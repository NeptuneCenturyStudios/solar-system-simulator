import * as THREE from 'three';
import { SeededRandom } from '../../utilities/prng';
import { clamp01, dot, fbm3D, hashStringToU32, lerp, mix3, normalizeSafe, smoothstep, Vec3 } from '../noise-utils';

const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1024;

const INTERNAL_WIDTH = TEXTURE_WIDTH;
const INTERNAL_HEIGHT = TEXTURE_HEIGHT;

// =============================================================================
// Noise tuning — continent-scale landmasses with realistic Earth-like detail
// =============================================================================

// Continental shape — very low frequency for large sweeping landmasses
const NOISE_CONTINENT_SCALE = 2.8;
const NOISE_CONTINENT_OCTAVES = 4;

// Coastline detail — medium frequency for jagged edges, fjords, bays
const NOISE_COAST_SCALE = 14.0;
const NOISE_COAST_OCTAVES = 4;

// Terrain elevation — builds mountains and hills on land
const NOISE_TERRAIN_SCALE = 18.0;
const NOISE_TERRAIN_OCTAVES = 5;

// Ridged mountain detail — sharp ridge lines for mountain ranges
const NOISE_RIDGE_SCALE = 30.0;
const NOISE_RIDGE_OCTAVES = 4;

// Micro detail for ground texture variation
const NOISE_DETAIL_SCALE = 60.0;
const NOISE_DETAIL_OCTAVES = 3;

// Biome/region noise — broad color zones (forest, desert, grassland)
const NOISE_BIOME_SCALE = 5.0;
const NOISE_BIOME_OCTAVES = 3;

// Polar ice cap noise
const NOISE_ICE_SCALE = 12.0;
const NOISE_ICE_OCTAVES = 3;

// =============================================================================
// Thresholds — tuned for ocean-dominated worlds (more water, less land)
// =============================================================================

// Coast gate — smoothstep width applied directly to combinedGate.
// The threshold itself is seeded per-planet (see renderTemperateMaps).
const COAST_GATE_WIDTH = 0.12;

// Shore band — where water meets land
const SHORE_EDGE0 = 0.18;
const SHORE_EDGE1 = 0.32;

// Mountain ridge thresholds
const RIDGE_EDGE0 = 0.55;
const RIDGE_EDGE1 = 0.80;

// Polar cap latitude — normalized latitude where ice begins to appear
const ICE_LAT_START = 0.72;
const ICE_LAT_END = 0.90;

// =============================================================================
// Height shaping
// =============================================================================

const OCEAN_DEPTH = 0.04;
const OCEAN_WAVINESS = 0.003;
const LAND_BASE_HEIGHT = 0.06;
const RIDGE_HEIGHT = 0.04;

// =============================================================================
// Normal map
// =============================================================================

const NORMAL_STRENGTH_WATER = 0.12;
const NORMAL_STRENGTH_LAND = 0.7;

// Polar flattening
const POLAR_FLAT_START = 0.65;
const POLAR_FLAT_END = 0.99;
const POLAR_DETAIL_MIN = 0.40;

// =============================================================================
// Color Palette — Earth-like
// =============================================================================

// Oceans
const oceanDeep: Vec3 = { x: 0.01, y: 0.04, z: 0.42 };
const oceanMid: Vec3 = { x: 0.01, y: 0.12, z: 0.62 };
const oceanShallow: Vec3 = { x: 0.05, y: 0.28, z: 0.75 };
const oceanCoastal: Vec3 = { x: 0.12, y: 0.45, z: 0.82 };

// Land — forest / vegetation (temperate Earth-like greens)
const forestDark: Vec3 = { x: 0.08, y: 0.25, z: 0.06 };
const forestMid: Vec3 = { x: 0.12, y: 0.38, z: 0.10 };
const grassland: Vec3 = { x: 0.30, y: 0.55, z: 0.15 };
const savanna: Vec3 = { x: 0.55, y: 0.65, z: 0.20 };

// Arid / desert regions
const desertSand: Vec3 = { x: 0.72, y: 0.62, z: 0.38 };
const desertRock: Vec3 = { x: 0.55, y: 0.48, z: 0.32 };

// Mountains / bare rock
const mountainRock: Vec3 = { x: 0.40, y: 0.38, z: 0.34 };
const mountainSnow: Vec3 = { x: 0.78, y: 0.80, z: 0.85 };

// Polar ice
const iceColor: Vec3 = { x: 0.70, y: 0.76, z: 0.88 };
const iceBright: Vec3 = { x: 0.88, y: 0.90, z: 0.95 };
const snowWhite: Vec3 = { x: 0.95, y: 0.96, z: 0.98 };

// Sand/beach fringe
const beachSand: Vec3 = { x: 0.80, y: 0.75, z: 0.55 };

// =============================================================================
// Types & Caches
// =============================================================================

type TemperateMaps = {
    color: THREE.Texture;
    normal: THREE.Texture;
};

const colorCache = new Map<string, THREE.Texture>();
const normalCache = new Map<string, THREE.Texture>();

function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

// =============================================================================
// Canvas → THREE.Texture helpers
// =============================================================================

function canvasesToTextures(canvas: HTMLCanvasElement, normalCanvas: HTMLCanvasElement): TemperateMaps {
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
    normalTex.minFilter = THREE.NearestFilter;
    normalTex.magFilter = THREE.NearestFilter;
    normalTex.anisotropy = 16;
    normalTex.needsUpdate = true;

    return { color: colorTex, normal: normalTex };
}

// =============================================================================
// Synchronous render: colour + normal canvases
// =============================================================================

function renderTemperateMaps(seed: string): { canvas: HTMLCanvasElement; normalCanvas: HTMLCanvasElement } {
    const cacheKey = seed.trim();

    const seedU32 = hashStringToU32(cacheKey);

    // Random rotation axis — so different seeds get different continent arrangements
    const climateRng = new SeededRandom(`${cacheKey}|climate-axis`);
    const yaw = climateRng.range(0, Math.PI * 2);

    const up: Vec3 = { x: 0, y: 1, z: 0 };
    const north: Vec3 = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
    const east: Vec3 = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };

    const ox = climateRng.range(-200, 200);
    const oy = climateRng.range(-200, 200);
    const oz = climateRng.range(-200, 200);

    // Per-planet land/ocean ratio — dedicated RNG so it's independent of
    // the climate-axis call order and won't shift if other params are added.
    const landThreshold = new SeededRandom(`${cacheKey}|land-threshold`).range(0.48, 0.62);

    // === Precompute spherical mapping tables ===

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

    // === Canvas setup ===

    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_WIDTH;
    canvas.height = INTERNAL_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create temperate texture canvas');

    const img = ctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const data = img.data;

    const height = new Float32Array(INTERNAL_WIDTH * INTERNAL_HEIGHT);

    // === Main render loop ===

    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const sLat = latSin[y]!;
        const cLat = latCos[y]!;

        // Latitude value in [-1..1] for ice cap calculation
        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const absLatSphere = Math.abs(1 - 2 * v01Pole); // 0 at equator, 1 at poles

        for (let x = 0; x < INTERNAL_WIDTH; x++) {
            const cLon = lonCos[x]!;
            const sLon = lonSin[x]!;

            // Unit sphere direction
            const dx = cLat * cLon;
            const dy = sLat;
            const dz = cLat * sLon;

            // Local coordinates for noise sampling (aligned to climate axis)
            const yLocal = dot({ x: dx, y: dy, z: dz }, up);
            const xLocal = dot({ x: dx, y: dy, z: dz }, east);
            const zLocal = dot({ x: dx, y: dy, z: dz }, north);

            // Pole factor — reduces longitudinal distortion near poles
            const poleFactor = Math.pow(Math.max(0, 1 - Math.abs(yLocal)), 0.65);
            const xLocalEff = xLocal * poleFactor;
            const zLocalEff = zLocal * poleFactor;

            // === Continent shape — large-scale low-frequency ===
            const continentN = fbm3D(
                xLocalEff * NOISE_CONTINENT_SCALE + ox,
                yLocal * NOISE_CONTINENT_SCALE + oy,
                zLocalEff * NOISE_CONTINENT_SCALE + oz,
                NOISE_CONTINENT_OCTAVES,
                seedU32
            );

            // === Coastline detail — medium frequency for jagged edges ===
            const coastN = fbm3D(
                xLocalEff * NOISE_COAST_SCALE + (ox + 135.7),
                yLocal * NOISE_COAST_SCALE + (oy - 246.8),
                zLocalEff * NOISE_COAST_SCALE + (oz + 357.9),
                NOISE_COAST_OCTAVES,
                seedU32
            );

            // === Terrain elevation on land ===
            const terrainN = fbm3D(
                xLocalEff * NOISE_TERRAIN_SCALE + (ox + 112.2),
                yLocal * NOISE_TERRAIN_SCALE + (oy - 334.4),
                zLocalEff * NOISE_TERRAIN_SCALE + (oz + 556.6),
                NOISE_TERRAIN_OCTAVES,
                seedU32
            );

            // === Ridged mountain detail ===
            const ridgeN = fbm3D(
                xLocalEff * NOISE_RIDGE_SCALE + (ox + 888.1),
                yLocal * NOISE_RIDGE_SCALE + (oy - 222.3),
                zLocalEff * NOISE_RIDGE_SCALE + (oz + 444.5),
                NOISE_RIDGE_OCTAVES,
                seedU32
            );
            const ridgeRidged = 1 - Math.abs(ridgeN);
            const ridgeStrength = smoothstep(RIDGE_EDGE0, RIDGE_EDGE1, ridgeRidged);

            // === Micro detail for ground texture ===
            const detailN = fbm3D(
                xLocalEff * NOISE_DETAIL_SCALE + (ox + 77.1),
                yLocal * NOISE_DETAIL_SCALE + (oy - 88.2),
                zLocalEff * NOISE_DETAIL_SCALE + (oz + 99.3),
                NOISE_DETAIL_OCTAVES,
                seedU32
            );

            // === Build landmask: continent + coast ===
            const continentRemap = clamp01(0.5 + 0.5 * continentN);

            // Combine continent gate with coast noise for ragged edges
            const coastRemap = clamp01(0.5 + 0.5 * coastN);
            const combinedGate = clamp01(continentRemap * 0.6 + coastRemap * 0.4); // blend

            // Coast gate — compare directly to per-planet seeded threshold.
            // combinedGate clusters ~N(0.5, std 0.08); landThreshold [0.48, 0.62]
            // produces 8–55% land depending on seed, always majority ocean.
            const landMask = smoothstep(landThreshold, landThreshold + COAST_GATE_WIDTH, combinedGate);
            const landMaskSharp = Math.pow(landMask, 1.8);

            // Shore band (transition zone between water and land)
            const shoreBand = smoothstep(SHORE_EDGE0, SHORE_EDGE1, landMaskSharp);

            // === Height ===
            // Ocean waviness (subtle, only in water)
            const waveN = fbm3D(
                xLocalEff * (NOISE_COAST_SCALE * 1.3) + (ox - 333.1),
                yLocal * (NOISE_COAST_SCALE * 1.3) + (oy + 666.2),
                zLocalEff * (NOISE_COAST_SCALE * 1.3) + (oz + 111.3),
                3,
                seedU32
            );

            // Land elevation: terrain + mountain ridge overlay
            const terrainElev = 0.5 + 0.5 * terrainN;
            const mountainElev = ridgeStrength * RIDGE_HEIGHT;
            const landElev = LAND_BASE_HEIGHT * terrainElev + mountainElev;

            const waterHeight = -OCEAN_DEPTH + OCEAN_WAVINESS * waveN * (1 - landMaskSharp);
            const h = lerp(waterHeight, landElev, landMaskSharp);
            height[y * INTERNAL_WIDTH + x] = h;

            // === Color ===

            // --- Water ---
            const waterDepth = clamp01(0.5 + 0.5 * detailN);
            const waterT = clamp01(waterDepth * 0.8 + 0.1);
            let col = mix3(oceanDeep, oceanMid, waterT);
            // Subtle banding
            const band = clamp01(
                0.5 + 0.5 * fbm3D(
                    xLocalEff * (NOISE_COAST_SCALE * 0.4) + (ox + 10.0),
                    yLocal * (NOISE_COAST_SCALE * 0.4) + (oy - 20.0),
                    zLocalEff * (NOISE_COAST_SCALE * 0.4) + (oz + 30.0),
                    2,
                    seedU32
                )
            );
            col = mix3(col, oceanMid, band * 0.10);

            // Shallow coastal water
            const shallowCol = mix3(oceanMid, oceanShallow, shoreBand);
            col = mix3(col, shallowCol, shoreBand * 0.25);

            // Very shallow / coastal fringe
            const coastalFringe = mix3(oceanShallow, oceanCoastal, shoreBand);
            col = mix3(col, coastalFringe, Math.pow(shoreBand, 0.5) * 0.15);

            // --- Land ---
            if (landMaskSharp > 0.001) {
                // Biome selection based on latitude + noise
                const latFactor = absLatSphere; // 0 at equator, 1 at poles

                const biomeN = fbm3D(
                    xLocalEff * NOISE_BIOME_SCALE + (ox + 500.1),
                    yLocal * NOISE_BIOME_SCALE + (oy - 600.2),
                    zLocalEff * NOISE_BIOME_SCALE + (oz + 700.3),
                    NOISE_BIOME_OCTAVES,
                    seedU32 + 8888
                );
                const biome = clamp01(0.5 + 0.5 * biomeN);

                // Mix based on latitude + biome noise
                const equatorialBias = clamp01(1 - latFactor * 1.5);
                const temperateBias = clamp01(1 - Math.abs(latFactor - 0.4) * 2.5);
                const aridBias = clamp01(1 - Math.abs(latFactor - 0.3) * 8.0) * (1 - equatorialBias) * 0.5;

                // Green blend
                const greenMix = mix3(forestDark, forestMid, biome);
                const temperateMix = mix3(grassland, savanna, biome);

                let landCol: Vec3;
                if (equatorialBias > 0.5) {
                    landCol = mix3(forestDark, greenMix, equatorialBias);
                } else if (aridBias > 0.3) {
                    landCol = mix3(desertSand, desertRock, biome);
                } else {
                    landCol = mix3(temperateMix, greenMix, temperateBias);
                }

                // Elevation coloring: low = green, mid = brown/tan, high = rock, peak = snow
                const elevFactor = terrainElev; // 0..1
                if (elevFactor > 0.65) {
                    const rockFade = (elevFactor - 0.65) / 0.30;
                    landCol = mix3(landCol, mix3(mountainRock, mountainSnow, clamp01((elevFactor - 0.80) / 0.15)), rockFade * 0.5);
                } else if (elevFactor < 0.35) {
                    // Lowland — might get coastal/sandy
                    const coastLatBias = clamp01(absLatSphere * 2.5);
                    landCol = mix3(landCol, beachSand, (1 - biome) * coastLatBias * 0.15);
                }

                // Ridge highlighting — brighter on ridges
                if (ridgeStrength > 0) {
                    landCol = mix3(landCol, mountainRock, ridgeStrength * 0.12);
                    landCol = mix3(landCol, mountainSnow, Math.pow(ridgeStrength, 2.0) * 0.08);
                }

                // Detail variation (micro)
                const micro = detailN * 0.025;
                landCol = {
                    x: clamp01(landCol.x + micro),
                    y: clamp01(landCol.y + micro),
                    z: clamp01(landCol.z + micro),
                };

                // Blend land over water
                const landBlend = clamp01(landMaskSharp * 1.1);
                col = mix3(col, landCol, landBlend);

                // Wet sand fringe at coast
                const wetSand = mix3(oceanShallow, beachSand, 0.3);
                const wetT = Math.pow(shoreBand, 0.8) * 0.20;
                col = mix3(col, wetSand, wetT);
            }

            // === Polar ice caps ===
            const iceLat = smoothstep(ICE_LAT_START, ICE_LAT_END, absLatSphere);
            if (iceLat > 0) {
                const iceN = fbm3D(
                    xLocalEff * NOISE_ICE_SCALE + (ox + 200.1),
                    yLocal * NOISE_ICE_SCALE + (oy - 300.2),
                    zLocalEff * NOISE_ICE_SCALE + (oz + 400.3),
                    NOISE_ICE_OCTAVES,
                    seedU32
                );
                const iceGap = smoothstep(0.35, 0.75, clamp01(0.5 + 0.5 * iceN));
                const iceStrength = iceLat * iceGap;

                // Ice gets brighter toward the pole
                const poleBrightness = smoothstep(ICE_LAT_START, 1.0, absLatSphere);
                const iceCol = mix3(iceColor, iceBright, poleBrightness);
                col = mix3(col, iceCol, iceStrength * 0.85);

                // Snow accumulation toward true pole
                const snowStrength = smoothstep(ICE_LAT_END, 1.0, absLatSphere) * iceGap;
                col = mix3(col, snowWhite, snowStrength * 0.3);
            }

            // === Write pixel ===
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

    // === Normal map ===
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = INTERNAL_WIDTH;
    normalCanvas.height = INTERNAL_HEIGHT;

    const nctx = normalCanvas.getContext('2d');
    if (!nctx) throw new Error('Failed to create temperate normal canvas');

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

    return { canvas, normalCanvas };
}

// =============================================================================
// Sync path
// =============================================================================

function getOrCreateTemperateMapsSync(seed: string): TemperateMaps {
    const cacheKey = seed.trim();

    const cachedColor = colorCache.get(cacheKey);
    const cachedNormal = normalCache.get(cacheKey);
    if (cachedColor && cachedNormal) return { color: cachedColor, normal: cachedNormal };

    const { canvas, normalCanvas } = renderTemperateMaps(seed);
    const maps = canvasesToTextures(canvas, normalCanvas);

    colorCache.set(cacheKey, maps.color);
    normalCache.set(cacheKey, maps.normal);

    return maps;
}

// =============================================================================
// Async path (chunked with yields)
// =============================================================================

async function getOrCreateTemperateMapsAsync(seed: string): Promise<TemperateMaps> {
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

    // Per-planet land/ocean ratio — dedicated RNG so it's independent of
    // the climate-axis call order and won't shift if other params are added.
    const landThreshold = new SeededRandom(`${cacheKey}|land-threshold`).range(0.48, 0.62);

    // Precompute spherical tables
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

    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_WIDTH;
    canvas.height = INTERNAL_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create temperate texture canvas');

    const img = ctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const data = img.data;

    const height = new Float32Array(INTERNAL_WIDTH * INTERNAL_HEIGHT);

    const YIELD_EVERY_ROWS = 6;

    // === Pass 1: Color + Height ===
    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const sLat = latSin[y]!;
        const cLat = latCos[y]!;
        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const absLatSphere = Math.abs(1 - 2 * v01Pole);

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

            // Continent shape
            const continentN = fbm3D(
                xLocalEff * NOISE_CONTINENT_SCALE + ox,
                yLocal * NOISE_CONTINENT_SCALE + oy,
                zLocalEff * NOISE_CONTINENT_SCALE + oz,
                NOISE_CONTINENT_OCTAVES,
                seedU32
            );

            // Coastline detail
            const coastN = fbm3D(
                xLocalEff * NOISE_COAST_SCALE + (ox + 135.7),
                yLocal * NOISE_COAST_SCALE + (oy - 246.8),
                zLocalEff * NOISE_COAST_SCALE + (oz + 357.9),
                NOISE_COAST_OCTAVES,
                seedU32
            );

            // Terrain elevation
            const terrainN = fbm3D(
                xLocalEff * NOISE_TERRAIN_SCALE + (ox + 112.2),
                yLocal * NOISE_TERRAIN_SCALE + (oy - 334.4),
                zLocalEff * NOISE_TERRAIN_SCALE + (oz + 556.6),
                NOISE_TERRAIN_OCTAVES,
                seedU32
            );

            // Ridged mountain detail
            const ridgeN = fbm3D(
                xLocalEff * NOISE_RIDGE_SCALE + (ox + 888.1),
                yLocal * NOISE_RIDGE_SCALE + (oy - 222.3),
                zLocalEff * NOISE_RIDGE_SCALE + (oz + 444.5),
                NOISE_RIDGE_OCTAVES,
                seedU32
            );
            const ridgeRidged = 1 - Math.abs(ridgeN);
            const ridgeStrength = smoothstep(RIDGE_EDGE0, RIDGE_EDGE1, ridgeRidged);

            // Micro detail
            const detailN = fbm3D(
                xLocalEff * NOISE_DETAIL_SCALE + (ox + 77.1),
                yLocal * NOISE_DETAIL_SCALE + (oy - 88.2),
                zLocalEff * NOISE_DETAIL_SCALE + (oz + 99.3),
                NOISE_DETAIL_OCTAVES,
                seedU32
            );

            // Landmask
            const continentRemap = clamp01(0.5 + 0.5 * continentN);

            const coastRemap = clamp01(0.5 + 0.5 * coastN);
            const combinedGate = clamp01(continentRemap * 0.6 + coastRemap * 0.4);

            const landMask = smoothstep(landThreshold, landThreshold + COAST_GATE_WIDTH, combinedGate);
            const landMaskSharp = Math.pow(landMask, 1.8);
            const shoreBand = smoothstep(SHORE_EDGE0, SHORE_EDGE1, landMaskSharp);

            // Height
            const waveN = fbm3D(
                xLocalEff * (NOISE_COAST_SCALE * 1.3) + (ox - 333.1),
                yLocal * (NOISE_COAST_SCALE * 1.3) + (oy + 666.2),
                zLocalEff * (NOISE_COAST_SCALE * 1.3) + (oz + 111.3),
                3,
                seedU32
            );

            const terrainElev = 0.5 + 0.5 * terrainN;
            const mountainElev = ridgeStrength * RIDGE_HEIGHT;
            const landElev = LAND_BASE_HEIGHT * terrainElev + mountainElev;

            const waterHeight = -OCEAN_DEPTH + OCEAN_WAVINESS * waveN * (1 - landMaskSharp);
            const h = lerp(waterHeight, landElev, landMaskSharp);
            height[y * INTERNAL_WIDTH + x] = h;

            // Color - water
            const waterDepth = clamp01(0.5 + 0.5 * detailN);
            const waterT = clamp01(waterDepth * 0.8 + 0.1);
            let col = mix3(oceanDeep, oceanMid, waterT);

            const bandN = clamp01(
                0.5 + 0.5 * fbm3D(
                    xLocalEff * (NOISE_COAST_SCALE * 0.4) + (ox + 10.0),
                    yLocal * (NOISE_COAST_SCALE * 0.4) + (oy - 20.0),
                    zLocalEff * (NOISE_COAST_SCALE * 0.4) + (oz + 30.0),
                    2,
                    seedU32
                )
            );
            col = mix3(col, oceanMid, bandN * 0.10);

            const shallowCol = mix3(oceanMid, oceanShallow, shoreBand);
            col = mix3(col, shallowCol, shoreBand * 0.25);

            const coastalFringe = mix3(oceanShallow, oceanCoastal, shoreBand);
            col = mix3(col, coastalFringe, Math.pow(shoreBand, 0.5) * 0.15);

            // Color - land
            if (landMaskSharp > 0.001) {
                const latFactor = absLatSphere;
                const biomeN = fbm3D(
                    xLocalEff * NOISE_BIOME_SCALE + (ox + 500.1),
                    yLocal * NOISE_BIOME_SCALE + (oy - 600.2),
                    zLocalEff * NOISE_BIOME_SCALE + (oz + 700.3),
                    NOISE_BIOME_OCTAVES,
                    seedU32 + 8888
                );
                const biome = clamp01(0.5 + 0.5 * biomeN);

                const equatorialBias = clamp01(1 - latFactor * 1.5);
                const temperateBias = clamp01(1 - Math.abs(latFactor - 0.4) * 2.5);
                const aridBias = clamp01(1 - Math.abs(latFactor - 0.3) * 8.0) * (1 - equatorialBias) * 0.5;

                const greenMix = mix3(forestDark, forestMid, biome);
                const temperateMix = mix3(grassland, savanna, biome);

                let landCol: Vec3;
                if (equatorialBias > 0.5) {
                    landCol = mix3(forestDark, greenMix, equatorialBias);
                } else if (aridBias > 0.3) {
                    landCol = mix3(desertSand, desertRock, biome);
                } else {
                    landCol = mix3(temperateMix, greenMix, temperateBias);
                }

                const elevFactor = terrainElev;
                if (elevFactor > 0.65) {
                    const rockFade = (elevFactor - 0.65) / 0.30;
                    landCol = mix3(landCol, mix3(mountainRock, mountainSnow, clamp01((elevFactor - 0.80) / 0.15)), rockFade * 0.5);
                } else if (elevFactor < 0.35) {
                    const coastLatBias = clamp01(absLatSphere * 2.5);
                    landCol = mix3(landCol, beachSand, (1 - biome) * coastLatBias * 0.15);
                }

                if (ridgeStrength > 0) {
                    landCol = mix3(landCol, mountainRock, ridgeStrength * 0.12);
                    landCol = mix3(landCol, mountainSnow, Math.pow(ridgeStrength, 2.0) * 0.08);
                }

                const micro = detailN * 0.025;
                landCol = {
                    x: clamp01(landCol.x + micro),
                    y: clamp01(landCol.y + micro),
                    z: clamp01(landCol.z + micro),
                };

                const landBlend = clamp01(landMaskSharp * 1.1);
                col = mix3(col, landCol, landBlend);

                const wetSand = mix3(oceanShallow, beachSand, 0.3);
                const wetT = Math.pow(shoreBand, 0.8) * 0.20;
                col = mix3(col, wetSand, wetT);
            }

            // Polar ice caps
            const iceLat = smoothstep(ICE_LAT_START, ICE_LAT_END, absLatSphere);
            if (iceLat > 0) {
                const iceN = fbm3D(
                    xLocalEff * NOISE_ICE_SCALE + (ox + 200.1),
                    yLocal * NOISE_ICE_SCALE + (oy - 300.2),
                    zLocalEff * NOISE_ICE_SCALE + (oz + 400.3),
                    NOISE_ICE_OCTAVES,
                    seedU32
                );
                const iceGap = smoothstep(0.35, 0.75, clamp01(0.5 + 0.5 * iceN));
                const iceStrength = iceLat * iceGap;
                const poleBrightness = smoothstep(ICE_LAT_START, 1.0, absLatSphere);
                const iceCol = mix3(iceColor, iceBright, poleBrightness);
                col = mix3(col, iceCol, iceStrength * 0.85);

                const snowStrength = smoothstep(ICE_LAT_END, 1.0, absLatSphere) * iceGap;
                col = mix3(col, snowWhite, snowStrength * 0.3);
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

    // === Pass 2: Normal map ===
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = INTERNAL_WIDTH;
    normalCanvas.height = INTERNAL_HEIGHT;

    const nctx = normalCanvas.getContext('2d');
    if (!nctx) throw new Error('Failed to create temperate normal canvas');

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

        if (y % YIELD_EVERY_ROWS === YIELD_EVERY_ROWS - 1) await yieldToEventLoop();
    }

    nctx.putImageData(nimg, 0, 0);

    const maps = canvasesToTextures(canvas, normalCanvas);

    colorCache.set(cacheKey, maps.color);
    normalCache.set(cacheKey, maps.normal);

    return maps;
}

// =============================================================================
// Public API
// =============================================================================

export function getTemperateTexture(seed: string): THREE.Texture {
    return getOrCreateTemperateMapsSync(seed).color;
}

export function getTemperateNormalTexture(seed: string): THREE.Texture {
    return getOrCreateTemperateMapsSync(seed).normal;
}

export function getTemperateTextureAsync(seed: string): Promise<THREE.Texture> {
    return getOrCreateTemperateMapsAsync(seed).then((m) => m.color);
}

export function getTemperateNormalTextureAsync(seed: string): Promise<THREE.Texture> {
    return getOrCreateTemperateMapsAsync(seed).then((m) => m.normal);
}
