import { SeededRandom } from '../../utilities/prng';
import { clamp01, fbm3D, hashStringToU32, mix3, Vec3 } from '../noise-utils';

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
    /** First band hue for the 'custom' palette. */
    customBandColor1: string;
    /** Second band hue for the 'custom' palette. */
    customBandColor2: string;
    /** Third band hue for the 'custom' palette. */
    customBandColor3: string;
    /** First equatorial hue for the 'custom' palette. */
    customEquatorialColor1: string;
    /** Second equatorial hue for the 'custom' palette. */
    customEquatorialColor2: string;
    /** Third equatorial hue for the 'custom' palette. */
    customEquatorialColor3: string;
    /** Width of the equatorial colour zone. 0 = none, 1 = full sphere. */
    equatorialWidth: number;
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
    customBandColor1: '#c2884a',
    customBandColor2: '#4a88c2',
    customBandColor3: '#c24a4a',
    customEquatorialColor1: '#6ab0e0',
    customEquatorialColor2: '#e0a060',
    customEquatorialColor3: '#60e090',
    equatorialWidth: 0.30,
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

/** Equatorial palette stops — blended in near the equator for each preset. */
const EQUATORIAL_PALETTES: Record<Exclude<GasGiantPalette, 'custom'>, PaletteStop[]> = {
    jupiter: [
        { x: 0.62, y: 0.28, z: 0.10 }, // dark reddish-orange (equatorial belt)
        { x: 0.88, y: 0.52, z: 0.20 }, // warm amber-orange
        { x: 0.45, y: 0.18, z: 0.06 }, // deep red-brown
        { x: 0.76, y: 0.42, z: 0.14 }, // reddish-orange
        { x: 0.32, y: 0.12, z: 0.04 }, // very dark reddish
        { x: 0.94, y: 0.70, z: 0.38 }, // light warm tan
    ],
    saturn: [
        { x: 0.98, y: 0.92, z: 0.76 }, // bright warm cream
        { x: 0.72, y: 0.56, z: 0.30 }, // warm amber-gold
        { x: 0.86, y: 0.80, z: 0.58 }, // pale warm
        { x: 0.62, y: 0.48, z: 0.22 }, // dark amber
        { x: 0.96, y: 0.86, z: 0.66 }, // creamy
        { x: 0.52, y: 0.40, z: 0.18 }, // deep bronze
    ],
    ice: [
        { x: 0.15, y: 0.65, z: 0.80 }, // teal
        { x: 0.06, y: 0.38, z: 0.68 }, // deep teal-blue
        { x: 0.28, y: 0.78, z: 0.88 }, // light teal
        { x: 0.10, y: 0.52, z: 0.75 }, // mid teal
        { x: 0.40, y: 0.85, z: 0.92 }, // bright cyan
        { x: 0.08, y: 0.28, z: 0.60 }, // deep blue
    ],
    alien: [
        { x: 0.90, y: 0.42, z: 0.08 }, // electric orange
        { x: 0.08, y: 0.88, z: 0.65 }, // bright cyan-green
        { x: 0.95, y: 0.88, z: 0.05 }, // vivid yellow
        { x: 0.45, y: 0.06, z: 0.90 }, // bright violet
        { x: 0.05, y: 0.72, z: 0.95 }, // electric blue
        { x: 0.95, y: 0.18, z: 0.48 }, // hot pink
    ],
};

function hexToVec3(hex: string): Vec3 {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    return { x: isNaN(r) ? 0 : r, y: isNaN(g) ? 0 : g, z: isNaN(b) ? 0 : b };
}

/** Build 6 palette stops from three base colours, alternating bright/dark so
 *  adjacent bands have visible contrast and all three hues appear in the cycle. */
function buildCustomPalette(hex1: string, hex2: string, hex3: string): PaletteStop[] {
    const c1 = hexToVec3(hex1);
    const c2 = hexToVec3(hex2);
    const c3 = hexToVec3(hex3);
    const dk = (c: Vec3): Vec3 => ({ x: c.x * 0.45, y: c.y * 0.45, z: c.z * 0.45 });
    return [
        c1,      // bright c1
        dk(c2),  // dark   c2
        c3,      // bright c3
        dk(c1),  // dark   c1
        c2,      // bright c2
        dk(c3),  // dark   c3
    ];
}

function getStops(params: GasGiantTextureParams): PaletteStop[] {
    if (params.palette === 'custom')
        return buildCustomPalette(params.customBandColor1, params.customBandColor2, params.customBandColor3);
    return PALETTES[params.palette];
}

function getEquatorialStops(params: GasGiantTextureParams): PaletteStop[] {
    if (params.palette === 'custom')
        return buildCustomPalette(params.customEquatorialColor1, params.customEquatorialColor2, params.customEquatorialColor3);
    return EQUATORIAL_PALETTES[params.palette];
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
    sinLat: number;   // -1..1
    lon: number;      // 0..2π
    radius: number;
    spin: number;     // +1 or -1
};

function buildStorms(params: GasGiantTextureParams): Storm[] {
    const rng = new SeededRandom(`${params.seed}|storms`);
    const storms: Storm[] = [];
    for (let i = 0; i < params.stormCount; i++) {
        storms.push({
            sinLat: rng.range(-0.65, 0.65),
            lon: rng.range(0, Math.PI * 2),
            radius: params.stormSize * rng.range(0.7, 1.3),
            spin: rng.chance(0.5) ? 1 : -1,
        });
    }
    return storms;
}

/**
 * Returns the latitude (v) warp contribution from a single storm vortex at the
 * given surface point. The displacement is tangential to the vortex rotation so
 * bands physically curve around the storm rather than being overlaid with colour.
 *
 * Profile: zero at the eye, peaks near storm.radius, falls back to zero at
 * ~2.2 × storm.radius, producing a smooth ring of band distortion.
 */
function evaluateStormWarp(sinLat: number, lon: number, storm: Storm): number {
    const dLat = sinLat - storm.sinLat;
    let dLon = lon - storm.lon;
    if (dLon > Math.PI) dLon -= Math.PI * 2;
    if (dLon < -Math.PI) dLon += Math.PI * 2;

    // Oval footprint: squash the longitude component
    const squash = 0.55;
    const dist = Math.hypot(dLat, dLon * squash);
    const outerRadius = storm.radius * 2.2;
    if (dist < 1e-6 || dist > outerRadius) return 0;

    // Bell envelope: sin(πt) gives 0 at eye, peak at t=0.5, 0 at outer edge
    const t = dist / outerRadius;
    const bell = Math.sin(t * Math.PI);

    // Only the v (latitude) component of the tangent warps the horizontal bands;
    // ry is the longitude component of the radial unit vector (in squashed space).
    const ry = (dLon * squash) / dist;

    // Tangent = 90° rotation of radial, scaled by spin direction.
    // Only the v (latitude) component warps the horizontal bands.
    const tangentV = -ry * storm.spin;

    // Strength is in sinLat-units; the caller converts to v-units via 1/(π·cosLat).
    // Coefficient ~5 keeps a similar visual band-displacement magnitude after that
    // division by π at the equator.
    return tangentV * bell * storm.radius * 5.0;
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

    const turbSeedU32 = hashStringToU32(`${params.seed}|turb`);
    const detailSeedU32 = hashStringToU32(`${params.seed}|detail`);

    const stops = getStops(params);
    const equatorialStops = getEquatorialStops(params);
    const storms = buildStorms(params);

    // Scale noise inputs so that frequency is consistent across resolutions
    const TURB_SCALE = 2.5;
    const TURB_OCTAVES = 5;
    const DETAIL_SCALE = 12.0;
    const DETAIL_OCTAVES = 3;
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

            // Storm vortex warp
            let stormWarpV = 0;
            for (const storm of storms) {
                stormWarpV += evaluateStormWarp(sinLat, lon, storm);
            }
            const safeCos = Math.max(cosLat, 0.15);

            // Sinusoidal band function driven by turbulence + storm warp
            const vBand = clamp01(v + turbDisplace + stormWarpV / (Math.PI * safeCos));
            const bandT = Math.sin(vBand * params.bandScale * Math.PI) * 0.5 + 0.5;

            // Equatorial blend — computed here, after vBand, so it tracks the
            // warped/turbulent band positions rather than raw latitude.
            // Distance is measured in band cycles from the equator (vBand = 0.5)
            // so the palette boundary follows actual band edges, not a latitude line.
            let equatorialBlend = 0;
            if (params.equatorialWidth > 0.01) {
                const bandDist = Math.abs(vBand - 0.5) * params.bandScale;
                const bandThreshold = params.equatorialWidth * params.bandScale;
                // Transition over 0.5 band cycles so the boundary sits at a band edge
                const eq = clamp01((bandDist - bandThreshold) / 0.5);
                equatorialBlend = 1 - eq * eq * (3 - 2 * eq);
            }

            // Blend primary and equatorial palettes based on band position
            const primaryColor = samplePalette(stops, bandT);
            const equatorialColor = samplePalette(equatorialStops, bandT);
            let color = applyContrast(mix3(primaryColor, equatorialColor, equatorialBlend), params.contrast);

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
