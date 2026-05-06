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
export const SCALE_FACTOR = 2;
// Tuned so that SUN_MASS = 33,000,000 exactly
export const MASS_SCALE = 6.025757575757576e22;
export const RADIUS_SCALE = 1000;
export const DIST_SCALE = 1000;
export const G = 0.00408;
export const C = (299792.458 / DIST_SCALE) * SCALE_FACTOR; // Speed of light in vacuum (units/s)

// === Planetary System: Mass ===
// Masses use: (real-world mass in kg / MASS_SCALE) * SCALE_FACTOR
export const SUN_MASS = (1.9885e30 / MASS_SCALE) * SCALE_FACTOR;
export const MERCURY_MASS = (3.3011e23 / MASS_SCALE) * SCALE_FACTOR;
export const VENUS_MASS = (4.8675e24 / MASS_SCALE) * SCALE_FACTOR;
export const EARTH_MASS = (5.97237e24 / MASS_SCALE) * SCALE_FACTOR;
export const MOON_MASS = (7.342e22 / MASS_SCALE) * SCALE_FACTOR;
export const MARS_MASS = (6.4171e23 / MASS_SCALE) * SCALE_FACTOR;
export const JUPITER_MASS = (1.8982e27 / MASS_SCALE) * SCALE_FACTOR;
export const IO_MASS = (8.9319e22 / MASS_SCALE) * SCALE_FACTOR;
export const EUROPA_MASS = (4.7998e22 / MASS_SCALE) * SCALE_FACTOR;
export const GANYMEDE_MASS = (1.4819e23 / MASS_SCALE) * SCALE_FACTOR;
export const CALLISTO_MASS = (1.0759e23 / MASS_SCALE) * SCALE_FACTOR;
export const SATURN_MASS = (5.6834e26 / MASS_SCALE) * SCALE_FACTOR;
export const URANUS_MASS = (8.681e25 / MASS_SCALE) * SCALE_FACTOR;
export const NEPTUNE_MASS = (1.02413e26 / MASS_SCALE) * SCALE_FACTOR;
export const PLUTO_MASS = (1.303e22 / MASS_SCALE) * SCALE_FACTOR;

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
export const CERES_MASS = (9.393e20 / MASS_SCALE) * SCALE_FACTOR;
export const VESTA_MASS = (2.59076e20 / MASS_SCALE) * SCALE_FACTOR;
export const PALLAS_MASS = (2.04e20 / MASS_SCALE) * SCALE_FACTOR;
export const HYGIEA_MASS = (8.32e19 / MASS_SCALE) * SCALE_FACTOR;

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
// Halley's Comet: 2.2e14 kg
export const COMET_MASS = (2.2e14 / MASS_SCALE) * SCALE_FACTOR;
export const COMET_RADIUS = (11 / RADIUS_SCALE) * SCALE_FACTOR;
export const COMET_PERIHELION_DIST = (88000000 / DIST_SCALE) * SCALE_FACTOR;
export const COMET_APHELION_DIST = (5250000000 / DIST_SCALE) * SCALE_FACTOR;

// === Flight tuning constants ===
export const FLIGHT_MAX_SPEED = C / 2; // normal max speed cap (units/s) 50% of light speed, chosen to allow for a good sense of speed while still leaving room for boost and warp speeds above it
export const FLIGHT_BOOST_MAX_SPEED = 10 * FLIGHT_MAX_SPEED; // boost ceiling = 100× normal max speed
export const FLIGHT_THRUST_ACCEL = FLIGHT_MAX_SPEED / 10; // acceleration rate while W/S held (u/s²)
export const FLIGHT_THRUST_DECEL = FLIGHT_MAX_SPEED / 10; // deceleration rate while W/S held (u/s²)
export const FLIGHT_BOOST_ACCEL = FLIGHT_BOOST_MAX_SPEED / 10; // acceleration rate while Shift held (u/s²)
export const FLIGHT_BOOST_DECEL = FLIGHT_BOOST_MAX_SPEED / 10; // decel rate after boost ends (u/s²)
export const FLIGHT_WARP_SPEED = 100 * FLIGHT_BOOST_MAX_SPEED; // top warp speed (u/s) — FLIGHT_BOOST_MAX_SPEED already contains SCALE_FACTOR
export const FLIGHT_WARP_DECEL = FLIGHT_WARP_SPEED / 2; // decel rate after warp ends (u/s²)
/** Camera distance (u) at which the warp tunnel is still fully opaque. */
export const WARP_FULL_VIS_DIST = 50 * SCALE_FACTOR;
/** Camera distance (u) at which the warp tunnel has fully faded out. */
export const WARP_FADE_DIST = 200 * SCALE_FACTOR;
/** Peak camera shake displacement (u) applied each frame during warp. */
export const WARP_SHAKE_MAG = 0.002; // No scale factor here; shake is in camera-local space so should feel consistent at all scales.

// === Miscellaneous & Simulation Parameters ===
export const ASTEROID_SPAWN_MIN_DIST = 50000 * SCALE_FACTOR;
export const ASTEROID_SPAWN_MAX_DIST = 300000 * SCALE_FACTOR;
export const KUIPER_BELT_COUNT = 12000;
export const KUIPER_BELT_INNER_DIST = (4500000000 / DIST_SCALE) * SCALE_FACTOR; // 4,500,000,000 km
export const KUIPER_BELT_OUTER_DIST = (7500000000 / DIST_SCALE) * SCALE_FACTOR; // 7,500,000,000 km
export const KUIPER_BELT_VERTICAL_SPREAD = (100000000 / DIST_SCALE) * SCALE_FACTOR; // 100,000,000 km
export const SHADOW_MAP_SIZE = 8192;
export const BROWN_DWARF_MASS_THRESHOLD = SUN_MASS * 0.08;
export const MIN_NEUTRON_STAR_MASS = SUN_MASS * 1.4;
export const MAX_NEUTRON_STAR_MASS = SUN_MASS * 3;
export const MIN_BLACK_HOLE_MASS = SUN_MASS * 3;
export const GIZMO_TUNING = Object.freeze({ VELOCITY_ARROW_SCALE: 50 });
export const GRAV_ARROW_SCALE = 15000;
