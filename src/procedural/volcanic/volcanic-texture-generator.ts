import * as THREE from 'three';
import { SeededRandom } from '../../utilities/prng';
import {
    clamp01,
    dot,
    fbm3D,
    hashStringToU32,
    mix3,
    normalizeSafe,
    smoothstep,
    Vec3,
} from '../noise-utils';

const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1024;

const INTERNAL_WIDTH = TEXTURE_WIDTH;
const INTERNAL_HEIGHT = TEXTURE_HEIGHT;

// Large-scale "continent" layer — determines broad lava lake regions
const NOISE_LAKE_SCALE = 4.5;
const NOISE_LAKE_OCTAVES = 4;

// River/tendril layer — same FBM family, slightly higher frequency.
// Gated very tightly so only sparse isolated fingers appear.
// Because it shares the same statistical shape as the lake noise, fingers
// naturally originate near lake zones and taper off into rock.
const NOISE_RIVER_SCALE = 7.5;
const NOISE_RIVER_OCTAVES = 4;

// Basalt / rock surface micro-detail
const NOISE_ROCK_SCALE = 14.0;
const NOISE_ROCK_OCTAVES = 5;

// Large-scale rock variation — dark cold spots and warm basalt patches
const NOISE_ROCKVAR_SCALE = 3.2;
const NOISE_ROCKVAR_OCTAVES = 3;

// Normal-map bumpiness
const NORMAL_STRENGTH = 1.0;

// Polar flattening to avoid texture pinching at poles
const POLAR_FLAT_START = 0.72;
const POLAR_FLAT_END = 0.99;
const POLAR_DETAIL_MIN = 0.4;

// ---------------------------------------------------------------------------
// Color palettes (linear [0..1]) — red/maroon spectrum like target image
// ---------------------------------------------------------------------------

// Rock / basalt — very dark with a faint maroon warmth
const rockBase: Vec3 = { x: 0.06, y: 0.01, z: 0.008 }; // near-black dark maroon
const rockMid: Vec3 = { x: 0.16, y: 0.032, z: 0.02 }; // slightly warmer dark red facets
// Cooled / active lava
const lavaCooled: Vec3 = { x: 0.32, y: 0.04, z: 0.01 }; // dark red cooled crust
const lavaRed: Vec3 = { x: 0.8, y: 0.13, z: 0.015 }; // bright glowing red
const lavaOrange: Vec3 = { x: 0.98, y: 0.45, z: 0.04 }; // orange-hot core

// ---------------------------------------------------------------------------
// Emissive palettes (sRGB, encodes lava glow color directly)
// ---------------------------------------------------------------------------
const emitBlack: Vec3 = { x: 0.0, y: 0.0, z: 0.0 };
const emitCooling: Vec3 = { x: 0.38, y: 0.03, z: 0.004 }; // deep red dim glow at edges
const emitRed: Vec3 = { x: 0.85, y: 0.1, z: 0.01 }; // bright red
const emitOrange: Vec3 = { x: 1.0, y: 0.5, z: 0.06 }; // orange at the hottest cores

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------
type VolcanicMaps = {
    color: THREE.Texture;
    normal: THREE.Texture;
    emissive: THREE.Texture;
};

const colorCache = new Map<string, THREE.Texture>();
const normalCache = new Map<string, THREE.Texture>();
const emissiveCache = new Map<string, THREE.Texture>();

function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function canvasesToTextures(
    canvas: HTMLCanvasElement,
    normalCanvas: HTMLCanvasElement,
    emissiveCanvas: HTMLCanvasElement
): VolcanicMaps {
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

    // Emissive map encodes lava color + brightness directly, so use sRGB.
    const emissiveTex = new THREE.CanvasTexture(emissiveCanvas);
    emissiveTex.colorSpace = THREE.SRGBColorSpace;
    emissiveTex.wrapS = THREE.RepeatWrapping;
    emissiveTex.wrapT = THREE.ClampToEdgeWrapping;
    emissiveTex.generateMipmaps = false;
    emissiveTex.minFilter = THREE.LinearFilter;
    emissiveTex.magFilter = THREE.LinearFilter;
    emissiveTex.anisotropy = 16;
    emissiveTex.needsUpdate = true;

    return { color: colorTex, normal: normalTex, emissive: emissiveTex };
}

// ---------------------------------------------------------------------------
// Core async renderer
// ---------------------------------------------------------------------------

async function getOrCreateVolcanicMapsAsync(seed: string): Promise<VolcanicMaps> {
    const cacheKey = seed.trim();

    const cachedColor = colorCache.get(cacheKey);
    const cachedNormal = normalCache.get(cacheKey);
    const cachedEmissive = emissiveCache.get(cacheKey);
    if (cachedColor && cachedNormal && cachedEmissive) {
        return { color: cachedColor, normal: cachedNormal, emissive: cachedEmissive };
    }

    const seedU32 = hashStringToU32(cacheKey);

    // --- Lava coverage: deterministic per seed --------------------------------
    // lavaCoverage ∈ [0.12 .. 0.35]
    // Drives how large the lava lake "continents" are, not how many cracks.
    const coverageRng = new SeededRandom(`${cacheKey}|coverage`);
    const lavaCoverage = coverageRng.range(0.12, 0.35);

    // Lake threshold: smoothstep gate on the low-freq continent FBM (remapped [0..1]).
    // Higher = smaller / rarer lakes. Tuned so coverage=0.12 gives small scattered
    // lakes, coverage=0.35 gives large connected lava seas.
    const lakeThresh = 0.66 - lavaCoverage * 0.3; // [0.555 .. 0.624]
    const lakeTransition = 0.14; // smooth lake edge

    // River gate: only very tightly gated peaks of the river FBM become
    // lava tendrils.  High threshold → rare, isolated, naturally-shaped fingers.
    const riverThresh = 0.76 - lavaCoverage * 0.18; // [0.726 .. 0.744]
    const riverTransition = 0.08;

    // --- 3-D noise offsets (break repeating patterns) -------------------------
    const axisRng = new SeededRandom(`${cacheKey}|axis`);
    const ox = axisRng.range(-200, 200);
    const oy = axisRng.range(-200, 200);
    const oz = axisRng.range(-200, 200);

    // --- Precompute spherical-mapping tables ----------------------------------
    const lonCos = new Float32Array(INTERNAL_WIDTH);
    const lonSin = new Float32Array(INTERNAL_WIDTH);
    for (let x = 0; x < INTERNAL_WIDTH; x++) {
        const lon = (x / Math.max(1, INTERNAL_WIDTH - 1)) * Math.PI * 2;
        lonCos[x] = Math.cos(lon);
        lonSin[x] = Math.sin(lon);
    }

    const latSin = new Float32Array(INTERNAL_HEIGHT);
    const latCos = new Float32Array(INTERNAL_HEIGHT);
    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const sinLat = 1 - 2 * (y / Math.max(1, INTERNAL_HEIGHT - 1));
        latSin[y] = sinLat;
        latCos[y] = Math.sqrt(Math.max(0, 1 - sinLat * sinLat));
    }

    // --- Canvases ------------------------------------------------------------
    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_WIDTH;
    canvas.height = INTERNAL_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[volcanic] Failed to create color canvas context');

    const emissiveCanvas = document.createElement('canvas');
    emissiveCanvas.width = INTERNAL_WIDTH;
    emissiveCanvas.height = INTERNAL_HEIGHT;
    const ectx = emissiveCanvas.getContext('2d');
    if (!ectx) throw new Error('[volcanic] Failed to create emissive canvas context');

    const img = ctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const eimg = ectx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const data = img.data;
    const edata = eimg.data;

    // Height buffer used later for the normal pass
    const height = new Float32Array(INTERNAL_WIDTH * INTERNAL_HEIGHT);

    // Unused but kept for a consistent Vec3 usage in mix3 calls
    const _up: Vec3 = { x: 0, y: 1, z: 0 };
    void dot(_up, _up); // prevent dead-code elimination warning

    const YIELD_EVERY_ROWS = 6;

    // =========================================================================
    // Pass 1 — Color + Emissive + Height
    // =========================================================================
    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const sLat = latSin[y]!;
        const cLat = latCos[y]!;

        // Polar-flattening mask: detail fades near poles to avoid pinching
        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
        const flatMask =
            POLAR_DETAIL_MIN +
            (1 - POLAR_DETAIL_MIN) * (1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01));

        for (let x = 0; x < INTERNAL_WIDTH; x++) {
            const cLon = lonCos[x]!;
            const sLon = lonSin[x]!;

            // Unit sphere point (3-D coordinates for noise sampling)
            const dx = cLat * cLon;
            const dy = sLat;
            const dz = cLat * sLon;

            // --- Large-scale lava lake "continents" --------------------------
            const lakeN = fbm3D(
                dx * NOISE_LAKE_SCALE + ox,
                dy * NOISE_LAKE_SCALE + oy,
                dz * NOISE_LAKE_SCALE + oz,
                NOISE_LAKE_OCTAVES,
                seedU32
            );
            const lakeNorm = lakeN * 0.5 + 0.5;
            const lakeMask =
                flatMask * smoothstep(lakeThresh, lakeThresh + lakeTransition, lakeNorm);

            // --- River / tendril layer ----------------------------------------
            // Same FBM family, different frequency + offset, very tight gate.
            // Fingers emerge from the same noise topology as lakes, so they
            // appear to flow from lake edges rather than being independent overlays.
            const riverN = fbm3D(
                dx * NOISE_RIVER_SCALE + (ox + 317.4),
                dy * NOISE_RIVER_SCALE + (oy - 189.6),
                dz * NOISE_RIVER_SCALE + (oz + 423.1),
                NOISE_RIVER_OCTAVES,
                seedU32
            );
            const riverNorm = riverN * 0.5 + 0.5;
            // Only fire where this secondary field peaks AND the lake field has
            // some warmth (lakeNorm > 0.35), so rivers cluster near lake zones.
            const lakeProximity = smoothstep(0.3, 0.55, lakeNorm);
            const riverMask =
                flatMask *
                smoothstep(riverThresh, riverThresh + riverTransition, riverNorm) *
                (0.35 + 0.65 * lakeProximity); // fade out rivers far from lakes

            // Combined lava intensity.
            // Lakes dominate; rivers are a gentle accent that can extend from them.
            const lavaT = clamp01(lakeMask + riverMask * 0.45);

            // --- Large-scale rock variation (dark cold spots) -----------------
            // Slow-moving low-freq noise breaks up the uniform dark rock into
            // distinct darker/cooler patches and warmer basalt regions.
            const rockVarN = fbm3D(
                dx * NOISE_ROCKVAR_SCALE + (ox + 77.3),
                dy * NOISE_ROCKVAR_SCALE + (oy - 44.1),
                dz * NOISE_ROCKVAR_SCALE + (oz + 155.9),
                NOISE_ROCKVAR_OCTAVES,
                seedU32
            );
            const rockVar = rockVarN * 0.5 + 0.5; // [0..1] — 0=cold dark, 1=warm basalt

            // --- Basalt / rock surface micro-detail --------------------------
            const rockN = fbm3D(
                dx * NOISE_ROCK_SCALE + (ox - 111.1),
                dy * NOISE_ROCK_SCALE + (oy + 456.2),
                dz * NOISE_ROCK_SCALE + (oz - 78.9),
                NOISE_ROCK_OCTAVES,
                seedU32
            );
            const rockDetail = rockN * 0.5 + 0.5; // [0..1]

            // Height: rock plateaus are high, lava channels/lakes are low
            height[y * INTERNAL_WIDTH + x] = rockDetail * 0.3 - lakeMask * 0.4 - riverMask * 0.3;

            // --- Color map ---------------------------------------------------
            // Rock: blend between near-black cold patches and dark-maroon basalt
            const rockCold = rockBase; // very dark cold spot
            const rockWarm = mix3(rockBase, rockMid, 0.7); // slightly warmer basalt
            const rockCol = mix3(
                mix3(rockCold, rockWarm, rockVar), // large-scale variation
                rockMid,
                rockDetail * 0.35 // micro surface bumps
            );

            // Lava: dark cooled crust → glowing red → orange at the very hottest
            const col = mix3(
                mix3(rockCol, lavaCooled, smoothstep(0.0, 0.2, lavaT)),
                mix3(lavaRed, lavaOrange, smoothstep(0.55, 1.0, lavaT)),
                smoothstep(0.05, 0.65, lavaT)
            );

            const pIdx = (y * INTERNAL_WIDTH + x) * 4;
            data[pIdx] = Math.round(clamp01(col.x) * 255);
            data[pIdx + 1] = Math.round(clamp01(col.y) * 255);
            data[pIdx + 2] = Math.round(clamp01(col.z) * 255);
            data[pIdx + 3] = 255;

            // --- Emissive map: encode lava glow color directly ---------------
            // Rock → dim cooling red → bright red → orange at the hottest cores
            let ec = mix3(emitBlack, emitCooling, smoothstep(0.0, 0.22, lavaT));
            ec = mix3(ec, emitRed, smoothstep(0.18, 0.65, lavaT));
            ec = mix3(ec, emitOrange, smoothstep(0.6, 1.0, lavaT));

            edata[pIdx] = Math.round(clamp01(ec.x) * 255);
            edata[pIdx + 1] = Math.round(clamp01(ec.y) * 255);
            edata[pIdx + 2] = Math.round(clamp01(ec.z) * 255);
            edata[pIdx + 3] = 255;
        }

        if (y % YIELD_EVERY_ROWS === YIELD_EVERY_ROWS - 1) await yieldToEventLoop();
    }

    ctx.putImageData(img, 0, 0);
    ectx.putImageData(eimg, 0, 0);

    // =========================================================================
    // Pass 2 — Normal map (derived from height field)
    // =========================================================================
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = INTERNAL_WIDTH;
    normalCanvas.height = INTERNAL_HEIGHT;
    const nctx = normalCanvas.getContext('2d');
    if (!nctx) throw new Error('[volcanic] Failed to create normal canvas context');

    const nimg = nctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    const ndata = nimg.data;

    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const yU = y > 0 ? y - 1 : 0;
        const yD = y + 1 < INTERNAL_HEIGHT ? y + 1 : INTERNAL_HEIGHT - 1;

        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
        const normalFlatMask =
            POLAR_DETAIL_MIN +
            (1 - POLAR_DETAIL_MIN) * (1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01));

        for (let x = 0; x < INTERNAL_WIDTH; x++) {
            const xL = x > 0 ? x - 1 : INTERNAL_WIDTH - 1;
            const xR = x + 1 < INTERNAL_WIDTH ? x + 1 : 0;

            const hL = height[y * INTERNAL_WIDTH + xL]!;
            const hR = height[y * INTERNAL_WIDTH + xR]!;
            const hU = height[yU * INTERNAL_WIDTH + x]!;
            const hD = height[yD * INTERNAL_WIDTH + x]!;

            const nx = -(hR - hL) * NORMAL_STRENGTH * normalFlatMask;
            const ny = -(hD - hU) * NORMAL_STRENGTH * normalFlatMask;
            const nz = 1.0;

            const n = normalizeSafe({ x: nx, y: ny, z: nz });

            const ni = (y * INTERNAL_WIDTH + x) * 4;
            ndata[ni] = Math.round((n.x * 0.5 + 0.5) * 255);
            ndata[ni + 1] = Math.round((1 - (n.y * 0.5 + 0.5)) * 255);
            ndata[ni + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
            ndata[ni + 3] = 255;
        }

        if (y % YIELD_EVERY_ROWS === YIELD_EVERY_ROWS - 1) await yieldToEventLoop();
    }

    nctx.putImageData(nimg, 0, 0);

    // --- Build + cache textures ----------------------------------------------
    const maps = canvasesToTextures(canvas, normalCanvas, emissiveCanvas);

    colorCache.set(cacheKey, maps.color);
    normalCache.set(cacheKey, maps.normal);
    emissiveCache.set(cacheKey, maps.emissive);

    return maps;
}

// ---------------------------------------------------------------------------
// Public API (async only — volcanic textures are only used by the upgrader)
// ---------------------------------------------------------------------------

export function getVolcanicTextureAsync(seed: string): Promise<THREE.Texture> {
    return getOrCreateVolcanicMapsAsync(seed).then((m) => m.color);
}

export function getVolcanicNormalTextureAsync(seed: string): Promise<THREE.Texture> {
    return getOrCreateVolcanicMapsAsync(seed).then((m) => m.normal);
}

export function getVolcanicEmissiveTextureAsync(seed: string): Promise<THREE.Texture> {
    return getOrCreateVolcanicMapsAsync(seed).then((m) => m.emissive);
}
