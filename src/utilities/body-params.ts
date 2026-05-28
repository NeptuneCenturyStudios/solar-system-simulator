/**
 * body-params.ts
 *
 * Pure, scene-independent param generators for custom/random body creation.
 * No THREE imports, no scene references — only numbers in, numbers out.
 * Shared between the `createNewBody` interactive flow and the preset spawn modes.
 */
import {
    SCALE_FACTOR,
    SUN_MASS,
    SUN_RADIUS,
    STAR_LIGHT_INTENSITY_MIN,
    STAR_LIGHT_INTENSITY_MAX,
    MOON_MASS,
    MOON_RADIUS,
    MOON_DIST_FROM_EARTH,

    // Solid-like reference range (scaled by MASS_SCALE / RADIUS_SCALE)
    MERCURY_MASS,
    VENUS_MASS,
    EARTH_MASS,
    MERCURY_RADIUS,
    VENUS_RADIUS,
    EARTH_RADIUS,

    // Gas giant reference range
    JUPITER_MASS,
    SATURN_MASS,
    JUPITER_RADIUS,
    SATURN_RADIUS,

    // Ice giant reference range
    URANUS_MASS,
    NEPTUNE_MASS,
    URANUS_RADIUS,
    NEPTUNE_RADIUS,
} from './consts';
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
    rotationTilt: number;
    rotationSpeed: number;
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
        rotationTilt?: number | null;
        rotationSpeed?: number | null;
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
    // Procedural stars + custom stars should share the same clamp bounds.
    // Use a log-distribution for nicer spread.
    const lightMin = STAR_LIGHT_INTENSITY_MIN;
    const lightMax = STAR_LIGHT_INTENSITY_MAX;

    const rawLightIntensity =
        isFinitePositiveNumber(opts.lightIntensity)
            ? opts.lightIntensity
            : lightMin * Math.pow(lightMax / lightMin, rng.next());

    const lightIntensity = Math.min(Math.max(rawLightIntensity, lightMin), lightMax);

    // Rotation:
    // - tilt: [0, 90] (degrees) similar to prior procedural generator behavior
    // - speed: [0.03, 0.12] similar to prior procedural generator behavior
    const rotationTilt =
        typeof opts.rotationTilt === 'number' && isFinite(opts.rotationTilt)
            ? opts.rotationTilt
            : rng.range(0, 90);

    const rotationSpeed =
        typeof opts.rotationSpeed === 'number' && isFinite(opts.rotationSpeed) && opts.rotationSpeed > 0
            ? opts.rotationSpeed
            : rng.range(0.03, 0.12);

    // Defensive: ensure outputs are finite + positive (prevents NaN geometry in THREE)
    const safeMass = isFinitePositiveNumber(mass) ? mass : minMass;
    const safeRadius = isFinitePositiveNumber(radius) ? radius : minRadius;
    const safeTemperature =
        typeof temperature === 'number' && isFinite(temperature) && temperature > 0
            ? temperature
            : 5778;
    const safeLightIntensity =
        isFinitePositiveNumber(lightIntensity) ? lightIntensity : lightMin;

    const safeRotationTilt = isFinitePositiveNumber(rotationTilt) ? rotationTilt : 0;
    const safeRotationSpeed =
        isFinitePositiveNumber(rotationSpeed) ? rotationSpeed : 0.08;

    return {
        mass: safeMass,
        radius: safeRadius,
        temperature: safeTemperature,
        lightIntensity: safeLightIntensity,
        rotationTilt: safeRotationTilt,
        rotationSpeed: safeRotationSpeed,
        seed,
    };
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
    Temperate = 'temperate',
}

/**
 * MoonTypeEnum mirrors the "solid-like" planet subtypes, but intentionally excludes
 * gas/ice giant categories. This lets procedural moons pick planet-like textures
 * (ocean/desert/frozen/volcanic/terrestrial) without ever needing gas/ice moon textures.
 */
export enum MoonTypeEnum {
    Terrestrial = 'solid',
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
        | 'desert'
        | 'temperate' = 'solid',
    opts: { mass?: number | null; radius?: number | null; seed?: string | null } = {}
): PlanetParams {
    const inputSeed = (opts.seed ?? '').trim();
    const seed = inputSeed.length > 0 ? inputSeed : generateSeedString();
    const rng = new SeededRandom(seed);

    const isGasGiant = planetType === 'gas_giant';
    const isIceGiant = planetType === 'ice_giant';
    const isSolidLike =
        planetType === 'solid' ||
        planetType === 'volcanic' ||
        planetType === 'ocean' ||
        planetType === 'frozen' ||
        planetType === 'desert' ||
        planetType === 'temperate';

    // Mass+radius ranges from already-scaled constants.
    const solidMassMin = Math.min(MERCURY_MASS, VENUS_MASS, EARTH_MASS);
    const solidMassMax = Math.max(MERCURY_MASS, VENUS_MASS, EARTH_MASS);

    const solidRadiusMin = Math.min(MERCURY_RADIUS, VENUS_RADIUS, EARTH_RADIUS);
    const solidRadiusMax = Math.max(MERCURY_RADIUS, VENUS_RADIUS, EARTH_RADIUS);

    const gasMassMin = Math.min(JUPITER_MASS, SATURN_MASS);
    const gasMassMax = Math.max(JUPITER_MASS, SATURN_MASS);

    const gasRadiusMin = Math.min(JUPITER_RADIUS, SATURN_RADIUS);
    const gasRadiusMax = Math.max(JUPITER_RADIUS, SATURN_RADIUS);

    const iceMassMin = Math.min(URANUS_MASS, NEPTUNE_MASS);
    const iceMassMax = Math.max(URANUS_MASS, NEPTUNE_MASS);

    const iceRadiusMin = Math.min(URANUS_RADIUS, NEPTUNE_RADIUS);
    const iceRadiusMax = Math.max(URANUS_RADIUS, NEPTUNE_RADIUS);

    const massMin = isSolidLike ? solidMassMin : isGasGiant ? gasMassMin : iceMassMin;
    const massMax = isSolidLike ? solidMassMax : isGasGiant ? gasMassMax : iceMassMax;

    const radiusMin = isSolidLike
        ? solidRadiusMin
        : isGasGiant
          ? gasRadiusMin
          : iceRadiusMin;
    const radiusMax = isSolidLike
        ? solidRadiusMax
        : isGasGiant
          ? gasRadiusMax
          : iceRadiusMax;

    // Sample mass log-uniform between min/max, unless overridden.
    const sampledMass =
        massMin * Math.pow(massMax / Math.max(1e-12, massMin), rng.next());

    const mass =
        typeof opts.mass === 'number' && isFinite(opts.mass) && opts.mass > 0 ? opts.mass : sampledMass;

    // Derive radius from the mass using a power-law anchored at min/max,
    // unless overridden.
    const massDen = Math.max(1e-12, massMin);
    const exp = Math.log(radiusMax / Math.max(1e-12, radiusMin)) / Math.log(massMax / massDen);
    const derivedRadius = radiusMin * Math.pow(mass / massDen, exp);

    const radius =
        typeof opts.radius === 'number' && isFinite(opts.radius) && opts.radius > 0
            ? opts.radius
            : Math.min(Math.max(derivedRadius, radiusMin), radiusMax);

    const bodySubtype: PlanetTypeEnum =
        planetType === 'gas_giant'
            ? PlanetTypeEnum.GasGiant
            : isIceGiant
              ? PlanetTypeEnum.IceGiant
              : planetType === 'volcanic'
                ? PlanetTypeEnum.Volcanic
                : planetType === 'ocean'
                  ? PlanetTypeEnum.Ocean
                  : planetType === 'frozen'
                    ? PlanetTypeEnum.Frozen
                    : planetType === 'desert'
                      ? PlanetTypeEnum.Desert
                      : planetType === 'temperate'
                        ? PlanetTypeEnum.Temperate
                        : PlanetTypeEnum.Terrestrial;

    return {
        mass,
        radius,
        rotationSpeed: 0.1 + rng.next() * 0.4,
        bodyType: BodyTypeEnum.Planet,
        bodySubtype,
    };
}

// ---------------------------------------------------------------------------
// Moon
// ---------------------------------------------------------------------------

/**
 * Returns deterministic (or override-applied) params for a new custom/procedural moon.
 * `parentRadius` is used to scale the default orbital distance.
 *
 * Note: `seed` is included so procedural moon generation can create stable names/placements.
 */
export interface MoonParams {
    mass: number;
    radius: number;
    /** Distance from parent centre (world units). */
    distance: number;
    rotationSpeed: number;
    /** Seed actually used to derive this moon's properties. */
    seed: string;
}

// - If `opts.seed` is provided, it is used to derive deterministic values.
// - Otherwise a new seed string is generated (matches the star/planet custom pattern).
// Returns deterministic (or override-applied) params for a new custom/procedural moon.
// Hardened against NaN/invalid parentRadius to avoid THREE geometry blowups.
export function randomMoonParams(
    parentRadius: number,
    opts: { mass?: number | null; radius?: number | null; seed?: string | null } = {}
): MoonParams {
    const inputSeed = (opts.seed ?? '').trim();
    const seed = inputSeed.length > 0 ? inputSeed : generateSeedString();

    const rng = new SeededRandom(seed);

    const safeParentRadius =
        typeof parentRadius === 'number' && isFinite(parentRadius) && parentRadius > 0
            ? parentRadius
            : 1;

    // Distance scales with parent size using the real Earth/Moon baseline:
    // Earth–Moon: MOON_DIST_FROM_EARTH. Scale linearly by radius ratio.
    const parentRelEarth = safeParentRadius / Math.max(1e-12, EARTH_RADIUS);
    const distanceBase = MOON_DIST_FROM_EARTH * parentRelEarth;

    // Add a deterministic multiplier so moons don't all sit on the same ring.
    // Keep it modest so distance doesn't explode for tiny/huge radii.
    const distanceMultiplier = 0.75 + rng.next() * 0.5; // [0.75..1.25]
    const distance = distanceBase * distanceMultiplier;

    // Planet-relative sizing so procedural moons can’t come out larger than the host.
    // - Only applies to PROCEDURAL defaults (when opts.radius/mass aren't provided).
    const maxDefaultMoonRadius = safeParentRadius * 0.25;
    const minDefaultMoonRadius = Math.max(MOON_RADIUS * 0.05, safeParentRadius * 0.03);

    const radius =
        typeof opts.radius === 'number' && isFinite(opts.radius) && opts.radius > 0
            ? opts.radius
            : minDefaultMoonRadius +
              rng.next() * Math.max(1e-6, maxDefaultMoonRadius - minDefaultMoonRadius);

    // Use a density-ish scaling anchored to Earth/Moon constants:
    // mass ∝ radius^3, with a light random multiplier to avoid uniformity.
    const densityScale = MOON_MASS / Math.pow(Math.max(1e-12, MOON_RADIUS), 3);
    const densityFactor = 0.7 + rng.next() * 0.6;

    const computedMass = densityScale * Math.pow(radius, 3) * densityFactor;

    const mass =
        typeof opts.mass === 'number' && isFinite(opts.mass) && opts.mass > 0
            ? opts.mass
            : computedMass;

    const safeRadius = isFinite(radius) && radius > 0 ? radius : minDefaultMoonRadius;
    const safeMass = isFinite(mass) && mass > 0 ? mass : MOON_MASS * 0.5;
    const safeDistance = isFinite(distance) && distance > 0 ? distance : safeParentRadius * 5;

    return {
        mass: safeMass,
        radius: safeRadius,
        distance: safeDistance,
        rotationSpeed: 0.15 + rng.next() * 0.35,
        seed,
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
