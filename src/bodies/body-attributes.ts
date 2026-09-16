/**
 * Hidden/discoverable planetary science data (Phase 3.1). Kept free of THREE.js or
 * scene-specific references, matching the convention in body-enums.ts, so it can be
 * imported from pure procedural-generation modules without circular dependencies.
 */

/** Single-valued categorical attribute — a body has exactly one core type. */
export enum CoreTypeEnum {
    Molten = 'molten',
    Solid = 'solid',
    Metallic = 'metallic',
    Icy = 'icy',
    /** No solid surface — gas/ice giants. */
    GasFluid = 'gas_fluid',
    /** Loosely bound aggregate — small asteroids/comet nuclei. */
    RubblePile = 'rubble_pile',
}

/** OR'able bit flags. None(0) means "confirmed airless" — a discoverable fact, not "no data". */
export enum AtmosphericGasEnum {
    None = 0,
    Hydrogen = 1 << 0,
    Helium = 1 << 1,
    Nitrogen = 1 << 2,
    Oxygen = 1 << 3,
    CarbonDioxide = 1 << 4,
    Methane = 1 << 5,
    Ammonia = 1 << 6,
    SulfurDioxide = 1 << 7,
    Argon = 1 << 8,
    Ozone = 1 << 9,
    Neon = 1 << 10,
    WaterVapor = 1 << 11,
    CarbonMonoxide = 1 << 12,
}

/** OR'able bit flags for surface/subsurface material. Omitted entirely (not None) for
 *  bodies with no solid surface, such as gas/ice giants. */
export enum SoilCompositionEnum {
    None = 0,
    Silicates = 1 << 0,
    Iron = 1 << 1,
    Nickel = 1 << 2,
    Carbon = 1 << 3,
    WaterIce = 1 << 4,
    Sulfur = 1 << 5,
    Basalt = 1 << 6,
    IronOxide = 1 << 7,
    Gold = 1 << 8,
    Silicon = 1 << 9,
    Platinum = 1 << 10,
    Regolith = 1 << 11,
}

/** OR'able bit flags for surface/subsurface liquids. Omitted entirely (not None) for
 *  bodies with no solid surface, such as gas/ice giants. */
export enum LiquidCompositionEnum {
    None = 0,
    Water = 1 << 0,
    LiquidMethane = 1 << 1,
    LiquidEthane = 1 << 2,
    LiquidNitrogen = 1 << 3,
    LiquidAmmonia = 1 << 4,
    LiquidSulfur = 1 << 5,
    /** Concentrated salt/mineral solution rather than pure water — e.g. Ceres' subsurface reservoir. */
    Brine = 1 << 6,
}

/** OR'able bit flags for macroscopic surface life. */
export enum VegetationEnum {
    None = 0,
    Grass = 1 << 0,
    Trees = 1 << 1,
    Cacti = 1 << 2,
    Algae = 1 << 3,
    Fungus = 1 << 4,
    Moss = 1 << 5,
    Shrubs = 1 << 6,
    Kelp = 1 << 7,
}

/** Single-valued categorical attribute — a lifebearing body has exactly one biochemical
 *  basis. None means no life was found. */
export enum LifeformBaseEnum {
    None = 'none',
    CarbonBased = 'carbon_based',
    SiliconBased = 'silicon_based',
    MethaneBased = 'methane_based',
    BoraneBased = 'borane_based',
    AmmoniaBased = 'ammonia_based',
}

export interface IDiscoverableAttribute<T> {
    value: T;
    discovered: boolean;
}

/**
 * A body's hidden science data. All fields are optional so any CelestialBody subtype can
 * carry zero or more attributes (e.g. gas giants omit soilComposition entirely).
 *
 * orbitalPeriod/rotationPeriod carry no `value` — those numbers are always derived live from
 * the physics simulation via CelestialBody.getOrbitalPeriod()/getRotationPeriod(); `discovered`
 * here only gates whether CelestialBody.getDiscoveredOrbitalPeriod()/getDiscoveredRotationPeriod()
 * return a value or null.
 */
export interface IPlanetaryAttributes {
    coreType?: IDiscoverableAttribute<CoreTypeEnum>;
    atmosphericComposition?: IDiscoverableAttribute<AtmosphericGasEnum>;
    soilComposition?: IDiscoverableAttribute<SoilCompositionEnum>;
    liquidComposition?: IDiscoverableAttribute<LiquidCompositionEnum>;
    averageTemperatureKelvin?: IDiscoverableAttribute<number>;
    vegetation?: IDiscoverableAttribute<VegetationEnum>;
    sentientLife?: IDiscoverableAttribute<boolean>;
    lifeformBase?: IDiscoverableAttribute<LifeformBaseEnum>;
    orbitalPeriod?: { discovered: boolean };
    rotationPeriod?: { discovered: boolean };
}
