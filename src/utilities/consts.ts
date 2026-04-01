// Constants - Real-world scale ratios (Earth = 100 mass, 2000 distance, 8 radius)
export const SCALE_FACTOR = 1;

export const G = 1;

export const EARTH_MASS = 100 * SCALE_FACTOR; // Base mass unit
export const EARTH_DIST = 21850 * SCALE_FACTOR; // Base distance unit (from Sun)
export const EARTH_RADIUS = 8 * SCALE_FACTOR;

export const SUN_MASS = 33300000 * SCALE_FACTOR; // 333,000 × Earth
export const SUN_RADIUS = 874 * SCALE_FACTOR; // 109.2 × Earth radius

export const MERCURY_MASS = 5.5 * SCALE_FACTOR; // 0.055 × Earth
export const MERCURY_RADIUS = 3.06 * SCALE_FACTOR; // 0.383 × Earth
export const VENUS_MASS = 81.5 * SCALE_FACTOR; // 0.815 × Earth
export const VENUS_RADIUS = 7.6 * SCALE_FACTOR; // 0.950 × Earth
export const MARS_MASS = 10.7 * SCALE_FACTOR; // 0.107 × Earth
export const MARS_RADIUS = 4.26 * SCALE_FACTOR; // 0.532 × Earth
export const MOON_MASS = 1.23 * SCALE_FACTOR; // 0.0123 × Earth
export const MOON_RADIUS = 2.18 * SCALE_FACTOR; // 0.273 × Earth
export const JUPITER_MASS = 31780 * SCALE_FACTOR; // 317.8 × Earth
export const JUPITER_RADIUS = 87.76 * SCALE_FACTOR; // 10.97 × Earth
export const IO_MASS = 1.5 * SCALE_FACTOR; // 0.015 × Earth
export const IO_RADIUS = 2.28 * SCALE_FACTOR; // 0.286 × Earth
export const EUROPA_MASS = 0.8 * SCALE_FACTOR; // 0.008 × Earth
export const EUROPA_RADIUS = 1.96 * SCALE_FACTOR; // 0.245 × Earth
export const GANYMEDE_MASS = 2.48 * SCALE_FACTOR; // 0.0248 × Earth
export const GANYMEDE_RADIUS = 3.31 * SCALE_FACTOR; // 0.413 × Earth
export const CALLISTO_MASS = 1.8 * SCALE_FACTOR; // 0.018 × Earth
export const CALLISTO_RADIUS = 3.02 * SCALE_FACTOR; // 0.378 × Earth
export const SATURN_MASS = 9520 * SCALE_FACTOR; // 95.2 × Earth
export const SATURN_RADIUS = 73.12 * SCALE_FACTOR; // 9.14 × Earth
export const URANUS_MASS = 1450 * SCALE_FACTOR; // 14.5 × Earth
export const URANUS_RADIUS = 31.84 * SCALE_FACTOR; // 3.98 × Earth
export const NEPTUNE_MASS = 1710 * SCALE_FACTOR; // 17.1 × Earth
export const NEPTUNE_RADIUS = 30.88 * SCALE_FACTOR; // 3.86 × Earth
export const PLUTO_MASS = 0.218 * SCALE_FACTOR; // 0.00218 × Earth
export const PLUTO_RADIUS = 1.49 * SCALE_FACTOR; // 0.186 × Earth

export const MERCURY_DIST = 8522 * SCALE_FACTOR; // 0.39 AU
export const VENUS_DIST = 15732 * SCALE_FACTOR; // 0.72 AU
export const MARS_DIST = 33212 * SCALE_FACTOR; // 1.52 AU
export const MOON_DIST_FROM_EARTH = 55 * SCALE_FACTOR; // 0.00257 AU
export const JUPITER_DIST = 113620 * SCALE_FACTOR; // 5.2 AU
export const IO_DIST_FROM_JUPITER = 518 * SCALE_FACTOR; // 5.9 × Jupiter radius (real-world ratio)
export const EUROPA_DIST_FROM_JUPITER = 825 * SCALE_FACTOR; // 9.4 × Jupiter radius
export const GANYMEDE_DIST_FROM_JUPITER = 1316 * SCALE_FACTOR; // 15.0 × Jupiter radius
export const CALLISTO_DIST_FROM_JUPITER = 2308 * SCALE_FACTOR; // 26.3 × Jupiter radius
export const SATURN_DIST = 208400 * SCALE_FACTOR; // 9.54 AU
export const URANUS_DIST = 419400 * SCALE_FACTOR; // 19.19 AU
export const NEPTUNE_DIST = 656780 * SCALE_FACTOR; // 30.07 AU
export const PLUTO_DIST = 862600 * SCALE_FACTOR;
export const COMET_PERIHELION_DIST = 38238 * SCALE_FACTOR; // Just outside Mars (scaled)
export const COMET_APHELION_DIST = 273125 * SCALE_FACTOR; // Scaled
export const COMET_RADIUS = 3 * SCALE_FACTOR;

export const ASTEROID_SPAWN_MIN_DIST = 50000 * SCALE_FACTOR;
export const ASTEROID_SPAWN_MAX_DIST = 300000 * SCALE_FACTOR;

// Preset asteroids
export const CERES_MASS = 0.09 * SCALE_FACTOR;
export const CERES_DISTANCE = 67735 * SCALE_FACTOR;
export const CERES_RADIUS = 3 * SCALE_FACTOR;
export const VESTA_MASS = 0.06 * SCALE_FACTOR;
export const VESTA_DISTANCE = 35300 * SCALE_FACTOR;
export const VESTA_RADIUS = 2 * SCALE_FACTOR;
export const PALLAS_MASS = 0.05 * SCALE_FACTOR;
export const PALLAS_DISTANCE = 41400 * SCALE_FACTOR;
export const PALLAS_RADIUS = 1.8 * SCALE_FACTOR;
export const HYGIEA_MASS = 0.04 * SCALE_FACTOR;
export const HYGIEA_DISTANCE = 78660 * SCALE_FACTOR;
export const HYGIEA_RADIUS = 1.5 * SCALE_FACTOR;

// Kuiper Belt parameters
export const KUIPER_BELT_COUNT = 12000; // Number of objects to simulate in Kuiper Belt
export const KUIPER_BELT_INNER_DIST = NEPTUNE_DIST;
export const KUIPER_BELT_OUTER_DIST = PLUTO_DIST + 300000 * SCALE_FACTOR;
export const KUIPER_BELT_VERTICAL_SPREAD = 50000 * SCALE_FACTOR;

export const SHADOW_MAP_SIZE = 8192; // Increased shadow map size for better quality at large scale

// Minimum star mass: fraction of Sun mass (0.08 = ~minimum main-sequence red dwarf)
export const MIN_SOLAR_MASS_FACTOR = 0.08;
export const MIN_STAR_MASS = SUN_MASS * MIN_SOLAR_MASS_FACTOR;

export const GIZMO_TUNING = Object.freeze({
    // MUST match CoordinateGizmo.updateVelocityArrow()
    VELOCITY_ARROW_SCALE: 50,
});

export const GRAV_ARROW_SCALE = 15000;

export enum SimulationStartMode {
    Default = 0,
    Empty = 1,
}