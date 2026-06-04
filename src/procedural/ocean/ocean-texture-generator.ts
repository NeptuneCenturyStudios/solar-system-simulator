import * as THREE from 'three';
import { SeededRandom } from '../../utilities/prng';
import { clamp01, dot, fbm3D, hashStringToU32, mix3, normalizeSafe, smoothstep } from './ocean-noise';

const TEXTURE_WIDTH = 2024;
const TEXTURE_HEIGHT = 1024;

const INTERNAL_WIDTH = TEXTURE_WIDTH;
const INTERNAL_HEIGHT = TEXTURE_HEIGHT;

type Vec3 = { x: number; y: number; z: number };

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}


export type OceanGenerationProgress = {
    seed: string;
    phase: 'height' | 'normal';
    done: number;
    total: number;
};

type OceanProgressCallback = (progress: OceanGenerationProgress) => void;

type OceanMaps = {
    color: THREE.Texture;
    normal: THREE.Texture;
};

// Caches (deterministic by seed)
const colorCache = new Map<string, THREE.Texture>();
const normalCache = new Map<string, THREE.Texture>();
const pendingOceanMaps = new Map<string, Promise<OceanMaps>>();

// ------------------------------
// Ocean tuning (deep + crisp)
// ------------------------------

// Noise scaling
const NOISE_WATER_SCALE = 10.5;
const NOISE_WATER_OCTAVES = 5;

const NOISE_ISLAND_BASE_SCALE = 20.0;
const NOISE_ISLAND_BASE_OCTAVES = 4;

const NOISE_ISLAND_RIDGED_SCALE = 58.0;
const NOISE_ISLAND_RIDGED_OCTAVES = 3;

const ISLAND_GATE_SCALE = 140.0;
const ISLAND_GATE_OCTAVES = 2;

// Island thresholds (rare)
const ISLAND_RIDGED_EDGE0 = 0.79;
const ISLAND_RIDGED_EDGE1 = 0.93;

const ISLAND_GATE_EDGE0 = 0.55;
const ISLAND_GATE_EDGE1 = 0.85;

// Height shaping
const WATER_DEPTH = 0.035;
const WATER_WAVINESS = 0.0035; // calmer water (less “foggy” feel)
const ISLAND_HEIGHT = 0.055;

// Shore band thresholds (narrower for crisp coast)
const SHOREBAND_EDGE0 = 0.20;
const SHOREBAND_EDGE1 = 0.28;

// Normal map strength (reduce “gray-out” from lighting)
const NORMAL_STRENGTH_WATER = 0.14;
const NORMAL_STRENGTH_LAND = 0.7;

// Polar flattening: reduce contrast near poles to avoid weird shading artifacts
const POLAR_FLAT_START = 0.65;
const POLAR_FLAT_END = 0.99;
const POLAR_DETAIL_MIN = 0.45;

// Palette tuned for deep ocean blue
const waterDeep: Vec3 = { x: 0.00, y: 0.05, z: 0.18 };
const waterMid: Vec3 = { x: 0.01, y: 0.16, z: 0.42 };
const waterShallow: Vec3 = { x: 0.04, y: 0.30, z: 0.55 };

// Very limited land palette (rare islands)
const landSand: Vec3 = { x: 0.78, y: 0.72, z: 0.45 };
const landRock: Vec3 = { x: 0.28, y: 0.34, z: 0.30 };

// ------------------------------
// Core generation (sync)
// ------------------------------

function createOceanMapsForSeed(seed: string): OceanMaps {
    const cacheKey = seed.trim();

    const cachedColor = colorCache.get(cacheKey);
    const cachedNormal = normalCache.get(cacheKey);
    if (cachedColor && cachedNormal) return { color: cachedColor, normal: cachedNormal };

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

    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_WIDTH;
    canvas.height = INTERNAL_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create ocean texture canvas');

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

    // Precompute equal-area latitude sin/cos
    const latSin = new Float32Array(INTERNAL_HEIGHT);
    const latCos = new Float32Array(INTERNAL_HEIGHT);
    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const v01 = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const sinLat = 1 - 2 * v01;
        const cosLat = Math.sqrt(Math.max(0, 1 - sinLat * sinLat));
        latSin[y] = sinLat;
        latCos[y] = cosLat;
    }

    // Height + color
    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const sLat = latSin[y]!;
        const cLat = latCos[y]!;

        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
        const polarFlatRaw = 1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01);
        const normalFlatMask = POLAR_DETAIL_MIN + (1 - POLAR_DETAIL_MIN) * polarFlatRaw;

        for (let x = 0; x < INTERNAL_WIDTH; x++) {
            const cLon = lonCos[x]!;
            const sLon = lonSin[x]!;

            // Sphere direction
            const dx = cLat * cLon;
            const dy = sLat;
            const dz = cLat * sLon;

            // Local climate frame
            const yLocal = dot({ x: dx, y: dy, z: dz }, up);
            const xLocal = dot({ x: dx, y: dy, z: dz }, east);
            const zLocal = dot({ x: dx, y: dy, z: dz }, north);

            const poleFactor = Math.pow(Math.max(0, 1 - Math.abs(yLocal)), 0.65);
            const xLocalEff = xLocal * poleFactor;
            const zLocalEff = zLocal * poleFactor;

            // Water field (subtle)
            const waterN = fbm3D(
                xLocalEff * NOISE_WATER_SCALE + ox,
                yLocal * NOISE_WATER_SCALE + oy,
                zLocalEff * NOISE_WATER_SCALE + oz,
                NOISE_WATER_OCTAVES,
                seedU32
            );

            // Island signals
            const islandBase = fbm3D(
                xLocalEff * NOISE_ISLAND_BASE_SCALE + (ox + 111.1),
                yLocal * NOISE_ISLAND_BASE_SCALE + (oy - 222.2),
                zLocalEff * NOISE_ISLAND_BASE_SCALE + (oz + 333.3),
                NOISE_ISLAND_BASE_OCTAVES,
                seedU32
            );

            const islandRidgedRaw = fbm3D(
                xLocal * NOISE_ISLAND_RIDGED_SCALE + (ox + 900.5),
                yLocal * NOISE_ISLAND_RIDGED_SCALE + (oy - 800.2),
                zLocal * NOISE_ISLAND_RIDGED_SCALE + (oz + 700.9),
                NOISE_ISLAND_RIDGED_OCTAVES,
                seedU32
            );
            const islandRidged = 1 - Math.abs(islandRidgedRaw);

            const gateN = fbm3D(
                xLocalEff * ISLAND_GATE_SCALE + (ox - 41.4),
                yLocal * ISLAND_GATE_SCALE + (oy + 12.7),
                zLocalEff * ISLAND_GATE_SCALE + (oz + 88.8),
                ISLAND_GATE_OCTAVES,
                seedU32
            );

            const islandRidgedMask = smoothstep(ISLAND_RIDGED_EDGE0, ISLAND_RIDGED_EDGE1, islandRidged);
            const islandGate = smoothstep(ISLAND_GATE_EDGE0, ISLAND_GATE_EDGE1, gateN);

            const baseMod = smoothstep(0.25, 0.8, 0.5 + 0.5 * islandBase);
            const islandMask = islandRidgedMask * islandGate * baseMod;

            // Make islands rare + crisp
            const islandMaskSharp = Math.pow(clamp01(islandMask), 3.6);

            // Coast sharp band
            const shoreBand = smoothstep(SHOREBAND_EDGE0, SHOREBAND_EDGE1, islandMaskSharp);

            // Height (water negative/near-flat, islands positive)
            const waveN = fbm3D(
                xLocalEff * (NOISE_WATER_SCALE * 1.65) + (ox - 501.3),
                yLocal * (NOISE_WATER_SCALE * 1.65) + (oy + 777.7),
                zLocalEff * (NOISE_WATER_SCALE * 1.65) + (oz + 123.4),
                3,
                seedU32
            );

            const waterHeight = -WATER_DEPTH + WATER_WAVINESS * waveN * (1 - islandMaskSharp);
            const landHeight = islandMaskSharp * ISLAND_HEIGHT;

            const h = lerp(waterHeight, landHeight, islandMaskSharp);
            height[y * INTERNAL_WIDTH + x] = h;

            // Color (deep blue + subtle variation)
            const waterT = clamp01(0.08 + 0.55 * clamp01(0.5 + 0.5 * waterN));
            let col = mix3(waterDeep, waterMid, waterT);

            // Very subtle banding
            const band = clamp01(
                0.5 +
                    0.5 *
                        fbm3D(
                            xLocalEff * (NOISE_WATER_SCALE * 0.55) + (ox + 10.1),
                            yLocal * (NOISE_WATER_SCALE * 0.55) + (oy - 20.2),
                            zLocalEff * (NOISE_WATER_SCALE * 0.55) + (oz + 30.3),
                            2,
                            seedU32
                        )
            );
            col = mix3(col, waterMid, band * 0.12);

            // Shoreline tint (weak)
            const shorelineCol = mix3(waterMid, waterShallow, shoreBand);
            col = mix3(col, shorelineCol, shoreBand * 0.20);

            // Islands (rare)
            if (islandMaskSharp > 0.001) {
                const landN = fbm3D(
                    xLocalEff * (NOISE_ISLAND_BASE_SCALE * 1.2) + (ox + 404.4),
                    yLocal * (NOISE_ISLAND_BASE_SCALE * 1.2) + (oy - 505.5),
                    zLocalEff * (NOISE_ISLAND_BASE_SCALE * 1.2) + (oz + 606.6),
                    3,
                    seedU32
                );

                const rockT = clamp01(0.5 + 0.5 * landN);
                const landCol = mix3(landSand, landRock, rockT * 0.6);

                const landBlend = clamp01(islandMaskSharp * 1.15);
                col = mix3(col, landCol, landBlend);

                // Wet sand accent near coasts
                const wetSand = mix3(landSand, waterShallow, 0.25);
                const wetT = (1 - Math.pow(1 - islandMaskSharp, 2)) * shoreBand * 0.25;
                col = mix3(col, wetSand, wetT);
            }

            // Polar contrast: reduce overall brightness to keep deep blue
            const polarContrast = 0.45 + 0.2 * normalFlatMask;
            col = { x: col.x * polarContrast, y: col.y * polarContrast, z: col.z * polarContrast };

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

    // Normal map from height (seam-safe wrap x)
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = INTERNAL_WIDTH;
    normalCanvas.height = INTERNAL_HEIGHT;

    const nctx = normalCanvas.getContext('2d');
    if (!nctx) throw new Error('Failed to create ocean normal canvas');

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

            const isLand = hL > 0 || hR > 0 || hU > 0 || hD > 0;
            const strength = isLand ? NORMAL_STRENGTH_LAND : NORMAL_STRENGTH_WATER;

            const nx = -dxH * strength * normalFlatMask;
            const ny = -dyH * strength * normalFlatMask;
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

    colorCache.set(cacheKey, colorTex);
    normalCache.set(cacheKey, normalTex);

    return { color: colorTex, normal: normalTex };
}

// ------------------------------
// Core generation (async)
// ------------------------------

async function getOrCreateOceanMapsForSeedAsync(
    seed: string,
    onProgress?: OceanProgressCallback,
    signal?: AbortSignal
): Promise<OceanMaps> {
    const cacheKey = seed.trim();

    const cachedColor = colorCache.get(cacheKey);
    const cachedNormal = normalCache.get(cacheKey);
    if (cachedColor && cachedNormal) return { color: cachedColor, normal: cachedNormal };

    const existing = pendingOceanMaps.get(cacheKey);
    if (existing) return existing;

    const workPromise = (async (): Promise<OceanMaps> => {
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

        const canvas = document.createElement('canvas');
        canvas.width = INTERNAL_WIDTH;
        canvas.height = INTERNAL_HEIGHT;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to create ocean texture canvas');

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

        // Precompute equal-area latitude sin/cos
        const latSin = new Float32Array(INTERNAL_HEIGHT);
        const latCos = new Float32Array(INTERNAL_HEIGHT);
        for (let y = 0; y < INTERNAL_HEIGHT; y++) {
            const v01 = y / Math.max(1, INTERNAL_HEIGHT - 1);
            const sinLat = 1 - 2 * v01;
            const cosLat = Math.sqrt(Math.max(0, 1 - sinLat * sinLat));
            latSin[y] = sinLat;
            latCos[y] = cosLat;
        }

        const ensureNotAborted = () => {
            if (signal?.aborted) throw new Error('Ocean generation aborted.');
        };

        // Height + color
        const totalRows = INTERNAL_HEIGHT * 2;
        let doneRows = 0;
        const YIELD_EVERY_ROWS = 6;

        for (let y = 0; y < INTERNAL_HEIGHT; y++) {
            ensureNotAborted();

            const sLat = latSin[y]!;
            const cLat = latCos[y]!;

            const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
            const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
            const polarFlatRaw = 1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01);
            const normalFlatMask = POLAR_DETAIL_MIN + (1 - POLAR_DETAIL_MIN) * polarFlatRaw;

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

                const waterN = fbm3D(
                    xLocalEff * NOISE_WATER_SCALE + ox,
                    yLocal * NOISE_WATER_SCALE + oy,
                    zLocalEff * NOISE_WATER_SCALE + oz,
                    NOISE_WATER_OCTAVES,
                    seedU32
                );

                const islandBase = fbm3D(
                    xLocalEff * NOISE_ISLAND_BASE_SCALE + (ox + 111.1),
                    yLocal * NOISE_ISLAND_BASE_SCALE + (oy - 222.2),
                    zLocalEff * NOISE_ISLAND_BASE_SCALE + (oz + 333.3),
                    NOISE_ISLAND_BASE_OCTAVES,
                    seedU32
                );

                const islandRidgedRaw = fbm3D(
                    xLocal * NOISE_ISLAND_RIDGED_SCALE + (ox + 900.5),
                    yLocal * NOISE_ISLAND_RIDGED_SCALE + (oy - 800.2),
                    zLocal * NOISE_ISLAND_RIDGED_SCALE + (oz + 700.9),
                    NOISE_ISLAND_RIDGED_OCTAVES,
                    seedU32
                );
                const islandRidged = 1 - Math.abs(islandRidgedRaw);

                const gateN = fbm3D(
                    xLocalEff * ISLAND_GATE_SCALE + (ox - 41.4),
                    yLocal * ISLAND_GATE_SCALE + (oy + 12.7),
                    zLocalEff * ISLAND_GATE_SCALE + (oz + 88.8),
                    ISLAND_GATE_OCTAVES,
                    seedU32
                );

                const islandRidgedMask = smoothstep(ISLAND_RIDGED_EDGE0, ISLAND_RIDGED_EDGE1, islandRidged);
                const islandGate = smoothstep(ISLAND_GATE_EDGE0, ISLAND_GATE_EDGE1, gateN);

                const baseMod = smoothstep(0.25, 0.8, 0.5 + 0.5 * islandBase);
                const islandMask = islandRidgedMask * islandGate * baseMod;

                const islandMaskSharp = Math.pow(clamp01(islandMask), 3.6);
                const shoreBand = smoothstep(SHOREBAND_EDGE0, SHOREBAND_EDGE1, islandMaskSharp);

                const waveN = fbm3D(
                    xLocalEff * (NOISE_WATER_SCALE * 1.65) + (ox - 501.3),
                    yLocal * (NOISE_WATER_SCALE * 1.65) + (oy + 777.7),
                    zLocalEff * (NOISE_WATER_SCALE * 1.65) + (oz + 123.4),
                    3,
                    seedU32
                );

                const waterHeight = -WATER_DEPTH + WATER_WAVINESS * waveN * (1 - islandMaskSharp);
                const landHeight = islandMaskSharp * ISLAND_HEIGHT;

                const h = lerp(waterHeight, landHeight, islandMaskSharp);
                height[y * INTERNAL_WIDTH + x] = h;

                const waterT = clamp01(0.08 + 0.55 * clamp01(0.5 + 0.5 * waterN));
                let col = mix3(waterDeep, waterMid, waterT);

                const band = clamp01(
                    0.5 +
                        0.5 *
                            fbm3D(
                                xLocalEff * (NOISE_WATER_SCALE * 0.55) + (ox + 10.1),
                                yLocal * (NOISE_WATER_SCALE * 0.55) + (oy - 20.2),
                                zLocalEff * (NOISE_WATER_SCALE * 0.55) + (oz + 30.3),
                                2,
                                seedU32
                            )
                );
                col = mix3(col, waterMid, band * 0.12);

                const shorelineCol = mix3(waterMid, waterShallow, shoreBand);
                col = mix3(col, shorelineCol, shoreBand * 0.20);

                if (islandMaskSharp > 0.001) {
                    const landN = fbm3D(
                        xLocalEff * (NOISE_ISLAND_BASE_SCALE * 1.2) + (ox + 404.4),
                        yLocal * (NOISE_ISLAND_BASE_SCALE * 1.2) + (oy - 505.5),
                        zLocalEff * (NOISE_ISLAND_BASE_SCALE * 1.2) + (oz + 606.6),
                        3,
                        seedU32
                    );
                    const rockT = clamp01(0.5 + 0.5 * landN);
                    const landCol = mix3(landSand, landRock, rockT * 0.6);

                    const landBlend = clamp01(islandMaskSharp * 1.15);
                    col = mix3(col, landCol, landBlend);

                    const wetSand = mix3(landSand, waterShallow, 0.25);
                    const wetT = (1 - Math.pow(1 - islandMaskSharp, 2)) * shoreBand * 0.25;
                    col = mix3(col, wetSand, wetT);
                }

                const polarContrast = 0.45 + 0.2 * normalFlatMask;
                col = { x: col.x * polarContrast, y: col.y * polarContrast, z: col.z * polarContrast };

                const r = Math.round(clamp01(col.x) * 255);
                const g = Math.round(clamp01(col.y) * 255);
                const b = Math.round(clamp01(col.z) * 255);

                const pIndex = (y * INTERNAL_WIDTH + x) * 4;
                data[pIndex] = r;
                data[pIndex + 1] = g;
                data[pIndex + 2] = b;
                data[pIndex + 3] = 255;
            }
            doneRows++;
            onProgress?.({ seed: cacheKey, phase: 'height', done: doneRows, total: totalRows });
            if (y % YIELD_EVERY_ROWS === YIELD_EVERY_ROWS - 1) await yieldToEventLoop();
        }

        ctx.putImageData(img, 0, 0);

        // Normal map
        const normalCanvas = document.createElement('canvas');
        normalCanvas.width = INTERNAL_WIDTH;
        normalCanvas.height = INTERNAL_HEIGHT;

        const nctx = normalCanvas.getContext('2d');
        if (!nctx) throw new Error('Failed to create ocean normal canvas');

        const nimg = nctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
        const ndata = nimg.data;

        for (let y = 0; y < INTERNAL_HEIGHT; y++) {
            ensureNotAborted();

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

                const isLand = hL > 0 || hR > 0 || hU > 0 || hD > 0;
                const strength = isLand ? NORMAL_STRENGTH_LAND : NORMAL_STRENGTH_WATER;

                const nx = -dxH * strength * normalFlatMask;
                const ny = -dyH * strength * normalFlatMask;
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
            doneRows++;
            onProgress?.({ seed: cacheKey, phase: 'normal', done: doneRows, total: totalRows });
            if (y % YIELD_EVERY_ROWS === YIELD_EVERY_ROWS - 1) await yieldToEventLoop();
        }

        nctx.putImageData(nimg, 0, 0);

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

        colorCache.set(cacheKey, colorTex);
        normalCache.set(cacheKey, normalTex);

        return { color: colorTex, normal: normalTex };
    })();

    pendingOceanMaps.set(cacheKey, workPromise);

    try {
        return await workPromise;
    } finally {
        pendingOceanMaps.delete(cacheKey);
    }
}

// ------------------------------
// Public API
// ------------------------------

export function getOceanTexture(seed: string): THREE.Texture {
    return createOceanMapsForSeed(seed).color;
}

export function getOceanNormalTexture(seed: string): THREE.Texture {
    return createOceanMapsForSeed(seed).normal;
}

export async function getOceanTextureAsync(
    seed: string,
    onProgress?: (progress: OceanGenerationProgress) => void,
    options?: { signal?: AbortSignal }
): Promise<THREE.Texture> {
    const maps = await getOrCreateOceanMapsForSeedAsync(seed, onProgress, options?.signal);
    return maps.color;
}

export async function getOceanNormalTextureAsync(
    seed: string,
    onProgress?: (progress: OceanGenerationProgress) => void,
    options?: { signal?: AbortSignal }
): Promise<THREE.Texture> {
    const maps = await getOrCreateOceanMapsForSeedAsync(seed, onProgress, options?.signal);
    return maps.normal;
}
