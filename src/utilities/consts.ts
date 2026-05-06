// === Global Performance Settings ===
/**
 * Controls whether particle effects are rendered.
 * When false, effects fall back to simpler line-based representations.
 * Mutated directly by the UI; imported by effect classes.
 */
export const performanceSettings = {
    particleEffectsEnabled: true,
};

export enum SimulationStartMode {
    Default = 0,
    Empty = 1,
    BlackHole = 2,
}

// === Particle Alpha Range for Accretion Disk & Siphon Effects ===
export const MIN_PARTICLE_ALPHA = 0.7;
export const MAX_PARTICLE_ALPHA = 1.0;

// === Simulation Scale and Physics Constants ===
export const SCALE_FACTOR = 1;
export const DIST_SCALE = 10000;
export const RADIUS_SCALE = 1000;
export const G = 0.00408;

// === Planetary System: Mass ===
export const SUN_MASS = 32980000 * SCALE_FACTOR;
export const MERCURY_MASS = 5.47 * SCALE_FACTOR;
export const VENUS_MASS = 80.7 * SCALE_FACTOR;
export const EARTH_MASS = 99.0 * SCALE_FACTOR;
export const MOON_MASS = 1.22 * SCALE_FACTOR;
export const MARS_MASS = 10.6 * SCALE_FACTOR;
export const JUPITER_MASS = 31480 * SCALE_FACTOR;
export const IO_MASS = 1.48 * SCALE_FACTOR;
export const EUROPA_MASS = 0.796 * SCALE_FACTOR;
export const GANYMEDE_MASS = 2.45 * SCALE_FACTOR;
export const CALLISTO_MASS = 1.79 * SCALE_FACTOR;
export const SATURN_MASS = 9430 * SCALE_FACTOR;
export const URANUS_MASS = 1440 * SCALE_FACTOR;
export const NEPTUNE_MASS = 1700 * SCALE_FACTOR;
export const PLUTO_MASS = 0.217 * SCALE_FACTOR;

// === Planetary System: Radius ===
export const SUN_RADIUS = (696340 / RADIUS_SCALE) * SCALE_FACTOR;
export const MERCURY_RADIUS = (2439.7 / RADIUS_SCALE) * SCALE_FACTOR;
export const VENUS_RADIUS = (6051.8 / RADIUS_SCALE) * SCALE_FACTOR;
export const EARTH_RADIUS = (6371.0 / RADIUS_SCALE) * SCALE_FACTOR;
export const MOON_RADIUS = (1737.4 / RADIUS_SCALE) * SCALE_FACTOR;
export const MARS_RADIUS = (3389.5 / RADIUS_SCALE) * SCALE_FACTOR;
export const JUPITER_RADIUS = (69911 / RADIUS_SCALE) * SCALE_FACTOR;
export const IO_RADIUS = (1821.6 / RADIUS_SCALE) * SCALE_FACTOR;
export const EUROPA_RADIUS = (1560.8 / RADIUS_SCALE) * SCALE_FACTOR;
export const GANYMEDE_RADIUS = (2634.1 / RADIUS_SCALE) * SCALE_FACTOR;
export const CALLISTO_RADIUS = (2410.3 / RADIUS_SCALE) * SCALE_FACTOR;
export const SATURN_RADIUS = (58232 / RADIUS_SCALE) * SCALE_FACTOR;
export const URANUS_RADIUS = (25362 / RADIUS_SCALE) * SCALE_FACTOR;
export const NEPTUNE_RADIUS = (24622 / RADIUS_SCALE) * SCALE_FACTOR;
export const PLUTO_RADIUS = (1188.3 / RADIUS_SCALE) * SCALE_FACTOR;

// === Planetary System: Distance ===
export const MERCURY_DIST = (57910000 / DIST_SCALE) * SCALE_FACTOR;
export const VENUS_DIST = (108200000 / DIST_SCALE) * SCALE_FACTOR;
export const EARTH_DIST = (149600000 / DIST_SCALE) * SCALE_FACTOR;
export const MOON_DIST_FROM_EARTH = (384400 / DIST_SCALE) * SCALE_FACTOR;
export const MARS_DIST = (227940000 / DIST_SCALE) * SCALE_FACTOR;
export const JUPITER_DIST = (778330000 / DIST_SCALE) * SCALE_FACTOR;
export const IO_DIST_FROM_JUPITER = (421700 / DIST_SCALE) * SCALE_FACTOR;
export const EUROPA_DIST_FROM_JUPITER = (671100 / DIST_SCALE) * SCALE_FACTOR;
export const GANYMEDE_DIST_FROM_JUPITER = (1070400 / DIST_SCALE) * SCALE_FACTOR;
export const CALLISTO_DIST_FROM_JUPITER = (1882700 / DIST_SCALE) * SCALE_FACTOR;
export const SATURN_DIST = (1429400000 / DIST_SCALE) * SCALE_FACTOR;
export const URANUS_DIST = (2870990000 / DIST_SCALE) * SCALE_FACTOR;
export const NEPTUNE_DIST = (4504000000 / DIST_SCALE) * SCALE_FACTOR;
export const PLUTO_DIST = (5906380000 / DIST_SCALE) * SCALE_FACTOR;

// === Asteroids: Mass ===
export const CERES_MASS = 0.0156 * SCALE_FACTOR;
export const VESTA_MASS = 0.00429 * SCALE_FACTOR;
export const PALLAS_MASS = 0.00350 * SCALE_FACTOR;
export const HYGIEA_MASS = 0.00144 * SCALE_FACTOR;

// === Asteroids: Radius ===
export const CERES_RADIUS = (473 / RADIUS_SCALE) * SCALE_FACTOR;
export const VESTA_RADIUS = (262.7 / RADIUS_SCALE) * SCALE_FACTOR;
export const PALLAS_RADIUS = (256 / RADIUS_SCALE) * SCALE_FACTOR;
export const HYGIEA_RADIUS = (215 / RADIUS_SCALE) * SCALE_FACTOR;

// === Asteroids: Distance ===
export const CERES_DISTANCE = (413700000 / DIST_SCALE) * SCALE_FACTOR;
export const VESTA_DISTANCE = (353400000 / DIST_SCALE) * SCALE_FACTOR;
export const PALLAS_DISTANCE = (414500000 / DIST_SCALE) * SCALE_FACTOR;
export const HYGIEA_DISTANCE = (470300000 / DIST_SCALE) * SCALE_FACTOR;

// === Comet (Halley): Mass, Radius, Distance ===
export const COMET_MASS = 3.65e-9 * SCALE_FACTOR;
export const COMET_RADIUS = (11 / RADIUS_SCALE) * SCALE_FACTOR;
export const COMET_PERIHELION_DIST = (88000000 / DIST_SCALE) * SCALE_FACTOR;
export const COMET_APHELION_DIST = (5250000000 / DIST_SCALE) * SCALE_FACTOR;

// === Miscellaneous & Simulation Parameters ===
export const ASTEROID_SPAWN_MIN_DIST = 50000 * SCALE_FACTOR;
export const ASTEROID_SPAWN_MAX_DIST = 300000 * SCALE_FACTOR;
export const KUIPER_BELT_COUNT = 12000;
export const KUIPER_BELT_INNER_DIST = (4500000000 / DIST_SCALE) * SCALE_FACTOR; // 4,500,000,000 km
export const KUIPER_BELT_OUTER_DIST = (7500000000 / DIST_SCALE) * SCALE_FACTOR; // 7,500,000,000 km
export const KUIPER_BELT_VERTICAL_SPREAD = (100000000 / DIST_SCALE) * SCALE_FACTOR; // 100,000,000 km
export const SHADOW_MAP_SIZE = 8192;
export const MIN_SOLAR_MASS_FACTOR = 0.08;
export const MIN_STAR_MASS = SUN_MASS * MIN_SOLAR_MASS_FACTOR;
export const BROWN_DWARF_MASS_THRESHOLD = SUN_MASS * 0.08;
export const MIN_NEUTRON_STAR_MASS = SUN_MASS * 1.4;
export const MAX_NEUTRON_STAR_MASS = SUN_MASS * 3;
export const MIN_BLACK_HOLE_MASS = SUN_MASS * 3;
export const GIZMO_TUNING = Object.freeze({ VELOCITY_ARROW_SCALE: 50 });
export const GRAV_ARROW_SCALE = 15000;
