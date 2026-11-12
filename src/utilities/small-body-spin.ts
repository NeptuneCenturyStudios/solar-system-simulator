import type { IStateDependencies } from '../interfaces';
import {
    EARTH_DIST,
    EARTH_ORBITAL_PERIOD_REAL,
    RADIUS_SCALE,
    SUN_MASS,
} from './consts';
import { calcSimOrbitalPeriod } from '../procedural/orbital-math.js';

/**
 * Realistic spin periods for generated small bodies (asteroids and comets).
 *
 * A period is drawn in real hours from distributions shaped like the asteroid Lightcurve
 * Database, then converted to a sim rotation speed with the same real-to-sim time scale the
 * real bodies use, so a procedural rock turns at the same rate as Ceres or Vesta would.
 */

/** Uniform random source in [0, 1): a seeded `rng.next` or `Math.random`. */
export type RandomSource = () => number;

// === Asteroids ===
// Large asteroids cluster around ~9 h with little spread (Ceres 9.07 h, Pallas 7.81 h,
// Vesta 5.34 h, Hygiea 13.8 h). Kilometre-sized ones spin faster on average (~5 h) with a much
// wider spread. Median and spread are interpolated in log-radius between these two anchors.
const ASTEROID_SMALL_RADIUS_KM = 0.5;
const ASTEROID_LARGE_RADIUS_KM = 50;
const ASTEROID_SMALL_MEDIAN_HOURS = 5;
const ASTEROID_LARGE_MEDIAN_HOURS = 9;
/** Log-normal sigma (natural log) for small and large asteroids. */
const ASTEROID_SMALL_SIGMA = 0.7;
const ASTEROID_LARGE_SIGMA = 0.35;
/** Fraction of asteroids that are slow rotators (often tumbling), drawn log-uniformly. */
const ASTEROID_SLOW_ROTATOR_FRACTION = 0.07;
const ASTEROID_SLOW_ROTATOR_MIN_HOURS = 24;
const ASTEROID_SLOW_ROTATOR_MAX_HOURS = 500;
/** The ~2.2 h "spin barrier": rubble piles larger than ~150 m fly apart if they spin faster. */
const ASTEROID_MIN_PERIOD_HOURS = 2.2;
const ASTEROID_MAX_PERIOD_HOURS = 1000;

// === Comets ===
// Measured nuclei: 67P 12.4 h, Hale-Bopp 11.3 h, Tempel 1 ~41 h, Halley ~52 h.
const COMET_MEDIAN_HOURS = 15;
const COMET_SIGMA = 0.6;
const COMET_MIN_PERIOD_HOURS = 5;
const COMET_MAX_PERIOD_HOURS = 70;

/**
 * Real seconds per sim second. Keyed to Earth's orbit like Earth's own spin (see earth.ts);
 * because distances and masses are scaled consistently this ratio holds at any orbit distance
 * and around any star mass.
 */
export function simTimeScale(dependencies: IStateDependencies): number {
    return (
        EARTH_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(EARTH_DIST, dependencies.getG(), SUN_MASS)
    );
}

/** Sim rotation speed (rad per sim second) for a real spin period in hours. */
export function spinSpeedFromPeriodHours(dependencies: IStateDependencies, hours: number): number {
    return ((2 * Math.PI) / (hours * 3600)) * simTimeScale(dependencies);
}

/** Standard normal draw (Box-Muller). */
function standardNormal(random: RandomSource): number {
    const u1 = Math.max(Number.EPSILON, random());
    const u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Draws a real spin period (hours) for an asteroid of the given radius (km). */
export function sampleAsteroidSpinPeriodHours(random: RandomSource, radiusKm: number): number {
    if (random() < ASTEROID_SLOW_ROTATOR_FRACTION) {
        const logMin = Math.log(ASTEROID_SLOW_ROTATOR_MIN_HOURS);
        const logMax = Math.log(ASTEROID_SLOW_ROTATOR_MAX_HOURS);
        return Math.exp(logMin + random() * (logMax - logMin));
    }

    const safeRadius =
        Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm : ASTEROID_SMALL_RADIUS_KM;
    const t = clamp(
        (Math.log(safeRadius) - Math.log(ASTEROID_SMALL_RADIUS_KM)) /
            (Math.log(ASTEROID_LARGE_RADIUS_KM) - Math.log(ASTEROID_SMALL_RADIUS_KM)),
        0,
        1
    );
    const logMedian =
        Math.log(ASTEROID_SMALL_MEDIAN_HOURS) +
        t * (Math.log(ASTEROID_LARGE_MEDIAN_HOURS) - Math.log(ASTEROID_SMALL_MEDIAN_HOURS));
    const sigma = ASTEROID_SMALL_SIGMA + t * (ASTEROID_LARGE_SIGMA - ASTEROID_SMALL_SIGMA);

    const hours = Math.exp(logMedian + sigma * standardNormal(random));
    return clamp(hours, ASTEROID_MIN_PERIOD_HOURS, ASTEROID_MAX_PERIOD_HOURS);
}

/** Draws a real spin period (hours) for a comet nucleus. */
export function sampleCometSpinPeriodHours(random: RandomSource): number {
    const hours = Math.exp(Math.log(COMET_MEDIAN_HOURS) + COMET_SIGMA * standardNormal(random));
    return clamp(hours, COMET_MIN_PERIOD_HOURS, COMET_MAX_PERIOD_HOURS);
}

/** Sim rotation speed for an asteroid whose radius is in sim units. */
export function sampleAsteroidSpinSpeed(
    dependencies: IStateDependencies,
    random: RandomSource,
    simRadius: number
): number {
    const hours = sampleAsteroidSpinPeriodHours(random, simRadius * RADIUS_SCALE);
    return spinSpeedFromPeriodHours(dependencies, hours);
}

/** Sim rotation speed for a comet nucleus. */
export function sampleCometSpinSpeed(
    dependencies: IStateDependencies,
    random: RandomSource
): number {
    return spinSpeedFromPeriodHours(dependencies, sampleCometSpinPeriodHours(random));
}
