/**
 * Defines enums for celestial body types and subtypes, used across the codebase to categorize and manage different kinds of bodies in the solar system simulator.
 * This file is intentionally kept free of any THREE.js or scene-specific references, so it can be imported in pure utility modules like body-params without circular dependencies.
 */
export enum BodyTypeEnum {
    None = 0,
    Star = 1 << 0,
    Planet = 1 << 1,
    Moon = 1 << 2,
    Asteroid = 1 << 3,
    Comet = 1 << 4,
    BlackHole = 1 << 5,
    GasGiant = 1 << 6,
    IceGiant = 1 << 7,
    DwarfPlanet = 1 << 8,
    WhiteDwarf = 1 << 9,
    SpaceShip = 1 << 10,
    BrownDwarf = 1 << 11,
    Pulsar = 1 << 12,
    Satellite = 1 << 13,
    Wormhole = 1 << 14,
    Probe = 1 << 15,
    /** The player on foot (surface mode). Integrated by the physics, never in the body list. */
    Player = 1 << 16,
}

/**
 * PlanetTypeEnum defines subtypes for planets, which can be used to determine texture choices and other characteristics.
 * These are not mutually exclusive flags, but rather distinct categories that a planet can belong to.
 * For example, a planet with bodyType Planet could have a subtype of 'gas_giant' or 'desert', which would influence its appearance and behavior in the simulation.
 */
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
 * (ocean/desert/frozen/volcanic/terrestrial/temperate) without ever needing gas/ice moon textures.
 */
export enum MoonTypeEnum {
    Terrestrial = 'solid',
    Temperate = 'temperate',
    Volcanic = 'volcanic',
    Ocean = 'ocean',
    Frozen = 'frozen',
    Desert = 'desert',
}

/**
 * Body-type keys used by the Add/Edit Body panel. Star through Wormhole are the types the custom
 * add form can create; DwarfPlanet and Other only appear on edit snapshots of existing bodies.
 */
export enum BodyTypeKeyEnum {
    Star = 'sun',
    Planet = 'planet',
    Moon = 'moon',
    Asteroid = 'asteroid',
    Comet = 'comet',
    BlackHole = 'black_hole',
    Wormhole = 'wormhole',
    /** Edit-only: never created by the add form. */
    DwarfPlanet = 'dwarf_planet',
    /** Edit-only: any body that maps to none of the other keys. */
    Other = 'other',
}

/** Orbit shape requested when a body is created from the add form. */
export enum OrbitTypeEnum {
    Circular = 'circular',
    Elliptical = 'elliptical',
    /** Star only: the new star and its parent star orbit their shared barycenter. */
    Binary = 'binary',
}

/** Keys of the real solar system bodies the add form can create as presets. */
export enum PresetBodyKeyEnum {
    Sun = 'sun',
    Mercury = 'mercury',
    Venus = 'venus',
    Earth = 'earth',
    Mars = 'mars',
    Jupiter = 'jupiter',
    Saturn = 'saturn',
    Uranus = 'uranus',
    Neptune = 'neptune',
    Pluto = 'pluto',
    Ceres = 'ceres',
    Vesta = 'vesta',
    Pallas = 'pallas',
    Hygiea = 'hygiea',
    Halley = 'halley',
    EarthMoon = 'earth_moon',
    Iss = 'iss',
    Io = 'io',
    Europa = 'europa',
    Ganymede = 'ganymede',
    Callisto = 'callisto',
    Titan = 'titan',
    Charon = 'charon',
}
