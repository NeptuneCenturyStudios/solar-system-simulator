import { SeededRandom } from '../../utilities/prng';
import { clamp01, fbm3D, hashStringToU32, lerp, mix3, Vec3 } from '../noise-utils';

// ─────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────

export type GasGiantPalette = 'jupiter' | 'saturn' | 'ice' | 'alien' | 'custom';

export interface GasGiantTextureParams {
    seed: string;
    /** Number of horizontal band cycles across the disc. Range 1–20. */
    bandScale: number;
    /** FBM warp strength — how wavy/distorted the bands appear. Range 0–1. */
    turbulence: number;
    /** High-frequency noise overlaid within each band. Range 0–1. */
    detailStrength: number;
    /** Number of oval storm features. Range 0–5. */
    stormCount: number;
    /** Relative radius of each storm. Range 0.02–0.25. */
    stormSize: number;
    /** Contrast between adjacent bands. Range 0.5–3.0. */
    contrast: number;
    palette: GasGiantPalette;
    /** Hex colour for band hue when palette is 'custom'. E.g. '#c2884a'. */
    customBandColor: string;
    /** Hex colour for storm highlights when palette is 'custom'. E.g. '#ffffff'. */
    customStormColor: string;
}

export const DEFAULT_GAS_GIANT_PARAMS: GasGiantTextureParams = {
    seed: 'gas-giant',
    bandScale: 8,
    turbulence: 0.4,
    detailStrength: 0.3,
    stormCount: 2,
    stormSize: 0.1,
    contrast: 1.5,
    palette: 'jupiter',
    customBandColor: '#c2884a',
    customStormColor: '#ffffff',
};

// ─────────────────────────────────────────────────────────────
// Colour Palettes
// ─────────────────────────────────────────────────────────────

type PaletteStop = Vec3;

const PALETTES: Record<Exclude<GasGiantPalette, 'custom'>, PaletteStop[]> = {
    jupiter: [
        { x: 0.75, y: 0.55, z: 0.30 }, // warm amber
        { x: 0.52, y: 0.30, z: 0.14 }, // dark brown
        { x: 0.88, y: 0.78, z: 0.62 }, // cream tan
        { x: 0.62, y: 0.38, z: 0.20 }, // reddish brown
        { x: 0.80, y: 0.65, z: 0.44 }, // warm tan
        { x: 0.42, y: 0.26, z: 0.12 }, // deep brown
    ],
    saturn: [
        { x: 0.92, y: 0.86, z: 0.70 }, // cream
        { x: 0.78, y: 0.66, z: 0.42 }, // gold
        { x: 0.85, y: 0.78, z: 0.58 }, // pale gold
        { x: 0.70, y: 0.58, z: 0.36 }, // dark gold
        { x: 0.95, y: 0.90, z: 0.78 }, // bright cream
        { x: 0.60, y: 0.48, z: 0.28 }, // bronze
    ],
    ice: [
        { x: 0.25, y: 0.45, z: 0.82 }, // mid blue
        { x: 0.10, y: 0.22, z: 0.65 }, // deep blue
        { x: 0.35, y: 0.72, z: 0.88 }, // light teal
        { x: 0.12, y: 0.38, z: 0.72 }, // slate blue
        { x: 0.52, y: 0.82, z: 0.92 }, // cyan
        { x: 0.18, y: 0.30, z: 0.78 }, // cobalt
    ],
    alien: [
        { x: 0.58, y: 0.15, z: 0.85 }, // purple
        { x: 0.15, y: 0.72, z: 0.25 }, // green
        { x: 0.88, y: 0.15, z: 0.65 }, // magenta
        { x: 0.32, y: 0.55, z: 0.18 }, // olive green
        { x: 0.72, y: 0.22, z: 0.95 }, // violet
        { x: 0.10, y: 0.85, z: 0.45 }, // emerald
    ],
};

function hexToVec3(hex: string): Vec3 {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    return { x: isNaN(r) ? 0 : r, y: isNaN(g) ? 0 : g, z: isNaN(b) ? 0 : b };
}

/** Derive 6 palette stops from a single base colour by lightening and darkening. */
function buildCustomPalette(bandHex: string): PaletteStop[] {
    const base = hexToVec3(bandHex);
    const clampedLerp = (a: Vec3, f: number): Vec3 => ({
        x: clamp01(lerp(0, a.x, f)),
        y: clamp01(lerp(0, a.y, f)),
        z: clamp01(lerp(0, a.z, f)),
    });
    const towards1 = (a: Vec3, f: number): Vec3 => ({
        x: clamp01(lerp(a.x, 1, f)),
        y: clamp01(lerp(a.y, 1, f)),
        z: clamp01(lerp(a.z, 1, f)),
    });
    return [
        clampedLerp(base, 0.35),      // very dark
        clampedLerp(base, 0.65),      // dark
        base,                         // base colour
        towards1(base, 0.25),         // lighter
        towards1(base, 0.50),         // light
        clampedLerp(base, 0.50),      // mid-dark accent
    ];
}

function getStops(params: GasGiantTextureParams): PaletteStop[] {
    if (params.palette === 'custom') return buildCustomPalette(params.customBandColor);
    return PALETTES[params.palette];
}

// ─────────────────────────────────────────────────────────────
// Band colour helpers
// ─────────────────────────────────────────────────────────────

function samplePalette(stops: PaletteStop[], t: number): Vec3 {
    const n = stops.length;
    const scaled = clamp01(t) * (n - 1);
    const i0 = Math.min(Math.floor(scaled), n - 2);
    const i1 = i0 + 1;
    const f = scaled - i0;
    const s = f * f * (3 - 2 * f); // smoothstep
    return mix3(stops[i0]!, stops[i1]!, s);
}

function applyContrast(c: Vec3, contrast: number): Vec3 {
    return {
        x: clamp01(0.5 + (c.x - 0.5) * contrast),
        y: clamp01(0.5 + (c.y - 0.5) * contrast),
        z: clamp01(0.5 + (c.z - 0.5) * contrast),
    };
}

// ─────────────────────────────────────────────────────────────
// Storm helpers
// ─────────────────────────────────────────────────────────────

type Storm = {
    sinLat: number; // -1..1
    lon: number;    // 0..2π
    radius: number;
    highlight: Vec3;
    spin: number;   // +1 or -1
};

function buildStorms(params: GasGiantTextureParams): Storm[] {
    const rng = new SeededRandom(`${params.seed}|storms`);
    const stormHighlight: Vec3 =
        params.palette === 'custom'
            ? hexToVec3(params.customStormColor)
            : { x: 0.96, y: 0.90, z: 0.72 };

    const storms: Storm[] = [];
    for (let i = 0; i < params.stormCount; i++) {
        storms.push({
            sinLat: rng.range(-0.65, 0.65),
            lon: rng.range(0, Math.PI * 2),
            radius: params.stormSize * rng.range(0.7, 1.3),
            highlight: stormHighlight,
            spin: rng.chance(0.5) ? 1 : -1,
        });
    }
    return storms;
}

function evaluateStormInfluence(sinLat: number, lon: number, storm: Storm): number {
    const dLat = sinLat - storm.sinLat;
    let dLon = lon - storm.lon;
    if (dLon > Math.PI) dLon -= Math.PI * 2;
    if (dLon < -Math.PI) dLon += Math.PI * 2;

    // squash horizontally so storms look oval
    const squash = 0.55;
    const dist = Math.hypot(dLat, dLon * squash);
    if (dist >= storm.radius * 1.5) return 0;

    const t = clamp01(1 - dist / storm.radius);
    return t * t * (3 - 2 * t);
}

// ─────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────

function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

// ─────────────────────────────────────────────────────────────
// Main async renderer
// ─────────────────────────────────────────────────────────────

/**
 * Renders a gas-giant colour map onto a new HTMLCanvasElement.
 * Yields to the event loop every 32 rows so the browser stays responsive
 * even at high resolutions (8192×4096).
 *
 * @param params   Generation parameters.
 * @param width    Output width in pixels (e.g. 2048, 4096, 8192).
 * @param height   Output height in pixels (e.g. 1024, 2048, 4096).
 * @param onProgress  Optional callback receiving a 0–1 completion fraction.
 * @returns A resolved canvas containing the texture.
 */
export async function renderGasGiantTexture(
    params: GasGiantTextureParams,
    width: number,
    height: number,
    onProgress?: (fraction: number) => void
): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const seedU32 = hashStringToU32(params.seed);
    const turbSeedU32 = hashStringToU32(`${params.seed}|turb`);
    const detailSeedU32 = hashStringToU32(`${params.seed}|detail`);
    const swirlSeedU32 = hashStringToU32(`${params.seed}|swirl`);

    const stops = getStops(params);
    const storms = buildStorms(params);

    // Scale noise inputs so that frequency is consistent across resolutions
    const TURB_SCALE = 2.5;
    const TURB_OCTAVES = 5;
    const DETAIL_SCALE = 12.0;
    const DETAIL_OCTAVES = 3;
    const SWIRL_OCTAVES = 3;
    const YIELD_ROWS = 32;

    for (let y = 0; y < height; y++) {
        if (y > 0 && y % YIELD_ROWS === 0) {
            onProgress?.(y / height);
            await yieldToEventLoop();
        }

        const v = y / Math.max(height - 1, 1); // 0..1 top → bottom
        const lat = (v - 0.5) * Math.PI;        // -π/2 .. +π/2
        const cosLat = Math.cos(lat);
        const sinLat = Math.sin(lat);

        for (let x = 0; x < width; x++) {
            const u = x / Math.max(width - 1, 1); // 0..1
            const lon = u * Math.PI * 2;

            // 3-D point on unit sphere
            const px = cosLat * Math.cos(lon);
            const py = sinLat;
            const pz = cosLat * Math.sin(lon);

            // FBM turbulence — displaces the latitude sample for wavy bands
            const turbDisplace =
                fbm3D(
                    px * TURB_SCALE,
                    py * TURB_SCALE,
                    pz * TURB_SCALE,
                    TURB_OCTAVES,
                    turbSeedU32
                ) * params.turbulence * 0.35;

            // Sinusoidal band function driven by displaced v
            const vBand = clamp01(v + turbDisplace);
            const bandT = Math.sin(vBand * params.bandScale * Math.PI) * 0.5 + 0.5;
            let color = applyContrast(samplePalette(stops, bandT), params.contrast);

            // High-frequency detail within bands
            if (params.detailStrength > 0) {
                const detail =
                    fbm3D(
                        px * DETAIL_SCALE,
                        py * DETAIL_SCALE,
                        pz * DETAIL_SCALE,
                        DETAIL_OCTAVES,
                        detailSeedU32
                    ) * params.detailStrength * 0.10;
                color = {
                    x: clamp01(color.x + detail),
                    y: clamp01(color.y + detail),
                    z: clamp01(color.z + detail),
                };
            }

            // Storm overlays
            for (const storm of storms) {
                const influence = evaluateStormInfluence(sinLat, lon, storm);
                if (influence <= 0) continue;

                // Vortex swirl: rotate FBM by angular position around storm centre
                const angle = Math.atan2(sinLat - storm.sinLat, lon - storm.lon) * storm.spin;
                const swirlNoise =
                    fbm3D(
                        Math.cos(angle) * 4,
                        Math.sin(angle) * 4,
                        seedU32 * 1e-9,
                        SWIRL_OCTAVES,
                        swirlSeedU32
                    ) * 0.12;

                const highlight: Vec3 = {
                    x: clamp01(storm.highlight.x + swirlNoise),
                    y: clamp01(storm.highlight.y + swirlNoise),
                    z: clamp01(storm.highlight.z + swirlNoise),
                };
                color = mix3(color, highlight, influence * 0.65);
            }

            const idx = (y * width + x) * 4;
            data[idx]     = Math.round(color.x * 255);
            data[idx + 1] = Math.round(color.y * 255);
            data[idx + 2] = Math.round(color.z * 255);
            data[idx + 3] = 255;
        }
    }

    onProgress?.(1);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}
