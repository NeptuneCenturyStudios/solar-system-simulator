import * as THREE from 'three';
import { SeededRandom } from '../../utilities/prng';
import { clamp01, dot, fbm3D, hashStringToU32, mix3, normalizeSafe, smoothstep, Vec3 } from '../noise-utils';

const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1024;

const INTERNAL_WIDTH = TEXTURE_WIDTH;
const INTERNAL_HEIGHT = TEXTURE_HEIGHT;

// Noise tuning
const NOISE_ICE_SCALE = 14.0;
const NOISE_ICE_OCTAVES = 5;

const NOISE_TERRAIN_SCALE = 20.0;
const NOISE_TERRAIN_OCTAVES = 4;

const NOISE_CRACK_SCALE = 60.0;
const NOISE_CRACK_OCTAVES = 3;

const NOISE_CRATER_SCALE = 50.0;
const NOISE_CRATER_OCTAVES = 4;

// Ice band thresholds
const ICE_DEEP_EDGE0 = 0.0;
const ICE_DEEP_EDGE1 = 0.20;
const ICE_MID_EDGE0 = 0.15;
const ICE_MID_EDGE1 = 0.35;
const ICE_SURFACE_EDGE0 = 0.30;
const ICE_SURFACE_EDGE1 = 0.55;
const SNOW_EDGE0 = 0.50;
const SNOW_EDGE1 = 0.80;
const EXPOSED_ROCK_EDGE0 = 0.75;
const EXPOSED_ROCK_EDGE1 = 0.95;

// Crater impact thresholds
const CRATER_RIM_EDGE0 = 0.55;
const CRATER_RIM_EDGE1 = 0.80;
const CRATER_INNER_EDGE0 = 0.78;
const CRATER_INNER_EDGE1 = 0.92;
const CRATER_MASK_EDGE0 = 0.60;
const CRATER_MASK_EDGE1 = 0.90;
const CRATER_RIM_STRENGTH = 0.04;
const CRATER_DEPTH_STRENGTH = 0.03;

// Normal map tuning
const NORMAL_STRENGTH = 0.6;

// Polar flattening
const POLAR_FLAT_START = 0.65;
const POLAR_FLAT_END = 0.99;
const POLAR_DETAIL_MIN = 0.40;

const YIELD_EVERY_ROWS = 8;

// ====== Palette ======
const iceDeep: Vec3 = { x: 0.55, y: 0.62, z: 0.72 };
const iceMid: Vec3 = { x: 0.68, y: 0.75, z: 0.84 };
const iceSurface: Vec3 = { x: 0.82, y: 0.88, z: 0.94 };
const snowWhite: Vec3 = { x: 0.92, y: 0.94, z: 0.97 };
const pureWhite: Vec3 = { x: 0.96, y: 0.97, z: 0.98 };
const rockGray: Vec3 = { x: 0.55, y: 0.56, z: 0.58 };
const darkRock: Vec3 = { x: 0.40, y: 0.41, z: 0.44 };

type FrozenMaps = {
    color: THREE.Texture;
    normal: THREE.Texture;
};

const colorCache = new Map<string, THREE.Texture>();
const normalCache = new Map<string, THREE.Texture>();

function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function getOrCreateFrozenMapsForSeed(seed: string): FrozenMaps {
    const cacheKey = seed.trim();
    const cachedColor = colorCache.get(cacheKey);
    const cachedNormal = normalCache.get(cacheKey);
    if (cachedColor && cachedNormal) return { color: cachedColor, normal: cachedNormal };

    const seedU32 = hashStringToU32(cacheKey);

    const climateRng = new SeededRandom(`${cacheKey}|climate-axis`);
    const yaw = climateRng.range(0, Math.PI * 2);

    const up: Vec3 = { x: 0, y: 1, z: 0 };
    const north: Vec3 = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
    const east: Vec3 = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };

    const ox = climateRng.range(-200, 200);
    const oy = climateRng.range(-200, 200);
    const oz = climateRng.range(-200, 200);

    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_WIDTH;
    canvas.height = INTERNAL_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create frozen texture canvas');

    const img = ctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const data = img.data;

    const height = new Float32Array(INTERNAL_WIDTH * INTERNAL_HEIGHT);

    // Precompute lon sin/cos
    const lonCos = new Float32Array(INTERNAL_WIDTH);
    const lonSin = new Float32Array(INTERNAL_WIDTH);
    for (let x = 0; x < INTERNAL_WIDTH; x++) {
        const u01 = x / Math.max(1, INTERNAL_WIDTH - 1);
        const lon = u01 * Math.PI * 2;
        lonCos[x] = Math.cos(lon);
        lonSin[x] = Math.sin(lon);
    }

    // Precompute equal-area latitude
    const latSin = new Float32Array(INTERNAL_HEIGHT);
    const latCos = new Float32Array(INTERNAL_HEIGHT);
    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const v01 = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const sinLat = 1 - 2 * v01;
        const cosLat = Math.sqrt(Math.max(0, 1 - sinLat * sinLat));
        latSin[y] = sinLat;
        latCos[y] = cosLat;
    }

    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const sLat = latSin[y]!;
        const cLat = latCos[y]!;

        for (let x = 0; x < INTERNAL_WIDTH; x++) {
            const cLon = lonCos[x]!;
            const sLon = lonSin[x]!;

            const dx = cLat * cLon;
            const dy = sLat;
            const dz = cLat * sLon;

            const yLocal = dot({ x: dx, y: dy, z: dz }, up);
            const xLocal = dot({ x: dx, y: dy, z: dz }, east);
            const zLocal = dot({ x: dx, y: dy, z: dz }, north);

            const poleFactor = Math.pow(Math.max(0, 1 - Math.abs(yLocal)), 0.65);
            const xLocalEff = xLocal * poleFactor;
            const zLocalEff = zLocal * poleFactor;

            const iceN = fbm3D(
                xLocalEff * NOISE_ICE_SCALE + ox,
                yLocal * NOISE_ICE_SCALE + oy,
                zLocalEff * NOISE_ICE_SCALE + oz,
                NOISE_ICE_OCTAVES,
                seedU32
            );

            const terrainN = fbm3D(
                xLocalEff * NOISE_TERRAIN_SCALE + (ox + 111.1),
                yLocal * NOISE_TERRAIN_SCALE + (oy - 222.2),
                zLocalEff * NOISE_TERRAIN_SCALE + (oz + 333.3),
                NOISE_TERRAIN_OCTAVES,
                seedU32
            );

            const crackN = fbm3D(
                xLocal * NOISE_CRACK_SCALE + (ox + 1234.5),
                yLocal * NOISE_CRACK_SCALE + (oy - 234.6),
                zLocal * NOISE_CRACK_SCALE + (oz + 98.7),
                NOISE_CRACK_OCTAVES,
                seedU32
            );
            const crackRidged = Math.abs(crackN);
            const crackMask = smoothstep(0.55, 0.80, crackRidged);

            const craterN = fbm3D(
                xLocal * NOISE_CRATER_SCALE + (ox + 999.1),
                yLocal * NOISE_CRATER_SCALE + (oy - 321.7),
                zLocal * NOISE_CRATER_SCALE + (oz + 77.7),
                NOISE_CRATER_OCTAVES,
                seedU32
            );
            const craterRidged = 1 - Math.abs(craterN);
            const craterInner = smoothstep(CRATER_INNER_EDGE0, CRATER_INNER_EDGE1, craterRidged);
            const craterRimBand =
                smoothstep(CRATER_RIM_EDGE0, CRATER_RIM_EDGE1, craterRidged) -
                smoothstep(CRATER_INNER_EDGE0, CRATER_INNER_EDGE1, craterRidged);
            const craterMask = smoothstep(CRATER_MASK_EDGE0, CRATER_MASK_EDGE1, craterRidged);

            const iceHeight = iceN * 0.06;
            const terrainHeight = terrainN * 0.04;
            const crackHeight = crackRidged * 0.012 * crackMask;
            const craterHeight =
                CRATER_RIM_STRENGTH * craterRimBand * craterMask -
                CRATER_DEPTH_STRENGTH * craterInner * craterMask;

            height[y * INTERNAL_WIDTH + x] = iceHeight + terrainHeight + crackHeight + craterHeight;

            // Color blending
            const bandSource = clamp01(0.5 + 0.5 * (iceN * 0.7 + terrainN * 0.3));
            const bandPow = Math.pow(bandSource, 1.3);

            const latGradient = clamp01((1 - Math.abs(yLocal)) * 1.2);

            const deepT = clamp01(smoothstep(ICE_DEEP_EDGE0, ICE_DEEP_EDGE1, bandPow));
            const midT = clamp01(smoothstep(ICE_MID_EDGE0, ICE_MID_EDGE1, bandPow));
            const surfaceT = clamp01(smoothstep(ICE_SURFACE_EDGE0, ICE_SURFACE_EDGE1, bandPow));
            const snowT = clamp01(smoothstep(SNOW_EDGE0, SNOW_EDGE1, bandPow));
            const rockT = clamp01(smoothstep(EXPOSED_ROCK_EDGE0, EXPOSED_ROCK_EDGE1, bandPow));

            let col: Vec3;
            col = mix3(iceDeep, iceMid, deepT);
            col = mix3(col, iceSurface, midT);
            col = mix3(col, snowWhite, surfaceT);
            col = mix3(col, pureWhite, snowT * 0.6);
            col = mix3(col, rockGray, rockT * latGradient * 0.35);

            const microVar = clamp01(0.5 + 0.5 * fbm3D(
                xLocalEff * (NOISE_ICE_SCALE * 2.5) + (ox + 50.1),
                yLocal * (NOISE_ICE_SCALE * 2.5) + (oy - 70.2),
                zLocalEff * (NOISE_ICE_SCALE * 2.5) + (oz + 90.3),
                2,
                seedU32
            ));
            const iceTint: Vec3 = { x: 0.0, y: 0.01, z: 0.02 };
            col = { x: col.x + iceTint.x * microVar, y: col.y + iceTint.y * microVar, z: col.z + iceTint.z * microVar };

            if (craterMask > 0) {
                col = mix3(col, darkRock, craterInner * craterMask * 0.30);
                col = mix3(col, iceSurface, craterRimBand * craterMask * 0.10);
            }

            if (crackMask > 0) {
                col = mix3(col, darkRock, crackMask * 0.15);
            }

            const polarEnhance = clamp01(1 - latGradient);
            col = mix3(col, pureWhite, polarEnhance * 0.20);

            const contrast = 0.92 + 0.08 * iceN;
            col = { x: col.x * contrast, y: col.y * contrast, z: col.z * contrast };

            const r = Math.round(clamp01(col.x) * 255);
            const g = Math.round(clamp01(col.y) * 255);
            const b = Math.round(clamp01(col.z) * 255);

            const pIndex = (y * INTERNAL_WIDTH + x) * 4;
            data[pIndex] = r;
            data[pIndex + 1] = g;
            data[pIndex + 2] = b;
            data[pIndex + 3] = 255;
        }
    }

    ctx.putImageData(img, 0, 0);

    // Normal map from height
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = INTERNAL_WIDTH;
    normalCanvas.height = INTERNAL_HEIGHT;

    const nctx = normalCanvas.getContext('2d');
    if (!nctx) throw new Error('Failed to create frozen normal canvas');

    const nimg = nctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const ndata = nimg.data;

    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const yU = y > 0 ? y - 1 : 0;
        const yD = y + 1 < INTERNAL_HEIGHT ? y + 1 : INTERNAL_HEIGHT - 1;

        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
        const polarFlatRaw = 1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01);
        const normalFlatMask = POLAR_DETAIL_MIN + (1 - POLAR_DETAIL_MIN) * polarFlatRaw;

        for (let x = 0; x < INTERNAL_WIDTH; x++) {
            const xL = x > 0 ? x - 1 : INTERNAL_WIDTH - 1;
            const xR = x + 1 < INTERNAL_WIDTH ? x + 1 : 0;

            const hL = height[y * INTERNAL_WIDTH + xL]!;
            const hR = height[y * INTERNAL_WIDTH + xR]!;
            const hU = height[yU * INTERNAL_WIDTH + x]!;
            const hD = height[yD * INTERNAL_WIDTH + x]!;
            const dxH = hR - hL;
            const dyH = hD - hU;

            const nx = -dxH * NORMAL_STRENGTH * normalFlatMask;
            const ny = -dyH * NORMAL_STRENGTH * normalFlatMask;
            const nz = 1.0;

            const n = normalizeSafe({ x: nx, y: ny, z: nz });

            const outZ = (n.z * 0.5 + 0.5) * 255;
            const outX = (n.x * 0.5 + 0.5) * 255;
            const outY = (1 - (n.y * 0.5 + 0.5)) * 255;

            const i = (y * INTERNAL_WIDTH + x) * 4;
            ndata[i] = Math.round(outX);
            ndata[i + 1] = Math.round(outY);
            ndata[i + 2] = Math.round(outZ);
            ndata[i + 3] = 255;
        }
    }

    nctx.putImageData(nimg, 0, 0);

    const colorTex = new THREE.CanvasTexture(canvas);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.wrapS = THREE.RepeatWrapping;
    colorTex.wrapT = THREE.ClampToEdgeWrapping;
    colorTex.generateMipmaps = false;
    colorTex.minFilter = THREE.LinearFilter;
    colorTex.magFilter = THREE.LinearFilter;
    colorTex.anisotropy = 16;
    colorTex.needsUpdate = true;

    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.ClampToEdgeWrapping;
    normalTex.generateMipmaps = false;
    normalTex.minFilter = THREE.LinearFilter;
    normalTex.magFilter = THREE.LinearFilter;
    normalTex.anisotropy = 16;
    normalTex.needsUpdate = true;

    colorCache.set(cacheKey, colorTex);
    normalCache.set(cacheKey, normalTex);

    return { color: colorTex, normal: normalTex };
}

// ------------------------------
// Async generation
// ------------------------------

async function getOrCreateFrozenMapsForSeedAsync(seed: string): Promise<FrozenMaps> {
    const cacheKey = seed.trim();

    const cachedColor = colorCache.get(cacheKey);
    const cachedNormal = normalCache.get(cacheKey);
    if (cachedColor && cachedNormal) return { color: cachedColor, normal: cachedNormal };

    const seedU32 = hashStringToU32(cacheKey);

    const climateRng = new SeededRandom(`${cacheKey}|climate-axis`);
    const yaw = climateRng.range(0, Math.PI * 2);

    const up: Vec3 = { x: 0, y: 1, z: 0 };
    const north: Vec3 = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
    const east: Vec3 = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };

    const ox = climateRng.range(-200, 200);
    const oy = climateRng.range(-200, 200);
    const oz = climateRng.range(-200, 200);

    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_WIDTH;
    canvas.height = INTERNAL_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create frozen texture canvas');

    const img = ctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const data = img.data;

    const height = new Float32Array(INTERNAL_WIDTH * INTERNAL_HEIGHT);

    const lonCos = new Float32Array(INTERNAL_WIDTH);
    const lonSin = new Float32Array(INTERNAL_WIDTH);
    for (let x = 0; x < INTERNAL_WIDTH; x++) {
        const u01 = x / Math.max(1, INTERNAL_WIDTH - 1);
        const lon = u01 * Math.PI * 2;
        lonCos[x] = Math.cos(lon);
        lonSin[x] = Math.sin(lon);
    }

    const latSin = new Float32Array(INTERNAL_HEIGHT);
    const latCos = new Float32Array(INTERNAL_HEIGHT);
    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const v01 = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const sinLat = 1 - 2 * v01;
        const cosLat = Math.sqrt(Math.max(0, 1 - sinLat * sinLat));
        latSin[y] = sinLat;
        latCos[y] = cosLat;
    }

    // Height + color pass
    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const sLat = latSin[y]!;
        const cLat = latCos[y]!;

        for (let x = 0; x < INTERNAL_WIDTH; x++) {
            const cLon = lonCos[x]!;
            const sLon = lonSin[x]!;

            const dx = cLat * cLon;
            const dy = sLat;
            const dz = cLat * sLon;

            const yLocal = dot({ x: dx, y: dy, z: dz }, up);
            const xLocal = dot({ x: dx, y: dy, z: dz }, east);
            const zLocal = dot({ x: dx, y: dy, z: dz }, north);

            const poleFactor = Math.pow(Math.max(0, 1 - Math.abs(yLocal)), 0.65);
            const xLocalEff = xLocal * poleFactor;
            const zLocalEff = zLocal * poleFactor;

            const iceN = fbm3D(
                xLocalEff * NOISE_ICE_SCALE + ox,
                yLocal * NOISE_ICE_SCALE + oy,
                zLocalEff * NOISE_ICE_SCALE + oz,
                NOISE_ICE_OCTAVES,
                seedU32
            );

            const terrainN = fbm3D(
                xLocalEff * NOISE_TERRAIN_SCALE + (ox + 111.1),
                yLocal * NOISE_TERRAIN_SCALE + (oy - 222.2),
                zLocalEff * NOISE_TERRAIN_SCALE + (oz + 333.3),
                NOISE_TERRAIN_OCTAVES,
                seedU32
            );

            const crackN = fbm3D(
                xLocal * NOISE_CRACK_SCALE + (ox + 1234.5),
                yLocal * NOISE_CRACK_SCALE + (oy - 234.6),
                zLocal * NOISE_CRACK_SCALE + (oz + 98.7),
                NOISE_CRACK_OCTAVES,
                seedU32
            );
            const crackRidged = Math.abs(crackN);
            const crackMask = smoothstep(0.55, 0.80, crackRidged);

            const craterN = fbm3D(
                xLocal * NOISE_CRATER_SCALE + (ox + 999.1),
                yLocal * NOISE_CRATER_SCALE + (oy - 321.7),
                zLocal * NOISE_CRATER_SCALE + (oz + 77.7),
                NOISE_CRATER_OCTAVES,
                seedU32
            );
            const craterRidged = 1 - Math.abs(craterN);
            const craterInner = smoothstep(CRATER_INNER_EDGE0, CRATER_INNER_EDGE1, craterRidged);
            const craterRimBand =
                smoothstep(CRATER_RIM_EDGE0, CRATER_RIM_EDGE1, craterRidged) -
                smoothstep(CRATER_INNER_EDGE0, CRATER_INNER_EDGE1, craterRidged);
            const craterMask = smoothstep(CRATER_MASK_EDGE0, CRATER_MASK_EDGE1, craterRidged);

            const iceHeight = iceN * 0.06;
            const terrainHeight = terrainN * 0.04;
            const crackHeight = crackRidged * 0.012 * crackMask;
            const craterHeight =
                CRATER_RIM_STRENGTH * craterRimBand * craterMask -
                CRATER_DEPTH_STRENGTH * craterInner * craterMask;

            height[y * INTERNAL_WIDTH + x] = iceHeight + terrainHeight + crackHeight + craterHeight;

            const bandSource = clamp01(0.5 + 0.5 * (iceN * 0.7 + terrainN * 0.3));
            const bandPow = Math.pow(bandSource, 1.3);
            const latGradient = clamp01((1 - Math.abs(yLocal)) * 1.2);

            const deepT = clamp01(smoothstep(ICE_DEEP_EDGE0, ICE_DEEP_EDGE1, bandPow));
            const midT = clamp01(smoothstep(ICE_MID_EDGE0, ICE_MID_EDGE1, bandPow));
            const surfaceT = clamp01(smoothstep(ICE_SURFACE_EDGE0, ICE_SURFACE_EDGE1, bandPow));
            const snowT = clamp01(smoothstep(SNOW_EDGE0, SNOW_EDGE1, bandPow));
            const rockT = clamp01(smoothstep(EXPOSED_ROCK_EDGE0, EXPOSED_ROCK_EDGE1, bandPow));

            let col: Vec3;
            col = mix3(iceDeep, iceMid, deepT);
            col = mix3(col, iceSurface, midT);
            col = mix3(col, snowWhite, surfaceT);
            col = mix3(col, pureWhite, snowT * 0.6);
            col = mix3(col, rockGray, rockT * latGradient * 0.35);

            const microVar = clamp01(0.5 + 0.5 * fbm3D(
                xLocalEff * (NOISE_ICE_SCALE * 2.5) + (ox + 50.1),
                yLocal * (NOISE_ICE_SCALE * 2.5) + (oy - 70.2),
                zLocalEff * (NOISE_ICE_SCALE * 2.5) + (oz + 90.3),
                2,
                seedU32
            ));
            const iceTint: Vec3 = { x: 0.0, y: 0.01, z: 0.02 };
            col = { x: col.x + iceTint.x * microVar, y: col.y + iceTint.y * microVar, z: col.z + iceTint.z * microVar };

            if (craterMask > 0) {
                col = mix3(col, darkRock, craterInner * craterMask * 0.30);
                col = mix3(col, iceSurface, craterRimBand * craterMask * 0.10);
            }
            if (crackMask > 0) {
                col = mix3(col, darkRock, crackMask * 0.15);
            }

            const polarEnhance = clamp01(1 - latGradient);
            col = mix3(col, pureWhite, polarEnhance * 0.20);
            const contrast = 0.92 + 0.08 * iceN;
            col = { x: col.x * contrast, y: col.y * contrast, z: col.z * contrast };

            const r = Math.round(clamp01(col.x) * 255);
            const g = Math.round(clamp01(col.y) * 255);
            const b = Math.round(clamp01(col.z) * 255);

            const pIndex = (y * INTERNAL_WIDTH + x) * 4;
            data[pIndex] = r;
            data[pIndex + 1] = g;
            data[pIndex + 2] = b;
            data[pIndex + 3] = 255;
        }

        if (y % YIELD_EVERY_ROWS === YIELD_EVERY_ROWS - 1) await yieldToEventLoop();
    }

    ctx.putImageData(img, 0, 0);

    // Normal pass
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = INTERNAL_WIDTH;
    normalCanvas.height = INTERNAL_HEIGHT;

    const nctx = normalCanvas.getContext('2d');
    if (!nctx) throw new Error('Failed to create frozen normal canvas');

    const nimg = nctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const ndata = nimg.data;

    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const yU = y > 0 ? y - 1 : 0;
        const yD = y + 1 < INTERNAL_HEIGHT ? y + 1 : INTERNAL_HEIGHT - 1;

        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
        const polarFlatRaw = 1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01);
        const normalFlatMask = POLAR_DETAIL_MIN + (1 - POLAR_DETAIL_MIN) * polarFlatRaw;

        for (let x = 0; x < INTERNAL_WIDTH; x++) {
            const xL = x > 0 ? x - 1 : INTERNAL_WIDTH - 1;
            const xR = x + 1 < INTERNAL_WIDTH ? x + 1 : 0;

            const hL = height[y * INTERNAL_WIDTH + xL]!;
            const hR = height[y * INTERNAL_WIDTH + xR]!;
            const hU = height[yU * INTERNAL_WIDTH + x]!;
            const hD = height[yD * INTERNAL_WIDTH + x]!;
            const dxH = hR - hL;
            const dyH = hD - hU;

            const nx = -dxH * NORMAL_STRENGTH * normalFlatMask;
            const ny = -dyH * NORMAL_STRENGTH * normalFlatMask;
            const nz = 1.0;

            const n = normalizeSafe({ x: nx, y: ny, z: nz });

            const outZ = (n.z * 0.5 + 0.5) * 255;
            const outX = (n.x * 0.5 + 0.5) * 255;
            const outY = (1 - (n.y * 0.5 + 0.5)) * 255;

            const i = (y * INTERNAL_WIDTH + x) * 4;
            ndata[i] = Math.round(outX);
            ndata[i + 1] = Math.round(outY);
            ndata[i + 2] = Math.round(outZ);
            ndata[i + 3] = 255;
        }

        if (y % YIELD_EVERY_ROWS === YIELD_EVERY_ROWS - 1) await yieldToEventLoop();
    }

    nctx.putImageData(nimg, 0, 0);

    const colorTex = new THREE.CanvasTexture(canvas);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.wrapS = THREE.RepeatWrapping;
    colorTex.wrapT = THREE.ClampToEdgeWrapping;
    colorTex.generateMipmaps = false;
    colorTex.minFilter = THREE.LinearFilter;
    colorTex.magFilter = THREE.LinearFilter;
    colorTex.anisotropy = 16;
    colorTex.needsUpdate = true;

    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.ClampToEdgeWrapping;
    normalTex.generateMipmaps = false;
    normalTex.minFilter = THREE.LinearFilter;
    normalTex.magFilter = THREE.LinearFilter;
    normalTex.anisotropy = 16;
    normalTex.needsUpdate = true;

    colorCache.set(cacheKey, colorTex);
    normalCache.set(cacheKey, normalTex);

    return { color: colorTex, normal: normalTex };
}

// ------------------------------
// Public API
// ------------------------------

export function getFrozenTexture(seed: string): THREE.Texture {
    return getOrCreateFrozenMapsForSeed(seed).color;
}

export function getFrozenNormalTexture(seed: string): THREE.Texture {
    return getOrCreateFrozenMapsForSeed(seed).normal;
}

export function getFrozenTextureAsync(seed: string): Promise<THREE.Texture> {
    return getOrCreateFrozenMapsForSeedAsync(seed).then((m) => m.color);
}

export function getFrozenNormalTextureAsync(seed: string): Promise<THREE.Texture> {
    return getOrCreateFrozenMapsForSeedAsync(seed).then((m) => m.normal);
}
