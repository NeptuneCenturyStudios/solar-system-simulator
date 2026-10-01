import * as THREE from 'three';
import type { IRingSpec } from '../interfaces';
import { SeededRandom } from '../utilities/prng';

export type PlanetRingsHandle = {
    dispose: () => void;
    /**
     * Points the ring's lighting at a star.
     *
     * `lightDirLocal` is the unit vector from the body toward the star, expressed in the body
     * mesh's local frame (the frame the rings live in). Pass null when there is no star, which
     * leaves the rings evenly lit and unshadowed.
     */
    update: (lightDirLocal: THREE.Vector3 | null) => void;
    /** Rescales the rings after the host body's radius changes — no geometry rebuild. */
    setRadius: (radius: number) => void;
};

/** Segments around the ring. Enough that the silhouette stays round at close range. */
const RING_SEGMENTS = 128;

/** Texture dimensions. Wide along the radius, where all of the detail is; height is just a strip. */
const TEX_WIDTH = 2048;
const TEX_HEIGHT = 4;

/**
 * Half-width, as a fraction of the ring, over which one band blends into the next.
 * Wide enough to avoid a hard aliased edge, narrow enough that thin rings stay crisp.
 */
const BAND_EDGE_SOFTNESS = 0.004;

/** Cell counts of the 1D noise octaves that make up the ringlet detail, coarse to fine. */
const RINGLET_OCTAVES = [
    { cells: 24, weight: 0.15 },
    { cells: 96, weight: 0.25 },
    { cells: 384, weight: 0.35 },
    { cells: 1536, weight: 0.25 },
];

/** How strongly the ringlet noise modulates a band's density (0 = smooth bands). */
const RINGLET_STRENGTH = 0.8;

/** Light reaching the side of the planet's shadow, relative to full light. */
const SHADOW_LIGHT = 0.06;

/** Shadow penumbra width, as a fraction of the planet radius. */
const SHADOW_PENUMBRA = 0.04;

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/** Seeded 1D value noise, summed over `RINGLET_OCTAVES`, returned as a sampler over 0–1. */
function createRingletNoise(rng: SeededRandom): (t: number) => number {
    const octaves = RINGLET_OCTAVES.map(({ cells, weight }) => {
        const values = new Float32Array(cells + 1);
        for (let i = 0; i <= cells; i++) values[i] = rng.next();
        return { cells, weight, values };
    });

    return (t: number) => {
        let sum = 0;
        for (const { cells, weight, values } of octaves) {
            const x = t * cells;
            const i = Math.min(cells - 1, Math.floor(x));
            const f = x - i;
            sum += weight * (values[i] + (values[i + 1] - values[i]) * f);
        }
        return sum; // weights sum to 1, so this stays within 0–1
    };
}

/**
 * Paints the ring's radial profile into a strip texture: band colour and density across the
 * width, with soft band edges and fine ringlet noise on top.
 *
 * Colours are written as plain sRGB bytes straight from the hex value — bypassing
 * `THREE.Color`, which would convert to linear — because the texture is tagged sRGB.
 */
function drawRingTexture(spec: IRingSpec): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = TEX_WIDTH;
    canvas.height = TEX_HEIGHT;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(TEX_WIDTH, TEX_HEIGHT);

    const noise = createRingletNoise(new SeededRandom(`${spec.seed}|ringlets`));

    for (let x = 0; x < TEX_WIDTH; x++) {
        const t = (x + 0.5) / TEX_WIDTH;

        // Complementary smoothsteps mean neighbouring bands' coverages sum to 1 across a
        // boundary, so the colour crossfades and the density never dips at the seam.
        let r = 0;
        let g = 0;
        let b = 0;
        let weight = 0;
        for (const band of spec.bands) {
            const coverage =
                smoothstep(band.start - BAND_EDGE_SOFTNESS, band.start + BAND_EDGE_SOFTNESS, t) *
                (1 - smoothstep(band.end - BAND_EDGE_SOFTNESS, band.end + BAND_EDGE_SOFTNESS, t));
            if (coverage <= 0) continue;

            const w = coverage * band.opacity;
            r += ((band.color >> 16) & 0xff) * w;
            g += ((band.color >> 8) & 0xff) * w;
            b += (band.color & 0xff) * w;
            weight += w;
        }

        // `weight` is the density; dividing it back out leaves the blended colour.
        const mod = 1 + (noise(t) - 0.5) * RINGLET_STRENGTH * 2;
        const alpha = Math.min(1, weight * mod);
        const norm = weight > 0 ? 1 / weight : 0;

        for (let y = 0; y < TEX_HEIGHT; y++) {
            const p = (y * TEX_WIDTH + x) * 4;
            image.data[p] = r * norm;
            image.data[p + 1] = g * norm;
            image.data[p + 2] = b * norm;
            image.data[p + 3] = alpha * 255;
        }
    }
    ctx.putImageData(image, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
}

/**
 * A flat annulus in the local XZ plane (normal = +Y, the body's spin axis), with `u` running
 * from 0 at the inner edge to 1 at the outer edge so the strip texture maps straight across it.
 */
function buildRingGeometry(innerRadius: number, outerRadius: number): THREE.BufferGeometry {
    const geo = new THREE.RingGeometry(innerRadius, outerRadius, RING_SEGMENTS, 1);
    geo.rotateX(-Math.PI / 2);

    const positions = geo.getAttribute('position');
    const uvs = geo.getAttribute('uv');
    const span = outerRadius - innerRadius;
    for (let i = 0; i < positions.count; i++) {
        const radius = Math.hypot(positions.getX(i), positions.getZ(i));
        uvs.setXY(i, (radius - innerRadius) / span, 0.5);
    }
    uvs.needsUpdate = true;

    return geo;
}

/**
 * Per-ring shader uniforms.
 *
 * Owned by the ring and handed to `shader.uniforms` rather than read back from a captured
 * `shader` reference, for the same reason the aurora does it: Three.js shares compiled
 * programs between materials, so a captured reference can end up belonging to another one.
 */
type RingUniforms = {
    /** Unit vector toward the star, in the ring's local frame. */
    uLightDir: { value: THREE.Vector3 };
    /** 1 when a star is lighting the ring, 0 for even, unshadowed light. */
    uLightOn: { value: number };
    /** Host body radius in geometry units, for the shadow test. */
    uPlanetRadius: { value: number };
};

/**
 * Lighting is done in the ring's local frame, where the planet sits at the origin. World
 * coordinates here run to millions of units, and float32 cannot resolve a planet-sized shadow
 * edge at that magnitude.
 */
const RING_VERTEX_PARS = /* glsl */ `
    varying vec3 vRingLocal;
`;

const RING_FRAGMENT_PARS = /* glsl */ `
    uniform vec3 uLightDir;
    uniform float uLightOn;
    uniform float uPlanetRadius;
    varying vec3 vRingLocal;
`;

const RING_FRAGMENT_CHUNK = /* glsl */ `
    if (uLightOn > 0.5) {
        // Rings are thin and translucent, so they glow on the face turned away from the star
        // instead of going black; the floor keeps an edge-on ring faintly visible.
        float ringLit = 0.2 + 0.8 * abs(uLightDir.y);

        // The planet shadows the ring when the ray from the ring toward the star passes
        // through the planet: the planet is on the star's side of the fragment (b < 0) and
        // the ray's closest approach to the planet's centre is inside its radius.
        float ringB = dot(vRingLocal, uLightDir);
        float ringD = sqrt(max(dot(vRingLocal, vRingLocal) - ringB * ringB, 0.0));
        float ringPenumbra = uPlanetRadius * ${SHADOW_PENUMBRA.toFixed(3)};
        float ringShadow = (1.0 - smoothstep(uPlanetRadius - ringPenumbra, uPlanetRadius + ringPenumbra, ringD))
            * step(ringB, 0.0);

        diffuseColor.rgb *= ringLit * mix(1.0, ${SHADOW_LIGHT.toFixed(2)}, ringShadow);
    }
`;

/** Attaches the lighting shader to a ring material, driven by the caller-owned uniforms. */
function applyRingShader(mat: THREE.MeshBasicMaterial, uniforms: RingUniforms): void {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uLightDir = uniforms.uLightDir;
        shader.uniforms.uLightOn = uniforms.uLightOn;
        shader.uniforms.uPlanetRadius = uniforms.uPlanetRadius;

        shader.vertexShader = shader.vertexShader
            .replace('void main() {', `${RING_VERTEX_PARS}\nvoid main() {`)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRingLocal = position;');
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', `${RING_FRAGMENT_PARS}\nvoid main() {`)
            .replace('#include <map_fragment>', `#include <map_fragment>\n${RING_FRAGMENT_CHUNK}`);
    };
}

/**
 * A planetary ring system: a flat, banded, translucent annulus around a body's equator.
 *
 * Bands, colours and extent all come from the `IRingSpec`, so the same spec always renders the
 * same rings. The fine ringlet detail is drawn into a strip texture from the spec's seed.
 *
 * The rings are added as a child of `parent` (the body mesh), so they inherit axial tilt and
 * azimuth automatically. They also inherit the body's spin, which is invisible because the
 * texture is radially symmetric.
 *
 * Lit by one star and shadowed by the body, both analytically in the fragment shader — no
 * shadow maps. Feed it the star's direction each frame through `update()`.
 *
 * @param radius Host body radius, in the same units as the body mesh.
 * @param spec Ring extent (in body radii), bands and detail seed.
 * @param parent Object3D to attach to — the body mesh.
 */
export function createPlanetRings(
    radius: number,
    spec: IRingSpec,
    parent: THREE.Object3D
): PlanetRingsHandle {
    const geometry = buildRingGeometry(radius * spec.innerRatio, radius * spec.outerRatio);
    const texture = drawRingTexture(spec);

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    const uniforms: RingUniforms = {
        uLightDir: { value: new THREE.Vector3(0, 1, 0) },
        uLightOn: { value: 0 },
        uPlanetRadius: { value: radius },
    };
    applyRingShader(material, uniforms);

    const mesh = new THREE.Mesh(geometry, material);
    parent.add(mesh);

    // Remembered so setRadius rescales relative to the build rather than compounding.
    const builtRadius = radius;

    return {
        dispose: () => {
            if (mesh.parent) mesh.parent.remove(mesh);
            geometry.dispose();
            material.dispose();
            texture.dispose();
        },

        update: (lightDirLocal) => {
            if (lightDirLocal) {
                uniforms.uLightDir.value.copy(lightDirLocal);
                uniforms.uLightOn.value = 1;
            } else {
                uniforms.uLightOn.value = 0;
            }
        },

        setRadius: (newRadius) => {
            if (!Number.isFinite(newRadius) || newRadius <= 0 || builtRadius <= 0) return;
            mesh.scale.setScalar(newRadius / builtRadius);
        },
    };
}
