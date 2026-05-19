/**
 * body-params.ts
 *
 * Pure, scene-independent param generators for custom/random body creation.
 * No THREE imports, no scene references — only numbers in, numbers out.
 * Shared between the `createNewBody` interactive flow and the preset spawn modes.
 */
import { SCALE_FACTOR, SUN_MASS, SUN_RADIUS } from './consts';
import { BlackHole } from '../bodies/black-hole';
import { BodyTypeEnum } from './utilities';

// ---------------------------------------------------------------------------
// Star
// ---------------------------------------------------------------------------

/** Mass-radius power law for main-sequence stars (R ∝ M^0.8). */
export function calculateStarRadius(mass: number, baseMass: number, baseRadius: number): number {
    return baseRadius * Math.pow(mass / baseMass, 0.8);
}

export interface StarParams {
    mass: number;
    radius: number;
    temperature: number;
}

/**
 * Returns randomised (or override-applied) mass/radius/temperature for a new star.
 * Any field in `opts` that is a finite positive number is used as-is instead of randomising.
 */
export function randomStarParams(
    opts: {
        mass?: number | null;
        radius?: number | null;
        temperature?: number | null;
    } = {}
): StarParams {
    const minMass = SUN_MASS * 0.08;
    const maxMass = SUN_MASS * 150;
    const mass =
        typeof opts.mass === 'number' && isFinite(opts.mass) && opts.mass > 0
            ? opts.mass
            : minMass * Math.pow(maxMass / minMass, Math.random());

    const minRadius = SUN_RADIUS * 0.15;
    const maxRadius = 200000 * SCALE_FACTOR;
    const computedRadius = calculateStarRadius(mass, SUN_MASS, SUN_RADIUS);
    const radius =
        typeof opts.radius === 'number' && isFinite(opts.radius) && opts.radius > 0
            ? opts.radius
            : Math.min(Math.max(computedRadius, minRadius), maxRadius);

    const temperature =
        typeof opts.temperature === 'number' && isFinite(opts.temperature)
            ? opts.temperature
            : 2000 + Math.random() * 28000;

    return { mass, radius, temperature };
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
