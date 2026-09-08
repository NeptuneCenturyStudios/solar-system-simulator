/**
 * magnetic-field.ts
 *
 * Shared procedural roll for a body's dipole magnetic field.
 *
 * Planet, moon, and star factories all need the same decision ("does this body have a
 * global field, and if so what shape?"), so it lives here rather than being duplicated
 * per factory the way the atmosphere-tint block currently is.
 *
 * Attribute-only: this produces data for IMagneticFieldOptions and renders nothing.
 * Strength is in gauss, matching the real-world constants in utilities/consts.ts.
 */
import type { IMagneticFieldOptions } from '../interfaces';
import { SeededRandom } from '../utilities/prng';

/** The body classes that roll for a magnetic field, each with its own odds and strength range. */
export type MagneticFieldKind = 'gasGiant' | 'iceGiant' | 'solid' | 'dwarf' | 'moon' | 'star';

/**
 * Probability (0–1) that a body of each kind has a global magnetic field.
 * Planets are deliberately high — a magnetosphere is meant to be the norm, not a rarity.
 * Dwarf planets and moons are the exceptions (Ganymede being the real-world precedent).
 */
const MAGNETIC_FIELD_CHANCE: Record<MagneticFieldKind, number> = {
    gasGiant: 0.95,
    iceGiant: 0.9,
    solid: 0.8,
    dwarf: 0.15,
    moon: 0.25,
    star: 1.0,
};

/**
 * Surface equatorial dipole strength range per kind, in gauss. Sampled logarithmically
 * because the real spread is enormous — Mercury 0.003 G against Jupiter 4.17 G — and a
 * linear roll would cluster everything at the top of the range.
 */
const STRENGTH_RANGE_GAUSS: Record<MagneticFieldKind, [min: number, max: number]> = {
    gasGiant: [0.5, 8],
    iceGiant: [0.05, 0.6],
    solid: [0.005, 0.6],
    dwarf: [0.001, 0.05],
    moon: [0.001, 0.05],
    star: [0.1, 100],
};

/** Log-uniform sample over [min, max]. */
function logRange(rng: SeededRandom, min: number, max: number): number {
    return Math.exp(rng.range(Math.log(min), Math.log(max)));
}

/**
 * Rolls a magnetic field for a body, or returns null when it has none.
 *
 * Takes an RNG rather than a seed string so seeded callers (the procedural factories,
 * which pass `new SeededRandom(`${id}|magnetic-field`)`) and the unseeded UI-defaults
 * path can share one implementation.
 *
 * @param rng Random source; seeded callers get stable results for a given body id.
 * @param kind Body class, which sets both the odds and the strength range.
 */
export function rollMagneticField(
    rng: SeededRandom,
    kind: MagneticFieldKind
): IMagneticFieldOptions | null {
    if (!rng.chance(MAGNETIC_FIELD_CHANCE[kind])) return null;

    const [minStrength, maxStrength] = STRENGTH_RANGE_GAUSS[kind];

    // Most dipoles sit close to the rotation axis, but roughly one in six is wildly
    // tilted the way Uranus (58.6°) and Neptune (46.9°) are.
    const tilt = rng.chance(0.15) ? rng.range(30, 70) : rng.range(0, 20);

    // Squared so offsets bias small (Earth ≈ 0.08) with a rare Neptune-like extreme (0.55).
    const offset = Math.pow(rng.next(), 2) * 0.5;

    return {
        strength: logRange(rng, minStrength, maxStrength),
        tilt,
        azimuth: rng.range(0, 360),
        offset,
        reversed: rng.chance(0.5),
    };
}
