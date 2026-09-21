/**
 * Procedural generation of a star's hidden/discoverable science data (age, fuel remaining).
 * Pure — no THREE.js or scene references — mirroring the convention in planet-attributes.ts.
 */
import type { IPlanetaryAttributes } from '../bodies/body-attributes';
import { SeededRandom } from '../utilities/prng';
import { SUN_MASS } from '../utilities/consts';

/** Nothing in this game can be older than the universe itself. */
const UNIVERSE_AGE_YEARS = 13.8e9;

/**
 * Approximate main-sequence lifetime for a star of the given mass, using the standard
 * lifetime ∝ mass^-2.5 relation (~10 Gyr for a Sun-mass star), clamped to the age of the
 * universe — the unclamped formula lets very low-mass stars "outlive" it, which isn't
 * meaningful here.
 */
export function computeMainSequenceLifetimeYears(mass: number): number {
    const lifetime = 10e9 * Math.pow(mass / SUN_MASS, -2.5);
    return Math.min(lifetime, UNIVERSE_AGE_YEARS);
}

/**
 * Rolls a star's age as a random fraction of its own main-sequence lifetime — a star can't be
 * older than the point at which it would die of old age. Massive, hot stars have short
 * lifetimes and so tend to roll young; small, cool stars have long lifetimes and can roll
 * very old.
 */
export function computeStarAge(rng: SeededRandom, mass: number): number {
    return rng.next() * computeMainSequenceLifetimeYears(mass);
}

/**
 * Top-level entry point for procedural star attribute generation. Every attribute starts
 * undiscovered (discovered: false) since procedural bodies require probe discovery.
 *
 * `hasOrbitalPeriod` should be true only when this star actually orbits something (a
 * companion star or a black hole) — a lone star like a single-star system's only sun has no
 * orbit, so the attribute is omitted entirely rather than being permanently undiscoverable.
 * Rotation period, by contrast, is meaningful for every star (they all spin), so it's always
 * included.
 */
export function computeStellarAttributes(params: {
    id: string;
    mass: number;
    hasOrbitalPeriod: boolean;
}): IPlanetaryAttributes {
    const { id, mass, hasOrbitalPeriod } = params;

    const age = computeStarAge(new SeededRandom(`${id}|attr-age`), mass);

    const attributes: IPlanetaryAttributes = {
        age: { value: age, discovered: false },
        fuelPercentRemaining: { discovered: false },
        rotationPeriod: { discovered: false },
    };

    if (hasOrbitalPeriod) {
        attributes.orbitalPeriod = { discovered: false };
    }

    return attributes;
}
