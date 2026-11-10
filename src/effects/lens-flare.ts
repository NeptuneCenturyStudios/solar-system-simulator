import * as THREE from 'three';
import { BodyTypeEnum } from '../bodies/body-enums';
import { MAX_LIGHTING_STARS } from '../utilities/consts';
import { CloudTransmittanceProbe, type ICloudProbeSource } from './cloud-transmittance-probe';

/** Most stars that flare in one frame (the largest on screen win). */
const MAX_FLARE_STARS = MAX_LIGHTING_STARS;

/**
 * Shine sizes are tuned in pixels at this screen height and scale with the real height, so
 * the flare covers the same share of the screen at any resolution.
 */
const REFERENCE_HEIGHT_PX = 1080;

/**
 * Projected star radius (in reference pixels) at which the shine (core, starburst, streak) starts to
 * fade, and at which it is gone. A distant star is a point of light and the shine dominates;
 * up close the disc and the sun rays take over. The ghosts and the halo ring stay, as they
 * would in a real lens with the sun in frame.
 */
const SHINE_FADE_START_PX = 8;
const SHINE_FADE_END_PX = 60;

/** How far past the screen edge (in NDC) the flare takes to fade out as its star leaves. */
const EDGE_FADE_NDC = 0.15;

/** How quickly occlusion changes are eased in and out (1/s). */
const VISIBILITY_DECAY_RATE = 48;

/** Ghosts collapse onto the star when it sits at the screen centre; they fade out there. */
const GHOST_CENTER_FADE_START = 0.02;
const GHOST_CENTER_FADE_END = 0.15;

/** The parts of a sim body the flare needs. */
export interface ILensFlareBody {
    readonly id: string;
    _isDisposed: boolean;
    bodyType: BodyTypeEnum;
    radius: number;
    mesh: THREE.Object3D;
    /** Star light colour (linear). Stars set it from their temperature. */
    baseColor?: THREE.Color;
    /** A cloud layer, which dims stars seen through it (bodies/cloud-layer.ts). */
    cloudLayer?: { readonly probe: ICloudProbeSource } | null;
}

/** Brown dwarfs barely glow and do not flare. */
const NO_FLARE_STAR_TYPES = BodyTypeEnum.BrownDwarf;

/**
 * Bodies drawn from a model rather than a sphere. Their `radius` only bounds the model (a
 * ship's longest dimension equals it), so the sphere test alone would hide a star that the
 * line of sight passes well clear of the hull; a hit on the actual mesh confirms it.
 */
const MESH_SHAPED_TYPES =
    BodyTypeEnum.SpaceShip |
    BodyTypeEnum.Probe |
    BodyTypeEnum.Satellite |
    BodyTypeEnum.Asteroid |
    BodyTypeEnum.Comet;

/** A star that made the cut this frame. */
interface IFlareCandidate {
    center: THREE.Vector2;
    color: THREE.Color;
    radiusPx: number;
    shine: number;
    ghosts: number;
    rotation: number;
    seed: number;
}

/** Eased visibility per star, with the frame it was last seen (to drop stale entries). */
interface IVisibilityEntry {
    value: number;
    frame: number;
}

const _view = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _toStar = new THREE.Vector3();
const _toBody = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _hits: THREE.Intersection[] = [];

/**
 * True if `material` can't hide a star: not drawn at all (the ship's placeholder container),
 * or see-through / glow (shield bubble, flames, trails) rather than hull.
 */
function isNonBlockingMaterial(material: THREE.Material | THREE.Material[]): boolean {
    const list = Array.isArray(material) ? material : [material];
    return list.every((m) => !m.visible || m.transparent || m.blending === THREE.AdditiveBlending);
}

/**
 * Whether the ray from `origin` along unit `dir` hits an opaque, visible mesh under `root`
 * within `maxDist`. Only meshes are tested: a body's label sprite and label line hang off
 * its mesh too, and Sprite.raycast throws without a camera on the raycaster.
 */
function rayHitsMesh(
    root: THREE.Object3D,
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number
): boolean {
    _raycaster.set(origin, dir);
    _raycaster.near = 0;
    _raycaster.far = maxDist;
    return meshHit(root);
}

/** Depth-first over visible descendants of `object`, raycasting the opaque meshes. */
function meshHit(object: THREE.Object3D): boolean {
    if (!object.visible) return false;
    if (object instanceof THREE.Mesh && !isNonBlockingMaterial(object.material)) {
        _hits.length = 0;
        object.raycast(_raycaster, _hits);
        const hit = _hits.length > 0;
        _hits.length = 0;
        if (hit) return true;
    }
    for (const child of object.children) {
        if (meshHit(child)) return true;
    }
    return false;
}

/** Stable 0..1 hash of a body id, so each star keeps its own ray pattern. */
function hashId(id: string): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10007) / 10007;
}

/**
 * Screen-space photographic lens flare for stars, drawn in a single shader pass:
 *  - **shine**: a white-hot core, a soft glow, a fine many-rayed starburst with a few long
 *    main spikes, and a horizontal anamorphic streak, all tinted with the star's colour;
 *  - **ghosts**: hexagonal aperture reflections and small dots strung along the line from
 *    the star through the screen centre, each with its own hue shift;
 *  - **halo ring**: one large, faint ring with slight chromatic fringing.
 *
 * The shine is sized in pixels, so a distant star (a point on screen) carries a large,
 * visible flare, while a close star's disc and sun rays swallow it. Planets and other bodies
 * in front of a star dim its flare smoothly (worked out analytically, without reading back
 * depth).
 *
 * Usage each frame, after the scene is on the screen:
 *   `render(renderer, camera, bodies, dt, wallDt)` — adds the flare on top of the screen.
 */
export class LensFlareEffect {
    private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private readonly scene = new THREE.Scene();
    private readonly material: THREE.ShaderMaterial;

    private readonly uniforms: {
        uResolution: THREE.IUniform<THREE.Vector2>;
        uScreenScale: THREE.IUniform<number>;
        uTime: THREE.IUniform<number>;
        uStarCount: THREE.IUniform<number>;
        uCenters: THREE.IUniform<THREE.Vector2[]>;
        uColors: THREE.IUniform<THREE.Vector3[]>;
        uShine: THREE.IUniform<number[]>;
        uGhosts: THREE.IUniform<number[]>;
        uRotations: THREE.IUniform<number[]>;
        uSeeds: THREE.IUniform<number[]>;
    };

    private readonly _candidatePool: IFlareCandidate[] = [];
    private readonly _candidates: IFlareCandidate[] = [];
    private readonly _visibility = new Map<string, IVisibilityEntry>();
    private readonly _cloudProbe = new CloudTransmittanceProbe();
    private _frame = 0;

    /** Overall flare brightness. */
    intensity = 1.0;

    constructor() {
        const centers: THREE.Vector2[] = [];
        const colors: THREE.Vector3[] = [];
        for (let i = 0; i < MAX_FLARE_STARS; i++) {
            centers.push(new THREE.Vector2());
            colors.push(new THREE.Vector3(1, 1, 1));
        }
        this.uniforms = {
            uResolution: { value: new THREE.Vector2(1, 1) },
            uScreenScale: { value: 1 },
            uTime: { value: 0 },
            uStarCount: { value: 0 },
            uCenters: { value: centers },
            uColors: { value: colors },
            uShine: { value: new Array<number>(MAX_FLARE_STARS).fill(0) },
            uGhosts: { value: new Array<number>(MAX_FLARE_STARS).fill(0) },
            uRotations: { value: new Array<number>(MAX_FLARE_STARS).fill(0) },
            uSeeds: { value: new Array<number>(MAX_FLARE_STARS).fill(0) },
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms as unknown as { [key: string]: THREE.IUniform },
            vertexShader: /* glsl */ `
                void main() {
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                #define PI 3.14159265359
                #define TAU 6.28318530718
                #define GHOST_COUNT 7
                #define DOT_COUNT 5

                uniform vec2 uResolution;      // drawing-buffer pixels
                uniform float uScreenScale;    // real px per reference px
                uniform float uTime;
                uniform int uStarCount;
                uniform vec2 uCenters[${MAX_FLARE_STARS}];   // drawing-buffer pixels
                uniform vec3 uColors[${MAX_FLARE_STARS}];    // display (sRGB) colour
                uniform float uShine[${MAX_FLARE_STARS}];
                uniform float uGhosts[${MAX_FLARE_STARS}];
                uniform float uRotations[${MAX_FLARE_STARS}];
                uniform float uSeeds[${MAX_FLARE_STARS}];

                // Ghosts: position along the axis (0 = star, 1 = screen centre), size as a
                // fraction of the screen height, brightness, and hue shift.
                const float G_T[GHOST_COUNT] = float[GHOST_COUNT](1.25, 1.45, 1.70, 1.95, 0.70, 0.85, 2.30);
                const float G_SIZE[GHOST_COUNT] = float[GHOST_COUNT](0.060, 0.085, 0.070, 0.050, 0.030, 0.045, 0.110);
                const float G_BRIGHT[GHOST_COUNT] = float[GHOST_COUNT](0.22, 0.16, 0.20, 0.26, 0.20, 0.12, 0.08);
                const vec3 G_TINT[GHOST_COUNT] = vec3[GHOST_COUNT](
                    vec3(1.0, 0.55, 0.45),
                    vec3(1.0, 0.45, 0.6),
                    vec3(0.85, 1.0, 0.45),
                    vec3(1.0, 0.85, 0.4),
                    vec3(1.0, 0.7, 0.4),
                    vec3(1.0, 0.5, 0.5),
                    vec3(0.7, 0.9, 1.0)
                );
                // Aperture orientation (fixed, like a real lens): rotation by 0.26 rad.
                const mat2 AP_ROT = mat2(0.966390, -0.257081, 0.257081, 0.966390);

                float hash11(float p) {
                    p = fract(p * 0.1031);
                    p *= p + 33.33;
                    p *= p + p;
                    return fract(p);
                }

                float luma(vec3 c) {
                    return dot(c, vec3(0.2126, 0.7152, 0.0722));
                }

                // Signed distance to a regular hexagon of inradius r (Inigo Quilez).
                float sdHexagon(vec2 p, float r) {
                    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
                    p = abs(p);
                    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
                    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
                    return length(p) * sign(p.y);
                }

                // Shifts the star colour toward a tint while keeping its brightness, so ghosts
                // read as hue variations of the star rather than unrelated colours.
                vec3 tinted(vec3 starColor, vec3 tint) {
                    vec3 c = starColor * tint;
                    float scale = clamp(luma(starColor) / max(luma(c), 1e-3), 0.0, 3.0);
                    return c * scale;
                }

                // One layer of thin, randomly long starburst rays. d is in reference px.
                float rayLayer(float r, float ang, float bins, float seed, float minLen, float maxLen) {
                    float a = ang / TAU * bins;
                    // Wrap the bin index so the atan seam at ±PI does not split a ray (bins is whole).
                    float bin = mod(floor(a), bins);
                    float h1 = hash11(bin + seed * 97.0);
                    float h2 = hash11(bin + seed * 97.0 + 17.0);
                    float h3 = hash11(bin + seed * 97.0 + 41.0);
                    // Ray angle jittered inside its bin; distance from the ray line in px.
                    float offset = (fract(a) - (0.5 + (h2 - 0.5) * 0.6)) * TAU / bins;
                    float perp = r * abs(offset);
                    float width = 0.7 + r * 0.004;
                    float profile = exp(-(perp * perp) / (width * width));
                    float shimmer = 1.0 + 0.12 * sin(uTime * (1.3 + 3.1 * h3) + h1 * 31.0);
                    float len = mix(minLen, maxLen, h1 * h1) * shimmer;
                    float bright = 0.35 + 0.65 * h3;
                    return profile * exp(-r / len) * bright;
                }

                vec3 starFlare(int i, vec2 frag) {
                    vec3 col = vec3(0.0);
                    vec3 starColor = uColors[i];
                    vec2 center = uCenters[i];
                    float seed = uSeeds[i];

                    // ── Shine (reference px around the star) ──────────────────────────
                    float shine = uShine[i];
                    vec2 d = (frag - center) / uScreenScale;
                    float r = length(d);
                    // Past 1100 ref px even the streak is under 1%.
                    if (shine > 0.001 && r < 1100.0) {
                        float core = exp(-r / 5.0) + 0.45 * exp(-r / 18.0);
                        float glow = 0.18 * exp(-r / 70.0);

                        // The starburst has faded below 2% by 640 ref px; skip its trig there.
                        float burst = 0.0;
                        if (r < 640.0) {
                            float ang = atan(d.y, d.x) + uRotations[i];
                            float rays = rayLayer(r, ang, 53.0, seed, 25.0, 140.0)
                                       + 0.7 * rayLayer(r, ang + 0.37, 89.0, seed + 0.5, 15.0, 80.0);

                            // Six long main spikes: sin(3θ) is zero along each of them.
                            float spikeOff = abs(sin(3.0 * ang)) / 3.0;
                            float spikePerp = r * spikeOff;
                            float spikeWidth = 0.9 + r * 0.003;
                            float spikes = exp(-(spikePerp * spikePerp) / (spikeWidth * spikeWidth))
                                         * exp(-r / 160.0)
                                         * (1.0 + 0.06 * sin(uTime * 2.3 + seed * 13.0));
                            burst = rays * 0.9 + spikes * 0.8;
                        }

                        // Horizontal anamorphic streak, with a fainter wide band and a weak
                        // vertical counterpart.
                        float streak = exp(-(d.y * d.y) / 3.0) * exp(-abs(d.x) / 260.0)
                                     + 0.25 * exp(-(d.y * d.y) / 90.0) * exp(-abs(d.x) / 120.0)
                                     + 0.15 * exp(-(d.x * d.x) / 2.0) * exp(-abs(d.y) / 60.0);

                        vec3 hot = mix(starColor, vec3(1.0), 0.75);
                        col += hot * core * 1.2;
                        col += starColor * (glow + burst + streak * 0.55);
                        col *= shine;
                    }

                    // ── Ghosts and halo ring (along the axis through the screen centre) ──
                    float ghostStrength = uGhosts[i];
                    if (ghostStrength > 0.001) {
                        vec2 screenCenter = uResolution * 0.5;
                        vec2 axis = screenCenter - center;
                        float axisLen = length(axis) / uResolution.y;
                        ghostStrength *= smoothstep(${GHOST_CENTER_FADE_START.toFixed(3)}, ${GHOST_CENTER_FADE_END.toFixed(3)}, axisLen);

                        vec3 ghosts = vec3(0.0);
                        for (int g = 0; g < GHOST_COUNT; g++) {
                            vec2 gp = center + axis * G_T[g];
                            float size = G_SIZE[g] * uResolution.y;
                            vec2 q = frag - gp;
                            // Outside the hexagon's corners plus its soft rim: nothing to add.
                            if (dot(q, q) > size * size * 1.96) continue;
                            float sd = sdHexagon(AP_ROT * q, size);
                            float soft = size * 0.08;
                            float fill = 1.0 - smoothstep(-soft, soft, sd);
                            // Brighter toward the edge, with a thin rim.
                            float body = fill * (0.35 + 0.65 * smoothstep(-size, 0.0, sd));
                            float rim = exp(-(sd * sd) / (soft * soft * 0.6)) * 0.5;
                            ghosts += tinted(starColor, G_TINT[g]) * (body + rim) * G_BRIGHT[g];
                        }

                        // Small round dots between the star and the centre.
                        for (int k = 0; k < DOT_COUNT; k++) {
                            float fk = float(k);
                            float t = 0.12 + fk * 0.11 + 0.03 * hash11(fk + 3.0);
                            vec2 dp = center + axis * t;
                            float dotR = (0.004 + 0.006 * hash11(fk + 11.0)) * uResolution.y;
                            float dd = length(frag - dp);
                            float dotV = 1.0 - smoothstep(dotR * 0.6, dotR, dd);
                            vec3 dotTint = mix(vec3(1.0, 0.6, 0.3), vec3(1.0, 0.9, 0.5), hash11(fk + 5.0));
                            ghosts += tinted(starColor, dotTint) * dotV * 0.35;
                        }

                        // Large faint halo ring around the mirrored point, chromatically fringed.
                        vec2 ringCenter = center + axis * 1.5;
                        float ringR = 0.42 * uResolution.y;
                        float ringW = 0.006 * uResolution.y;
                        float rd = length(frag - ringCenter);
                        vec3 ringOff = vec3(-1.0, 0.0, 1.0) * 0.004 * uResolution.y;
                        vec3 ringDist = (vec3(rd) - (ringR + ringOff)) / ringW;
                        vec3 ring = exp(-ringDist * ringDist);
                        ghosts += ring * mix(starColor, vec3(1.0), 0.3) * 0.07;

                        col += ghosts * ghostStrength;
                    }

                    return col;
                }

                void main() {
                    vec2 frag = gl_FragCoord.xy;
                    vec3 col = vec3(0.0);
                    for (int s = 0; s < ${MAX_FLARE_STARS}; s++) {
                        if (s >= uStarCount) break;
                        col += starFlare(s, frag);
                    }
                    gl_FragColor = vec4(min(col, vec3(4.0)), 1.0);
                }
            `,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        quad.frustumCulled = false;
        this.scene.add(quad);
    }

    /**
     * Adds the flares of the stars in `bodies` over whatever is on the screen.
     *
     * @param dt     Animation time to advance the shimmer by (0 while paused).
     * @param wallDt Real seconds this frame, for easing occlusion changes.
     */
    render(
        renderer: THREE.WebGLRenderer,
        camera: THREE.PerspectiveCamera,
        bodies: readonly ILensFlareBody[],
        dt: number,
        wallDt: number
    ): void {
        this.uniforms.uTime.value += dt;
        this._frame++;

        const count = this._collectStars(renderer, camera, bodies, wallDt);
        this._pruneVisibility();
        // Measure the cloud lines of sight queried above; the answers land in a frame or two.
        this._cloudProbe.flush(renderer);
        if (count === 0) return;

        const prevAutoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.render(this.scene, this.quadCamera);
        renderer.autoClear = prevAutoClear;
    }

    private _collectStars(
        renderer: THREE.WebGLRenderer,
        camera: THREE.PerspectiveCamera,
        bodies: readonly ILensFlareBody[],
        wallDt: number
    ): number {
        const widthPx = renderer.domElement.width;
        const heightPx = renderer.domElement.height;
        const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
        const screenScale = heightPx / REFERENCE_HEIGHT_PX;
        const ease = 1 - Math.exp(-VISIBILITY_DECAY_RATE * Math.max(wallDt, 0));
        this._candidates.length = 0;

        for (const body of bodies) {
            if (body._isDisposed || !(body.bodyType & BodyTypeEnum.Star)) continue;
            if (body.bodyType & NO_FLARE_STAR_TYPES) continue;
            if (!body.baseColor) continue;

            const position = body.mesh.position;
            _view.copy(position).applyMatrix4(camera.matrixWorldInverse);
            const depth = -_view.z;
            // Behind the camera, or the camera is inside the star.
            if (depth <= body.radius) continue;

            _ndc.copy(position).project(camera);
            const edge = Math.max(Math.abs(_ndc.x), Math.abs(_ndc.y));
            const edgeFade = 1 - THREE.MathUtils.smoothstep(edge, 1, 1 + EDGE_FADE_NDC);

            // Ease toward the occlusion target; keep easing even while off screen so the
            // flare doesn't pop when the star comes back. A null target (cloud cover not
            // measured yet) holds the current value; a star first seen then starts dark and
            // fades in, rather than flashing through a cloud.
            const target =
                edgeFade > 0 ? this._occlusion(body, bodies, camera, heightPx, tanHalfFov) : 0;
            let entry = this._visibility.get(body.id);
            if (!entry) {
                entry = { value: target ?? 0, frame: this._frame };
                this._visibility.set(body.id, entry);
            }
            if (target !== null) entry.value += (target - entry.value) * ease;
            entry.frame = this._frame;

            const visibility = entry.value * edgeFade;
            if (visibility < 0.001) continue;

            const radiusPx = (body.radius / (depth * tanHalfFov) / 2) * heightPx;
            const radiusRefPx = radiusPx / screenScale;

            const index = this._candidates.length;
            let candidate = this._candidatePool[index];
            if (!candidate) {
                candidate = {
                    center: new THREE.Vector2(),
                    color: new THREE.Color(),
                    radiusPx: 0,
                    shine: 0,
                    ghosts: 0,
                    rotation: 0,
                    seed: 0,
                };
                this._candidatePool.push(candidate);
            }
            candidate.center.set((_ndc.x + 1) * 0.5 * widthPx, (_ndc.y + 1) * 0.5 * heightPx);
            // The shader writes straight to the screen, so it needs the display colour.
            candidate.color.copy(body.baseColor).convertLinearToSRGB();
            candidate.radiusPx = radiusPx;
            candidate.shine =
                (1 -
                    THREE.MathUtils.smoothstep(
                        radiusRefPx,
                        SHINE_FADE_START_PX,
                        SHINE_FADE_END_PX
                    )) *
                visibility;
            candidate.ghosts = visibility;
            // Rays turn a little as the star moves across the screen.
            candidate.rotation = _ndc.x * 0.6 + _ndc.y * 0.4;
            candidate.seed = hashId(body.id);
            this._candidates.push(candidate);
        }

        this._candidates.sort((a, b) => b.radiusPx - a.radiusPx);
        const count = Math.min(this._candidates.length, MAX_FLARE_STARS);

        const u = this.uniforms;
        u.uResolution.value.set(widthPx, heightPx);
        u.uScreenScale.value = screenScale;
        u.uStarCount.value = count;
        for (let i = 0; i < count; i++) {
            const c = this._candidates[i];
            u.uCenters.value[i].copy(c.center);
            u.uColors.value[i].set(c.color.r, c.color.g, c.color.b);
            u.uShine.value[i] = c.shine * this.intensity;
            u.uGhosts.value[i] = c.ghosts * this.intensity;
            u.uRotations.value[i] = c.rotation;
            u.uSeeds.value[i] = c.seed;
        }
        return count;
    }

    /**
     * How much of the star is visible past the bodies between it and the camera (0..1).
     * Each body in the way covers the star's disc (as seen at the body's distance) by how
     * close the line of sight passes to it, and any cloud layer the line crosses lets through
     * only its transmittance; the factors multiply. Null while a cloud layer in the way has
     * not been measured yet (CloudTransmittanceProbe answers a frame or two late).
     */
    private _occlusion(
        star: ILensFlareBody,
        bodies: readonly ILensFlareBody[],
        camera: THREE.PerspectiveCamera,
        heightPx: number,
        tanHalfFov: number
    ): number | null {
        const cam = camera.position;
        _toStar.copy(star.mesh.position).sub(cam);
        const starDist = _toStar.length();
        if (starDist <= 0) return 0;
        _toStar.divideScalar(starDist);

        let visibility = 1;
        let unknown = false;
        for (const body of bodies) {
            if (body === star || body._isDisposed || !body.mesh.visible) continue;

            // Clouds first: the camera may well be inside the deck (surface view, low flight),
            // which the solid-body test below rightly skips.
            if (body.cloudLayer) {
                const t = this._cloudProbe.query(
                    body.cloudLayer.probe,
                    star.id,
                    cam,
                    star.mesh.position
                );
                if (t === null) unknown = true;
                else visibility *= t;
                if (visibility <= 0.001) return 0;
            }

            _toBody.copy(body.mesh.position).sub(cam);
            const along = _toBody.dot(_toStar);
            const distSq = _toBody.lengthSq();
            const perp = Math.sqrt(Math.max(distSq - along * along, 0));

            if (body.bodyType & MESH_SHAPED_TYPES) {
                // The bounding sphere is only a broad phase: the chase camera often sits
                // inside it (its centre may even be behind the camera), and the hull fills
                // little of it. The star is hidden only if the line of sight hits the hull.
                if (along <= -body.radius || along >= starDist + body.radius) continue;
                if (perp > body.radius) continue;
                if (rayHitsMesh(body.mesh, cam, _toStar, starDist)) return 0;
                continue;
            }

            if (along <= 0 || along >= starDist) continue;
            // The camera is inside this body: it can't be judged as an occluder.
            if (distSq <= body.radius * body.radius) continue;

            // The star's disc, and one pixel, measured at the occluder's distance.
            const pixel = (2 * along * tanHalfFov) / heightPx;
            const soft = Math.max((star.radius * along) / starDist, pixel);
            visibility *= THREE.MathUtils.smoothstep(perp - body.radius, -soft, soft);
            if (visibility <= 0) return 0;
        }
        return unknown ? null : visibility;
    }

    /** Drops eased visibilities for stars no longer in the scene. */
    private _pruneVisibility(): void {
        for (const [id, entry] of this._visibility) {
            if (entry.frame !== this._frame) this._visibility.delete(id);
        }
    }

    dispose(): void {
        this.material.dispose();
        this.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        this._visibility.clear();
        this._cloudProbe.dispose();
    }
}
