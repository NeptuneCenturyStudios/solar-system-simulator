import * as THREE from 'three';

/**
 * Hue stops for the procedural star surface, keyed by surface temperature (K).
 *
 * These are *shader tints*, not display colours: the surface shader runs them through a filmic
 * per-channel curve (`1 - exp(-tint * energy)`), so the dominant channel saturates first and
 * hot spots roll off toward yellow and then white. A tint of (1, 0.36, 0.08) therefore renders
 * as the orange-to-yellow sun from the original Blender model, not as a flat red.
 *
 * Stops are interpolated in log(temperature) so the cool end, where most stars live, gets as
 * much resolution as the hot end.
 */
const TINT_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
    [1000, 1.0, 0.04, 0.01],
    [2500, 1.0, 0.09, 0.015],
    [3500, 1.0, 0.14, 0.025],
    [4500, 1.0, 0.19, 0.035],
    [5800, 1.0, 0.32, 0.05],
    [7500, 1.0, 0.6, 0.32],
    [10000, 0.95, 0.95, 1.0],
    // Blue range matches the old blue-star texture's cyan/sky-blue: teal lanes, cyan surface,
    // near-white hot spots. That texture applied from 25000 K, so the tint is fully cyan there.
    [18000, 0.55, 0.8, 1.0],
    [25000, 0.1, 0.55, 1.0],
    [40000, 0.08, 0.5, 1.0],
    // Beyond any star: neutron-star hot (pulsars, ~10^6 K) reads as a pale violet-white, so a
    // pulsar never looks like a blue star or a white dwarf.
    [100000, 0.5, 0.42, 1.0],
];

/** Writes the surface-shader tint for a star of the given temperature into `target`. */
export function starSurfaceTint(temperature: number, target: THREE.Color): THREE.Color {
    const first = TINT_STOPS[0];
    const last = TINT_STOPS[TINT_STOPS.length - 1];

    if (!(temperature > first[0])) return target.setRGB(first[1], first[2], first[3]);
    if (temperature >= last[0]) return target.setRGB(last[1], last[2], last[3]);

    const logT = Math.log(temperature);
    for (let i = 1; i < TINT_STOPS.length; i++) {
        const hi = TINT_STOPS[i];
        if (temperature > hi[0]) continue;

        const lo = TINT_STOPS[i - 1];
        const t = (logT - Math.log(lo[0])) / (Math.log(hi[0]) - Math.log(lo[0]));
        return target.setRGB(
            lo[1] + (hi[1] - lo[1]) * t,
            lo[2] + (hi[2] - lo[2]) * t,
            lo[3] + (hi[3] - lo[3]) * t
        );
    }

    return target.setRGB(last[1], last[2], last[3]);
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
