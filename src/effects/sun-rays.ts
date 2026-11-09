import * as THREE from 'three';
import { BodyTypeEnum } from '../bodies/body-enums';
import { MAX_LIGHTING_STARS } from '../utilities/consts';

/** Most stars that cast rays in one frame (the largest on screen win). */
const MAX_RAY_STARS = MAX_LIGHTING_STARS;

/** Samples marched toward each star per pixel. */
const RAY_SAMPLES = 40;

/** Ray length, in star radii beyond the limb. */
const RAY_LENGTH_RADII = 4.0;

/** Longest a ray may get, as a fraction of the screen height (keeps huge close-ups sane). */
const MAX_RAY_LENGTH_SCREEN = 0.9;

/**
 * Projected star radius (in pixels) at which rays start, and at which they reach full strength.
 * Below this a star is a point of light, and the lens-flare shine takes over.
 */
const MIN_RADIUS_PX = 3;
const FULL_RADIUS_PX = 24;

/** The rays are worked out at this fraction of the screen resolution, then upscaled. */
const RESOLUTION_SCALE = 0.5;

/** The parts of a sim body the rays need. Only stars (other than brown dwarfs) cast rays. */
export interface ISunRayBody {
    _isDisposed: boolean;
    bodyType: BodyTypeEnum;
    radius: number;
    mesh: { position: THREE.Vector3 };
}

/** Brown dwarfs barely glow and cast no rays. */
const NO_RAY_STAR_TYPES = BodyTypeEnum.BrownDwarf;

/** A star that made the cut this frame, in screen-height units. */
interface IRayCandidate {
    center: THREE.Vector2;
    radius: number;
    strength: number;
}

const _view = new THREE.Vector3();
const _ndc = new THREE.Vector3();

/**
 * Screen-space sun rays — the in-sim version of the Blender model's compositor "Sun Beams"
 * glare: light streaming outward from a star, radially.
 *
 * Each pixel near a star marches toward the star's centre on screen, sampling the rendered
 * scene, and gathers the light it crosses inside the star's disc and flame fringe. Bright
 * features (hot spots, wisps, the limb) therefore smear outward into streaks that move as the
 * surface boils, and anything in front of the star — a planet, a ship — blocks its share and
 * casts a dark shaft through the rays.
 *
 * Rays scale with the star's size on screen and fade out as it shrinks to a point, where the
 * lens-flare shine takes over.
 *
 * Usage each frame, after the scene has been captured (and drawn to the screen):
 *   `render(renderer, camera, sceneTexture, bodies)` — adds the rays on top of the screen.
 */
export class SunRaysEffect {
    private readonly rt: THREE.WebGLRenderTarget;
    private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private readonly raysScene = new THREE.Scene();
    private readonly compositeScene = new THREE.Scene();
    private readonly raysMaterial: THREE.ShaderMaterial;
    private readonly compositeMaterial: THREE.ShaderMaterial;

    private readonly uniforms: {
        tScene: THREE.IUniform<THREE.Texture | null>;
        uAspect: THREE.IUniform<number>;
        uStarCount: THREE.IUniform<number>;
        uStarCenters: THREE.IUniform<THREE.Vector2[]>;
        uStarRadii: THREE.IUniform<number[]>;
        uStarLengths: THREE.IUniform<number[]>;
        uStarStrengths: THREE.IUniform<number[]>;
    };

    /** Reused candidate objects, so collecting stars allocates nothing per frame. */
    private readonly _candidatePool: IRayCandidate[] = [];
    /** This frame's candidates (entries of the pool), sorted largest first. */
    private readonly _candidates: IRayCandidate[] = [];

    /** Overall ray brightness. */
    intensity = 0.55;

    constructor(width: number, height: number) {
        this.rt = new THREE.WebGLRenderTarget(
            Math.max(1, Math.floor(width * RESOLUTION_SCALE)),
            Math.max(1, Math.floor(height * RESOLUTION_SCALE)),
            {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType,
                depthBuffer: false,
            }
        );

        const centers: THREE.Vector2[] = [];
        for (let i = 0; i < MAX_RAY_STARS; i++) centers.push(new THREE.Vector2());
        this.uniforms = {
            tScene: { value: null },
            uAspect: { value: width / Math.max(height, 1) },
            uStarCount: { value: 0 },
            uStarCenters: { value: centers },
            uStarRadii: { value: new Array<number>(MAX_RAY_STARS).fill(0) },
            uStarLengths: { value: new Array<number>(MAX_RAY_STARS).fill(0) },
            uStarStrengths: { value: new Array<number>(MAX_RAY_STARS).fill(0) },
        };

        const quadVertex = /* glsl */ `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `;

        this.raysMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms as unknown as { [key: string]: THREE.IUniform },
            vertexShader: quadVertex,
            fragmentShader: /* glsl */ `
                uniform sampler2D tScene;
                uniform float uAspect;
                uniform int uStarCount;
                uniform vec2 uStarCenters[${MAX_RAY_STARS}];
                uniform float uStarRadii[${MAX_RAY_STARS}];    // screen-height units
                uniform float uStarLengths[${MAX_RAY_STARS}];  // screen-height units
                uniform float uStarStrengths[${MAX_RAY_STARS}];
                varying vec2 vUv;

                // Per-pixel jitter for the march start: trades banding for fine noise, which
                // the upscale then smooths out.
                float hash12(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                void main() {
                    vec2 aspect = vec2(uAspect, 1.0);
                    vec3 rays = vec3(0.0);
                    float jitter = hash12(gl_FragCoord.xy);

                    for (int s = 0; s < ${MAX_RAY_STARS}; s++) {
                        if (s >= uStarCount) break;

                        vec2 center = uStarCenters[s];
                        float r = uStarRadii[s];
                        vec2 toCenter = center - vUv;
                        float dist = length(toCenter * aspect);
                        float rho = dist / r;             // distance from centre, in radii
                        float reach = uStarLengths[s];
                        if (dist > r + reach) continue;

                        // March from this pixel to the star's centre, collecting the light the
                        // ray crosses in the band around the limb and its flame fringe. Using a
                        // band rather than the whole disc keeps each direction's light distinct,
                        // so bright wisps and hot spots near the edge become separate streaks.
                        vec3 sum = vec3(0.0);
                        float weightSum = 0.0;
                        for (int k = 0; k < ${RAY_SAMPLES}; k++) {
                            float f = (float(k) + jitter) / float(${RAY_SAMPLES});
                            vec2 p = vUv + toCenter * f;
                            float pRho = rho * (1.0 - f);
                            float source = smoothstep(0.55, 0.95, pRho)
                                         * (1.0 - smoothstep(1.0, 1.35, pRho));
                            vec3 c = texture2D(tScene, p).rgb;
                            sum += c * source;
                            weightSum += source;
                        }
                        // Average, then stretch the contrast so streaks stand apart from the glow.
                        vec3 light = sum / max(weightSum, 1.0);
                        light = light * light * 1.6;

                        // Long, soft falloff away from the limb; gentle inside the disc, so the
                        // rays sit around the star rather than washing out its surface.
                        float h = max(dist - r, 0.0) / reach;
                        float falloff = exp(-h * 3.0) * (1.0 - smoothstep(0.75, 1.0, h));
                        float inner = mix(0.25, 1.0, smoothstep(0.8, 1.02, rho));
                        rays += light * falloff * inner * uStarStrengths[s];
                    }

                    gl_FragColor = vec4(rays, 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false,
        });

        this.compositeMaterial = new THREE.ShaderMaterial({
            uniforms: { tRays: { value: this.rt.texture } },
            vertexShader: quadVertex,
            fragmentShader: /* glsl */ `
                uniform sampler2D tRays;
                varying vec2 vUv;
                void main() {
                    gl_FragColor = vec4(texture2D(tRays, vUv).rgb, 1.0);
                }
            `,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        const raysQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.raysMaterial);
        raysQuad.frustumCulled = false;
        this.raysScene.add(raysQuad);

        const compositeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial);
        compositeQuad.frustumCulled = false;
        this.compositeScene.add(compositeQuad);
    }

    /**
     * Works out the rays from `sceneTexture` and adds them over whatever is on the screen.
     * Does nothing (and costs nothing) when no star is large enough on screen.
     */
    render(
        renderer: THREE.WebGLRenderer,
        camera: THREE.PerspectiveCamera,
        sceneTexture: THREE.Texture,
        bodies: readonly ISunRayBody[]
    ): void {
        const count = this._collectStars(renderer, camera, bodies);
        if (count === 0) return;

        this.uniforms.tScene.value = sceneTexture;
        this._matchSceneSize(sceneTexture);

        const prevTarget = renderer.getRenderTarget();
        const prevAutoClear = renderer.autoClear;

        renderer.setRenderTarget(this.rt);
        renderer.autoClear = false;
        renderer.render(this.raysScene, this.quadCamera);

        renderer.setRenderTarget(prevTarget);
        renderer.render(this.compositeScene, this.quadCamera);

        renderer.autoClear = prevAutoClear;
    }

    /**
     * Picks the ray-casting stars out of `bodies`, projects them, keeps the largest few on
     * screen, and fills the uniforms.
     */
    private _collectStars(
        renderer: THREE.WebGLRenderer,
        camera: THREE.PerspectiveCamera,
        bodies: readonly ISunRayBody[]
    ): number {
        const heightPx = renderer.domElement.height;
        const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
        const aspect = this.uniforms.uAspect.value;
        this._candidates.length = 0;

        for (const body of bodies) {
            if (body._isDisposed || !(body.bodyType & BodyTypeEnum.Star)) continue;
            if (body.bodyType & NO_RAY_STAR_TYPES) continue;

            const position = body.mesh.position;
            _view.copy(position).applyMatrix4(camera.matrixWorldInverse);
            const depth = -_view.z;
            // Behind the camera, or the camera is inside the star.
            if (depth <= body.radius) continue;

            // Angular radius -> fraction of the screen height.
            const radius = body.radius / (depth * tanHalfFov) / 2;
            const radiusPx = radius * heightPx;
            if (radiusPx < MIN_RADIUS_PX) continue;

            _ndc.copy(position).project(camera);
            const cx = (_ndc.x + 1) * 0.5;
            const cy = (_ndc.y + 1) * 0.5;

            // Skip stars whose rays can't reach the screen.
            const reach = Math.min(radius * RAY_LENGTH_RADII, MAX_RAY_LENGTH_SCREEN) + radius;
            if (cx < -reach / aspect || cx > 1 + reach / aspect || cy < -reach || cy > 1 + reach) {
                continue;
            }

            const index = this._candidates.length;
            let candidate = this._candidatePool[index];
            if (!candidate) {
                candidate = { center: new THREE.Vector2(), radius: 0, strength: 0 };
                this._candidatePool.push(candidate);
            }
            candidate.center.set(cx, cy);
            candidate.radius = radius;
            candidate.strength = THREE.MathUtils.smoothstep(
                radiusPx,
                MIN_RADIUS_PX,
                FULL_RADIUS_PX
            );
            this._candidates.push(candidate);
        }

        this._candidates.sort((a, b) => b.radius - a.radius);
        const count = Math.min(this._candidates.length, MAX_RAY_STARS);

        const u = this.uniforms;
        u.uStarCount.value = count;
        for (let i = 0; i < count; i++) {
            const c = this._candidates[i];
            u.uStarCenters.value[i].copy(c.center);
            u.uStarRadii.value[i] = c.radius;
            u.uStarLengths.value[i] = Math.min(c.radius * RAY_LENGTH_RADII, MAX_RAY_LENGTH_SCREEN);
            u.uStarStrengths.value[i] = c.strength * this.intensity;
        }
        return count;
    }

    /**
     * Keeps the rays target at RESOLUTION_SCALE of the captured scene, so lowering the render
     * scale makes the rays cheaper too. Only resizes when the scene size has changed.
     */
    private _matchSceneSize(sceneTexture: THREE.Texture): void {
        const image = sceneTexture.image as { width?: number; height?: number } | null;
        if (!image?.width || !image.height) return;
        const w = Math.max(1, Math.floor(image.width * RESOLUTION_SCALE));
        const h = Math.max(1, Math.floor(image.height * RESOLUTION_SCALE));
        if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    }

    /** Call from the window resize handler. */
    resize(width: number, height: number): void {
        this.rt.setSize(
            Math.max(1, Math.floor(width * RESOLUTION_SCALE)),
            Math.max(1, Math.floor(height * RESOLUTION_SCALE))
        );
        this.uniforms.uAspect.value = width / Math.max(height, 1);
    }

    dispose(): void {
        this.rt.dispose();
        this.raysMaterial.dispose();
        this.compositeMaterial.dispose();
        for (const scene of [this.raysScene, this.compositeScene]) {
            scene.traverse((o) => {
                if (o instanceof THREE.Mesh) o.geometry.dispose();
            });
        }
    }
}
