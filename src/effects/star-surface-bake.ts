import * as THREE from 'three';
import { STAR_NOISE_GLSL } from './star-noise-glsl';
import { STAR_ENERGY_GLSL, STAR_ENERGY_SCALE, STAR_QUALITY_TIER } from './star-energy-glsl';
import type { StarSurfaceStyle } from './star-surface-material';

/**
 * Cubemap face size for the baked star surface. 512² resolves about five of the six cell octaves;
 * the finer detail is lost either way once a star is far enough away for Minimal to matter.
 * About 8 MB per surface style with mipmaps.
 */
const BAKE_FACE_SIZE = 512;

/** Fixed animation time the bake is taken at. Any value works; this one avoids w = 0 symmetry. */
const BAKE_W = 7.31;

/** Lowest height {@link STAR_ENERGY_GLSL} produces (deep lanes); the bake stores height above it. */
export const STAR_BAKE_HEIGHT_MIN = -0.35;
/** Height range {@link STAR_ENERGY_GLSL} produces (-0.35 … 1.0). */
export const STAR_BAKE_HEIGHT_RANGE = 1.35;

/** The structure uniforms a surface style sets; the bake reproduces them exactly. */
export interface IStarEnergyParams {
    warp: number;
    flowWarp: number;
    cellLo: number;
    cellHi: number;
    base: number;
    laneScale: number;
    laneLo: number;
    laneHi: number;
    laneDepth: number;
}

let _renderer: THREE.WebGLRenderer | null = null;
const _cubes = new Map<StarSurfaceStyle, THREE.WebGLCubeRenderTarget>();

/** Gives the bake the renderer it draws with. Until this is called, Minimal falls back to Low. */
export function initStarSurfaceBake(renderer: THREE.WebGLRenderer): void {
    _renderer = renderer;
}

/**
 * The baked surface for a style, rendered on first request and shared by every star of that style.
 * Channels: R = sqrt(energy / STAR_ENERGY_SCALE), G = granule mask, B = relief height (normalised).
 * The bake holds no colour, so a star changing temperature never needs a new one.
 *
 * Returns null when the renderer has not been registered yet.
 */
export function getStarEnergyCube(
    style: StarSurfaceStyle,
    params: IStarEnergyParams
): THREE.CubeTexture | null {
    const cached = _cubes.get(style);
    if (cached) return cached.texture;
    if (!_renderer) return null;

    const target = bake(_renderer, params);
    _cubes.set(style, target);
    return target.texture;
}

/** Frees every baked cubemap. They are rebuilt on the next request. */
export function disposeStarSurfaceBake(): void {
    for (const target of _cubes.values()) target.dispose();
    _cubes.clear();
}

function bake(
    renderer: THREE.WebGLRenderer,
    params: IStarEnergyParams
): THREE.WebGLCubeRenderTarget {
    const target = new THREE.WebGLCubeRenderTarget(BAKE_FACE_SIZE, {
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
    });

    const material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
        defines: { STAR_QUALITY: STAR_QUALITY_TIER.high },
        uniforms: {
            uSsOctaves: { value: 6 },
            uSsWarp: { value: params.warp },
            uSsFlowWarp: { value: params.flowWarp },
            uSsCellLo: { value: params.cellLo },
            uSsCellHi: { value: params.cellHi },
            uSsBase: { value: params.base },
            uSsLaneScale: { value: params.laneScale },
            uSsLaneLo: { value: params.laneLo },
            uSsLaneHi: { value: params.laneHi },
            uSsLaneDepth: { value: params.laneDepth },
        },
        vertexShader: /* glsl */ `
            varying vec3 vDir;
            void main() {
                vDir = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: /* glsl */ `
            uniform float uSsOctaves;
            uniform float uSsWarp;
            uniform float uSsFlowWarp;
            uniform float uSsCellLo;
            uniform float uSsCellHi;
            uniform float uSsBase;
            uniform float uSsLaneScale;
            uniform float uSsLaneLo;
            uniform float uSsLaneHi;
            uniform float uSsLaneDepth;
            varying vec3 vDir;
            ${STAR_NOISE_GLSL}
            ${STAR_ENERGY_GLSL}
            void main() {
                // Same coordinates as the live surface: the unit cube around the sphere.
                vec3 q = normalize(vDir) * 0.5 + 0.5;
                SsSurface s = ss_surface(q, ${BAKE_W.toFixed(2)});
                gl_FragColor = vec4(
                    sqrt(clamp(s.energy / ${STAR_ENERGY_SCALE.toFixed(2)}, 0.0, 1.0)),
                    s.granules,
                    clamp((s.height - (${STAR_BAKE_HEIGHT_MIN.toFixed(2)})) / ${STAR_BAKE_HEIGHT_RANGE.toFixed(2)}, 0.0, 1.0),
                    1.0
                );
            }`,
    });

    // An inside-out unit sphere around a cube camera: each face sees the directions it stores.
    const geometry = new THREE.SphereGeometry(1, 64, 32);
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.CubeCamera(0.1, 10, target);
    scene.add(camera);

    // Raw values: no tone mapping or colour conversion may touch the stored data.
    const toneMapping = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    camera.update(renderer, scene);
    renderer.toneMapping = toneMapping;

    geometry.dispose();
    material.dispose();
    return target;
}
