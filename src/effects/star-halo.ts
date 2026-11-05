import * as THREE from 'three';
import { STAR_NOISE_GLSL } from './star-noise-glsl';
import type { StarSurfaceMaterial } from './star-surface-material';

/** Halo shell radius as a multiple of the star's radius. The glow is ~0 well before this. */
const HALO_SHELL_SCALE = 3.0;

const _camWorld = new THREE.Vector3();
const _invWorld = new THREE.Matrix4();

/**
 * Soft, temperature-tinted glow hugging a star's limb, with animated flame-like wisps — the
 * in-scene stand-in for the Blender model's compositor glow and the fuzzy, fiery edge of its
 * preview renders.
 *
 * Drawn as an additive, back-faced sphere shell parented to the star mesh. Each fragment works
 * out where its view ray passes closest to the star's centre and glows by that distance, so the
 * falloff is exact from any angle and any distance with no camera-facing sprite to orient. The
 * star's own depth hides the shell behind the disc, so the glow never washes out the surface.
 *
 * The maths runs in the shell's object space, so the wisps are anchored to the star (they turn
 * with it, rather than sliding when the camera rolls) and drift outward on the surface clock.
 *
 * The halo shares the surface material's tint, exposure and clock uniforms by reference, so it
 * recolours and animates with the star without any bookkeeping of its own.
 */
export class StarHalo {
    readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;

    private readonly _uniforms: {
        uShTint: THREE.IUniform<THREE.Color>;
        uShExposure: THREE.IUniform<number>;
        uShIntensity: THREE.IUniform<number>;
        uShWisps: THREE.IUniform<number>;
        uShTime: THREE.IUniform<number>;
        uShCamObj: THREE.IUniform<THREE.Vector3>;
    };

    /**
     * @param parent   The star mesh. The halo follows it with no per-frame sync.
     * @param radius   Star radius in world units.
     * @param surface  The star's surface material; its tint, exposure and clock are shared.
     * @param wisps    Flame-wisp strength: 1 for main-sequence stars, 0 for a clean glow.
     */
    constructor(parent: THREE.Object3D, radius: number, surface: StarSurfaceMaterial, wisps = 1) {
        const shared = surface.surfaceUniforms;
        this._uniforms = {
            uShTint: shared.uSsTint,
            uShExposure: shared.uSsExposure,
            uShIntensity: { value: 1.0 },
            uShWisps: { value: wisps },
            uShTime: shared.uSsTime,
            uShCamObj: { value: new THREE.Vector3() },
        };

        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.BackSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });

        // Star radius in the shell's own (unit-sphere) object space.
        const starR = (1 / HALO_SHELL_SCALE).toFixed(6);

        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this._uniforms);

            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    /* glsl */ `#include <common>
                    varying vec3 vShObjPos;`
                )
                .replace(
                    '#include <project_vertex>',
                    /* glsl */ `#include <project_vertex>
                    vShObjPos = position;`
                );

            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    /* glsl */ `#include <common>
                    uniform vec3 uShTint;
                    uniform float uShExposure;
                    uniform float uShIntensity;
                    uniform float uShWisps;
                    uniform float uShTime;
                    uniform vec3 uShCamObj;
                    varying vec3 vShObjPos;
                    ${STAR_NOISE_GLSL}`
                )
                .replace(
                    'vec4 diffuseColor = vec4( diffuse, opacity );',
                    /* glsl */ `
                    // Closest approach of this pixel's view ray to the star's centre, in star
                    // radii: 1.0 is the limb.
                    vec3 ro = uShCamObj;
                    vec3 rd = normalize(vShObjPos - ro);
                    float along = max(dot(-ro, rd), 0.0);
                    vec3 closest = ro + rd * along;
                    float dist = max(length(closest), 1e-6);
                    float x = dist / ${starR};
                    float h = max(x - 1.0, 0.0);
                    vec3 dir = closest / dist;

                    // Tight bright band at the limb plus a wide soft skirt.
                    float glow = 0.6 * exp(-h * 10.0) + 0.22 * exp(-h * 3.0);

                    // Wisps: noise that is fine around the limb but stretched along the radius,
                    // drifting outward over time, so it reads as licking flame tendrils. A slow,
                    // coarse field gathers them into active regions instead of an even fringe.
                    float t = uShTime * 0.01;
                    float flame = ss_fbm(vec4(dir * 16.0, h * 6.0 - t * 4.0), 3.0, 0.55);
                    float region = ss_fbm(vec4(dir * 2.5 + 9.1, t * 0.3), 2.0, 0.5);
                    float reach = mix(10.0, 26.0, smoothstep(0.35, 0.65, 1.0 - region));
                    float wisps = smoothstep(0.45, 0.7, flame) * exp(-h * reach);
                    glow += wisps * 0.75 * uShWisps;

                    // Fade to zero before the shell's own silhouette so its edge never shows.
                    glow *= 1.0 - smoothstep(${(HALO_SHELL_SCALE * 0.7).toFixed(2)}, ${HALO_SHELL_SCALE.toFixed(2)}, x);

                    vec3 halo = (1.0 - exp(-uShTint * uShExposure * 1.1)) * glow * uShIntensity;
                    vec4 diffuseColor = vec4(halo, 1.0);
                    `
                );
        };
        material.customProgramCacheKey = () => 'star-halo-v2';

        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
        this.mesh.name = 'StarHalo';
        this.mesh.scale.setScalar(radius * HALO_SHELL_SCALE);
        // Purely visual: keep it out of click picking, which would otherwise treat a star as
        // three times its real size.
        this.mesh.raycast = () => {};
        this.mesh.renderOrder = 1;
        // Camera position in the shell's object space, refreshed right before each draw (after
        // three.js has updated the world matrices for the frame).
        this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
            _invWorld.copy(this.mesh.matrixWorld).invert();
            _camWorld.setFromMatrixPosition(camera.matrixWorld);
            this._uniforms.uShCamObj.value.copy(_camWorld).applyMatrix4(_invWorld);
        };
        parent.add(this.mesh);
    }

    setRadius(radius: number): void {
        this.mesh.scale.setScalar(radius * HALO_SHELL_SCALE);
    }

    setVisible(visible: boolean): void {
        this.mesh.visible = visible;
    }

    dispose(): void {
        this.mesh.parent?.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
