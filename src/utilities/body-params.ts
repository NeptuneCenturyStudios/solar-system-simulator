/**
 * body-params.ts
 *
 * Pure, scene-independent param generators for custom/random body creation.
 * No THREE imports, no scene references — only numbers in, numbers out.
 * Shared between the `createNewBody` interactive flow and the preset spawn modes.
 */
import { SCALE_FACTOR, SUN_MASS, SUN_RADIUS } from './consts';
import { BlackHole } from '../bodies/black-hole';
import { SeededRandom } from './prng';
import { BodyTypeEnum } from './utilities';

// ---------------------------------------------------------------------------
// Star
// ---------------------------------------------------------------------------

/** Mass-radius power law for main-sequence stars (R ∝ M^0.8). */
export function calculateStarRadius(mass: number, baseMass: number, baseRadius: number): number {
    return baseRadius * Math.pow(mass / baseMass, 0.8);
}

// NOTE: Stars are scene-independent params used by both:
// - the procedural spawn pipeline
// - the management panel "create custom star" flow
export interface StarParams {
    mass: number;
    radius: number;
    temperature: number;
    lightIntensity: number;
    /** The seed actually used to derive this star's properties. */
    seed: string;
}

function isFinitePositiveNumber(v: unknown): v is number {
    return typeof v === 'number' && isFinite(v) && v > 0;
}

function generateSeedString(): string {
    return (() => {
        // Generate seed string (string -> hashed to PRNG state).
        // Use crypto when available, fall back to Math.random for older environments.
        const randPart =
            typeof crypto !== 'undefined' && crypto.getRandomValues
                ? (() => {
                      const bytes = new Uint32Array(2);
                      crypto.getRandomValues(bytes);
                      return `${bytes[0].toString(16)}${bytes[1].toString(16)}`;
                  })()
                : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        return `${randPart}`;
    })();
}

/**
 * Returns deterministic (or override-applied) mass/radius/temperature/lightIntensity for a new star.
 *
 * Rules:
 * - If `opts.seed` is provided (non-empty), it is used.
 * - Otherwise, a new seed string is generated.
 * - Any of `opts.mass`, `opts.radius`, `opts.temperature`, `opts.lightIntensity` that are
 *   finite positive numbers are used as-is; other fields are derived from the seed.
 */
export function randomStarParams(
    opts: {
        seed?: string | null;
        mass?: number | null;
        radius?: number | null;
        temperature?: number | null;
        lightIntensity?: number | null;
    } = {}
): StarParams {
    const inputSeed = (opts.seed ?? '').trim();
    const seed = inputSeed.length > 0 ? inputSeed : generateSeedString();

    const rng = new SeededRandom(seed);

    const minMass = SUN_MASS * 0.08;
    const maxMass = SUN_MASS * 150;
    const mass =
        isFinitePositiveNumber(opts.mass)
            ? opts.mass
            : minMass * Math.pow(maxMass / minMass, rng.next());

    const minRadius = SUN_RADIUS * 0.15;
    const maxRadius = 200000 * SCALE_FACTOR;
    const computedRadius = calculateStarRadius(mass, SUN_MASS, SUN_RADIUS);
    const radius =
        isFinitePositiveNumber(opts.radius)
            ? opts.radius
            : Math.min(Math.max(computedRadius, minRadius), maxRadius);

    const temperature =
        typeof opts.temperature === 'number' && isFinite(opts.temperature)
            ? opts.temperature
            : 2000 + rng.next() * 28000;

    // Light intensity:
    // Management panel uses values roughly in [1e5, 5e11] depending on randomization mode.
    // Use a log-distribution for nicer spread.
    const LIGHT_MIN = 100000;
    const LIGHT_MAX = 500000000000;
    const lightIntensity =
        isFinitePositiveNumber(opts.lightIntensity)
            ? opts.lightIntensity
            : LIGHT_MIN * Math.pow(LIGHT_MAX / LIGHT_MIN, rng.next());

    // Defensive: ensure outputs are finite + positive (prevents NaN geometry in THREE)
    const safeMass = isFinitePositiveNumber(mass) ? mass : minMass;
    const safeRadius = isFinitePositiveNumber(radius) ? radius : minRadius;
    const safeTemperature =
        typeof temperature === 'number' && isFinite(temperature) && temperature > 0
            ? temperature
            : 5778;
    const safeLightIntensity =
        isFinitePositiveNumber(lightIntensity) ? lightIntensity : 500000000;

    return { mass: safeMass, radius: safeRadius, temperature: safeTemperature, lightIntensity: safeLightIntensity, seed };
}

// ---------------------------------------------------------------------------
// Black Hole
// ---------------------------------------------------------------------------

export interface BlackHoleParams {
    mass: number;
    radius: number;
}

/**
 * Returns randomised (or override-applied) mass/radius for a new black hole.
 * Mass is log-sampled over [3 M☉, 50 M☉]; radius is derived from the static
 * event-horizon formula so it stays consistent with the live growth path.
 */
export function randomBlackHoleParams(
    opts: {
        mass?: number | null;
        radius?: number | null;
    } = {}
): BlackHoleParams {
    const BH_MIN_MASS = 3 * SUN_MASS;
    const BH_MAX_MASS = 50 * SUN_MASS;
    const mass =
        typeof opts.mass === 'number' && isFinite(opts.mass) && opts.mass >= BH_MIN_MASS
            ? opts.mass
            : BH_MIN_MASS * Math.pow(BH_MAX_MASS / BH_MIN_MASS, Math.random());

    const radius =
        typeof opts.radius === 'number' && isFinite(opts.radius) && opts.radius > 0
            ? opts.radius
            : BlackHole.massToEventHorizonRadius(mass);

    return { mass, radius };
}

// ---------------------------------------------------------------------------
// Planet
// ---------------------------------------------------------------------------
export enum PlanetTypeEnum {
    Terrestrial = 'solid',
    GasGiant = 'gas_giant',
    IceGiant = 'ice_giant',
    Volcanic = 'volcanic',
    Ocean = 'ocean',
    Frozen = 'frozen',
    Desert = 'desert',
}

export interface PlanetParams {
    mass: number;
    radius: number;
    rotationSpeed: number;
    /**
     * Always BodyTypeEnum.Planet for custom planets.
     * (Gas/ice/volcanic are expressed via `bodySubtype`.)
     */
    bodyType: BodyTypeEnum;
    bodySubtype: PlanetTypeEnum;
}

/**
 * Returns randomised (or override-applied) params for a new custom planet.
 * `planetType` drives the mass/radius ranges and the returned `bodySubtype` flag.
 *
 * IMPORTANT: `bodyType` is always BodyTypeEnum.Planet. Gas/ice/volcanic are represented
 * by `bodySubtype`.
 */
export function randomPlanetParams(
    planetType:
        | 'solid'
        | 'gas_giant'
        | 'ice_giant'
        | 'volcanic'
        | 'ocean'
        | 'frozen'
        | 'desert' = 'solid',
    opts: { mass?: number | null; radius?: number | null } = {}
): PlanetParams {
    const isGasGiant = planetType === 'gas_giant';
    const isSolidLike =
        planetType === 'solid' ||
        planetType === 'volcanic' ||
        planetType === 'ocean' ||
        planetType === 'frozen' ||
        planetType === 'desert';

    const radius =
        typeof opts.radius === 'number' && isFinite(opts.radius) && opts.radius > 0
            ? opts.radius
            : isSolidLike
              ? 5 + Math.random() * 10
              : 18 + Math.random() * 24;

    const mass =
        typeof opts.mass === 'number' && isFinite(opts.mass) && opts.mass > 0
            ? opts.mass
            : isSolidLike
              ? 50 + Math.random() * 500
              : isGasGiant
                ? 4000 + Math.random() * 26000
                : 1200 + Math.random() * 7000;

    const bodySubtype: PlanetTypeEnum =
        planetType === 'gas_giant'
            ? PlanetTypeEnum.GasGiant
            : planetType === 'ice_giant'
              ? PlanetTypeEnum.IceGiant
              : planetType === 'volcanic'
                ? PlanetTypeEnum.Volcanic
                : planetType === 'ocean'
                  ? PlanetTypeEnum.Ocean
                  : planetType === 'frozen'
                    ? PlanetTypeEnum.Frozen
                    : planetType === 'desert'
                      ? PlanetTypeEnum.Desert
                      : PlanetTypeEnum.Terrestrial;

    return {
        mass,
        radius,
        rotationSpeed: 0.1 + Math.random() * 0.4,
        bodyType: BodyTypeEnum.Planet,
        bodySubtype,
    };
}

// ---------------------------------------------------------------------------
// Moon
// ---------------------------------------------------------------------------

export interface MoonParams {
    mass: number;
    radius: number;
    /** Distance from parent centre (world units). */
    distance: number;
    rotationSpeed: number;
}

/**
 * Returns randomised (or override-applied) params for a new custom moon.
 * `parentRadius` is used to scale the default orbital distance.
 */
export function randomMoonParams(
    parentRadius: number,
    opts: { mass?: number | null; radius?: number | null } = {}
): MoonParams {
    const distance = parentRadius * 5 + Math.random() * parentRadius * 10;

    const radius =
        typeof opts.radius === 'number' && isFinite(opts.radius) && opts.radius > 0
            ? opts.radius
            : 1 + Math.random() * 3;

    const mass =
        typeof opts.mass === 'number' && isFinite(opts.mass) && opts.mass > 0
            ? opts.mass
            : 0.5 + Math.random() * 2;

    return {
        mass,
        radius,
        distance,
        rotationSpeed: 0.15 + Math.random() * 0.35,
    };
}

// ---------------------------------------------------------------------------
// Comet
// ---------------------------------------------------------------------------

export interface CometParams {
    mass: number;
    radius: number;
}

/** Returns randomised (or override-applied) mass/radius for a new custom comet. */
export function randomCometParams(
    opts: {
        mass?: number | null;
        radius?: number | null;
    } = {}
): CometParams {
    const mass =
        typeof opts.mass === 'number' && isFinite(opts.mass) && opts.mass > 0
            ? opts.mass
            : 0.5 + Math.random() * 3;

    const radius =
        typeof opts.radius === 'number' && isFinite(opts.radius) && opts.radius > 0
            ? opts.radius
            : 1 + Math.random() * 2;

    return { mass, radius };
}
