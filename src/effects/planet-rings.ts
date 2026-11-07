import * as THREE from 'three';
import type { IRingSpec } from '../interfaces';
import { SeededRandom } from '../utilities/prng';
import { MAX_LIGHTING_STARS } from '../utilities/consts';
import type { IStarLightingSet } from './star-illumination';
import { STAR_OCCLUSION_GLSL } from './shadows/star-occlusion-glsl';

export type PlanetRingsHandle = {
    dispose: () => void;
    /**
     * Feeds this frame's star lighting at the body (world space, from gatherStarLighting).
     * Every star in the set lights the rings and casts the planet's shadow across them.
     */
    update: (lights: IStarLightingSet) => void;
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
    /** How many entries of the star arrays are live this frame. */
    uRingStarCount: { value: number };
    /** Unit vectors toward each star, in the ring's local frame. */
    uRingStarDir: { value: THREE.Vector3[] };
    /** Each star's light at the body: colour × irradiance, as three.js lights the surface. */
    uRingStarLight: { value: THREE.Vector3[] };
    /** Angular radius of each star's disc as seen from the body, in radians. */
    uRingStarAngle: { value: number[] };
    /** The scene's ambient light (colour × intensity, summed). */
    uRingAmbient: { value: THREE.Vector3 };
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
    #define RING_MAX_STARS ${MAX_LIGHTING_STARS}
    uniform int uRingStarCount;
    uniform vec3 uRingStarDir[RING_MAX_STARS];
    uniform vec3 uRingStarLight[RING_MAX_STARS];
    uniform float uRingStarAngle[RING_MAX_STARS];
    uniform vec3 uRingAmbient;
    uniform float uPlanetRadius;
    varying vec3 vRingLocal;

    ${STAR_OCCLUSION_GLSL}
`;

const RING_FRAGMENT_CHUNK = /* glsl */ `
    {
        vec3 ringLight = uRingAmbient;

        // The planet as seen from this fragment: its direction and angular radius.
        float ringDist = length(vRingLocal);
        vec3 ringToPlanet = -vRingLocal / max(ringDist, 1e-6);
        float ringPlanetAngle = asin(clamp(uPlanetRadius / max(ringDist, 1e-6), 0.0, 1.0));

        for (int s = 0; s < RING_MAX_STARS; s++) {
            if (s >= uRingStarCount) break;
            vec3 L = uRingStarDir[s];

            // Rings are thin and translucent, so they glow on the face turned away from the
            // star instead of going black; the floor keeps an edge-on ring faintly visible.
            float ringLit = 0.2 + 0.8 * abs(L.y);

            // Angle between the star and the planet's centre in this fragment's sky. atan2
            // of cross and dot stays precise where acos of a near-1 dot would not.
            float ringSep = atan(length(cross(ringToPlanet, L)), dot(ringToPlanet, L));

            // A distant star's shadow edge can be far narrower than a pixel; widen the star
            // to about one pixel of separation so the edge is antialiased, not jagged.
            float ringStarAngle = max(max(uRingStarAngle[s], fwidth(ringSep)), 1e-6);

            float ringShadow = starDiscOcclusion(ringStarAngle, ringPlanetAngle, ringSep);
            ringLight += uRingStarLight[s] * ringLit * (1.0 - ringShadow);
        }
        // Lambertian 1/pi, exactly as the lit surfaces scale their irradiance.
        diffuseColor.rgb *= ringLight * RECIPROCAL_PI;
    }
`;

/**
 * Scene ambient light, summed once per rendered frame and shared by every ring.
 * MeshBasicMaterial gets no light uniforms from three.js, so the rings read it themselves.
 */
const _ambient = new THREE.Vector3();
let _ambientFrame = -1;

function sceneAmbient(renderer: THREE.WebGLRenderer, scene: THREE.Object3D): THREE.Vector3 {
    const frame = renderer.info.render.frame;
    if (frame === _ambientFrame) return _ambient;
    _ambientFrame = frame;
    _ambient.set(0, 0, 0);
    for (const child of scene.children) {
        if (!(child instanceof THREE.AmbientLight) || !child.visible) continue;
        _ambient.x += child.color.r * child.intensity;
        _ambient.y += child.color.g * child.intensity;
        _ambient.z += child.color.b * child.intensity;
    }
    return _ambient;
}

/** Attaches the lighting shader to a ring material, driven by the caller-owned uniforms. */
function applyRingShader(mat: THREE.MeshBasicMaterial, uniforms: RingUniforms): void {
    mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);

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
 * Lit by up to MAX_LIGHTING_STARS stars, each of which the body shadows, all analytically in
 * the fragment shader — no shadow maps. Feed it the star lighting each frame through
 * `update()`. Brightness is the raw irradiance the planet's surface receives, plus the scene's
 * ambient light, so the rings brighten and dim with the planet.
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
        uRingStarCount: { value: 0 },
        uRingStarDir: { value: [] },
        uRingStarLight: { value: [] },
        uRingStarAngle: { value: [] },
        uRingAmbient: { value: new THREE.Vector3() },
        uPlanetRadius: { value: radius },
    };
    for (let i = 0; i < MAX_LIGHTING_STARS; i++) {
        uniforms.uRingStarDir.value.push(new THREE.Vector3(0, 1, 0));
        uniforms.uRingStarLight.value.push(new THREE.Vector3());
        uniforms.uRingStarAngle.value.push(0);
    }
    applyRingShader(material, uniforms);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.onBeforeRender = (renderer, scene) => {
        uniforms.uRingAmbient.value.copy(sceneAmbient(renderer, scene));
    };
    parent.add(mesh);

    // Scratch for taking world directions into the body's local frame.
    const invParentQuat = new THREE.Quaternion();

    // Remembered so setRadius rescales relative to the build rather than compounding.
    const builtRadius = radius;

    return {
        dispose: () => {
            if (mesh.parent) mesh.parent.remove(mesh);
            geometry.dispose();
            material.dispose();
            texture.dispose();
        },

        update: (lights) => {
            // The direction is handed over in the body mesh's local frame, where the rings
            // live, and computed here on the CPU because world coordinates are too large for
            // the shader to resolve a planet-sized shadow edge.
            invParentQuat.copy(parent.quaternion).invert();
            const count = Math.min(lights.count, MAX_LIGHTING_STARS);
            let active = 0;
            for (let i = 0; i < count; i++) {
                const light = lights.lights[i];
                if (!(light.irradiance > 0)) continue;
                uniforms.uRingStarDir.value[active].copy(light.dir).applyQuaternion(invParentQuat);
                const k = light.irradiance;
                uniforms.uRingStarLight.value[active].set(
                    light.color.r * k,
                    light.color.g * k,
                    light.color.b * k
                );
                uniforms.uRingStarAngle.value[active] = light.angularRadius;
                active++;
            }
            uniforms.uRingStarCount.value = active;
        },

        setRadius: (newRadius) => {
            if (!Number.isFinite(newRadius) || newRadius <= 0 || builtRadius <= 0) return;
            mesh.scale.setScalar(newRadius / builtRadius);
        },
    };
}
