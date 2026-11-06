import * as THREE from 'three';
import {
    CLOUD_BASE_R,
    CLOUD_DETAIL_SCALE,
    CLOUD_PLANET_R,
    CLOUD_SIGMA,
    CLOUD_THICK,
    type CloudUniforms,
} from './cloud-coverage-glsl';

/**
 * TypeScript mirror of the cloud density in cloud-coverage-glsl.ts (cloudField, cloudErode,
 * cloudCirrus, cloudDensity), reading the same noise volume and the same uniform values, so the
 * CPU can ask how much cloud lies along a line of sight. Used to dim lens flares of stars behind
 * clouds. Keep it in step with the GLSL.
 *
 * Only the coarse erosion is mirrored (the GLSL's `fine = false` path): line-of-sight dimming is
 * eased and soft anyway, and the fine octave only nibbles at edges.
 */

/** Samples along a line of sight through the deck. */
const TRANSMITTANCE_SAMPLES = 24;
/** Must match the GLSL ground clip (volumetric-clouds.ts GROUND_CLIP). */
const GROUND_CLIP = 0.998;

const _q = new THREE.Vector3();
const _wq = new THREE.Vector3();
const _dp = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3();
const _rgba = new Float32Array(4);

function smoothstep(e0: number, e1: number, x: number): number {
    const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
    return t * t * (3 - 2 * t);
}

function clamp01(x: number): number {
    return Math.min(Math.max(x, 0), 1);
}

function mix(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Trilinear, repeat-wrapped sample of the RGBA8 noise volume into `out` (0..1 per channel),
 * as the GPU's LinearFilter + RepeatWrapping does it.
 */
function sampleNoise(
    tex: THREE.Data3DTexture,
    x: number,
    y: number,
    z: number,
    out: Float32Array
): void {
    const data = tex.image.data as Uint8Array;
    const n = tex.image.width;
    const fx = x * n - 0.5;
    const fy = y * n - 0.5;
    const fz = z * n - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const ty = fy - iy;
    const tz = fz - iz;
    const x0 = ((ix % n) + n) % n;
    const y0 = ((iy % n) + n) % n;
    const z0 = ((iz % n) + n) % n;
    const x1 = (x0 + 1) % n;
    const y1 = (y0 + 1) % n;
    const z1 = (z0 + 1) % n;
    const i000 = ((z0 * n + y0) * n + x0) * 4;
    const i100 = ((z0 * n + y0) * n + x1) * 4;
    const i010 = ((z0 * n + y1) * n + x0) * 4;
    const i110 = ((z0 * n + y1) * n + x1) * 4;
    const i001 = ((z1 * n + y0) * n + x0) * 4;
    const i101 = ((z1 * n + y0) * n + x1) * 4;
    const i011 = ((z1 * n + y1) * n + x0) * 4;
    const i111 = ((z1 * n + y1) * n + x1) * 4;
    for (let c = 0; c < 4; c++) {
        const a = mix(data[i000 + c], data[i100 + c], tx);
        const b = mix(data[i010 + c], data[i110 + c], tx);
        const d = mix(data[i001 + c], data[i101 + c], tx);
        const e = mix(data[i011 + c], data[i111 + c], tx);
        out[c] = mix(mix(a, b, ty), mix(d, e, ty), tz) / 255;
    }
}

/** Mirrors GLSL cloudNoiseR. */
function noiseR(u: CloudUniforms, x: number, y: number, z: number): number {
    sampleNoise(u.uCloudNoise.value, x, y, z, _rgba);
    return _rgba[0];
}

/** Mirrors GLSL cloudField. Writes [coverage, raw noise] into `out`. */
function cloudField(u: CloudUniforms, dir: THREE.Vector3, out: [number, number]): void {
    const scale = u.uCloudScale.value;
    const seed = u.uCloudSeedOffset.value;
    const t = u.uCloudTime.value;
    _q.set(dir.x, dir.y * u.uCloudBandStretch.value, dir.z)
        .multiplyScalar(scale)
        .add(seed);

    _wq.copy(_q).multiplyScalar(0.5);
    _wq.x += t;
    _wq.z -= 0.7 * t;
    const wa = noiseR(u, _wq.x, _wq.y, _wq.z) - 0.5;
    const wb = noiseR(u, _wq.x + 0.43, _wq.y + 0.17, _wq.z + 0.71) - 0.5;
    const swirl = u.uCloudSwirl.value;
    _q.x += wa * swirl;
    _q.y += 0.5 * wb * swirl;
    _q.z += (wb - wa) * swirl;

    const cohesion = u.uCloudSystems.value.w;
    const w2 = 0.3 * (1.0 - 0.6 * cohesion);
    const w3 = 0.15 * (1.0 - cohesion);
    let n =
        (noiseR(u, _q.x, _q.y, _q.z) * 0.55 +
            noiseR(u, _q.x * 2.07 + 0.13, _q.y * 2.07 + 0.29, _q.z * 2.07 + 0.61) * w2 +
            noiseR(u, _q.x * 4.31 + 0.57, _q.y * 4.31 + 0.83, _q.z * 4.31 + 0.37) * w3) /
        (0.55 + w2 + w3);

    // Weather systems and size variety (seed.yzx swizzle, as in the GLSL).
    const sys = u.uCloudSystems.value;
    const sx = dir.x * sys.x + seed.y;
    const sy = dir.y * u.uCloudBandStretch.value * sys.x + seed.z;
    const sz = dir.z * sys.x + seed.x + 0.5 * t;
    const sizeMask = smoothstep(
        0.35,
        0.65,
        noiseR(u, sx * 1.7 + 0.19, sy * 1.7 + 0.83, sz * 1.7 + 0.47)
    );
    const big = noiseR(u, _q.x * 0.45 + 0.61, _q.y * 0.45 + 0.07, _q.z * 0.45 + 0.33);
    n = mix(n, big, sys.z * sizeMask);
    n += (noiseR(u, sx, sy, sz) - 0.5) * sys.y;

    const s = Math.abs(dir.y);
    const ds = (s - 0.45) / 0.12;
    const dm = (s - 0.77) / 0.1;
    const lb = u.uCloudLatBias.value;
    const lat =
        lb.x * Math.exp((-s * s) / 0.02) +
        lb.y * Math.exp(-ds * ds) +
        lb.z * Math.exp(-dm * dm) +
        lb.w * smoothstep(0.85, 1.0, s);

    const threshold = mix(0.72, 0.3, u.uCloudCoverage.value);
    const cov = smoothstep(threshold - 0.02, threshold + 0.28, n + lat);
    out[0] = Math.max(cov, u.uCloudCoverageFloor.value);
    out[1] = n;
}

/** Mirrors GLSL cloudErode with fine = false. */
function cloudErode(
    u: CloudUniforms,
    shapeIn: number,
    p: THREE.Vector3,
    up: THREE.Vector3,
    h: number
): number {
    const shapeU = u.uCloudShape.value;
    const billow = shapeU.x;
    const t = u.uCloudTime.value;

    // cloudEast(up) * 0.35h, plus time drift.
    let ex = -up.z;
    let ez = up.x;
    const el = Math.hypot(ex, ez);
    if (el > 1e-4) {
        ex /= el;
        ez /= el;
    } else {
        ex = 1;
        ez = 0;
    }
    _dp.set(
        p.x * CLOUD_DETAIL_SCALE + ex * 0.35 * h + 0.5 * t,
        p.y * CLOUD_DETAIL_SCALE + 0.5 * t,
        p.z * CLOUD_DETAIL_SCALE + ez * 0.35 * h + 0.5 * t
    );

    sampleNoise(
        u.uCloudNoise.value,
        _dp.x * 0.4 + 0.71,
        _dp.y * 0.4 + 0.23,
        _dp.z * 0.4 + 0.59,
        _rgba
    );
    const protect = u.uCloudSystems.value.w * smoothstep(0.3, 0.85, shapeIn);
    const lobe = _rgba[1];
    const lobeShape = Math.min(
        shapeIn * mix(1.0, 1.3 * smoothstep(0.15, 0.85, lobe), 0.6 * billow),
        1.0
    );
    const shape = mix(lobeShape, shapeIn, protect);

    sampleNoise(u.uCloudNoise.value, _dp.x, _dp.y, _dp.z, _rgba);
    const worley = _rgba[1] * 0.625 + _rgba[2] * 0.25 + _rgba[3] * 0.125;
    const billowZone = smoothstep(0.0, mix(0.1, 0.7, shapeU.y), h);
    const e = mix(worley, 1.0 - worley, billowZone) * mix(0.2, 0.5, billow) * (1.0 - protect);
    const d = clamp01((shape - e) / Math.max(1.0 - e, 1e-3));
    return mix(d, d * d, u.uCloudEdgeSoftness.value);
}

/** Mirrors GLSL cloudCirrus. */
function cloudCirrus(u: CloudUniforms, p: THREE.Vector3, h: number, n: number): number {
    const amount = u.uCloudShape.value.z;
    if (amount <= 0 || h < 0.65) return 0;
    const band = smoothstep(0.65, 0.8, h) * (1.0 - smoothstep(0.92, 1.0, h));
    const seed = u.uCloudSeedOffset.value;
    // seed.zxy / seed.yzx swizzles, as in the GLSL.
    const wx = p.x * 1.4 + seed.z;
    const wy = p.y * 1.4 + seed.x;
    const wz = p.z * 1.4 + seed.y;
    const w0 = noiseR(u, wx, wy, wz) - 0.5;
    const w1 = noiseR(u, wx + 0.37, wy + 0.71, wz + 0.19) - 0.5;
    const streak = noiseR(
        u,
        p.x * 2.5 + w0 * 1.5 + seed.y + 0.3 * u.uCloudTime.value,
        p.y * 10.0 + (w0 + w1) * 5.0 + seed.z,
        p.z * 2.5 + w1 * 1.5 + seed.x
    );
    return smoothstep(0.62, 0.95, streak) * smoothstep(0.45, 0.75, n) * band * amount * 0.04;
}

const _field: [number, number] = [0, 0];

/** Mirrors GLSL cloudDensity with fine = false. */
function cloudDensity(u: CloudUniforms, p: THREE.Vector3, up: THREE.Vector3, h: number): number {
    if (h <= 0 || h >= 1) return 0;
    cloudField(u, up, _field);
    const cov = _field[0];
    let dens = 0;
    const hn = h / Math.max(u.uCloudShape.value.w, 1e-3);
    if (cov > 0 && hn < 1) {
        const need = Math.pow(hn, mix(0.7, 2.0, u.uCloudShape.value.x));
        const shape =
            clamp01((cov - need) / 0.25) *
            smoothstep(0.0, 0.05, h) *
            mix(cov, 1.0, u.uCloudSystems.value.w);
        if (shape > 0) dens = cloudErode(u, shape, p, up, h);
    }
    return dens + cloudCirrus(u, p, h, _field[1]);
}

/** Ray/sphere (centred at the origin) entry and exit parameters, or null on a miss. */
function intersectSphere(
    ro: THREE.Vector3,
    rd: THREE.Vector3,
    radius: number
): [number, number] | null {
    const b = ro.dot(rd);
    const c = ro.lengthSq() - radius * radius;
    const disc = b * b - c;
    if (disc <= 0) return null;
    const sq = Math.sqrt(disc);
    return [-b - sq, -b + sq];
}

/**
 * Fraction of light (0..1) that gets through the cloud deck along a ray, in the cloud layer's
 * object space (cloud top = unit sphere). `rd` must be unit length. The march stops at the
 * ground; whether the planet itself blocks the ray is the caller's business.
 */
export function cloudTransmittance(u: CloudUniforms, ro: THREE.Vector3, rd: THREE.Vector3): number {
    const outer = intersectSphere(ro, rd, 1);
    if (!outer) return 1;
    const t0 = Math.max(outer[0], 0);
    let t1 = outer[1];
    if (t1 <= t0) return 1;

    const ground = intersectSphere(ro, rd, CLOUD_PLANET_R * GROUND_CLIP);
    if (ground && ground[0] > t0) t1 = Math.min(t1, ground[0]);

    // Same two-segment march as the shader, skipping the clear hole under the cloud base.
    let lenA = t1 - t0;
    let startB = t1;
    let lenB = 0;
    const inner = intersectSphere(ro, rd, CLOUD_BASE_R);
    if (inner) {
        lenA = Math.max(Math.min(t1, inner[0]) - t0, 0);
        startB = Math.max(t0, inner[1]);
        lenB = Math.max(t1 - startB, 0);
    }
    const total = lenA + lenB;
    if (total <= 0) return 1;

    const ds = total / TRANSMITTANCE_SAMPLES;
    let od = 0;
    for (let i = 0; i < TRANSMITTANCE_SAMPLES; i++) {
        const s = (i + 0.5) * ds;
        const t = s < lenA ? t0 + s : startB + (s - lenA);
        _p.copy(rd).multiplyScalar(t).add(ro);
        const r = _p.length();
        const h = (r - CLOUD_BASE_R) / CLOUD_THICK;
        if (h <= 0 || h >= 1) continue;
        _up.copy(_p).divideScalar(r);
        od += cloudDensity(u, _p, _up, h) * ds;
    }
    return Math.exp(-od * CLOUD_SIGMA * u.uCloudDensityScale.value);
}
