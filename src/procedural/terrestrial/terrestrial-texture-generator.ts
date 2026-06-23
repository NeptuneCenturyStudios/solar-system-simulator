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

// === Rugged rocky terrain (multi-octave for rough, cracked look) ===
const NOISE_TERRAIN_SCALE = 16.0;
const NOISE_TERRAIN_OCTAVES = 5;

// === Craters — multi-octave ridged noise for defined rims + interiors ===
const NOISE_CRATER_SCALE = 18.0;
const NOISE_CRATER_OCTAVES = 4;

const CRATER_THRESHOLD = 0.55;
const CRATER_RIM_EDGE0 = 0.55;
const CRATER_RIM_EDGE1 = 0.75;
const CRATER_INNER_EDGE0 = 0.72;
const CRATER_INNER_EDGE1 = 0.9;

const CRATER_RIM_STRENGTH = 0.06;
const CRATER_DEPTH_STRENGTH = 0.05;

// === High-frequency cracks / fractured crust detail ===
const NOISE_CRACK_SCALE = 70.0;
const NOISE_CRACK_OCTAVES = 3;
const CRACK_STRENGTH = 0.1;
const CRACK_THRESHOLD = 0.55;

// === Color variation ===
const NOISE_COLOR_SCALE = 14.0;
const NOISE_COLOR_OCTAVES = 4;

// === Sub-variation within color bands (higher freq for fine grain) ===
const NOISE_SUB_COLOR_SCALE = 32.0;
const NOISE_SUB_COLOR_OCTAVES = 3;

// === Wide-band region noise for continent-scale color zones ===
const NOISE_REGION_SCALE = 6.0;
const NOISE_REGION_OCTAVES = 3;

// === Ice caps ===
const NOISE_ICE_SCALE = 10.0;
const NOISE_ICE_OCTAVES = 2;

const NORMAL_STRENGTH = 0.9;

// Polar flattening — reduce extreme detail at poles
const POLAR_FLAT_START = 0.65;
const POLAR_FLAT_END = 0.98;
const POLAR_DETAIL_MIN = 0.3;

// Ice cap latitude
const ICE_LAT_START = 0.8;
const ICE_LAT_END = 0.94;

// ============================================================
// Color Theme System
// ============================================================

/** A complete color palette for one terrestrial theme. */
interface ColorTheme {
    name: string;
    // Main rock band tones (sorted dark → light)
    baseDark: Vec3;
    baseMid: Vec3;
    baseLight: Vec3;
    // Highlight — for brighter exposed crust (rims, slopes)
    highlight: Vec3;
    // Two accent colors for sub-band variety within the main band
    accent1: Vec3;
    accent2: Vec3;
    // Crater interior shadow
    craterColor: Vec3;
    // Crack fill
    crackColor: Vec3;
}

// Theme definitions — each designed to look distinct at-a-glance

const THEME_RUSTY: ColorTheme = {
    name: 'rusty',
    baseDark: { x: 0.09, y: 0.05, z: 0.03 }, // dark reddish-brown
    baseMid: { x: 0.2, y: 0.1, z: 0.05 }, // rusty red-brown
    baseLight: { x: 0.32, y: 0.17, z: 0.08 }, // light reddish-tan
    highlight: { x: 0.42, y: 0.26, z: 0.14 }, // pinkish-tan crust
    accent1: { x: 0.14, y: 0.06, z: 0.04 }, // deep maroon
    accent2: { x: 0.27, y: 0.15, z: 0.07 }, // orange-tan
    craterColor: { x: 0.04, y: 0.025, z: 0.015 },
    crackColor: { x: 0.06, y: 0.035, z: 0.02 },
};

const THEME_GRAY: ColorTheme = {
    name: 'gray',
    baseDark: { x: 0.08, y: 0.08, z: 0.08 }, // dark charcoal
    baseMid: { x: 0.17, y: 0.17, z: 0.17 }, // medium gray
    baseLight: { x: 0.27, y: 0.27, z: 0.27 }, // light gray
    highlight: { x: 0.38, y: 0.38, z: 0.38 }, // very light gray
    accent1: { x: 0.12, y: 0.13, z: 0.15 }, // bluish-gray
    accent2: { x: 0.22, y: 0.21, z: 0.19 }, // warm gray
    craterColor: { x: 0.035, y: 0.035, z: 0.035 },
    crackColor: { x: 0.055, y: 0.055, z: 0.055 },
};

const THEME_SANDY: ColorTheme = {
    name: 'sandy',
    baseDark: { x: 0.13, y: 0.1, z: 0.06 }, // dark tan
    baseMid: { x: 0.25, y: 0.19, z: 0.11 }, // sandy beige
    baseLight: { x: 0.38, y: 0.29, z: 0.17 }, // light buff
    highlight: { x: 0.48, y: 0.38, z: 0.24 }, // cream
    accent1: { x: 0.19, y: 0.14, z: 0.08 }, // golden tan
    accent2: { x: 0.31, y: 0.24, z: 0.14 }, // pale tan
    craterColor: { x: 0.05, y: 0.04, z: 0.025 },
    crackColor: { x: 0.08, y: 0.06, z: 0.04 },
};

const THEME_BASALT: ColorTheme = {
    name: 'basalt',
    baseDark: { x: 0.045, y: 0.045, z: 0.048 }, // near-black
    baseMid: { x: 0.11, y: 0.11, z: 0.12 }, // dark gray
    baseLight: { x: 0.19, y: 0.19, z: 0.2 }, // medium-dark gray
    highlight: { x: 0.28, y: 0.28, z: 0.3 }, // medium gray
    accent1: { x: 0.07, y: 0.08, z: 0.1 }, // dark bluish-gray
    accent2: { x: 0.15, y: 0.14, z: 0.12 }, // brownish-gray
    craterColor: { x: 0.02, y: 0.02, z: 0.022 },
    crackColor: { x: 0.035, y: 0.035, z: 0.04 },
};

const THEME_RED_CLAY: ColorTheme = {
    name: 'red_clay',
    baseDark: { x: 0.11, y: 0.05, z: 0.05 }, // dark terracotta
    baseMid: { x: 0.22, y: 0.09, z: 0.07 }, // brick red
    baseLight: { x: 0.34, y: 0.16, z: 0.11 }, // light brick
    highlight: { x: 0.44, y: 0.24, z: 0.17 }, // pinkish-beige
    accent1: { x: 0.15, y: 0.05, z: 0.04 }, // deep maroon
    accent2: { x: 0.28, y: 0.13, z: 0.09 }, // orange-terracotta
    craterColor: { x: 0.04, y: 0.02, z: 0.02 },
    crackColor: { x: 0.06, y: 0.03, z: 0.03 },
};

const THEME_OLIVE_TAN: ColorTheme = {
    name: 'olive_tan',
    baseDark: { x: 0.09, y: 0.08, z: 0.04 }, // dark olive
    baseMid: { x: 0.19, y: 0.16, z: 0.08 }, // olive tan
    baseLight: { x: 0.3, y: 0.25, z: 0.14 }, // light olive
    highlight: { x: 0.4, y: 0.34, z: 0.21 }, // pale tan
    accent1: { x: 0.13, y: 0.11, z: 0.05 }, // greenish-brown
    accent2: { x: 0.24, y: 0.2, z: 0.11 }, // golden-olive
    craterColor: { x: 0.035, y: 0.03, z: 0.018 },
    crackColor: { x: 0.055, y: 0.05, z: 0.03 },
};

const ALL_THEMES: ColorTheme[] = [
    THEME_RUSTY,
    THEME_GRAY,
    THEME_SANDY,
    THEME_BASALT,
    THEME_RED_CLAY,
    THEME_OLIVE_TAN,
];

/**
 * Deterministically pick a color theme from the seed.
 * The same seed always gets the same theme; different seeds
 * spread across the available themes.
 */
function pickTheme(seedU32: number): ColorTheme {
    const idx = seedU32 % ALL_THEMES.length;
    return ALL_THEMES[idx]!;
}

/**
 * Map a noise-driven color index [0..1] to a color within the
 * given theme, with sub-band variation for richer detail.
 *
 * The `cb` value determines which elevation/region band we're in,
 * and `sub` adds micro-variation within that band to avoid
 * artificial-looking flat stretches of a single color.
 */
function themeColor(cb: number, sub: number, theme: ColorTheme): Vec3 {
    // Clamp and shape the color index
    const t = clamp01(cb);

    // Build color by mixing between the theme's swatches, using `t` as the band selector.
    // Each band maps a range of `t` to a blend of two adjacent swatches.
    let col: Vec3;

    // Sub-variation offsets each band slightly so it's not a flat plateau
    const sv = sub * 0.06 - 0.03; // [-0.03, 0.03]

    if (t < 0.15) {
        // Deep shadow — crater-like darkness, between dark and near-black
        const u = (t + sv) / 0.15;
        col = mix3(theme.craterColor, theme.baseDark, clamp01(u));
    } else if (t < 0.3) {
        // Dark rock band
        const u = (t - 0.15 + sv) / 0.15;
        col = mix3(theme.baseDark, theme.accent1, clamp01(u));
    } else if (t < 0.48) {
        // Lower mid — accent1→baseMid
        const u = (t - 0.3 + sv) / 0.18;
        col = mix3(theme.accent1, theme.baseMid, clamp01(u));
    } else if (t < 0.65) {
        // Upper mid — baseMid→accent2
        const u = (t - 0.48 + sv) / 0.17;
        col = mix3(theme.baseMid, theme.accent2, clamp01(u));
    } else if (t < 0.8) {
        // Light rock — accent2→baseLight
        const u = (t - 0.65 + sv) / 0.15;
        col = mix3(theme.accent2, theme.baseLight, clamp01(u));
    } else if (t < 0.92) {
        // Highlight band — baseLight→highlight
        const u = (t - 0.8 + sv) / 0.12;
        col = mix3(theme.baseLight, theme.highlight, clamp01(u));
    } else {
        // Brightest crust
        const u = (t - 0.92 + sv) / 0.08;
        col = mix3(theme.highlight, { x: 0.55, y: 0.5, z: 0.45 }, clamp01(u));
    }

    return col;
}

// Ice
const ice: Vec3 = { x: 0.65, y: 0.72, z: 0.85 };
const iceHi: Vec3 = { x: 0.82, y: 0.85, z: 0.92 };

// ============================================================
// Rendering
// ============================================================

type TerrestrialMaps = { color: THREE.Texture; normal: THREE.Texture };
const colorCache = new Map<string, THREE.Texture>();
const normalCache = new Map<string, THREE.Texture>();

function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function toTex(canvas: HTMLCanvasElement, normal: HTMLCanvasElement): TerrestrialMaps {
    const c = new THREE.CanvasTexture(canvas);
    c.colorSpace = THREE.SRGBColorSpace;
    c.wrapS = THREE.RepeatWrapping;
    c.wrapT = THREE.ClampToEdgeWrapping;
    c.generateMipmaps = false;
    c.minFilter = THREE.LinearFilter;
    c.magFilter = THREE.LinearFilter;
    c.anisotropy = 16;
    c.needsUpdate = true;

    const n = new THREE.CanvasTexture(normal);
    n.wrapS = THREE.RepeatWrapping;
    n.wrapT = THREE.ClampToEdgeWrapping;
    n.generateMipmaps = false;
    n.minFilter = THREE.LinearFilter;
    n.magFilter = THREE.LinearFilter;
    n.anisotropy = 16;
    n.needsUpdate = true;

    return { color: c, normal: n };
}

function renderColorAndHeight(
    seedU32: number,
    ox: number,
    oy: number,
    oz: number,
    up: Vec3,
    east: Vec3,
    north: Vec3,
    lonCos: Float32Array,
    lonSin: Float32Array,
    latSin: Float32Array,
    latCos: Float32Array
): { data: Uint8ClampedArray; height: Float32Array } {
    const data = new Uint8ClampedArray(INTERNAL_WIDTH * INTERNAL_HEIGHT * 4);
    const height = new Float32Array(INTERNAL_WIDTH * INTERNAL_HEIGHT);

    // Pick a color theme once for this body
    const theme = pickTheme(seedU32);

    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const sLat = latSin[y]!;
        const cLat = latCos[y]!;
        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
        const flatMask =
            POLAR_DETAIL_MIN +
            (1 - POLAR_DETAIL_MIN) * (1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01));

        for (let x = 0; x < INTERNAL_WIDTH; x++) {
            const cLon = lonCos[x]!;
            const sLon = lonSin[x]!;
            const dx = cLat * cLon;
            const dy = sLat;
            const dz = cLat * sLon;

            const yLocal = dot({ x: dx, y: dy, z: dz }, up);
            const xLocal = dot({ x: dx, y: dy, z: dz }, east);
            const zLocal = dot({ x: dx, y: dy, z: dz }, north);
            const pf = Math.pow(Math.max(0, 1 - Math.abs(yLocal)), 0.65);
            const xLe = xLocal * pf;
            const zLe = zLocal * pf;

            // === Rugged terrain height ===
            const terrainN = fbm3D(
                xLe * NOISE_TERRAIN_SCALE + ox,
                yLocal * NOISE_TERRAIN_SCALE + oy,
                zLe * NOISE_TERRAIN_SCALE + oz,
                NOISE_TERRAIN_OCTAVES,
                seedU32
            );

            // === Craters — ridged noise for rim + interior ===
            const cN = fbm3D(
                xLocal * NOISE_CRATER_SCALE + (ox + 77.7),
                yLocal * NOISE_CRATER_SCALE + (oy - 88.8),
                zLocal * NOISE_CRATER_SCALE + (oz + 99.9),
                NOISE_CRATER_OCTAVES,
                seedU32
            );
            const cRidged = 1 - Math.abs(cN); // [0..1], high at crater edges

            // Gate — only form craters where ridged noise is strong enough
            const cGate = smoothstep(CRATER_THRESHOLD, CRATER_THRESHOLD + 0.15, cRidged);
            const cInterior = smoothstep(CRATER_INNER_EDGE0, CRATER_INNER_EDGE1, cRidged);
            const cRim =
                smoothstep(CRATER_RIM_EDGE0, CRATER_RIM_EDGE1, cRidged) -
                smoothstep(CRATER_INNER_EDGE0, CRATER_INNER_EDGE1, cRidged);

            const craterH =
                (cRim * CRATER_RIM_STRENGTH - cInterior * CRATER_DEPTH_STRENGTH) * cGate * flatMask;

            // === High-frequency cracks ===
            const crackN = fbm3D(
                xLocal * NOISE_CRACK_SCALE + (ox + 1234.56),
                yLocal * NOISE_CRACK_SCALE + (oy - 234.12),
                zLocal * NOISE_CRACK_SCALE + (oz + 98.76),
                NOISE_CRACK_OCTAVES,
                seedU32
            );
            const crackRidged = Math.abs(crackN);
            const crackMask =
                flatMask * smoothstep(CRACK_THRESHOLD, CRACK_THRESHOLD + 0.2, crackRidged);

            // Composite height
            height[y * INTERNAL_WIDTH + x] =
                terrainN * 0.1 + craterH + crackRidged * CRACK_STRENGTH * crackMask;

            // === Color ===

            // Wide-band region noise — creates continent-scale color zones
            // so one side of the body can look different from the other
            const regionN = fbm3D(
                xLe * NOISE_REGION_SCALE + (ox + 200.0),
                yLocal * NOISE_REGION_SCALE + (oy - 100.0),
                zLe * NOISE_REGION_SCALE + (oz + 300.0),
                NOISE_REGION_OCTAVES,
                seedU32 + 999
            );
            const regionBias = clamp01(regionN * 0.5 + 0.5) * 0.25 - 0.125; // [-0.125..0.125]

            // Main color noise — selects the band within the theme
            const colorN = fbm3D(
                xLe * NOISE_COLOR_SCALE + (ox + 50.5),
                yLocal * NOISE_COLOR_SCALE + (oy - 60.6),
                zLe * NOISE_COLOR_SCALE + (oz + 70.7),
                NOISE_COLOR_OCTAVES,
                seedU32
            );
            const cb = clamp01((colorN * 0.5 + 0.5) * 1.4 - 0.2 + regionBias);

            // Sub-variation noise — micro hue shifts within each band
            const subN = fbm3D(
                xLe * NOISE_SUB_COLOR_SCALE + (ox + 777.0),
                yLocal * NOISE_SUB_COLOR_SCALE + (oy - 888.0),
                zLe * NOISE_SUB_COLOR_SCALE + (oz + 999.0),
                NOISE_SUB_COLOR_OCTAVES,
                seedU32 + 7777
            );

            // Get color from theme
            let col = themeColor(cb, subN, theme);

            // === Terrain brightness variation (height-driven shading) ===
            const brightOffset = terrainN * 0.04;
            col = {
                x: clamp01(col.x + brightOffset),
                y: clamp01(col.y + brightOffset),
                z: clamp01(col.z + brightOffset),
            };

            // === Crater coloring: dark interior, bright rim ===
            if (cGate > 0) {
                col = mix3(col, theme.craterColor, cInterior * cGate * 0.35);
                col = mix3(col, theme.highlight, cRim * cGate * 0.1);
            }

            // === Crack coloring ===
            if (crackMask > 0) {
                col = mix3(col, theme.crackColor, crackMask * 0.3);
            }

            // === Polar ice caps ===
            const absLat = Math.abs(yLocal);
            const latIce = smoothstep(ICE_LAT_START, ICE_LAT_END, absLat);
            if (latIce > 0) {
                const iN = fbm3D(
                    xLe * NOISE_ICE_SCALE + (ox + 11.1),
                    yLocal * NOISE_ICE_SCALE + (oy - 22.2),
                    zLe * NOISE_ICE_SCALE + (oz + 33.3),
                    NOISE_ICE_OCTAVES,
                    seedU32
                );
                const iGap = smoothstep(0.3, 0.7, clamp01(iN * 0.5 + 0.5));
                const iStr = latIce * iGap;
                const iBrt = 0.4 + 0.6 * smoothstep(ICE_LAT_START, ICE_LAT_END, absLat);
                col = mix3(col, mix3(ice, iceHi, iBrt), iStr * 0.85);
            }

            const pi = (y * INTERNAL_WIDTH + x) * 4;
            data[pi] = Math.round(clamp01(col.x) * 255);
            data[pi + 1] = Math.round(clamp01(col.y) * 255);
            data[pi + 2] = Math.round(clamp01(col.z) * 255);
            data[pi + 3] = 255;
        }
    }
    return { data, height };
}

function renderNormal(height: Float32Array): Uint8ClampedArray {
    const ndata = new Uint8ClampedArray(INTERNAL_WIDTH * INTERNAL_HEIGHT * 4);
    for (let y = 0; y < INTERNAL_HEIGHT; y++) {
        const yU = y > 0 ? y - 1 : 0;
        const yD = y + 1 < INTERNAL_HEIGHT ? y + 1 : INTERNAL_HEIGHT - 1;
        const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
        const pole01 = Math.abs(v01Pole - 0.5) / 0.5;
        const nfm =
            POLAR_DETAIL_MIN +
            (1 - POLAR_DETAIL_MIN) * (1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01));

        for (let x = 0; x < INTERNAL_WIDTH; x++) {
            const xL = x > 0 ? x - 1 : INTERNAL_WIDTH - 1;
            const xR = x + 1 < INTERNAL_WIDTH ? x + 1 : 0;
            const nx =
                -(height[y * INTERNAL_WIDTH + xR]! - height[y * INTERNAL_WIDTH + xL]!) *
                NORMAL_STRENGTH *
                nfm;
            const ny =
                -(height[yD * INTERNAL_WIDTH + x]! - height[yU * INTERNAL_WIDTH + x]!) *
                NORMAL_STRENGTH *
                nfm;
            const n = normalizeSafe({ x: nx, y: ny, z: 1.0 });

            const ni = (y * INTERNAL_WIDTH + x) * 4;
            ndata[ni] = Math.round((n.x * 0.5 + 0.5) * 255);
            ndata[ni + 1] = Math.round((1 - (n.y * 0.5 + 0.5)) * 255);
            ndata[ni + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
            ndata[ni + 3] = 255;
        }
    }
    return ndata;
}

async function getOrCreateTerrestrialMapsAsync(seed: string): Promise<TerrestrialMaps> {
    const key = seed.trim();
    if (colorCache.get(key) && normalCache.get(key))
        return { color: colorCache.get(key)!, normal: normalCache.get(key)! };

    const s32 = hashStringToU32(key);
    const rng = new SeededRandom(`${key}|climate`);
    const yaw = rng.range(0, Math.PI * 2);
    const up: Vec3 = { x: 0, y: 1, z: 0 };
    const north: Vec3 = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
    const east: Vec3 = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };
    const ox = rng.range(-200, 200),
        oy = rng.range(-200, 200),
        oz = rng.range(-200, 200);

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
        const sl = 1 - 2 * (y / Math.max(1, INTERNAL_HEIGHT - 1));
        latSin[y] = sl;
        latCos[y] = Math.sqrt(Math.max(0, 1 - sl * sl));
    }

    const { data, height } = renderColorAndHeight(
        s32,
        ox,
        oy,
        oz,
        up,
        east,
        north,
        lonCos,
        lonSin,
        latSin,
        latCos
    );

    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_WIDTH;
    canvas.height = INTERNAL_HEIGHT;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    img.data.set(data);
    ctx.putImageData(img, 0, 0);
    await yieldToEventLoop();

    const ndata = renderNormal(height);
    const nCanvas = document.createElement('canvas');
    nCanvas.width = INTERNAL_WIDTH;
    nCanvas.height = INTERNAL_HEIGHT;
    const nctx = nCanvas.getContext('2d')!;
    const nimg = nctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    nimg.data.set(ndata);
    nctx.putImageData(nimg, 0, 0);

    const maps = toTex(canvas, nCanvas);
    colorCache.set(key, maps.color);
    normalCache.set(key, maps.normal);
    return maps;
}

function getOrCreateTerrestrialMapsSync(seed: string): TerrestrialMaps {
    const key = seed.trim();
    if (colorCache.get(key) && normalCache.get(key))
        return { color: colorCache.get(key)!, normal: normalCache.get(key)! };

    const s32 = hashStringToU32(key);
    const rng = new SeededRandom(`${key}|climate`);
    const yaw = rng.range(0, Math.PI * 2);
    const up: Vec3 = { x: 0, y: 1, z: 0 };
    const north: Vec3 = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
    const east: Vec3 = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };
    const ox = rng.range(-200, 200),
        oy = rng.range(-200, 200),
        oz = rng.range(-200, 200);

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
        const sl = 1 - 2 * (y / Math.max(1, INTERNAL_HEIGHT - 1));
        latSin[y] = sl;
        latCos[y] = Math.sqrt(Math.max(0, 1 - sl * sl));
    }

    const { data, height } = renderColorAndHeight(
        s32,
        ox,
        oy,
        oz,
        up,
        east,
        north,
        lonCos,
        lonSin,
        latSin,
        latCos
    );

    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_WIDTH;
    canvas.height = INTERNAL_HEIGHT;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    img.data.set(data);
    ctx.putImageData(img, 0, 0);

    const ndata = renderNormal(height);
    const nCanvas = document.createElement('canvas');
    nCanvas.width = INTERNAL_WIDTH;
    nCanvas.height = INTERNAL_HEIGHT;
    const nctx = nCanvas.getContext('2d')!;
    const nimg = nctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
    nimg.data.set(ndata);
    nctx.putImageData(nimg, 0, 0);

    const maps = toTex(canvas, nCanvas);
    colorCache.set(key, maps.color);
    normalCache.set(key, maps.normal);
    return maps;
}

export function getTerrestrialTexture(seed: string): THREE.Texture {
    return getOrCreateTerrestrialMapsSync(seed).color;
}
export function getTerrestrialNormalTexture(seed: string): THREE.Texture {
    return getOrCreateTerrestrialMapsSync(seed).normal;
}
export function getTerrestrialTextureAsync(seed: string): Promise<THREE.Texture> {
    return getOrCreateTerrestrialMapsAsync(seed).then((m) => m.color);
}
export function getTerrestrialNormalTextureAsync(seed: string): Promise<THREE.Texture> {
    return getOrCreateTerrestrialMapsAsync(seed).then((m) => m.normal);
}
