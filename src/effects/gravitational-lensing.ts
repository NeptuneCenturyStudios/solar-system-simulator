import * as THREE from 'three';

/** Maximum number of black holes lensed simultaneously. */
const MAX_LENSES = 4;

/**
 * Einstein ring radius multiplier.
 * warpRadius (screen-space) = projectedHorizonRadius * EINSTEIN_SCALE.
 * The warp scales naturally with zoom — smaller when far, larger when close.
 * Increase to make the ring more dramatic at all distances.
 */
const EINSTEIN_SCALE = 22.0;

/**
 * Screen-space gravitational lensing post-processing effect.
 *
 * Usage each frame:
 *   1. `beginCapture(renderer)`      — redirects rendering into an internal render target
 *   2. `renderer.render(scene, cam)` — scene renders to the target instead of the canvas
 *   3. `applyLensing(renderer, cam, lenses)` — warps the captured image and draws to screen
 *
 * The UI overlay pass must happen AFTER applyLensing so it renders on top unwarped.
 */
export class GravitationalLensingEffect {
    private rt: THREE.WebGLRenderTarget;
    private quadScene: THREE.Scene;
    private quadCamera: THREE.OrthographicCamera;
    private quadMesh: THREE.Mesh;
    private uniforms: {
        tScene:          { value: THREE.Texture | null };
        uResolution:     { value: THREE.Vector2 };
        uLensCount:      { value: number };
        uLensPositions:  { value: THREE.Vector2[] };
        uLensRadii:      { value: number[] };   // actual projected event-horizon radius (black disc)
        uLensWarpRadii:  { value: number[] };   // einstein warp radius (floored to MIN_WARP_RADIUS)
    };

    constructor(renderer: THREE.WebGLRenderer) {
        const w = renderer.domElement.width;
        const h = renderer.domElement.height;

        this.rt = new THREE.WebGLRenderTarget(w, h, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
        });

        // Pre-allocate arrays for the fixed-size lens uniforms.
        const positions:  THREE.Vector2[] = [];
        const radii:      number[] = [];
        const warpRadii:  number[] = [];
        for (let i = 0; i < MAX_LENSES; i++) {
            positions.push(new THREE.Vector2(0, 0));
            radii.push(0);
            warpRadii.push(0);
        }

        this.uniforms = {
            tScene:          { value: this.rt.texture },
            uResolution:     { value: new THREE.Vector2(w, h) },
            uLensCount:      { value: 0 },
            uLensPositions:  { value: positions },
            uLensRadii:      { value: radii },
            uLensWarpRadii:  { value: warpRadii },
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms as unknown as { [key: string]: THREE.IUniform },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform sampler2D tScene;
                uniform vec2  uResolution;
                uniform int   uLensCount;
                uniform vec2  uLensPositions[${MAX_LENSES}];
                uniform float uLensRadii[${MAX_LENSES}];      // event-horizon (black disc)
                uniform float uLensWarpRadii[${MAX_LENSES}];  // einstein warp radius

                varying vec2 vUv;

                void main() {
                    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
                    vec2 totalWarp = vec2(0.0);

                    for (int i = 0; i < ${MAX_LENSES}; i++) {
                        if (i >= uLensCount) break;

                        vec2  lensUV    = uLensPositions[i];
                        float horizonR  = uLensRadii[i];      // actual projected disc size
                        float einstein  = uLensWarpRadii[i];  // pre-computed, distance-independent

                        // Aspect-corrected offset so the warp stays circular on non-square viewports.
                        vec2  offset = (vUv - lensUV) * aspect;
                        float dist   = length(offset);

                        // Hard black inside the event horizon.
                        if (dist < horizonR) {
                            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                            return;
                        }

                        // Thin-lens UV warp: magnitude ∝ einstein² / dist.
                        // Clamped to 95 % of dist to prevent UV inversion artifacts.
                        float warpMag = min(einstein * einstein / dist, dist * 0.95);
                        // Undo aspect scaling before adding to UV-space warp.
                        totalWarp += -normalize(offset) / aspect * warpMag;
                    }

                    vec2 warpedUV = clamp(vUv + totalWarp, 0.0, 1.0);
                    gl_FragColor = texture2D(tScene, warpedUV);
                }
            `,
            depthTest:  false,
            depthWrite: false,
        });

        this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.quadScene  = new THREE.Scene();
        this.quadMesh   = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        this.quadMesh.frustumCulled = false;
        this.quadScene.add(this.quadMesh);
    }

    /**
     * Call immediately before rendering the main scene.
     * Redirects subsequent renderer.render() calls into the internal render target.
     */
    beginCapture(renderer: THREE.WebGLRenderer): void {
        renderer.setRenderTarget(this.rt);
        renderer.autoClear = true;
    }

    /**
     * Call after the main scene has been rendered into the target.
     * Projects each lens position to UV space, updates uniforms, and draws the
     * warped image to the screen (render target = null).
     *
     * @param lenses Array of { position: world-space Vector3, radius: event-horizon radius }
     */
    applyLensing(
        renderer: THREE.WebGLRenderer,
        camera: THREE.PerspectiveCamera,
        lenses: { position: THREE.Vector3; radius: number }[]
    ): void {
        const count = Math.min(lenses.length, MAX_LENSES);
        this.uniforms.uLensCount.value = count;

        const _ndc  = new THREE.Vector3();
        const _edge = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
            const { position, radius } = lenses[i];

            // Project world position to NDC [-1, 1].
            _ndc.copy(position).project(camera);
            // Convert to UV [0, 1].
            this.uniforms.uLensPositions.value[i].set(
                (_ndc.x + 1) * 0.5,
                (_ndc.y + 1) * 0.5
            );

            // Compute the event-horizon radius in UV units by projecting an offset point.
            // We offset by `radius` along the camera's right vector in world space.
            _edge.copy(position).addScaledVector(
                camera.getWorldDirection(new THREE.Vector3())
                    .cross(camera.up).normalize(),
                radius
            );
            _edge.project(camera);
            const edgeUVx = (_edge.x + 1) * 0.5;
            const projectedRadius = Math.abs(
                edgeUVx - this.uniforms.uLensPositions.value[i].x
            );
            this.uniforms.uLensRadii.value[i]     = projectedRadius;
            this.uniforms.uLensWarpRadii.value[i] = projectedRadius * EINSTEIN_SCALE;
        }

        // Draw the warped render-target texture to the screen.
        renderer.setRenderTarget(null);
        renderer.autoClear = false;
        renderer.render(this.quadScene, this.quadCamera);
    }

    /** Call from the window resize handler. */
    resize(width: number, height: number): void {
        this.rt.setSize(width, height);
        this.uniforms.uResolution.value.set(width, height);
    }

    dispose(): void {
        this.rt.dispose();
        this.quadMesh.geometry.dispose();
        (this.quadMesh.material as THREE.ShaderMaterial).dispose();
    }
}
