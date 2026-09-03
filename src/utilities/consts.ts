export enum SimulationStartMode {
    Default = 0,
    Empty = 1,
    BlackHole = 2,
    Procedural = 3,
    /** Scenario: a bare star plus one AI-piloted ship, for testing ship AI. */
    TestAiShips = 4,
}

// === Particle Alpha Range for Accretion Disk & Siphon Effects ===
export const MIN_PARTICLE_ALPHA = 0.8;
export const MAX_PARTICLE_ALPHA = 1.0;

// === Simulation Scale and Physics Constants ===
export const SCALE_FACTOR = 1;
export const G_SCALE = 1; //10000000;
// Tuned so that SUN_MASS = 33,000,000 exactly
export const MASS_SCALE = 6.025757575757576e22;
export const RADIUS_SCALE = 100;
export const DIST_SCALE = 100;

// === Free Camera Movement Speeds ===
// WASD normal speed and shift-boost speed, scaled proportionally to DIST_SCALE
// so camera feel remains consistent if the world scale changes.
export const FREE_CAM_NORMAL_SPEED = 10 / DIST_SCALE; // 10 u/s at default DIST_SCALE=100
export const FREE_CAM_BOOST_SPEED = 10000 / DIST_SCALE; // 10000 u/s at default DIST_SCALE=100

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

// === Planetary System: Rotation Azimuth (degrees) ===
// Direction the north pole points within the orbital (ecliptic) plane, derived from the IAU
// north-pole right ascension (α₀) and declination (δ₀) converted to ecliptic coordinates.
// Mapping: azimuth = (ecliptic longitude of pole) − 270°  (mod 360°)
// At azimuth=0 the tilt faces +Z; azimuth=90 faces +X (vernal equinox direction).
// Source: IAU 2015 Cartographic Coordinates and Rotational Elements.
export const SUN_AZIMUTH = 76; // IAU α₀=286.13°, δ₀= 63.87° → λ_pole≈346°
export const MERCURY_AZIMUTH = 48; // IAU α₀=281.01°, δ₀= 61.45° → λ_pole≈318°
export const VENUS_AZIMUTH = 119; // IAU α₀=272.76°, δ₀= 67.16° → λ_pole≈  29°
export const EARTH_AZIMUTH = 180; // IAU α₀=  0.00°, δ₀= 90.00° → λ_pole≈  90°
export const MARS_AZIMUTH = 83; // IAU α₀=317.68°, δ₀= 52.89° → λ_pole≈353°
export const JUPITER_AZIMUTH = 23; // IAU α₀=268.06°, δ₀= 64.50° → λ_pole≈293°
export const SATURN_AZIMUTH = 171; // IAU α₀= 40.59°, δ₀= 83.54° → λ_pole≈  81°
export const URANUS_AZIMUTH = 348; // IAU α₀=257.31°, δ₀=-15.18° → λ_pole≈258°
export const NEPTUNE_AZIMUTH = 49; // IAU α₀=299.36°, δ₀= 43.46° → λ_pole≈319°
export const PLUTO_AZIMUTH = 227; // IAU α₀=132.99°, δ₀= -6.16° → λ_pole≈137°
export const CERES_AZIMUTH = 101; // IAU α₀=291.42°, δ₀= 66.76° → λ_pole≈  11°

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
// Used by individual body classes to compute rotation speed at construction time,
// accounting for the effective G (including gMultiplier) via dependencies.getG().
export function calcSimOrbitalPeriod(r_sim: number, G: number, M_sun: number): number {
    // T_sim = 2 * PI * sqrt(r_sim^3 / (G * M_sun))
    return 2 * Math.PI * Math.sqrt(Math.pow(r_sim, 3) / (G * M_sun));
}

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

// === Asteroids: Orbital Period ===
export const CERES_ORBITAL_PERIOD_REAL = 1682.0 * 24 * 3600; // ~4.607 Earth years in seconds

// === Comet (Halley): Mass, Radius, Distance ===
// Halley's Comet: 2.2e14 kg
export const COMET_MASS = (2.2e14 / MASS_SCALE) * SCALE_FACTOR;
export const COMET_RADIUS = (11 / RADIUS_SCALE) * SCALE_FACTOR;
export const COMET_PERIHELION_DIST = (88000000 / DIST_SCALE) * SCALE_FACTOR;
export const COMET_APHELION_DIST = (5250000000 / DIST_SCALE) * SCALE_FACTOR;

/** Camera distance (u) at which the warp tunnel is still fully opaque. */
export const WARP_FULL_VIS_DIST = 50 * SCALE_FACTOR;
/** Camera distance (u) at which the warp tunnel has fully faded out. */
export const WARP_FADE_DIST = 200 * SCALE_FACTOR;
/** Peak camera shake displacement (u) applied each frame during warp. */
export const WARP_SHAKE_MAG = 0.002; // No scale factor here; shake is in camera-local space so should feel consistent at all scales.

// === Miscellaneous & Simulation Parameters ===
export const KUIPER_BELT_COUNT = 12000;
export const KUIPER_BELT_INNER_DIST = (4500000000 / DIST_SCALE) * SCALE_FACTOR; // 4,500,000,000 km
export const KUIPER_BELT_OUTER_DIST = (7500000000 / DIST_SCALE) * SCALE_FACTOR; // 7,500,000,000 km
export const KUIPER_BELT_VERTICAL_SPREAD = (100000000 / DIST_SCALE) * SCALE_FACTOR; // 100,000,000 km

// === Star Light ===
/** The DIST_SCALE at which the base light intensity values below were tuned. */
export const LIGHT_INTENSITY_REFERENCE_DIST_SCALE = 100;
/** Point-light decay exponent. decay=2 would be the physical inverse-square law;
 *  0.45 is tuned for the visual model. */
export const STAR_LIGHT_DECAY = 0.45; // Tuned for model

// Base light intensity values, tuned at DIST_SCALE = LIGHT_INTENSITY_REFERENCE_DIST_SCALE.
const BASE_SUN_LIGHT_INTENSITY = 10_000;
const BASE_STAR_LIGHT_INTENSITY_MIN = 1_000;
const BASE_STAR_LIGHT_INTENSITY_MAX = 15_000;

/**
 * Multiplier that keeps a star's punctual-light irradiance constant as
 * DIST_SCALE changes. Irradiance ∝ intensity × distance^(-decay), and every
 * distance scales by (reference / DIST_SCALE), so intensity must scale by
 * (reference / DIST_SCALE)^decay to leave the scene identically lit.
 */
export const STAR_LIGHT_SCALE = Math.pow(
    LIGHT_INTENSITY_REFERENCE_DIST_SCALE / DIST_SCALE,
    STAR_LIGHT_DECAY
);

export const SUN_LIGHT_INTENSITY = BASE_SUN_LIGHT_INTENSITY * STAR_LIGHT_SCALE;

// Star light intensity bounds (used for procedural stars + custom star creation)
export const STAR_LIGHT_INTENSITY_MIN = BASE_STAR_LIGHT_INTENSITY_MIN * STAR_LIGHT_SCALE;
export const STAR_LIGHT_INTENSITY_MAX = BASE_STAR_LIGHT_INTENSITY_MAX * STAR_LIGHT_SCALE;
export const STAR_LIGHT_DISTANCE = PLUTO_DIST + 10_000_000_000 / DIST_SCALE;

// ─── Lens Flare element sizes ──────────────────────────────────────────────
export const LENSFLARE_STARBURST_SIZE = 128;
export const LENSFLARE_CORE_SIZE = 75;
export const LENSFLARE_HALO_SIZE = 250;
export const LENSFLARE_CARDINAL_SPIKE_LENGTH = 0.46;
export const LENSFLARE_CARDINAL_SPIKE_WIDTH = 0.02;
export const LENSFLARE_DIAGONAL_SPIKE_LENGTH = 0.32;
export const LENSFLARE_DIAGONAL_SPIKE_WIDTH = 0.015;

// ─── Lens Flare starburst flicker ──────────────────────────────────────────
/** Peak size perturbation of the starburst as a fraction of its base size (±4%). */
export const LENSFLARE_STARBURST_FLICKER_AMPLITUDE = 0.04;
/** Primary flicker rate (rad/s) — slow shimmer dominant term. */
export const LENSFLARE_STARBURST_FLICKER_FREQ_A = 3.0;
/** Secondary flicker rate (rad/s) — incommensurate with A so the shimmer never repeats. */
export const LENSFLARE_STARBURST_FLICKER_FREQ_B = 7.3;

export const BROWN_DWARF_MASS_THRESHOLD = SUN_MASS * 0.08;
export const MIN_NEUTRON_STAR_MASS = SUN_MASS * 1.4;
export const MAX_NEUTRON_STAR_MASS = SUN_MASS * 3;
export const MIN_BLACK_HOLE_MASS = SUN_MASS * 3;
export const BLACK_HOLE_RADIUS_PER_SOL = (2.95 / RADIUS_SCALE) * SCALE_FACTOR; // Base radius for a black hole of mass MIN_BLACK_HOLE_MASS
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

// Orbit prediction rendering / quality
export const ORBIT_PREDICTION_LINEWIDTH_PX = 2.5;
export const ORBIT_PREDICTION_BASE_SEGMENTS = 512;
export const ORBIT_PREDICTION_MAX_SEGMENTS = 2048;
export const ORBIT_PREDICTION_HIGH_E_THRESHOLD = 0.6;

// === Simulation / integration timing ===
/** Reference frame duration (approx 60fps) that the substep count is calibrated against; actual dt is derived from measured wall-clock time. */
export const BASE_FRAME_DT = 0.016;
/** Hard cap on physics substeps per rendered frame, bounding worst-case CPU cost during a lag spike combined with high time-warp. */
export const MAX_SUBSTEPS_PER_FRAME = 512;
/** EMA factor (0-1) used to smooth measured frame delta; higher reacts faster but lets more raw rAF jitter through. */
export const WALL_DT_SMOOTHING = 0.08;

// === Flight controls ===
export const FLIGHT_MAX_POINTER_OFFSET = 260; // pixels before reaching full turn rate
export const FLIGHT_AUTOPILOT_CHARGE_TIME = 1.0; // seconds to hold E over a body before autopilot engages

/** Mouse sensitivity for ALT-key orbit camera mode (radians per pixel). */
export const FLIGHT_ALT_ORBIT_SENSITIVITY = 0.005;
/** Return speed (rad/s) at which ALT orbit yaw/pitch lerp back to zero on release. */
export const FLIGHT_ALT_ORBIT_RETURN_SPEED = 6.0;
/** Pitch clamp limits (radians) for ALT orbit — keeps camera in upper hemisphere (half-sphere). */
export const FLIGHT_ALT_ORBIT_PITCH_MIN = -60 * (Math.PI / 180); // 60° below ship equator
export const FLIGHT_ALT_ORBIT_PITCH_MAX = 80 * (Math.PI / 180); // 80° above ship equator
/** Yaw clamp limit (radians) for ALT orbit — limits horizontal range to a half-sphere (±90°). */
export const FLIGHT_ALT_ORBIT_YAW_MAX = 90 * (Math.PI / 180); // 90° left or right of rear

// === Autopilot tuning constants (derived from flight tuning) ===
// u/s

/** Orbit-insertion rate — gentler than FLIGHT_THRUST_DECEL so the turn into orbit is smooth. */
export const AUTOPILOT_CIRCULARIZE_RATE = 1.1 * SCALE_FACTOR;
/** Gravity-derived floor multiplier for circularize velocity rotation rate. */
export const AUTOPILOT_CIRCULARIZE_GRAVITY_MARGIN = 4 * SCALE_FACTOR;

/** Safety pad multiplier on brake distance. Must be ≥ 1.5 for smoothstep blend tracking. */
export const AUTOPILOT_BRAKE_PAD = 2.0;

/** Target orbit altitude expressed as a multiple of the target body's radius. */
export const AUTOPILOT_ORBIT_ALTITUDE_FACTOR = 1.5;

/** Relative-speed threshold at which BRAKE hands off to CIRCULARIZE (u/s). */
export const AUTOPILOT_BRAKE_DONE_SPEED = 2 * SCALE_FACTOR;
/** Duration (seconds) to show the "Stable Orbit" HUD notification. */
export const AUTOPILOT_ORBIT_NOTIFY_DURATION = 3.0;
/** Duration (seconds) to show the "Autopilot blocked" HUD notification. */
export const AUTOPILOT_BLOCKED_NOTIFY_DURATION = 2.5;

// (AUTOPILOT_BOOST_THRESHOLD, AUTOPILOT_APPROACH_MIN_DISTANCE, AUTOPILOT_BRAKE_ARC_DIST,
//  AUTOPILOT_WARP_THRESHOLD, AUTOPILOT_WARP_ACCEL, and AUTOPILOT_WARP_DECEL are now computed
//  at runtime from the ship's handling object via Spaceship getters.)

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

// === Wormhole tuning ===
/** Default mouth (gate) radius for a newly created wormhole, in sim units. */
export const WORMHOLE_DEFAULT_RADIUS = EARTH_RADIUS * 1.5;
/** Visual length of the swirling funnel/tail effect, as a multiple of the mouth radius. */
export const WORMHOLE_FUNNEL_LENGTH_FACTOR = 1.2;
/** Number of pooled particles in the funnel vortex effect. */
export const WORMHOLE_FUNNEL_PARTICLE_COUNT = 25000;
/** Distance (as a multiple of exit radius) a teleported body is pushed clear of the exit mouth. */
export const WORMHOLE_EMERGE_BUFFER_FACTOR = 1.5;

// === Wormhole link bridge (bezier particle curve between linked funnels) ===
/** Number of pooled particles flowing along a linked-wormhole bridge curve. */
export const WORMHOLE_BRIDGE_PARTICLE_COUNT = 4000;
/** Bridge tube radius as a multiple of the smaller linked wormhole's mouth radius. */
export const WORMHOLE_BRIDGE_TUBE_RADIUS_FACTOR = 0.22;
/** Bézier control-point length as a multiple of the funnel-tip-to-tip distance. */
export const WORMHOLE_BRIDGE_CONTROL_FACTOR = 0.35;
/** Mean flow speed along the bridge in sim units per second (normalised by curve length). */
export const WORMHOLE_BRIDGE_FLOW_SPEED = C;
/** Angular speed (rad/s) of the swirling motion around the bridge axis. */
export const WORMHOLE_BRIDGE_SWIRL_SPEED = 1.2 * 0.25;
/** Rings sampled along the glowing bridge tube (also drives the particle curve params). */
export const WORMHOLE_BRIDGE_TUBE_SEGMENTS = 1024;
/** Vertices around each ring of the glowing bridge tube. */
export const WORMHOLE_BRIDGE_TUBE_RADIAL_SEGMENTS = 12;

// Set the Z position slightly above 0 for linux systems
export const TEXT_SPRITE_Z = 0.01;

// === Ship AI (NPC controllers) ===
/** Station-keeping distance for the follow AI: 5,000 km expressed in sim units. */
export const NPC_FOLLOW_DISTANCE = 5000 / DIST_SCALE;
/** Half-width of the follow AI's slack zone around NPC_FOLLOW_DISTANCE, as a fraction
 *  of that distance. The commanded speed ramps up from zero at the edge of this zone
 *  rather than switching on at it, so station-keeping settles instead of limit-cycling. */
export const NPC_FOLLOW_DEAD_BAND = 0.2;
/** Angular error (radians) at which an AI applies full steering deflection.
 *  Smaller values make AI ships steer more aggressively off-axis. */
export const AI_STEER_FULL_DEFLECTION_ANGLE = Math.PI / 6;
/** Maximum off-axis angle (radians) at which an AI will still apply forward thrust.
 *  Beyond this the ship only turns, so it never accelerates sideways. */
export const AI_THRUST_ALIGN_ANGLE = Math.PI / 6;
/** Proportional gain converting distance error (u) into a desired closing speed (u/s). */
export const AI_FOLLOW_APPROACH_GAIN = 0.5;
/** Closing-speed tolerance, as a fraction of the larger of the ship's normal max speed
 *  and the currently commanded speed. Inside this band the AI coasts rather than pulsing
 *  thrust or brake; scaling it with the command keeps high-speed runs from chattering. */
export const AI_CLOSING_SPEED_TOLERANCE = 0.02;
/** Safety factor applied to the runway an AI assumes it has for braking. Values above 1
 *  make it commit to its approach speed more conservatively, trading arrival time for
 *  less overshoot. */
export const AI_APPROACH_SAFETY_PAD = 1.5;
/** How far above normal max speed the commanded speed must reach before an AI engages
 *  boost. Boost is then held until the command falls back below normal max speed, so the
 *  gap between the two thresholds is the hysteresis that stops boost from flickering. */
export const AI_BOOST_ENGAGE_FACTOR = 1.25;
/** Distance from the primary star at which the starting NPC ship spawns, expressed
 *  as a multiple of that star's radius. Scaling off the star (rather than using a
 *  fixed distance) keeps the ship safely outside the corona for procedural stars of
 *  any size, while staying close to where the camera frames the star on launch. */
export const NPC_SPAWN_STAR_RADII = 12;
/** Fallback spawn distance (sim units) when the system has no star to orbit. */
export const NPC_SPAWN_FALLBACK_DISTANCE = 5000000 / DIST_SCALE;

// === Ship AI obstacle avoidance ===
/** Hazard sphere around an ordinary body, as a multiple of its radius. Matches
 *  AUTOPILOT_ORBIT_ALTITUDE_FACTOR — the standoff the autopilot already treats as safe. */
export const AI_AVOID_HAZARD_FACTOR = 1.3;
/** Hazard sphere around a star or black hole, as a multiple of its radius. Wider than the
 *  ordinary factor because a corona or accretion disk kills well outside the rendered surface,
 *  and because gravity bends the flight path most sharply exactly here — the straight-ray
 *  corridor test is least accurate around the bodies it most matters for. */
export const AI_AVOID_STAR_HAZARD_FACTOR = 1.5;
/** How far ahead (in seconds of travel at the current speed) an AI looks for obstacles. */
export const AI_AVOID_LOOKAHEAD_TIME = 6;
/** Decision intervals of headroom folded into the lookahead. AI controllers run once per
 *  rendered frame on wall-clock time while the world advances by wall dt × time scale, so at
 *  high warp a ship covers enormous ground between two decisions. Without this term the
 *  lookahead is shorter than a single decision interval and the ship flies blind into things. */
export const AI_AVOID_DECISION_MARGIN = 3;
/** Angular margin (radians) added past the geometric tangent of a hazard, so the ship aims to
 *  clear the sphere rather than graze it. */
export const AI_AVOID_CLEARANCE_ANGLE = Math.PI / 18;
/** Extra angular margin (radians) the direct path must clear before an AI gives up on a detour
 *  it has already committed to. This is pure hysteresis: without it a ship releases the moment
 *  it is nominally clear, turns straight back toward whatever it was avoiding, immediately
 *  re-engages, and weaves at the obstacle instead of arcing around it. */
export const AI_AVOID_RELEASE_ANGLE = Math.PI / 36;
/** Seconds-to-surface below which an AI abandons whatever it was doing and flies directly away
 *  from the hazard. Braking alone is not enough this late — the ship has to thrust out. */
export const AI_AVOID_PANIC_TIME = 2;
