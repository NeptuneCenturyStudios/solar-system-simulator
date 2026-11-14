import * as THREE from 'three';
import { getCloudNoiseTexture } from '../drawing/cloud-noise-texture';

/**
 * Harmonic numbers of the oval warp and of the curtain-height wobble. Shared with the ribbon
 * tiers in `aurora.ts`, which build their `RibbonShape`s from these same lists, so the
 * volumetric curtains follow exactly the oval the ribbons would have drawn.
 */
export const AURORA_WARP_HARMONICS = [2, 3, 5] as const;
export const AURORA_WOBBLE_HARMONICS = [2, 4, 7] as const;

/** Layers (concentric ovals) evaluated per hemisphere. Must match `LAYERS` in `aurora.ts`. */
export const AURORA_VOLUME_LAYERS = 2;

/** Ceiling on ray-march iterations per pixel. Steps are adaptive, so most rays use far fewer. */
const MAX_STEPS = 96;

/**
 * Planet surface, in body radii (the volume mesh is scaled by the radius). Rays stop here, so
 * a ray dipping below the horizon gathers nothing from curtains beyond it. The surface itself,
 * not the clouds' slightly lower clip: the curtain base is at 1.005, so nothing is lost.
 */
const GROUND_R = 1.0;

/** How far behind each fragment the ray is started, in body radii; must clear the whole dome. */
const RAY_BACKOFF = 4;

/**
 * Curtain-sheet thickness, halo width and red-glow width, as fractions of the curtain height.
 * Real curtains are a few kilometres thick and hundreds tall; 3% keeps them reading as a sheet
 * without needing hundreds of samples to find it.
 */
const SHEET_FRACTION = 0.03;
const HALO_FRACTION = 0.1;
const RED_FRACTION = 0.09;

/** Fold displacement of the oval, as a fraction of its co-latitude: large folds and fine curls. */
const FOLD_AMOUNT = 0.22;
const CURL_AMOUNT = 0.035;

/** Radius of the circle the noise volume is sampled along: sets how many folds / rays fit around. */
const FOLD_NOISE_R = 0.32;
const RAY_NOISE_R = 4.0;
/** Worley cells per noise unit in the fine (alpha) channel — the ray density. */
const RAY_CELLS = 16;

/** Poleward lean of the curtain with altitude (radians per body radius), as the ribbons use. */
const LEAN = 0.35;

/** Emission saturates softly toward this (linear) level so edge-on folds glow instead of clip. */
const SATURATION = 3.0;

/** Overall emission gain, tuned against the ribbon tiers' brightness. */
const GAIN = 0.85;

const f = (n: number): string => n.toFixed(6);

/** Per-layer animated state, written every frame by `aurora.ts`. */
export interface IAuroraVolumeLayerState {
    /** Oval co-latitude, after breathing. Radians. */
    colatitudeRad: number;
    /** Curtain height, after breathing, in the body mesh's units. */
    curtainHeight: number;
    /** Warp harmonic amplitudes/phases, in `AURORA_WARP_HARMONICS` order. */
    warp: readonly { amplitude: number; phase: number }[];
    /** Height wobble amplitudes/phases, in `AURORA_WOBBLE_HARMONICS` order. */
    wobble: readonly { amplitude: number; phase: number }[];
    /** Brightness multiplier (field strength x layer opacity x pulse). */
    intensity: number;
}

export interface IVolumetricAuroraOptions {
    /** Body radius in the parent's units, at build time. */
    radius: number;
    /** +1 north, -1 south, in the aurora group's magnetic frame. */
    hemisphere: 1 | -1;
    /** Base of the curtains, in body radii. */
    baseAltitude: number;
    /** Largest co-latitude any oval of this hemisphere can reach (warp, breath, folds included). */
    boundColatitudeRad: number;
    /** Tallest curtain this hemisphere can reach, in the parent's units. */
    boundHeight: number;
    /** Typical curtain height, in the parent's units; sizes the sheet thickness. */
    typicalHeight: number;
    tint: THREE.Color;
    /** Noise offsets per layer, so the layers and hemispheres don't share folds or rays. */
    seeds: readonly THREE.Vector3[];
}

export interface IVolumetricAuroraHandle {
    mesh: THREE.Mesh;
    setTime: (time: number) => void;
    setLayer: (index: number, state: IAuroraVolumeLayerState) => void;
    dispose: () => void;
}

type VolumeUniforms = {
    uAuroraNoise: THREE.IUniform<THREE.Data3DTexture>;
    uAuroraTime: THREE.IUniform<number>;
    uAuroraCamObj: THREE.IUniform<THREE.Vector3>;
    uAuroraObjScale: THREE.IUniform<number>;
    uAuroraPixelAngle: THREE.IUniform<number>;
    uAuroraPhiSign: THREE.IUniform<number>;
    uAuroraSheetW: THREE.IUniform<number>;
    uAuroraHaloW: THREE.IUniform<number>;
    uAuroraRedW: THREE.IUniform<number>;
    uAuroraTint: THREE.IUniform<THREE.Color>;
    /** Per layer: (co-latitude, curtain height in body radii, intensity, unused). */
    uAuroraLayer: THREE.IUniform<THREE.Vector4[]>;
    uAuroraWarpAmp: THREE.IUniform<THREE.Vector3[]>;
    uAuroraWarpPhase: THREE.IUniform<THREE.Vector3[]>;
    uAuroraWobAmp: THREE.IUniform<THREE.Vector3[]>;
    uAuroraWobPhase: THREE.IUniform<THREE.Vector3[]>;
    uAuroraSeed: THREE.IUniform<THREE.Vector3[]>;
};

function vec3s(): THREE.Vector3[] {
    return Array.from({ length: AURORA_VOLUME_LAYERS }, () => new THREE.Vector3());
}

/**
 * Builds the convex dome the rays start from: a spherical cap at the curtain-top radius down to
 * the bounding co-latitude, a short wall, and a flat floor through the base circle. It encloses
 * every point with `r` in [base, top] and co-latitude below the bound, so only pixels near the
 * oval are shaded. Profile points run bottom to top, which makes LatheGeometry face outward.
 */
function buildDomeGeometry(baseR: number, topR: number, colat: number): THREE.LatheGeometry {
    const floorY = baseR * Math.cos(colat);
    const rimX = topR * Math.sin(colat);
    // Floor centre, floor edge, then up the wall to the rim and along the cap to the pole.
    const points: THREE.Vector2[] = [new THREE.Vector2(0, floorY), new THREE.Vector2(rimX, floorY)];
    const arcSegments = 24;
    for (let i = 0; i <= arcSegments; i++) {
        const a = colat * (1 - i / arcSegments);
        points.push(new THREE.Vector2(topR * Math.sin(a), topR * Math.cos(a)));
    }
    return new THREE.LatheGeometry(points, 96);
}

const FRAGMENT_PARS = /* glsl */ `
#define AURORA_LAYERS ${AURORA_VOLUME_LAYERS}
#define AURORA_MAX_STEPS ${MAX_STEPS}
const float AURORA_GROUND_R = ${f(GROUND_R)};
const float AURORA_RAY_BACKOFF = ${f(RAY_BACKOFF)};
const float AURORA_FOLD = ${f(FOLD_AMOUNT)};
const float AURORA_CURL = ${f(CURL_AMOUNT)};
const float AURORA_FOLD_R = ${f(FOLD_NOISE_R)};
const float AURORA_RAY_R = ${f(RAY_NOISE_R)};
const float AURORA_RAY_CELLS = ${f(RAY_CELLS)};
const float AURORA_LEAN = ${f(LEAN)};
const float AURORA_SAT = ${f(SATURATION)};
const float AURORA_GAIN = ${f(GAIN)};
const float AURORA_SQRT_PI = 1.7724539;

uniform sampler3D uAuroraNoise;
uniform float uAuroraTime;
uniform vec3 uAuroraCamObj;
uniform float uAuroraObjScale;
uniform float uAuroraPixelAngle;
uniform float uAuroraPhiSign;
uniform float uAuroraSheetW;
uniform float uAuroraHaloW;
uniform float uAuroraRedW;
uniform vec3 uAuroraTint;
uniform vec4 uAuroraLayer[AURORA_LAYERS];
uniform vec3 uAuroraWarpAmp[AURORA_LAYERS];
uniform vec3 uAuroraWarpPhase[AURORA_LAYERS];
uniform vec3 uAuroraWobAmp[AURORA_LAYERS];
uniform vec3 uAuroraWobPhase[AURORA_LAYERS];
uniform vec3 uAuroraSeed[AURORA_LAYERS];

varying vec3 vAuroraObjPos;
varying vec3 vAuroraViewPos;

// Emission colours, linear RGB: atomic-oxygen green (557.7 nm), oxygen red (630 nm) high up,
// and the molecular-nitrogen pink/magenta fringe along the lower edge of intense curtains.
const vec3 AURORA_GREEN = vec3(0.10, 1.00, 0.30);
const vec3 AURORA_RED = vec3(1.00, 0.07, 0.12);
const vec3 AURORA_FRINGE = vec3(0.85, 0.10, 0.70);

// White-noise jitter for the ray start (same hash as cloudJitter): grain rather than banding.
float auroraJitter(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}

// Normalised Gaussian across the sheet: integrates to 1 over a crossing, whatever its width,
// so widening a sheet to stay above the pixel footprint does not change its brightness.
float auroraSheet(float d, float w) {
    float x = d / w;
    return exp(-x * x) / (w * AURORA_SQRT_PI);
}
`;

const FRAGMENT_BODY = /* glsl */ `
    vec3 toFrag = vAuroraObjPos - uAuroraCamObj;
    float camDist = length(toFrag);
    vec3 rd = toFrag / max(camDist, 1e-6);
    vec3 ro = vAuroraObjPos - rd * AURORA_RAY_BACKOFF;
    float tCam = AURORA_RAY_BACKOFF - camDist;

    // ── Clip the ray to the dome: top sphere, floor plane, ground ─────────────────────
    float b = dot(ro, rd);
    float c0 = dot(ro, ro);
    float disc = b * b - (c0 - AURORA_TOP_R * AURORA_TOP_R);
    if (disc <= 0.0) discard;
    float sq = sqrt(disc);
    float t0 = max(-b - sq, tCam);
    float t1 = -b + sq;

    if (abs(rd.y) > 1e-6) {
        float tp = (AURORA_FLOOR_Y - ro.y) / rd.y;
        if (rd.y > 0.0) t0 = max(t0, tp);
        else t1 = min(t1, tp);
    } else if (ro.y < AURORA_FLOOR_Y) {
        discard;
    }

    float discG = b * b - (c0 - AURORA_GROUND_R * AURORA_GROUND_R);
    if (discG > 0.0) {
        float tg = -b - sqrt(discG);
        if (tg > t0) t1 = min(t1, tg);
    }
    if (t1 <= t0) discard;

    // ── March ────────────────────────────────────────────────────────────────────────
    // Emission only (aurorae are optically thin), so this is a plain line integral. Steps are
    // adaptive: far from every sheet the angular distance to the nearest one bounds how far the
    // ray can go without meeting it, so empty sky (the polar cap, the space outside the oval)
    // is crossed in a few long strides and the fine steps are spent inside the curtains.
    vec3 acc = vec3(0.0);
    float tDepth = -1.0;
    // First sample with any emission: the depth fallback for faint pixels.
    float tFirst = -1.0;
    float minStep0 = max(uAuroraSheetW * 0.6, (t1 - t0) / float(AURORA_MAX_STEPS));
    float t = t0 + auroraJitter(gl_FragCoord.xy) * minStep0;

    for (int i = 0; i < AURORA_MAX_STEPS; i++) {
        if (t >= t1) break;
        vec3 p = ro + rd * t;
        float r = length(p);
        float alt = r - AURORA_BASE_R;

        // Never thinner than ~1.5 pixels at this distance, so far-off curtains don't alias.
        float footprint = max(t - tCam, 0.0) * uAuroraPixelAngle;
        float wSheet = max(uAuroraSheetW, footprint * 1.5);
        float wHalo = max(uAuroraHaloW, wSheet * 3.0);
        float wRed = max(uAuroraRedW, wSheet * 3.0);
        float reach = 2.5 * max(wHalo, wRed);

        float theta = acos(clamp(p.y / r, -1.0, 1.0));
        // Azimuth in the ribbon's frame. The southern dome is the northern one turned half a
        // turn about X, which mirrors azimuth; uAuroraPhiSign undoes that.
        vec2 cs = p.xz / max(length(p.xz), 1e-6);
        cs.y *= uAuroraPhiSign;
        float phi = atan(cs.y, cs.x);

        vec3 emit = vec3(0.0);
        float dMin = 1e9;

        for (int L = 0; L < AURORA_LAYERS; L++) {
            vec4 lay = uAuroraLayer[L];
            if (lay.z <= 0.0) continue;

            // Large folds and the coarse brightness field, from one fetch around the oval.
            // Sampling along a circle keeps it seamless at phi = +-pi; time morphs it.
            vec4 n1 = texture(uAuroraNoise,
                vec3(cs * AURORA_FOLD_R, uAuroraTime * 0.010) + uAuroraSeed[L]);

            vec3 w = uAuroraWarpAmp[L] * sin(vec3(2.0, 3.0, 5.0) * phi + uAuroraWarpPhase[L]);
            float thetaC = lay.x * (1.0 + w.x + w.y + w.z + (n1.r - 0.5) * AURORA_FOLD);
            // Field lines converge on the pole, so the curtain leans poleward with height.
            thetaC -= max(alt, 0.0) * AURORA_LEAN;

            float d = (theta - thetaC) * r;
            float curlReach = AURORA_CURL * lay.x * r;
            dMin = min(dMin, abs(d) - curlReach);
            if (abs(d) > reach + curlReach) continue;

            vec3 wob = uAuroraWobAmp[L] * sin(vec3(2.0, 4.0, 7.0) * phi + uAuroraWobPhase[L]);
            float H = lay.y * (0.6 + 0.4 * (0.5 + 0.5 * (wob.x + wob.y + wob.z)));
            // Broad bundles of taller and shorter curtain.
            H *= 0.7 + 0.6 * n1.g;
            if (alt > H * 1.25 || alt < -wSheet) continue;

            // Fine rays and curls. Constant up the field line (bar a slight twist), which is
            // what makes them read as vertical striations; they drift along the curtain.
            float altFrac = max(alt, 0.0) / max(H, 1e-6);
            vec2 csRay = vec2(cos(phi + uAuroraTime * 0.02), sin(phi + uAuroraTime * 0.02));
            vec4 n2 = texture(uAuroraNoise,
                vec3(csRay * AURORA_RAY_R, uAuroraTime * 0.03 + altFrac * 0.06) + uAuroraSeed[L].zxy);

            d -= (n2.g - 0.5) * 2.0 * curlReach;
            H *= 0.8 + 0.4 * n2.g;

            // Rays fade to an even sheet once they are too fine for the pixel footprint.
            float rayPitch = sin(lay.x) / (AURORA_RAY_R * AURORA_RAY_CELLS);
            float rayFade = 1.0 - smoothstep(rayPitch * 0.5, rayPitch * 1.5, wSheet);
            float rays = mix(1.0, 0.2 + 1.7 * pow(n2.a, 2.5), rayFade);

            // Bright knots and dim stretches along the oval.
            float knot = 0.3 + 1.4 * smoothstep(0.2, 0.85, n1.b);

            // Vertical structure: a sharp lower edge (dipping lower under bright rays), green
            // falling off with height, and the diffuse oxygen red above it.
            float base = H * 0.07 * (1.0 - n2.a);
            float u = max(alt - base, 0.0) / max(H, 1e-6);
            float lower = smoothstep(base - wSheet, base + 0.03 * H + wSheet, alt);
            float green = lower * exp(-u * 3.0) * (1.0 - smoothstep(0.6, 1.0, u));
            float red = smoothstep(0.25, 0.6, u) * (1.0 - smoothstep(0.85, 1.25, u)) * 0.3;
            float fringe = lower * (1.0 - smoothstep(0.0, 0.08, u))
                * smoothstep(0.7, 1.6, knot * rays);

            float sheet = auroraSheet(d, wSheet) + 0.12 * auroraSheet(d, wHalo);
            float redSheet = auroraSheet(d, wRed);

            emit += lay.z * knot * (
                (AURORA_GREEN * green + AURORA_FRINGE * fringe * 0.8) * sheet * rays
                + AURORA_RED * red * redSheet * mix(1.0, rays, 0.25));
        }

        float minStep = max(wSheet * 0.6, (t1 - t) / float(AURORA_MAX_STEPS - i));
        float stepLen = max(minStep, 0.6 * (dMin - reach));
        stepLen = min(stepLen, t1 - t);

        float stepEmit = dot(emit, vec3(0.3333)) * stepLen;
        if (tFirst < 0.0 && stepEmit > 1e-5) tFirst = t;
        acc += emit * stepLen;
        if (tDepth < 0.0 && dot(acc, vec3(0.3333)) > 0.02) tDepth = t;
        t += stepLen;
    }

    vec3 aCol = AURORA_SAT * (1.0 - exp(-acc * AURORA_GAIN * uAuroraTint / AURORA_SAT));
    if (max(aCol.r, max(aCol.g, aCol.b)) < 0.003 || tFirst < 0.0) discard;
    // Faint pixels that never reach the threshold take the first emission they met. Never the
    // ray start: that is the camera itself from inside the dome, and would draw over everything.
    if (tDepth < 0.0) tDepth = tFirst;
    float aViewDist = max(tDepth - tCam, 0.0) * uAuroraObjScale;
    float aViewW = -normalize(vAuroraViewPos).z * aViewDist;
    vec4 diffuseColor = vec4(aCol, 1.0);
`;

/**
 * Ray-marched aurora curtains for one hemisphere — the `high` aurora detail tier.
 *
 * Each oval is a thin, folded emission sheet: the warp and breathing come from the same
 * `RibbonShape` state the ribbon tiers animate, with noise-driven folds and curls on top. Along
 * the sheet, fine rays run up the field lines; up it, a sharp lower edge (pink where the
 * curtain is intense) gives way to green and then the diffuse oxygen red. Being a true volume,
 * it brightens where the sheet is seen edge-on and looks right from underneath (surface camera).
 *
 * The mesh is a convex dome around the pole that only starts the rays. As with the volumetric
 * clouds it switches to its back faces when the camera is inside, and writes the depth of the
 * first bright emission, so ships and terrain in front of or behind the curtains sort correctly.
 * The mesh is scaled by the body radius, so the shader works in body radii.
 */
export function createVolumetricAurora(
    options: IVolumetricAuroraOptions,
    parent: THREE.Object3D
): IVolumetricAuroraHandle {
    const { radius, hemisphere, baseAltitude } = options;
    const topR = baseAltitude + options.boundHeight / radius;
    const colat = Math.min(options.boundColatitudeRad, THREE.MathUtils.degToRad(80));
    const floorY = baseAltitude * Math.cos(colat);
    const rimX = topR * Math.sin(colat);
    const rimY = topR * Math.cos(colat);
    const typical = options.typicalHeight / radius;

    const uniforms: VolumeUniforms = {
        uAuroraNoise: { value: getCloudNoiseTexture() },
        uAuroraTime: { value: 0 },
        uAuroraCamObj: { value: new THREE.Vector3() },
        uAuroraObjScale: { value: 1 },
        uAuroraPixelAngle: { value: 0.001 },
        uAuroraPhiSign: { value: hemisphere },
        uAuroraSheetW: { value: typical * SHEET_FRACTION },
        uAuroraHaloW: { value: typical * HALO_FRACTION },
        uAuroraRedW: { value: typical * RED_FRACTION },
        uAuroraTint: { value: options.tint.clone() },
        uAuroraLayer: {
            value: Array.from({ length: AURORA_VOLUME_LAYERS }, () => new THREE.Vector4()),
        },
        uAuroraWarpAmp: { value: vec3s() },
        uAuroraWarpPhase: { value: vec3s() },
        uAuroraWobAmp: { value: vec3s() },
        uAuroraWobPhase: { value: vec3s() },
        uAuroraSeed: {
            value: Array.from({ length: AURORA_VOLUME_LAYERS }, (_, i) =>
                (options.seeds[i] ?? new THREE.Vector3()).clone()
            ),
        },
    };

    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.FrontSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
    });

    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                /* glsl */ `#include <common>
                varying vec3 vAuroraObjPos;
                varying vec3 vAuroraViewPos;`
            )
            .replace(
                '#include <project_vertex>',
                /* glsl */ `#include <project_vertex>
                vAuroraObjPos = position;
                vAuroraViewPos = mvPosition.xyz;`
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
                const float AURORA_BASE_R = ${f(baseAltitude)};
                const float AURORA_TOP_R = ${f(topR)};
                const float AURORA_FLOOR_Y = ${f(floorY)};
                ${FRAGMENT_PARS}`
            )
            .replace('vec4 diffuseColor = vec4( diffuse, opacity );', FRAGMENT_BODY)
            // The depth of the first bright emission rather than the dome face's (log depth
            // buffer, as the renderer uses; same as the volumetric clouds).
            .replace(
                '#include <logdepthbuf_fragment>',
                /* glsl */ `
                #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
                    gl_FragDepth = vIsPerspective == 0.0
                        ? gl_FragCoord.z
                        : log2(1.0 + max(aViewW, 1e-6)) * logDepthBufFC * 0.5;
                #endif
                `
            );
    };
    // The dome dimensions are baked in as constants, so each body needs its own program.
    const cacheKey = `volumetric-aurora-v2|${f(baseAltitude)}|${f(topR)}|${f(floorY)}`;
    material.customProgramCacheKey = () => cacheKey;

    const mesh = new THREE.Mesh(buildDomeGeometry(baseAltitude, topR, colat), material);
    mesh.name = 'VolumetricAurora';
    mesh.scale.setScalar(radius);
    // The southern dome is the northern one turned half a turn about X: a proper rotation, so
    // the faces keep their winding (a negative scale would flip it).
    if (hemisphere === -1) mesh.rotation.x = Math.PI;
    // Above the cloud layer (2) and atmosphere shell (1), like the ribbons.
    mesh.renderOrder = 3;
    mesh.raycast = () => {};

    const invWorld = new THREE.Matrix4();
    const camWorld = new THREE.Vector3();
    const bufferSize = new THREE.Vector2();

    mesh.onBeforeRender = (renderer, _scene, camera) => {
        invWorld.copy(mesh.matrixWorld).invert();
        camWorld.setFromMatrixPosition(camera.matrixWorld);
        const c = uniforms.uAuroraCamObj.value.copy(camWorld).applyMatrix4(invWorld);

        // Inside the dome the near faces are behind the camera: start rays from the far ones.
        const horiz = Math.hypot(c.x, c.z);
        const inside =
            c.y >= floorY && horiz <= rimX && (c.y <= rimY || c.lengthSq() <= topR * topR);
        const side = inside ? THREE.BackSide : THREE.FrontSide;
        if (material.side !== side) material.side = side;

        uniforms.uAuroraObjScale.value = mesh.matrixWorld.getMaxScaleOnAxis();

        // Angle one pixel subtends, so the sheet can widen to stay above the pixel footprint.
        const target = renderer.getRenderTarget();
        const height = target ? target.height : renderer.getDrawingBufferSize(bufferSize).y;
        const fovRad =
            camera instanceof THREE.PerspectiveCamera
                ? THREE.MathUtils.degToRad(camera.getEffectiveFOV())
                : THREE.MathUtils.degToRad(60);
        uniforms.uAuroraPixelAngle.value = (2 * Math.tan(fovRad / 2)) / Math.max(height, 1);
    };

    parent.add(mesh);

    return {
        mesh,
        setTime: (time: number) => {
            uniforms.uAuroraTime.value = time;
        },
        setLayer: (index: number, state: IAuroraVolumeLayerState) => {
            if (index < 0 || index >= AURORA_VOLUME_LAYERS) return;
            uniforms.uAuroraLayer.value[index].set(
                state.colatitudeRad,
                state.curtainHeight / radius,
                state.intensity,
                0
            );
            const wa = uniforms.uAuroraWarpAmp.value[index];
            const wp = uniforms.uAuroraWarpPhase.value[index];
            wa.set(state.warp[0].amplitude, state.warp[1].amplitude, state.warp[2].amplitude);
            wp.set(state.warp[0].phase, state.warp[1].phase, state.warp[2].phase);
            const ba = uniforms.uAuroraWobAmp.value[index];
            const bp = uniforms.uAuroraWobPhase.value[index];
            ba.set(state.wobble[0].amplitude, state.wobble[1].amplitude, state.wobble[2].amplitude);
            bp.set(state.wobble[0].phase, state.wobble[1].phase, state.wobble[2].phase);
        },
        dispose: () => {
            mesh.parent?.remove(mesh);
            mesh.geometry.dispose();
            material.dispose();
        },
    };
}
