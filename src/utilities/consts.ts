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
    Procedural = 3,
}

// === Particle Alpha Range for Accretion Disk & Siphon Effects ===
export const MIN_PARTICLE_ALPHA = 0.8;
export const MAX_PARTICLE_ALPHA = 1.0;

// === Simulation Scale and Physics Constants ===
export const SCALE_FACTOR = 1;
export const G_SCALE = 1//10000000;
// Tuned so that SUN_MASS = 33,000,000 exactly
export const MASS_SCALE = 6.025757575757576e22;
export const RADIUS_SCALE = 100;
export const DIST_SCALE = 100;
// 1. Keep the physically-derived base time scale
export const BASE_TIME_SCALE = Math.sqrt(DIST_SCALE ** 3 / MASS_SCALE);
// 2. Choose a user multiplier so that at warp 1, dt matches the old behavior
export const USER_TIME_MULTIPLIER = 1 / BASE_TIME_SCALE;
// 3. Final TIME_SCALE used in dt
export const TIME_SCALE = BASE_TIME_SCALE * USER_TIME_MULTIPLIER; // ≈ 1
export const G = 6.6743e-20 * (MASS_SCALE / DIST_SCALE ** 3) * SCALE_FACTOR * G_SCALE; //0.00408; // 6.67430e-20; // km^3 / kg / s^2 //
export const C = (299792.458 / DIST_SCALE) * SCALE_FACTOR; // * Math.sqrt(G_SCALE) Speed of light in vacuum (units/s)

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

// === Planetary System: Rotation Axis (degrees) ===
export const SUN_AXIS = 7.25;
export const MERCURY_AXIS = 0.034;
export const VENUS_AXIS = 177.4;
export const EARTH_AXIS = 23.44;
export const MARS_AXIS = 25.19;
export const JUPITER_AXIS = 3.13;
export const SATURN_AXIS = 26.73;
export const URANUS_AXIS = 97.77;
export const NEPTUNE_AXIS = 28.32;
export const PLUTO_AXIS = 119.61;

// === Planetary System: Real Orbital Periods (seconds) ===
export const MERCURY_ORBITAL_PERIOD_REAL = 87.969 * 24 * 3600; // days to seconds
export const VENUS_ORBITAL_PERIOD_REAL = 224.701 * 24 * 3600;
export const EARTH_ORBITAL_PERIOD_REAL = 365.256 * 24 * 3600;
export const MARS_ORBITAL_PERIOD_REAL = 686.98 * 24 * 3600;
export const JUPITER_ORBITAL_PERIOD_REAL = 4332.59 * 24 * 3600;
export const SATURN_ORBITAL_PERIOD_REAL = 10759.22 * 24 * 3600;
export const URANUS_ORBITAL_PERIOD_REAL = 30685.4 * 24 * 3600;
export const NEPTUNE_ORBITAL_PERIOD_REAL = 60190.03 * 24 * 3600;
export const PLUTO_ORBITAL_PERIOD_REAL = 90560 * 24 * 3600;

// === Planetary System: Per-planet Time Scale Factors ===
// S_time = T_real / T_sim, where T_sim = 2 * PI * r_sim / sqrt(G * M_sun / r_sim)
export function calcSimOrbitalPeriod(r_sim: number, G: number, M_sun: number): number {
    // T_sim = 2 * PI * sqrt(r_sim^3 / (G * M_sun))
    return 2 * Math.PI * Math.sqrt(Math.pow(r_sim, 3) / (G * M_sun));
}

export const SUN_TIME_SCALE = 1;
export const MERCURY_TIME_SCALE =
    MERCURY_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(MERCURY_DIST, G, SUN_MASS);
export const VENUS_TIME_SCALE =
    VENUS_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(VENUS_DIST, G, SUN_MASS);
export const EARTH_TIME_SCALE =
    EARTH_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(EARTH_DIST, G, SUN_MASS);
export const MARS_TIME_SCALE =
    MARS_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(MARS_DIST, G, SUN_MASS);
export const JUPITER_TIME_SCALE =
    JUPITER_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(JUPITER_DIST, G, SUN_MASS);
export const SATURN_TIME_SCALE =
    SATURN_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(SATURN_DIST, G, SUN_MASS);
export const URANUS_TIME_SCALE =
    URANUS_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(URANUS_DIST, G, SUN_MASS);
export const NEPTUNE_TIME_SCALE =
    NEPTUNE_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(NEPTUNE_DIST, G, SUN_MASS);
export const PLUTO_TIME_SCALE =
    PLUTO_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(PLUTO_DIST, G, SUN_MASS);

// === Sun: Rotation Speed ===
export const SUN_ROT_SPEED = ((2 * Math.PI) / (25.38 * 3600)) * SUN_TIME_SCALE; // ~2.86e-6 radians/sec
// === Planetary System: Rotation Speed (radians/sec, scaled for simulation) ===
// Angular speed = 2 * PI / (sidereal day in seconds), then scaled by per-planet time scale
export const MERCURY_ROT_SPEED = ((2 * Math.PI) / (1407.5 * 3600)) * MERCURY_TIME_SCALE; // ~1.24e-6
export const VENUS_ROT_SPEED = ((-2 * Math.PI) / (5832.5 * 3600)) * VENUS_TIME_SCALE; // ~-2.98e-7 (retrograde)
export const EARTH_ROT_SPEED = ((2 * Math.PI) / (23.934 * 3600)) * EARTH_TIME_SCALE; // ~7.29e-5
export const MARS_ROT_SPEED = ((2 * Math.PI) / (24.623 * 3600)) * MARS_TIME_SCALE; // ~7.09e-5
export const JUPITER_ROT_SPEED = ((2 * Math.PI) / (9.925 * 3600)) * JUPITER_TIME_SCALE; // ~1.76e-4
export const SATURN_ROT_SPEED = ((2 * Math.PI) / (10.656 * 3600)) * SATURN_TIME_SCALE; // ~1.64e-4
export const URANUS_ROT_SPEED = ((-2 * Math.PI) / (17.24 * 3600)) * URANUS_TIME_SCALE; // ~-1.01e-4 (retrograde)
export const NEPTUNE_ROT_SPEED = ((2 * Math.PI) / (16.11 * 3600)) * NEPTUNE_TIME_SCALE; // ~1.08e-4
export const PLUTO_ROT_SPEED = ((-2 * Math.PI) / (153.3 * 3600)) * PLUTO_TIME_SCALE; // ~-1.14e-5 (retrograde)

// === Spaceship: Mass ===
export const SPACESHIP_MASS = (75000 / MASS_SCALE) * SCALE_FACTOR;

// === Spaceship: Radius ===
export const SPACESHIP_RADIUS = (0.037 / RADIUS_SCALE) * SCALE_FACTOR;

// === Satellites: Mass ===
export const ISS_MASS = (419725 / MASS_SCALE) * SCALE_FACTOR;

// === Satellites: Radius ===
export const ISS_RADIUS = (0.1 / RADIUS_SCALE) * SCALE_FACTOR;

// === Satellites: Inclination ===
export const ISS_INCLINATION = 51.64;

// === Satellites: Distance from Earth ===
export const ISS_DIST_FROM_EARTH = (EARTH_RADIUS + 410 / DIST_SCALE) * SCALE_FACTOR;

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

// == Asteroids: Axial Tilt ===
export const CERES_AXIS = 4.0;

// === Asteroids: Rotation ===
export const CERES_ROT_SPEED = ((2 * Math.PI) / (9.074 * 3600)) * SUN_TIME_SCALE; // ~1.92e-4

// === Comet (Halley): Mass, Radius, Distance ===
// Halley's Comet: 2.2e14 kg
export const COMET_MASS = (2.2e14 / MASS_SCALE) * SCALE_FACTOR;
export const COMET_RADIUS = (11 / RADIUS_SCALE) * SCALE_FACTOR;
export const COMET_PERIHELION_DIST = (88000000 / DIST_SCALE) * SCALE_FACTOR;
export const COMET_APHELION_DIST = (5250000000 / DIST_SCALE) * SCALE_FACTOR;

// === Flight tuning constants ===
export const FLIGHT_MAX_SPEED = C * 0.01; // normal max speed cap (units/s) of light speed, chosen to allow for a good sense of speed while still leaving room for boost and warp speeds above it
export const FLIGHT_BOOST_MAX_SPEED = C * 1; // boost ceiling = 5x light speed
export const FLIGHT_THRUST_ACCEL = FLIGHT_MAX_SPEED * 0.1; // acceleration rate while W/S held (u/s²)
export const FLIGHT_THRUST_DECEL = FLIGHT_MAX_SPEED * 0.1; // deceleration rate while W/S held (u/s²)
export const FLIGHT_BOOST_ACCEL = FLIGHT_BOOST_MAX_SPEED * 0.1; // acceleration rate while Shift held (u/s²)
export const FLIGHT_BOOST_DECEL = FLIGHT_BOOST_MAX_SPEED * 0.1; // decel rate after boost ends (u/s²)
export const FLIGHT_WARP_SPEED = C * 100; // top warp speed (u/s) — FLIGHT_BOOST_MAX_SPEED already contains SCALE_FACTOR
export const FLIGHT_WARP_DECEL = FLIGHT_WARP_SPEED * 0.5; // decel rate after warp ends (u/s²)
/** Camera distance (u) at which the warp tunnel is still fully opaque. */
export const WARP_FULL_VIS_DIST = 50 * SCALE_FACTOR;
/** Camera distance (u) at which the warp tunnel has fully faded out. */
export const WARP_FADE_DIST = 200 * SCALE_FACTOR;
/** Peak camera shake displacement (u) applied each frame during warp. */
export const WARP_SHAKE_MAG = 0.002 * SPACESHIP_RADIUS; // No scale factor here; shake is in camera-local space so should feel consistent at all scales.

// === Miscellaneous & Simulation Parameters ===
export const ASTEROID_SPAWN_MIN_DIST = 50000 * SCALE_FACTOR;
export const ASTEROID_SPAWN_MAX_DIST = 300000 * SCALE_FACTOR;
export const KUIPER_BELT_COUNT = 12000;
export const KUIPER_BELT_INNER_DIST = (4500000000 / DIST_SCALE) * SCALE_FACTOR; // 4,500,000,000 km
export const KUIPER_BELT_OUTER_DIST = (7500000000 / DIST_SCALE) * SCALE_FACTOR; // 7,500,000,000 km
export const KUIPER_BELT_VERTICAL_SPREAD = (100000000 / DIST_SCALE) * SCALE_FACTOR; // 100,000,000 km
export const SHADOW_MAP_SIZE = 8192;

// Star light intensity bounds (used for procedural stars + custom star creation)
export const STAR_LIGHT_INTENSITY_MIN = 200_000_000;
export const STAR_LIGHT_INTENSITY_MAX = 4_000_000_000;

export const BROWN_DWARF_MASS_THRESHOLD = SUN_MASS * 0.08;
export const MIN_NEUTRON_STAR_MASS = SUN_MASS * 1.4;
export const MAX_NEUTRON_STAR_MASS = SUN_MASS * 3;
export const MIN_BLACK_HOLE_MASS = SUN_MASS * 3;
export const GIZMO_TUNING = Object.freeze({ VELOCITY_ARROW_SCALE: 50 });
export const GRAV_ARROW_SCALE = 15000;

// === UI / HUD (canvas + helper geometry) ===
/** FPS sprite + other HUD assets use tuned scale; keep consistent with index.ts. */
export const CROSSHAIR_SIZE = 10; // half-arm length in screen pixels

// Velocity HUD tuning
export const VEL_SCALE = 546; // visual speed-to-arrow scaling (used for velocity normalization/snap)
export const VEL_ARC_SEGMENTS = 64;
export const VEL_ARC_COLOR = 0x00ff00;
export const VEL_ARC_OPACITY = 0.25;
export const VEL_ARC_ACTIVE_OPACITY = 0.35;
export const VEL_ARC_LINEWIDTH_PX = 22;
export const VEL_ARC_TIP_RADIUS_MIN = 80;
export const VEL_ARC_TIP_RADIUS_MAX = 1200;

// === Simulation / integration timing ===
/** Base frame dt used for physics integration (approx 60fps). */
export const BASE_FRAME_DT = 0.016;

// === Flight feel + steering tuning (used by index.ts runtime logic) ===
export const FLIGHT_PERP_DECAY = 0.5; // per second
export const FLIGHT_MAX_POINTER_OFFSET = 260; // pixels before reaching full turn rate
export const FLIGHT_MAX_TURN_RATE = 0.6; // radians/s at full pointer deflection
export const FLIGHT_ROLL_SPEED = 2.0; // max roll angular velocity (rad/s)
export const FLIGHT_ROLL_ACCEL = 0.4; // how fast roll ramps up (rad/s²)
export const FLIGHT_ROLL_FRICTION = 0.4; // how fast roll decays when key released (rad/s²)
export const FLIGHT_STEER_SMOOTHING = 0.004; // lerp factor per frame — lower = heavier feel
export const FLIGHT_STEER_DEADZONE = 0.05; // normalised dead zone (0–1)
export const FLIGHT_WARP_CHARGE_TIME = 2.0; // seconds to hold Space before warp engages

export const FLIGHT_MAX_BANK_ANGLE = 0.35; // max visual roll angle (rad)
export const FLIGHT_MAX_BANK_PITCH = 0.2; // max visual pitch angle (rad)
export const FLIGHT_BANK_LERP_RATE = 0.08; // per-frame lerp factor for banking animation

// === Autopilot tuning constants (derived from flight tuning) ===
// u/s
export const AUTOPILOT_APPROACH_SPEED = FLIGHT_MAX_SPEED;

/** Thrust acceleration used by autopilot during approach (u/s²). */
export const AUTOPILOT_ACCEL = FLIGHT_THRUST_ACCEL;
/** Braking deceleration — moderate so the stop feels gradual rather than jarring. */
export const AUTOPILOT_DECEL = FLIGHT_THRUST_DECEL;
/** High deceleration rate used to scrub boost speed quickly during approach. */
export const AUTOPILOT_BOOST_DECEL = FLIGHT_BOOST_DECEL;

/** Orbit-insertion rate — gentler than AUTOPILOT_DECEL so the turn into orbit is smooth. */
export const AUTOPILOT_CIRCULARIZE_RATE = 1.1 * SCALE_FACTOR;
/** Gravity-derived floor multiplier for circularize velocity rotation rate. */
export const AUTOPILOT_CIRCULARIZE_GRAVITY_MARGIN = 4 * SCALE_FACTOR;

/** Safety pad multiplier on brake distance. Must be ≥ 1.5 for smoothstep blend tracking. */
export const AUTOPILOT_BRAKE_PAD = 2.0;

/** Target orbit altitude expressed as a multiple of the target body's radius. */
export const AUTOPILOT_ORBIT_ALTITUDE_FACTOR = 1.5;

/** Relative-speed threshold at which BRAKE hands off to CIRCULARIZE (u/s). */
export const AUTOPILOT_BRAKE_DONE_SPEED = 2 * SCALE_FACTOR;

/** Maximum timeScale at which autopilot may engage. Above this it refuses with a warning. */
export const AUTOPILOT_MAX_TIMESCALE = 50;
/** Duration (seconds) to show the "Stable Orbit" HUD notification. */
export const AUTOPILOT_ORBIT_NOTIFY_DURATION = 3.0;
/** Duration (seconds) to show the "Autopilot blocked" HUD notification. */
export const AUTOPILOT_BLOCKED_NOTIFY_DURATION = 2.5;

/** Threshold distance for switching from boost to normal approach decel. */
export const AUTOPILOT_BOOST_THRESHOLD =
    1.5 *
    ((FLIGHT_BOOST_MAX_SPEED * FLIGHT_BOOST_MAX_SPEED - AUTOPILOT_APPROACH_SPEED * AUTOPILOT_APPROACH_SPEED) /
        (2 * AUTOPILOT_BOOST_DECEL) +
        (AUTOPILOT_APPROACH_SPEED * AUTOPILOT_APPROACH_SPEED) / (2 * AUTOPILOT_DECEL));

/** Deceleration rate used to scrub warp speed during autopilot approach. */
export const AUTOPILOT_WARP_DECEL = FLIGHT_WARP_DECEL;

/** Minimum runway (u) that APPROACH needs to safely brake from normal speed to a stop. */
export const AUTOPILOT_APPROACH_MIN_DISTANCE =
    AUTOPILOT_BRAKE_PAD *
    (((AUTOPILOT_APPROACH_SPEED + AUTOPILOT_BRAKE_DONE_SPEED) *
        (AUTOPILOT_APPROACH_SPEED + AUTOPILOT_BRAKE_DONE_SPEED)) /
        (2 * AUTOPILOT_DECEL));

/** Target arc length (u) for the BRAKE blend. */
export const AUTOPILOT_BRAKE_ARC_DIST = AUTOPILOT_APPROACH_SPEED * 10;

/** Distance (u) above which autopilot engages warp for fast transit. */
export const AUTOPILOT_WARP_THRESHOLD =
    1.5 *
        ((FLIGHT_WARP_SPEED * FLIGHT_WARP_SPEED - FLIGHT_BOOST_MAX_SPEED * FLIGHT_BOOST_MAX_SPEED) /
            (2 * AUTOPILOT_WARP_DECEL)) +
    AUTOPILOT_BOOST_THRESHOLD;

// === Ship weapon tuning ===
/**
 * Base bolt speed added on top of the ship's current speed (units/s).
 * Effective relative speed = min(WEAPON_MAX_SPEED, WEAPON_BASE_SPEED + shipSpeed).
 * Bolts are always exactly WEAPON_BASE_SPEED faster than the ship in camera space —
 * so you can never outrun them, and the feel scales linearly with your velocity.
 */
export const WEAPON_BASE_SPEED = FLIGHT_MAX_SPEED * 1.1;
/**
 * Hard cap on bolt relative speed (units/s).
 * Prevents bolts becoming sub-pixel at boost / warp speeds.
 * Defaults to 10× normal max speed.
 */
export const WEAPON_MAX_SPEED = FLIGHT_MAX_SPEED * 10;
/** Seconds a projectile lives before fizzling out. */
export const WEAPON_PARTICLE_LIFETIME = 4.0;
/**
 * Visual bolt length (world units).  Each shot is a fixed-length line segment;
 * the tail always sits exactly WEAPON_BOLT_LENGTH behind the head.
 * ~40 ship radii gives a clearly visible streak at minimum fire speed.
 */
export const WEAPON_BOLT_LENGTH = SPACESHIP_RADIUS * 40;
/** Hex colour of weapon bolts. */
export const WEAPON_PARTICLE_COLOR = 0x00eeff;
/** World-space size (units) of the glowing point at each bolt head.
 *  Uses sizeAttenuation=true — perspective-correct, so distant bolts appear smaller.
 *  Increase the multiplier to keep bolts visible at greater range. */
export const WEAPON_BOLT_HEAD_SIZE = SPACESHIP_RADIUS * 2400;
/** Maximum projectiles fired per second. */
export const WEAPON_FIRE_RATE = 4;
/** HP damage dealt to a body on each bolt impact. */
export const WEAPON_DAMAGE = 1;

// === Body health points ===
/**
 * Multiplier applied to a body's mass to compute its initial health points.
 *   healthPoints = mass * HP_MASS_MULTIPLIER
 * With WEAPON_DAMAGE = 1 this gives roughly:
 *   - Comet    ~0 HP  → destroyed in 1 shot
 *   - Ceres    ~1.5 HP → destroyed in 1-2 shots
 *   - Moon     ~122 HP
 *   - Earth    ~9 900 HP
 *   - Sun      ~3.3 billion HP (practically indestructible)
 */
export const HP_MASS_MULTIPLIER = 100;
