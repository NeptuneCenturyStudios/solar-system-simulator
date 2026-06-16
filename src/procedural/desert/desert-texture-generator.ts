import * as THREE from 'three';
import { SeededRandom } from '../../utilities/prng';
import { clamp01, dot, fbm3D, hashStringToU32, mix3, normalizeSafe, smoothstep, Vec3 } from '../noise-utils';

const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1024;

const INTERNAL_WIDTH = TEXTURE_WIDTH;
const INTERNAL_HEIGHT = TEXTURE_HEIGHT;

// Noise tuning (tweakable)
const NOISE_DUNE_SCALE = 18.0;
const NOISE_DUNE_OCTAVES = 6;

const NOISE_OASIS_SCALE = 2.2;
const NOISE_OASIS_OCTAVES = 3;

// Normal-map tuning
const NORMAL_STRENGTH = 0.9;

// Subtle crater / impact micro-detail
const NOISE_CRATER_SCALE = 40.0;
const NOISE_CRATER_OCTAVES = 4;

// Height: rim slightly raised, interior slightly lowered.
const CRATER_RIM_STRENGTH = 0.05;
const CRATER_DEPTH_STRENGTH = 0.03;

// Thresholds for crater rim/interior from ridged crater signal.
const CRATER_RIM_EDGE0 = 0.55;
const CRATER_RIM_EDGE1 = 0.8;
const CRATER_INNER_EDGE0 = 0.78;
const CRATER_INNER_EDGE1 = 0.92;

// Overall crater presence gating.
const CRATER_MASK_EDGE0 = 0.62;
const CRATER_MASK_EDGE1 = 0.92;

// Crack / fractured crust detail
const NOISE_CRACK_SCALE = 80.0;
const NOISE_CRACK_OCTAVES = 3;
const CRACK_STRENGTH = 0.11;

// Flatten normal/height detail near poles
const POLAR_FLAT_START = 0.65;
const POLAR_FLAT_END = 0.98;
const POLAR_DETAIL_MIN = 0.35;

type DesertMaps = {
    color: THREE.Texture;
    normal: THREE.Texture;
};

const colorCache = new Map<string, THREE.Texture>();
const normalCache = new Map<string, THREE.Texture>();

function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Core generation: computes the colour + normal canvas textures.
 * Returns the raw canvases so callers can decide whether to yield.
 */
function renderDesertMaps(
    seed: string,
): { canvas: HTMLCanvasElement; normalCanvas: HTMLCanvasElement } {
    const cacheKey = seed.trim();

    const seedU32 = hashStringToU32(cacheKey);

    // Deterministic climate axis
    const climateRng = new SeededRandom(`${cacheKey}|climate-axis`);
    const yaw = climateRng.range(0, Math.PI * 2);

    const up: Vec3 = { x: 0, y: 1, z: 0 };
    const north: Vec3 = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
    const east: Vec3 = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };

    const ox = climateRng.range(-200, 200);
    const oy = climateRng.range(-200, 200);
    const oz = climateRng.range(-200, 200);

    const sandColor: Vec3 = { x: 0.86, y: 0.74, z: 0.53 };
    const darkSand: Vec3 = { x: 0.63, y: 0.52, z: 0.35 };
    const paleSand: Vec3 = { x: 0.97, y: 0.88, z: 0.65 };
    const rockColor: Vec3 = { x: 0.63, y: 0.6, z: 0.58 };
    const waterColor: Vec3 = { x: 0.26, y: 0.55, z: 0.6 };

    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_WIDTH;
    canvas.height = INTERNAL_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create desert texture canvas');

    const img = ctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const data = img.data;

    const height = new Float32Array(INTERNAL_WIDTH * INTERNAL_HEIGHT);

    // Precompute lon for internal x
    const lonCos = new Float32Array(INTERNAL_WIDTH);
    const lonSin = new Float32Array(INTERNAL_WIDTH);
    for (let x = 0; x < INTERNAL_WIDTH; x++) {
        const u01 = x / Math.max(1, INTERNAL_WIDTH - 1);
        const lon = u01 * Math.PI * 2;
        lonCos[x] = Math.cos(lon);
        lonSin[x] = Math.sin(lon);
    }

    // Precompute lat sin/cos for internal y (equal-area mapping)
    const latSin = new Float32Array(INTERNAL_HEIGHT);
    const latCos = new Float32Array(INTERNAL_HEIGHT);
    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const v01 = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const sinLat = 1 - 2 * v01;
        const cosLat = Math.sqrt(Math.max(0, 1 - sinLat * sinLat));
        latSin[y] = sinLat;
        latCos[y] = cosLat;
    }

    const hotMask = 1.0;

    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const sLat = latSin[y]!;
        const cLat = latCos[y]!;

        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
        const flatMaskRaw = 1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01);
        const flatMask = POLAR_DETAIL_MIN + (1 - POLAR_DETAIL_MIN) * flatMaskRaw;

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

            const dunesN = fbm3D(
                xLocalEff * NOISE_DUNE_SCALE + ox,
                yLocal * NOISE_DUNE_SCALE + oy,
                zLocalEff * NOISE_DUNE_SCALE + oz,
                NOISE_DUNE_OCTAVES,
                seedU32
            );
            const dunesNMasked = dunesN * flatMask;

            const crackN = fbm3D(
                xLocal * NOISE_CRACK_SCALE + (ox + 1234.56),
                yLocal * NOISE_CRACK_SCALE + (oy - 234.12),
                zLocal * NOISE_CRACK_SCALE + (oz + 98.76),
                NOISE_CRACK_OCTAVES,
                seedU32
            );
            const crackRidged = Math.abs(crackN);
            const crackMask = hotMask * flatMask * smoothstep(0.55, 0.78, crackRidged);

            const craterN = fbm3D(
                xLocal * NOISE_CRATER_SCALE + (ox + 999.13),
                yLocal * NOISE_CRATER_SCALE + (oy - 321.71),
                zLocal * NOISE_CRATER_SCALE + (oz + 77.77),
                NOISE_CRATER_OCTAVES,
                seedU32
            );
            const craterRidged = 1 - Math.abs(craterN);
            const craterInner = smoothstep(CRATER_INNER_EDGE0, CRATER_INNER_EDGE1, craterRidged);
            const craterRimBand =
                smoothstep(CRATER_RIM_EDGE0, CRATER_RIM_EDGE1, craterRidged) -
                smoothstep(CRATER_INNER_EDGE0, CRATER_INNER_EDGE1, craterRidged);
            const craterMask = hotMask * flatMask * smoothstep(CRATER_MASK_EDGE0, CRATER_MASK_EDGE1, craterRidged);

            height[y * INTERNAL_WIDTH + x] =
                dunesNMasked +
                CRATER_RIM_STRENGTH * craterRimBand * craterMask -
                CRATER_DEPTH_STRENGTH * craterInner * craterMask +
                CRACK_STRENGTH * crackRidged * crackMask;

            const dunesRidged = 1 - Math.abs(dunesNMasked);
            const dunesT = clamp01(0.5 + 0.65 * dunesRidged);

            const oasisN = fbm3D(
                xLocal * NOISE_OASIS_SCALE + (ox + 777.1),
                yLocal * NOISE_OASIS_SCALE + (oy - 133.7),
                zLocal * NOISE_OASIS_SCALE + (oz + 42.5),
                NOISE_OASIS_OCTAVES,
                seedU32
            );
            const oasisBlob = smoothstep(0.48, 0.78, oasisN * 0.5 + 0.5) * hotMask * flatMask;

            // Color
            const baseRock = rockColor;
            let col = mix3(baseRock, sandColor, hotMask);

            const duneLight = mix3(darkSand, paleSand, dunesT);
            col = mix3(col, duneLight, hotMask * 0.75);

            const contrast = 0.72 + 0.28 * dunesNMasked;
            col = { x: col.x * contrast, y: col.y * contrast, z: col.z * contrast };

            if (craterMask > 0) {
                const craterDark = mix3(darkSand, rockColor, 0.25);
                const craterLight = mix3(paleSand, sandColor, 0.35);
                col = mix3(col, craterLight, craterRimBand * craterMask * 0.22);
                col = mix3(col, craterDark, craterInner * craterMask * 0.28);
            }

            if (crackMask > 0) {
                const crackColor = mix3(darkSand, rockColor, 0.35);
                col = mix3(col, crackColor, crackMask * 0.25);
            }

            if (oasisBlob > 0) {
                const oasisCol = mix3(waterColor, paleSand, 0.15 + 0.25 * dunesT);
                col = mix3(col, oasisCol, oasisBlob);
                col = mix3(col, sandColor, oasisBlob * 0.7);
            }

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
    if (!nctx) throw new Error('Failed to create desert normal canvas');

    const nimg = nctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const ndata = nimg.data;

    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const yU = y > 0 ? y - 1 : 0;
        const yD = y + 1 < INTERNAL_HEIGHT ? y + 1 : INTERNAL_HEIGHT - 1;

        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
        const normalFlatMaskRaw = 1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01);
        const normalFlatMask = POLAR_DETAIL_MIN + (1 - POLAR_DETAIL_MIN) * normalFlatMaskRaw;

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

            const out = (n.z * 0.5 + 0.5) * 255;
            const outX = (n.x * 0.5 + 0.5) * 255;
            const outY = (1 - (n.y * 0.5 + 0.5)) * 255;

            const i = (y * INTERNAL_WIDTH + x) * 4;
            ndata[i] = Math.round(outX);
            ndata[i + 1] = Math.round(outY);
            ndata[i + 2] = Math.round(out);
            ndata[i + 3] = 255;
        }
    }

    nctx.putImageData(nimg, 0, 0);

    return { canvas, normalCanvas };
}

function canvasesToTextures(canvas: HTMLCanvasElement, normalCanvas: HTMLCanvasElement): DesertMaps {
    const colorTex = new THREE.CanvasTexture(canvas);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.wrapS = THREE.RepeatWrapping;
    colorTex.wrapT = THREE.ClampToEdgeWrapping;
    colorTex.generateMipmaps = false;
    colorTex.minFilter = THREE.NearestFilter;
    colorTex.magFilter = THREE.NearestFilter;
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

    return { color: colorTex, normal: normalTex };
}

/**
 * Synchronous path: renders the map immediately on the calling thread.
 * Used by call sites that need a texture right now (custom moon creation, etc.).
 */
function getOrCreateDesertMapsSync(seed: string): DesertMaps {
    const cacheKey = seed.trim();
    const cachedColor = colorCache.get(cacheKey);
    const cachedNormal = normalCache.get(cacheKey);
    if (cachedColor && cachedNormal) return { color: cachedColor, normal: cachedNormal };

    const { canvas, normalCanvas } = renderDesertMaps(seed);
    const maps = canvasesToTextures(canvas, normalCanvas);

    colorCache.set(cacheKey, maps.color);
    normalCache.set(cacheKey, maps.normal);

    return maps;
}

/**
 * Async path: splits the colour + normal loops into chunks that yield to the
 * event loop every few rows.  Used by the fire-and-forget texture upgrader.
 */
async function getOrCreateDesertMapsAsync(seed: string): Promise<DesertMaps> {
    const cacheKey = seed.trim();
    const cachedColor = colorCache.get(cacheKey);
    const cachedNormal = normalCache.get(cacheKey);
    if (cachedColor && cachedNormal) return { color: cachedColor, normal: cachedNormal };

    // --- Colour + height pass, chunked ---
    const seedU32 = hashStringToU32(cacheKey);

    const climateRng = new SeededRandom(`${cacheKey}|climate-axis`);
    const yaw = climateRng.range(0, Math.PI * 2);

    const up: Vec3 = { x: 0, y: 1, z: 0 };
    const north: Vec3 = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
    const east: Vec3 = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };

    const ox = climateRng.range(-200, 200);
    const oy = climateRng.range(-200, 200);
    const oz = climateRng.range(-200, 200);

    const sandColor: Vec3 = { x: 0.86, y: 0.74, z: 0.53 };
    const darkSand: Vec3 = { x: 0.63, y: 0.52, z: 0.35 };
    const paleSand: Vec3 = { x: 0.97, y: 0.88, z: 0.65 };
    const rockColor: Vec3 = { x: 0.63, y: 0.6, z: 0.58 };
    const waterColor: Vec3 = { x: 0.26, y: 0.55, z: 0.6 };

    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_WIDTH;
    canvas.height = INTERNAL_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create desert texture canvas');

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

    const hotMask = 1.0;
    const YIELD_EVERY_ROWS = 6;

    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const sLat = latSin[y]!;
        const cLat = latCos[y]!;

        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
        const flatMaskRaw = 1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01);
        const flatMask = POLAR_DETAIL_MIN + (1 - POLAR_DETAIL_MIN) * flatMaskRaw;

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

            const dunesN = fbm3D(
                xLocalEff * NOISE_DUNE_SCALE + ox,
                yLocal * NOISE_DUNE_SCALE + oy,
                zLocalEff * NOISE_DUNE_SCALE + oz,
                NOISE_DUNE_OCTAVES,
                seedU32
            );
            const dunesNMasked = dunesN * flatMask;

            const crackN = fbm3D(
                xLocal * NOISE_CRACK_SCALE + (ox + 1234.56),
                yLocal * NOISE_CRACK_SCALE + (oy - 234.12),
                zLocal * NOISE_CRACK_SCALE + (oz + 98.76),
                NOISE_CRACK_OCTAVES,
                seedU32
            );
            const crackRidged = Math.abs(crackN);
            const crackMask = hotMask * flatMask * smoothstep(0.55, 0.78, crackRidged);

            const craterN = fbm3D(
                xLocal * NOISE_CRATER_SCALE + (ox + 999.13),
                yLocal * NOISE_CRATER_SCALE + (oy - 321.71),
                zLocal * NOISE_CRATER_SCALE + (oz + 77.77),
                NOISE_CRATER_OCTAVES,
                seedU32
            );
            const craterRidged = 1 - Math.abs(craterN);
            const craterInner = smoothstep(CRATER_INNER_EDGE0, CRATER_INNER_EDGE1, craterRidged);
            const craterRimBand =
                smoothstep(CRATER_RIM_EDGE0, CRATER_RIM_EDGE1, craterRidged) -
                smoothstep(CRATER_INNER_EDGE0, CRATER_INNER_EDGE1, craterRidged);
            const craterMask = hotMask * flatMask * smoothstep(CRATER_MASK_EDGE0, CRATER_MASK_EDGE1, craterRidged);

            height[y * INTERNAL_WIDTH + x] =
                dunesNMasked +
                CRATER_RIM_STRENGTH * craterRimBand * craterMask -
                CRATER_DEPTH_STRENGTH * craterInner * craterMask +
                CRACK_STRENGTH * crackRidged * crackMask;

            const dunesRidged = 1 - Math.abs(dunesNMasked);
            const dunesT = clamp01(0.5 + 0.65 * dunesRidged);

            const oasisN = fbm3D(
                xLocal * NOISE_OASIS_SCALE + (ox + 777.1),
                yLocal * NOISE_OASIS_SCALE + (oy - 133.7),
                zLocal * NOISE_OASIS_SCALE + (oz + 42.5),
                NOISE_OASIS_OCTAVES,
                seedU32
            );
            const oasisBlob = smoothstep(0.48, 0.78, oasisN * 0.5 + 0.5) * hotMask * flatMask;

            const baseRock = rockColor;
            let col = mix3(baseRock, sandColor, hotMask);

            const duneLight = mix3(darkSand, paleSand, dunesT);
            col = mix3(col, duneLight, hotMask * 0.75);

            const contrast = 0.72 + 0.28 * dunesNMasked;
            col = { x: col.x * contrast, y: col.y * contrast, z: col.z * contrast };

            if (craterMask > 0) {
                const craterDark = mix3(darkSand, rockColor, 0.25);
                const craterLight = mix3(paleSand, sandColor, 0.35);
                col = mix3(col, craterLight, craterRimBand * craterMask * 0.22);
                col = mix3(col, craterDark, craterInner * craterMask * 0.28);
            }

            if (crackMask > 0) {
                const crackColor = mix3(darkSand, rockColor, 0.35);
                col = mix3(col, crackColor, crackMask * 0.25);
            }

            if (oasisBlob > 0) {
                const oasisCol = mix3(waterColor, paleSand, 0.15 + 0.25 * dunesT);
                col = mix3(col, oasisCol, oasisBlob);
                col = mix3(col, sandColor, oasisBlob * 0.7);
            }

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

    // --- Normal pass, chunked ---
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = INTERNAL_WIDTH;
    normalCanvas.height = INTERNAL_HEIGHT;

    const nctx = normalCanvas.getContext('2d');
    if (!nctx) throw new Error('Failed to create desert normal canvas');

    const nimg = nctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const ndata = nimg.data;

    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const yU = y > 0 ? y - 1 : 0;
        const yD = y + 1 < INTERNAL_HEIGHT ? y + 1 : INTERNAL_HEIGHT - 1;

        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
        const normalFlatMaskRaw = 1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01);
        const normalFlatMask = POLAR_DETAIL_MIN + (1 - POLAR_DETAIL_MIN) * normalFlatMaskRaw;

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

            const out = (n.z * 0.5 + 0.5) * 255;
            const outX = (n.x * 0.5 + 0.5) * 255;
            const outY = (1 - (n.y * 0.5 + 0.5)) * 255;

            const i = (y * INTERNAL_WIDTH + x) * 4;
            ndata[i] = Math.round(outX);
            ndata[i + 1] = Math.round(outY);
            ndata[i + 2] = Math.round(out);
            ndata[i + 3] = 255;
        }

        if (y % YIELD_EVERY_ROWS === YIELD_EVERY_ROWS - 1) await yieldToEventLoop();
    }

    nctx.putImageData(nimg, 0, 0);

    const maps = canvasesToTextures(canvas, normalCanvas);

    colorCache.set(cacheKey, maps.color);
    normalCache.set(cacheKey, maps.normal);

    return maps;
}

export function getDesertTexture(seed: string): THREE.Texture {
    return getOrCreateDesertMapsSync(seed).color;
}

export function getDesertNormalTexture(seed: string): THREE.Texture {
    return getOrCreateDesertMapsSync(seed).normal;
}

export function getDesertTextureAsync(seed: string): Promise<THREE.Texture> {
    return getOrCreateDesertMapsAsync(seed).then((m) => m.color);
}

export function getDesertNormalTextureAsync(seed: string): Promise<THREE.Texture> {
    return getOrCreateDesertMapsAsync(seed).then((m) => m.normal);
}
