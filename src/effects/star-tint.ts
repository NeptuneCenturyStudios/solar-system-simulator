import * as THREE from 'three';

/** A colour keyed by surface temperature (K). */
type TemperatureStop = readonly [temperature: number, color: THREE.Color];

/**
 * Writes the colour for `temperature` into `target`, interpolating between `stops` (sorted by
 * temperature) in log(temperature), so the cool end, where most stars live, gets as much
 * resolution as the hot end. Clamps to the first/last stop outside their range.
 */
function interpolateStops(
    stops: ReadonlyArray<TemperatureStop>,
    temperature: number,
    target: THREE.Color
): THREE.Color {
    const first = stops[0];
    const last = stops[stops.length - 1];

    if (!(temperature > first[0])) return target.copy(first[1]);
    if (temperature >= last[0]) return target.copy(last[1]);

    const logT = Math.log(temperature);
    for (let i = 1; i < stops.length; i++) {
        const hi = stops[i];
        if (temperature > hi[0]) continue;

        const lo = stops[i - 1];
        const t = (logT - Math.log(lo[0])) / (Math.log(hi[0]) - Math.log(lo[0]));
        return target.lerpColors(lo[1], hi[1], t);
    }

    return target.copy(last[1]);
}

/** Builds a stop from raw (linear) RGB components. */
function rgbStop(temperature: number, r: number, g: number, b: number): TemperatureStop {
    return [temperature, new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace)];
}

/** Builds a stop from an sRGB hex colour. */
function hexStop(temperature: number, hex: number): TemperatureStop {
    return [temperature, new THREE.Color(hex)];
}

/**
 * Display-to-linear power for the star shaders' brightness profiles (surface energy, halo and
 * pulsar glow), which were authored against the old raw, un-encoded output. Raising them to this
 * power makes faint parts look as they did after the output pass's sRGB encode, while bright
 * parts go above 1 and roll off in the tone curve.
 */
export const STAR_HDR_GAMMA = 2.2;

/**
 * Scales the star surface's energy before STAR_HDR_GAMMA. Raise it for brighter, more
 * washed-out stars; lower it for darker convection lanes. With a Sun-like star's exposure (4.2)
 * an average granule lands around 1.6 (bright), lanes around 0.1 and hot spots far above 1.
 */
export const STAR_SURFACE_HDR_SCALE = 0.3;

/** Scales the star halo's linear brightness; its limb band peaks around 1 at the default. */
export const STAR_HALO_HDR_SCALE = 1.5;

/** Scales the pulsar beam's glow before STAR_HDR_GAMMA. */
export const PULSAR_BEAM_HDR_SCALE = 1.6;

/**
 * Hue stops for the procedural star surface.
 *
 * These are *shader tints* in linear RGB: the surface shader multiplies them by an HDR
 * brightness, and the output pass's tone curve (AgX by default) desaturates the brightest
 * areas toward yellow and then white. A tint of (1, 0.36, 0.08) therefore renders as the
 * orange-to-yellow sun from the original Blender model, not as a flat red.
 */
const TINT_STOPS: ReadonlyArray<TemperatureStop> = [
    rgbStop(1000, 1.0, 0.04, 0.01),
    rgbStop(2500, 1.0, 0.09, 0.015),
    rgbStop(3500, 1.0, 0.14, 0.025),
    rgbStop(4500, 1.0, 0.19, 0.035),
    rgbStop(5800, 1.0, 0.32, 0.05),
    rgbStop(7500, 1.0, 0.6, 0.32),
    rgbStop(10000, 0.95, 0.95, 1.0),
    // Blue range matches the old blue-star texture's cyan/sky-blue: teal lanes, cyan surface,
    // near-white hot spots. That texture applied from 25000 K, so the tint is fully cyan there.
    rgbStop(18000, 0.55, 0.8, 1.0),
    rgbStop(25000, 0.1, 0.55, 1.0),
    rgbStop(40000, 0.08, 0.5, 1.0),
    // Beyond any star: neutron-star hot (pulsars, ~10^6 K) reads as a pale violet-white, so a
    // pulsar never looks like a blue star or a white dwarf.
    rgbStop(100000, 0.5, 0.42, 1.0),
];

/**
 * Display colour of a star's light (point light, lens flare, base colour), by temperature.
 *
 * Unlike the surface tint these are what the light actually looks like: near-white for
 * Sun-like stars, so planets aren't bathed in orange. The palette is the one the old
 * step table used, now interpolated so a cooling white dwarf or a red giant's light changes
 * smoothly instead of jumping between bins.
 */
const LIGHT_STOPS: ReadonlyArray<TemperatureStop> = [
    hexStop(2000, 0x8b3a0a),
    hexStop(3000, 0xff6644),
    hexStop(3800, 0xffaa55),
    hexStop(5000, 0xffffee),
    hexStop(9000, 0xffffee),
    hexStop(20000, 0xffffff),
    hexStop(30000, 0xaaccff),
    hexStop(40000, 0xd6f0ff),
];

/** Writes the surface-shader tint for a star of the given temperature into `target`. */
export function starSurfaceTint(temperature: number, target: THREE.Color): THREE.Color {
    return interpolateStops(TINT_STOPS, temperature, target);
}

/** Writes the light colour for a star of the given temperature into `target`. */
export function starLightColor(temperature: number, target: THREE.Color): THREE.Color {
    return interpolateStops(LIGHT_STOPS, temperature, target);
}

/**
 * Overall surface energy for a star of the given temperature. Cool stars (red and brown dwarfs)
 * read dimmer, so their dark convection cells stay dark; hot white and blue stars run hotter so
 * their low-saturation tint reads as brilliant instead of grey.
 */
export function starSurfaceExposure(temperature: number): number {
    if (temperature <= 4000) {
        const t = THREE.MathUtils.clamp((temperature - 1000) / 3000, 0, 1);
        return THREE.MathUtils.lerp(1.8, 3.4, t);
    }
    if (temperature <= 5800) {
        return THREE.MathUtils.lerp(3.4, 4.2, (temperature - 4000) / 1800);
    }
    const t = THREE.MathUtils.clamp((temperature - 5800) / 6200, 0, 1);
    return THREE.MathUtils.lerp(4.2, 5.4, t);
}
