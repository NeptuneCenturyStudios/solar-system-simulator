import { SCALE_FACTOR, SUN_MASS } from "../utilities/consts";

/**
 * Calculates the event horizon radius for a black hole of a given mass.
 * @param mass The mass of the black hole.
 * @returns The event horizon radius.
 */
export function blackHoleMassToEventHorizonRadius(mass: number): number {
    // Matches BlackHole.massToEventHorizonRadius but keeps body-params scene-independent/pure.
    const BASE_MASS = 3 * SUN_MASS;
    const BASE_RADIUS = 1 * SCALE_FACTOR;

    const r = BASE_RADIUS * Math.cbrt(Math.max(0, mass) / BASE_MASS);
    return Math.max(0.25 * SCALE_FACTOR, r);
}