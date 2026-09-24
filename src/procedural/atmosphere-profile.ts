/**
 * Procedural atmosphere rules — the single source of truth for whether a planet, dwarf planet or
 * moon has an atmosphere. A body has one exactly when it has a profile; clouds, atmospheric
 * composition and the physics/visual shell are all derived from that. Kept free of THREE.js so
 * the generators (and the Add/Edit panel's randomizer) can roll it before any body exists.
 */

import { SeededRandom } from '../utilities/prng';
import { MoonTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';
import { ATMOSPHERE_DEFAULT_RADIUS_FACTOR } from '../utilities/consts';

type AtmosphereSubtype = PlanetTypeEnum | MoonTypeEnum;

/** Which population a body is rolled from — moons and dwarfs hold on to less atmosphere. */
export type AtmosphereBodyKind = 'planet' | 'dwarf' | 'moon';

/** A body's atmosphere, relative to its own size so it survives radius changes. */
export interface IAtmosphereProfile {
    /** Atmosphere outer radius as a multiple of the body's radius (> 1). */
    radiusFactor: number;
    /** Surface pressure in bar (> 0). Cloud-top pressure for gas/ice giants. */
    surfacePressureBar: number;
}

/** Chance a planet of each subtype has an atmosphere at all. */
const ATMOSPHERE_CHANCE: Record<string, number> = {
    [PlanetTypeEnum.GasGiant]: 1.0,
    [PlanetTypeEnum.IceGiant]: 1.0,
    [PlanetTypeEnum.Temperate]: 1.0,
    [PlanetTypeEnum.Ocean]: 0.9,
    [PlanetTypeEnum.Terrestrial]: 0.55,
    [PlanetTypeEnum.Volcanic]: 0.5,
    [PlanetTypeEnum.Desert]: 0.4,
    [PlanetTypeEnum.Frozen]: 0.35,
};
/** Moons use the planet table scaled by this (Temperate moons still always have one). */
const MOON_ATMOSPHERE_CHANCE_MULTIPLIER = 0.6;
/** Dwarf planets rarely hold an atmosphere, whatever their subtype. */
const DWARF_ATMOSPHERE_CHANCE = 0.1;

/** Log-uniform surface pressure range in bar, per subtype. */
const PRESSURE_RANGE_BAR: Record<string, [number, number]> = {
    [PlanetTypeEnum.Temperate]: [0.5, 3],
    [PlanetTypeEnum.Ocean]: [0.5, 5],
    [PlanetTypeEnum.Terrestrial]: [0.05, 3],
    [PlanetTypeEnum.Desert]: [0.005, 1],
    [PlanetTypeEnum.Volcanic]: [1, 100],
    [PlanetTypeEnum.Frozen]: [0.01, 2],
    // Giants: pressure at the mesh surface, which is the visible cloud tops above the 1-bar level.
    [PlanetTypeEnum.GasGiant]: [0.1, 0.5],
    [PlanetTypeEnum.IceGiant]: [0.05, 0.3],
};
const DWARF_PRESSURE_RANGE_BAR: [number, number] = [1e-5, 0.01];

/** Jitter applied around ATMOSPHERE_DEFAULT_RADIUS_FACTOR. */
const RADIUS_FACTOR_JITTER = 0.02;

/** Subtypes that always have an atmosphere — the Add/Edit panel hides the checkbox for these. */
export function subtypeForcesAtmosphere(subtype: AtmosphereSubtype | string): boolean {
    return (
        subtype === PlanetTypeEnum.Temperate ||
        subtype === PlanetTypeEnum.GasGiant ||
        subtype === PlanetTypeEnum.IceGiant
    );
}

function atmosphereChance(subtype: AtmosphereSubtype, kind: AtmosphereBodyKind): number {
    if (subtypeForcesAtmosphere(subtype)) return 1.0;
    if (kind === 'dwarf') return DWARF_ATMOSPHERE_CHANCE;
    const base = ATMOSPHERE_CHANCE[subtype] ?? 0;
    return kind === 'moon' ? base * MOON_ATMOSPHERE_CHANCE_MULTIPLIER : base;
}

function logUniform(rng: SeededRandom, [min, max]: [number, number]): number {
    return Math.exp(rng.range(Math.log(min), Math.log(max)));
}

/** Rolls the pressure and radius for a body already known to have an atmosphere. */
export function rollAtmosphereValues(
    rng: SeededRandom,
    subtype: AtmosphereSubtype,
    kind: AtmosphereBodyKind
): IAtmosphereProfile {
    const range =
        kind === 'dwarf' && !subtypeForcesAtmosphere(subtype)
            ? DWARF_PRESSURE_RANGE_BAR
            : (PRESSURE_RANGE_BAR[subtype] ?? PRESSURE_RANGE_BAR[PlanetTypeEnum.Terrestrial]!);

    return {
        radiusFactor:
            ATMOSPHERE_DEFAULT_RADIUS_FACTOR +
            rng.range(-RADIUS_FACTOR_JITTER, RADIUS_FACTOR_JITTER),
        surfacePressureBar: logUniform(rng, range),
    };
}

/** Rolls whether the body has an atmosphere and, if so, its pressure and radius. */
export function rollAtmosphereProfile(
    rng: SeededRandom,
    subtype: AtmosphereSubtype,
    kind: AtmosphereBodyKind
): IAtmosphereProfile | null {
    if (!rng.chance(atmosphereChance(subtype, kind))) return null;
    return rollAtmosphereValues(rng, subtype, kind);
}

/** Deterministic per-body roll, keyed to the body id. */
export function rollAtmosphereProfileForId(
    id: string,
    subtype: AtmosphereSubtype,
    kind: AtmosphereBodyKind
): IAtmosphereProfile | null {
    return rollAtmosphereProfile(new SeededRandom(`${id}|atmosphere-profile`), subtype, kind);
}

/** Minimum pressure a user-supplied atmosphere is clamped to — an atmosphere is never 0 bar. */
const MIN_SURFACE_PRESSURE_BAR = 1e-5;

/** Clamps user-supplied values so the rules (radius > body, pressure > 0) always hold. */
export function sanitizeAtmosphereProfile(profile: IAtmosphereProfile): IAtmosphereProfile {
    return {
        radiusFactor: Number.isFinite(profile.radiusFactor)
            ? Math.max(1.001, profile.radiusFactor)
            : ATMOSPHERE_DEFAULT_RADIUS_FACTOR,
        surfacePressureBar: Number.isFinite(profile.surfacePressureBar)
            ? Math.max(MIN_SURFACE_PRESSURE_BAR, profile.surfacePressureBar)
            : MIN_SURFACE_PRESSURE_BAR,
    };
}

/**
 * Resolves a body's atmosphere: undefined rolls one (seeded by id), null means "no atmosphere",
 * and an object is used after sanitizing. Subtypes that always have an atmosphere ignore a null
 * override.
 */
export function resolveAtmosphereProfile(
    override: IAtmosphereProfile | null | undefined,
    id: string,
    subtype: AtmosphereSubtype,
    kind: AtmosphereBodyKind
): IAtmosphereProfile | null {
    if (override === undefined) return rollAtmosphereProfileForId(id, subtype, kind);
    if (override === null) {
        if (!subtypeForcesAtmosphere(subtype)) return null;
        return rollAtmosphereValues(new SeededRandom(`${id}|atmosphere-profile`), subtype, kind);
    }
    return sanitizeAtmosphereProfile(override);
}
