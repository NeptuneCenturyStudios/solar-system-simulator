import * as THREE from 'three';
import { getCloudNoiseTexture } from '../drawing/cloud-noise-texture';
import type { ICloudProfile } from '../procedural/cloud-profile';
import {
    CLOUD_BASE_FACTOR,
    CLOUD_OPTICAL_DEPTH,
    CLOUD_TOP_FACTOR,
    MAX_LIGHTING_STARS,
} from '../utilities/consts';
import type { IStarLightingSet } from './star-illumination';

/**
 * Shared pieces of the cloud shaders: the uniforms one body's cloud layer owns and the GLSL that
 * turns them into a coverage map. The flat (Low) and volumetric (Medium/High) materials both
 * include it and share one uniform set, so every tier draws exactly the same clouds and the
 * switch between them never moves one.
 *
 * All maths runs in the cloud meshes' object space, where the cloud top is the unit sphere and
 * +Y is the spin axis (the layer is a child of the body mesh, which carries the axial tilt).
 *
 * This GLSL is the only definition of the cloud shape. Lens flares measure how much cloud lies
 * between the camera and a star with cloudLineTransmittance, run on the GPU by
 * cloud-transmittance-probe.ts and read back, so there is no CPU copy to keep in step.
 */

/**
 * Marches stop a hair inside the faceted body mesh (see atmosphere-shell GROUND_CLIP_FACTOR), as
 * a fraction of the planet radius.
 */
export const CLOUD_GROUND_CLIP = 0.998;

/**
 * Detail-noise frequency in object space. The deck is ~0.02 units thick, and a Worley cell of
 * the first detail octave (4 cells per repeat) at this scale is ~0.016 units: billows about as
 * wide as the deck is deep. The fine octave is ~3x smaller again.
 */
export const CLOUD_DETAIL_SCALE = 16;

/** The planet surface and cloud base as fractions of the cloud-top radius. */
export const CLOUD_PLANET_R = 1 / CLOUD_TOP_FACTOR;
export const CLOUD_BASE_R = CLOUD_BASE_FACTOR / CLOUD_TOP_FACTOR;
/** Deck thickness in object units. */
export const CLOUD_THICK = 1 - CLOUD_BASE_R;

/**
 * Fraction of the deck's thickness the thickest cloud column actually fills (the height profile
 * thins it toward the base and top). Turns CLOUD_OPTICAL_DEPTH into an extinction coefficient.
 */
const COLUMN_FILL = 0.6;
/** Extinction per object unit at density 1 (before the profile's densityScale). */
export const CLOUD_SIGMA = CLOUD_OPTICAL_DEPTH / (CLOUD_THICK * COLUMN_FILL);

export type CloudUniforms = {
    uCloudNoise: THREE.IUniform<THREE.Data3DTexture>;
    uCloudScale: THREE.IUniform<number>;
    uCloudSeedOffset: THREE.IUniform<THREE.Vector3>;
    uCloudBandStretch: THREE.IUniform<number>;
    uCloudLatBias: THREE.IUniform<THREE.Vector4>;
    uCloudCoverage: THREE.IUniform<number>;
    uCloudCoverageFloor: THREE.IUniform<number>;
    uCloudSwirl: THREE.IUniform<number>;
    uCloudTime: THREE.IUniform<number>;
    uCloudTint: THREE.IUniform<THREE.Color>;
    uCloudShadeContrast: THREE.IUniform<number>;
    uCloudDensityScale: THREE.IUniform<number>;
    /** x: billowiness, y: wispiness, z: cirrus amount, w: max cloud height (fraction of deck). */
    uCloudShape: THREE.IUniform<THREE.Vector4>;
    /** 0..1: how thin and translucent cloud margins are (cores stay solid). */
    uCloudEdgeSoftness: THREE.IUniform<number>;
    /** x: weather-system scale, y: weather-system strength, z: cloud size variety, w: cohesion. */
    uCloudSystems: THREE.IUniform<THREE.Vector4>;
    /** Colour of the skylight on the clouds: the body's atmosphere tint, softened toward white. */
    uCloudSkyTint: THREE.IUniform<THREE.Color>;
    /** Flat/volumetric crossfade: 0 = flat only, 1 = volumetric only. */
    uCloudVolumetricFade: THREE.IUniform<number>;
    /** Camera position in object space, written by each mesh right before it draws. */
    uCloudCamObj: THREE.IUniform<THREE.Vector3>;
    uCloudStarCount: THREE.IUniform<number>;
    /** Object-space unit directions toward each star, written right before each draw. */
    uCloudStarDir: THREE.IUniform<THREE.Vector3[]>;
    /** Each star's colour × irradiance at the body (linear). */
    uCloudStarLight: THREE.IUniform<THREE.Vector3[]>;
};

/**
 * @param skyTint The body's atmosphere tint. The skylight the clouds receive is this colour
 *                normalised to its brightest channel and mixed halfway to white.
 */
export function createCloudUniforms(
    profile: ICloudProfile,
    skyTint: THREE.Color | null
): CloudUniforms {
    const sky = new THREE.Color(1, 1, 1);
    if (skyTint) {
        const max = Math.max(skyTint.r, skyTint.g, skyTint.b, 1e-4);
        sky.setRGB(skyTint.r / max, skyTint.g / max, skyTint.b / max).lerp(_white, 0.5);
    }
    const uniforms: CloudUniforms = {
        uCloudNoise: { value: getCloudNoiseTexture() },
        uCloudScale: { value: profile.scale },
        uCloudSeedOffset: { value: profile.seedOffset.clone() },
        uCloudBandStretch: { value: profile.bandStretch },
        uCloudLatBias: { value: profile.latitudeBias.clone() },
        uCloudCoverage: { value: profile.coverage },
        uCloudCoverageFloor: { value: profile.coverageFloor },
        uCloudSwirl: { value: profile.swirl },
        uCloudTime: { value: 0 },
        uCloudTint: { value: profile.tint.clone() },
        uCloudShadeContrast: { value: profile.shadeContrast },
        uCloudDensityScale: { value: profile.densityScale },
        uCloudShape: {
            value: new THREE.Vector4(
                profile.billowiness,
                profile.wispiness,
                profile.cirrus,
                profile.maxHeight
            ),
        },
        uCloudEdgeSoftness: { value: profile.edgeSoftness },
        uCloudSystems: {
            value: new THREE.Vector4(
                profile.systemScale,
                profile.systemStrength,
                profile.sizeVariety,
                profile.cohesion
            ),
        },
        uCloudSkyTint: { value: sky },
        uCloudVolumetricFade: { value: 0 },
        uCloudCamObj: { value: new THREE.Vector3() },
        uCloudStarCount: { value: 0 },
        uCloudStarDir: { value: [] },
        uCloudStarLight: { value: [] },
    };
    for (let i = 0; i < MAX_LIGHTING_STARS; i++) {
        uniforms.uCloudStarDir.value.push(new THREE.Vector3(1, 0, 0));
        uniforms.uCloudStarLight.value.push(new THREE.Vector3());
    }
    return uniforms;
}

/**
 * Copies this frame's star lighting into the uniforms. World-space directions are kept in
 * `worldDirs` and moved into object space per draw by `syncCloudObjectSpace`. Same raw
 * irradiance the surface is lit with: no exposure fudge, so clouds and ground dim together.
 */
export function updateCloudStarLighting(
    uniforms: CloudUniforms,
    worldDirs: THREE.Vector3[],
    lights: IStarLightingSet
): void {
    const count = Math.min(lights.count, MAX_LIGHTING_STARS);
    let active = 0;
    for (let i = 0; i < count; i++) {
        const light = lights.lights[i];
        if (!(light.irradiance > 0)) continue;
        worldDirs[active].copy(light.dir);
        const k = light.irradiance;
        uniforms.uCloudStarLight.value[active].set(
            light.color.r * k,
            light.color.g * k,
            light.color.b * k
        );
        active++;
    }
    uniforms.uCloudStarCount.value = active;
}

const _white = new THREE.Color(1, 1, 1);
const _invWorld = new THREE.Matrix4();
const _camWorld = new THREE.Vector3();

/**
 * Writes the camera position and star directions in `mesh`'s object space. Call from the
 * mesh's onBeforeRender, after three.js has updated the world matrices. Returns the camera's
 * object-space distance from the centre squared (< 1 means it is inside the cloud top).
 */
export function syncCloudObjectSpace(
    uniforms: CloudUniforms,
    worldDirs: THREE.Vector3[],
    mesh: THREE.Object3D,
    camera: THREE.Camera
): number {
    _invWorld.copy(mesh.matrixWorld).invert();
    _camWorld.setFromMatrixPosition(camera.matrixWorld);
    const camObj = uniforms.uCloudCamObj.value.copy(_camWorld).applyMatrix4(_invWorld);
    const count = uniforms.uCloudStarCount.value;
    for (let i = 0; i < count; i++) {
        uniforms.uCloudStarDir.value[i].copy(worldDirs[i]).transformDirection(_invWorld);
    }
    return camObj.lengthSq();
}

const f = (n: number): string => n.toFixed(6);

/**
 * Uniform declarations, the coverage function and lighting helpers. Inject after
 * `#include <common>` in a fragment shader.
 */
export const CLOUD_COMMON_GLSL = /* glsl */ `
#define CLOUD_MAX_STARS ${MAX_LIGHTING_STARS}
const float CLOUD_PLANET_R = ${f(CLOUD_PLANET_R)};
const float CLOUD_BASE_R = ${f(CLOUD_BASE_R)};
const float CLOUD_DETAIL_SCALE = ${f(CLOUD_DETAIL_SCALE)};
const float CLOUD_THICK = ${f(CLOUD_THICK)};
const float CLOUD_SIGMA = ${f(CLOUD_SIGMA)};
const float CLOUD_GROUND_CLIP = ${f(CLOUD_GROUND_CLIP)};

uniform sampler3D uCloudNoise;
uniform float uCloudScale;
uniform vec3 uCloudSeedOffset;
uniform float uCloudBandStretch;
uniform vec4 uCloudLatBias;
uniform float uCloudCoverage;
uniform float uCloudCoverageFloor;
uniform float uCloudSwirl;
uniform float uCloudTime;
uniform vec3 uCloudTint;
uniform float uCloudShadeContrast;
uniform float uCloudDensityScale;
uniform vec4 uCloudShape;
uniform float uCloudEdgeSoftness;
uniform vec4 uCloudSystems;
uniform vec3 uCloudSkyTint;
uniform float uCloudVolumetricFade;
uniform vec3 uCloudCamObj;
uniform int uCloudStarCount;
uniform vec3 uCloudStarDir[CLOUD_MAX_STARS];
uniform vec3 uCloudStarLight[CLOUD_MAX_STARS];

float cloudNoiseR(vec3 p) { return texture(uCloudNoise, p).r; }

// Cloud cover for a unit direction from the body centre (object space, +Y = spin axis).
// x: coverage 0..1, y: the raw noise (0..1), used to shade bands inside a closed deck.
// Sampled by direction, not UV, so there is no seam and no pinching at the poles.
vec2 cloudField(vec3 dir) {
    // Squeezing the domain along the spin axis smears weather into east-west bands.
    vec3 q = vec3(dir.x, dir.y * uCloudBandStretch, dir.z) * uCloudScale + uCloudSeedOffset;

    // Domain warp curls the clouds into swirls. The warp field drifts with time while the base
    // noise stays put, so systems grow, twist and dissolve in place rather than scrolling.
    vec3 wq = q * 0.5 + vec3(uCloudTime, 0.0, -0.7 * uCloudTime);
    float wa = cloudNoiseR(wq) - 0.5;
    float wb = cloudNoiseR(wq + vec3(0.43, 0.17, 0.71)) - 0.5;
    q += vec3(wa, 0.5 * wb, wb - wa) * uCloudSwirl;

    // R is histogram-equalised, so this blend sits around 0.5 with a predictable spread.
    // Cohesion turns down the two finer octaves, which otherwise fragment a big cloud's outline
    // into satellite patches near the threshold.
    float cohesion = uCloudSystems.w;
    float w2 = 0.3 * (1.0 - 0.6 * cohesion);
    float w3 = 0.15 * (1.0 - cohesion);
    float n = (cloudNoiseR(q) * 0.55
        + cloudNoiseR(q * 2.07 + vec3(0.13, 0.29, 0.61)) * w2
        + cloudNoiseR(q * 4.31 + vec3(0.57, 0.83, 0.37)) * w3) / (0.55 + w2 + w3);

    // Weather systems: a much lower-frequency field (continent-sized at the default scale) that
    // drifts slowly with the weather.
    vec3 sysq = vec3(dir.x, dir.y * uCloudBandStretch, dir.z) * uCloudSystems.x
        + uCloudSeedOffset.yzx + vec3(0.0, 0.0, 0.5 * uCloudTime);
    // Size variety: in some regions (a second low-frequency mask) the clouds come from the same
    // noise at under half the frequency, so they grow into a few large masses while elsewhere
    // they stay small.
    float sizeMask = smoothstep(0.35, 0.65, cloudNoiseR(sysq * 1.7 + vec3(0.19, 0.83, 0.47)));
    float big = cloudNoiseR(q * 0.45 + vec3(0.61, 0.07, 0.33));
    n = mix(n, big, uCloudSystems.z * sizeMask);
    // Systems push cover up (fronts, overcast decks where neighbouring clouds merge) or down
    // (clear high-pressure regions).
    n += (cloudNoiseR(sysq) - 0.5) * uCloudSystems.y;

    // Circulation bands, by sin(latitude).
    float s = abs(dir.y);
    float ds = (s - 0.45) / 0.12;
    float dm = (s - 0.77) / 0.1;
    float lat = uCloudLatBias.x * exp(-s * s / 0.02)
        + uCloudLatBias.y * exp(-ds * ds)
        + uCloudLatBias.z * exp(-dm * dm)
        + uCloudLatBias.w * smoothstep(0.85, 1.0, s);

    // A wide ramp: only the cores of weather systems reach full cover. The volumetric deck turns
    // cover into height (cloudDensity), so this is what gives clouds varied, domed tops.
    float threshold = mix(0.72, 0.3, uCloudCoverage);
    float cov = smoothstep(threshold - 0.02, threshold + 0.28, n + lat);
    return vec2(max(cov, uCloudCoverageFloor), n);
}

// Unit east direction at a point on the globe (the direction of the zonal wind).
vec3 cloudEast(vec3 up) {
    vec3 e = vec3(-up.z, 0.0, up.x);
    float l = length(e);
    return l > 1e-4 ? e / l : vec3(1.0, 0.0, 0.0);
}

// Erodes a smooth cloud shape (0..1) into cumulus detail. h is the height in the deck (0 base,
// 1 top), up the unit direction of p. After Schneider (Horizon Zero Dawn): eroding by the gaps
// between Worley puffs leaves rounded billows, eroding by the puffs themselves leaves frayed,
// stringy wisps, so clouds billow on top and fray toward the base. 'fine' adds a smaller octave
// on the edges only: the cauliflower texture of cumulus heads.
float cloudErode(float shape, vec3 p, vec3 up, float h, bool fine) {
    float billow = uCloudShape.x;
    // Wind shear: the upper cloud leans downwind.
    vec3 dp = p * CLOUD_DETAIL_SCALE + cloudEast(up) * (0.35 * h) + vec3(0.5 * uCloudTime);

    // Cohesion: how much of the cloud body the detail below leaves alone. 0 lets it bite all the
    // way through (clusters of separate puffs); 1 confines it to the margins, so a big cloud stays
    // one solid mass with a billowy outline.
    float protect = uCloudSystems.w * smoothstep(0.3, 0.85, shape);

    // Cotton-ball lobes: a coarse Worley octave (~2.5x the billow size) bulges the outline in and
    // out into a few big rounded puffs, which the billow erosion below then breaks up.
    float lobe = texture(uCloudNoise, dp * 0.4 + vec3(0.71, 0.23, 0.59)).g;
    float lobeShape = min(shape * mix(1.0, 1.3 * smoothstep(0.15, 0.85, lobe), 0.6 * billow), 1.0);
    shape = mix(lobeShape, shape, protect);

    float worley = dot(texture(uCloudNoise, dp).gba, vec3(0.625, 0.25, 0.125));
    float billowZone = smoothstep(0.0, mix(0.1, 0.7, uCloudShape.y), h);
    float e = mix(worley, 1.0 - worley, billowZone) * mix(0.2, 0.5, billow) * (1.0 - protect);
    float d = clamp((shape - e) / max(1.0 - e, 1e-3), 0.0, 1.0);
    if (fine && d > 0.0 && d < 0.7) {
        float g = texture(uCloudNoise, dp * 3.17 + vec3(0.31, 0.47, 0.13)).g;
        float e2 = mix(g, 1.0 - g, billowZone) * mix(0.1, 0.3, billow) * (1.0 - protect);
        d = clamp((d - e2) / max(1.0 - e2, 1e-3), 0.0, 1.0);
    }
    // Soft margins: thin the density toward the edges (d^2 there) while cores stay at 1, so
    // clouds fade out in translucent fluff instead of ending at a hard surface.
    return mix(d, d * d, uCloudEdgeSoftness);
}

// Cirrus: thin, faint ice veils high in the deck, drawn out roughly east-west. A low-frequency
// warp bends the streaks so they curve, fan out and change direction from patch to patch instead
// of running in parallel lines. n is the raw coverage noise, so the veils come and go in patches.
float cloudCirrus(vec3 p, float h, float n) {
    if (uCloudShape.z <= 0.0 || h < 0.65) return 0.0;
    float band = smoothstep(0.65, 0.8, h) * (1.0 - smoothstep(0.92, 1.0, h));
    vec3 wq = p * 1.4 + uCloudSeedOffset.zxy;
    vec2 w = vec2(
        texture(uCloudNoise, wq).r,
        texture(uCloudNoise, wq + vec3(0.37, 0.71, 0.19)).r
    ) - 0.5;
    vec3 cq = vec3(
        p.x * 2.5 + w.x * 1.5,
        p.y * 10.0 + (w.x + w.y) * 5.0,
        p.z * 2.5 + w.y * 1.5
    ) + uCloudSeedOffset.yzx + vec3(0.3 * uCloudTime, 0.0, 0.0);
    float streak = texture(uCloudNoise, cq).r;
    return smoothstep(0.62, 0.95, streak) * smoothstep(0.45, 0.75, n) * band * uCloudShape.z * 0.04;
}

// Density (0..1) at object-space point p (unit direction up), height h in the deck (0 base,
// 1 top), in a column whose coverage field (cloudField) is 'field'.
float cloudDensity(vec3 p, vec3 up, float h, vec2 field, bool fine) {
    if (h <= 0.0 || h >= 1.0) return 0.0;
    float cov = field.x;
    float dens = 0.0;
    float hn = h / max(uCloudShape.w, 1e-3);
    if (cov > 0.0 && hn < 1.0) {
        // Dome: the cover a point needs to be inside cloud grows with height, so thick cover
        // rises into tall rounded heads while a cloud's thin margins keep only their lower part.
        // Clouds round over at the sides instead of rising in sheer walls. Billowy types stay
        // wide until high up (heaped cumulus); flat ones taper fast into low sheets.
        float need = pow(hn, mix(0.7, 2.0, uCloudShape.x));
        // Thin cover is thin cloud; with cohesion, cloud bodies reach full density instead.
        float shape = clamp((cov - need) / 0.25, 0.0, 1.0)
            * smoothstep(0.0, 0.05, h) // flat base
            * mix(cov, 1.0, uCloudSystems.w);
        if (shape > 0.0) dens = cloudErode(shape, p, up, h, fine);
    }
    return dens + cloudCirrus(p, h, field.y);
}

// Fraction of light (0..1) that gets through the deck along a ray (object space, rd unit
// length), from ro onward. Stops at the ground; whether the planet itself blocks the ray is the
// caller's business. Same two-segment march as the volumetric view ray, skipping the clear
// hole under the cloud base.
float cloudLineTransmittance(vec3 ro, vec3 rd, int samples) {
    float b = dot(ro, rd);
    float roLenSq = dot(ro, ro);
    float disc = b * b - (roLenSq - 1.0);
    if (disc <= 0.0) return 1.0;
    float sq = sqrt(disc);
    float t0 = max(-b - sq, 0.0);
    float t1 = -b + sq;
    if (t1 <= t0) return 1.0;

    float groundR = CLOUD_PLANET_R * CLOUD_GROUND_CLIP;
    float discG = b * b - (roLenSq - groundR * groundR);
    if (discG > 0.0) {
        float tg = -b - sqrt(discG);
        if (tg > t0) t1 = min(t1, tg);
    }

    float lenA = t1 - t0;
    float startB = t1;
    float lenB = 0.0;
    float discI = b * b - (roLenSq - CLOUD_BASE_R * CLOUD_BASE_R);
    if (discI > 0.0) {
        float sqI = sqrt(discI);
        lenA = max(min(t1, -b - sqI) - t0, 0.0);
        startB = max(t0, -b + sqI);
        lenB = max(t1 - startB, 0.0);
    }
    float total = lenA + lenB;
    if (total <= 0.0) return 1.0;

    float ds = total / float(samples);
    float od = 0.0;
    for (int i = 0; i < samples; i++) {
        float s = (float(i) + 0.5) * ds;
        float t = s < lenA ? t0 + s : startB + (s - lenA);
        vec3 p = ro + rd * t;
        float r = length(p);
        float h = (r - CLOUD_BASE_R) / CLOUD_THICK;
        if (h <= 0.0 || h >= 1.0) continue;
        vec3 up = p / r;
        od += cloudDensity(p, up, h, cloudField(up), true) * ds;
    }
    return exp(-od * CLOUD_SIGMA * uCloudDensityScale);
}

// Brightness variation inside the cloud, strongest in closed decks.
float cloudShade(float n) {
    return mix(1.0 - uCloudShadeContrast, 1.0, n);
}

// Henyey-Greenstein phase, normalised over the sphere (1/4pi for g = 0).
float cloudHG(float cosT, float g) {
    float g2 = g * g;
    return 0.0795775 * (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * cosT, 1e-4), 1.5);
}

// Dual-lobe phase: a strong forward lobe (the silver lining) plus a weaker back lobe so clouds
// facing the star are bright. ecc < 1 relaxes both lobes, for the multiple-scattering octaves.
float cloudPhase(float cosT, float ecc) {
    return mix(cloudHG(cosT, 0.7 * ecc), cloudHG(cosT, -0.3 * ecc), 0.35);
}

// Indirect light on the cloud, per unit of the star's light: skylight from the lit atmosphere
// (tinted, strongest on the tops) plus sunlight bounced off the ground onto the bases. Keeps the
// undersides grey rather than black. Fades out through twilight with the direct light.
vec3 cloudAmbient(float mu, float h) {
    float day = smoothstep(-0.15, 0.3, mu);
    vec3 sky = uCloudSkyTint * (0.08 * mix(0.45, 1.0, h));
    float bounce = 0.03 * (1.0 - h) * max(mu, 0.0);
    return (sky + vec3(bounce)) * day;
}

// White-noise per-pixel jitter for ray starts. Unlike interleaved gradient noise, it has no
// diagonal structure, so the leftover sampling error reads as fine grain, not hatching.
float cloudJitter(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}
`;
