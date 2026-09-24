export enum SimulationStartMode {
    Default = 0,
    Empty = 1,
    BlackHole = 2,
    Procedural = 3,
    /** Scenario: a bare star plus one AI-piloted ship, for testing ship AI. */
    TestAiShips = 4,
    /** Scenario: Earth orbits the Sun but takes a linked-wormhole short-cut on a tighter ellipse. */
    WormholeShortcut = 5,
    /** Scenario: Earth (with its Moon) plows through a dense counter-orbiting asteroid field. */
    AsteroidField = 6,
    /** Scenario: the player defends Earth from continuous waves of incoming asteroids. */
    AsteroidDefense = 7,
    /** Scenario: the player defends Earth from a single onslaught of ~100 asteroids/comets. */
    ExtinctionEvent = 8,
}

// === Particle Alpha Range for Accretion Disk & Siphon Effects ===
export const MIN_PARTICLE_ALPHA = 0.8;
export const MAX_PARTICLE_ALPHA = 1.0;

// === Simulation Scale and Physics Constants ===
export const G_SCALE = 1; //10000000;
// Tuned so that SUN_MASS = 33,000,000 exactly
export const MASS_SCALE = 6.025757575757576e22;
export const RADIUS_SCALE = 100;
export const DIST_SCALE = 100;

// === Free Camera Movement Speeds ===
// WASD normal speed and shift-boost speed, scaled proportionally to DIST_SCALE
// so camera feel remains consistent if the world scale changes.
export const FREE_CAM_NORMAL_SPEED = 50 / DIST_SCALE; // 10 u/s at default DIST_SCALE=100
export const FREE_CAM_BOOST_SPEED = 500 / DIST_SCALE; // 10000 u/s at default DIST_SCALE=100

// 1. Keep the physically-derived base time scale
export const BASE_TIME_SCALE = Math.sqrt(DIST_SCALE ** 3 / MASS_SCALE);
// 2. Choose a user multiplier so that at warp 1, dt matches the old behavior
export const USER_TIME_MULTIPLIER = 1 / BASE_TIME_SCALE;
// 3. Final TIME_SCALE used in dt
export const TIME_SCALE = BASE_TIME_SCALE * USER_TIME_MULTIPLIER; // ≈ 1
export const G = 6.6743e-20 * (MASS_SCALE / DIST_SCALE ** 3) * G_SCALE; // km^3 / kg / s^2 //
export const C = 299792.458 / DIST_SCALE; // Speed of light

// === Planetary System: Mass ===
// Masses use: (real-world mass in kg / MASS_SCALE)
export const SUN_MASS = 1.9885e30 / MASS_SCALE;
export const MERCURY_MASS = 3.3011e23 / MASS_SCALE;
export const VENUS_MASS = 4.8675e24 / MASS_SCALE;
export const EARTH_MASS = 5.97237e24 / MASS_SCALE;
export const MOON_MASS = 7.342e22 / MASS_SCALE;
export const MARS_MASS = 6.4171e23 / MASS_SCALE;
export const JUPITER_MASS = 1.8982e27 / MASS_SCALE;
export const IO_MASS = 8.9319e22 / MASS_SCALE;
export const EUROPA_MASS = 4.7998e22 / MASS_SCALE;
export const GANYMEDE_MASS = 1.4819e23 / MASS_SCALE;
export const CALLISTO_MASS = 1.0759e23 / MASS_SCALE;
export const SATURN_MASS = 5.6834e26 / MASS_SCALE;
export const URANUS_MASS = 8.681e25 / MASS_SCALE;
export const NEPTUNE_MASS = 1.02413e26 / MASS_SCALE;
export const PLUTO_MASS = 1.303e22 / MASS_SCALE;

// === Planetary System: Radius ===
export const SUN_RADIUS = 696340 / RADIUS_SCALE;
export const MERCURY_RADIUS = 2439.7 / RADIUS_SCALE;
export const VENUS_RADIUS = 6051.8 / RADIUS_SCALE;
export const EARTH_RADIUS = 6371.0 / RADIUS_SCALE;
export const MOON_RADIUS = 1737.4 / RADIUS_SCALE;
export const MARS_RADIUS = 3389.5 / RADIUS_SCALE;
export const JUPITER_RADIUS = 69911 / RADIUS_SCALE;
export const IO_RADIUS = 1821.6 / RADIUS_SCALE;
export const EUROPA_RADIUS = 1560.8 / RADIUS_SCALE;
export const GANYMEDE_RADIUS = 2634.1 / RADIUS_SCALE;
export const CALLISTO_RADIUS = 2410.3 / RADIUS_SCALE;
export const SATURN_RADIUS = 58232 / RADIUS_SCALE;
export const URANUS_RADIUS = 25362 / RADIUS_SCALE;
export const NEPTUNE_RADIUS = 24622 / RADIUS_SCALE;
export const PLUTO_RADIUS = 1188.3 / RADIUS_SCALE;

// === Planetary System: Distance ===
export const MERCURY_DIST = 57910000 / DIST_SCALE;
export const VENUS_DIST = 108200000 / DIST_SCALE;
export const EARTH_DIST = 149600000 / DIST_SCALE;
export const MOON_DIST_FROM_EARTH = 384400 / DIST_SCALE;
export const MARS_DIST = 227940000 / DIST_SCALE;
export const JUPITER_DIST = 778330000 / DIST_SCALE;
export const IO_DIST_FROM_JUPITER = 421700 / DIST_SCALE;
export const EUROPA_DIST_FROM_JUPITER = 671100 / DIST_SCALE;
export const GANYMEDE_DIST_FROM_JUPITER = 1070400 / DIST_SCALE;
export const CALLISTO_DIST_FROM_JUPITER = 1882700 / DIST_SCALE;
export const SATURN_DIST = 1429400000 / DIST_SCALE;
export const URANUS_DIST = 2870990000 / DIST_SCALE;
export const NEPTUNE_DIST = 4498400000 / DIST_SCALE;
export const PLUTO_DIST = 5906380000 / DIST_SCALE;

// === Pluto: Orbital Elements (J2000) ===
// Pluto's orbit is the most eccentric and most inclined of the major bodies, so it is modelled
// from real orbital elements rather than the flat circular orbit used for the other planets.
// PLUTO_DIST above is the semi-major axis and equals (perihelion + aphelion) / 2.
export const PLUTO_PERIHELION_DIST = 4436820000 / DIST_SCALE; // 29.658 AU
export const PLUTO_APHELION_DIST = 7375930000 / DIST_SCALE; // 49.305 AU
export const PLUTO_INCLINATION = 17.16; // degrees, relative to the ecliptic
export const PLUTO_LONG_ASC_NODE = 110.299; // degrees, longitude of the ascending node (Ω)
export const PLUTO_ARG_PERIHELION = 113.834; // degrees, argument of perihelion (ω)
// Real mean anomaly at epoch is 14.53°, but the generator places Pluto at a random true anomaly
// instead, matching how the other planets and Halley are seeded.

// === Neptune: Orbital Elements (J2000) ===
// Neptune's orbit is far less exotic than Pluto's — eccentricity 0.0087 against Pluto's 0.25,
// and only 1.77° out of the ecliptic — but it is modelled from real orbital elements for the
// same reason: the flat circular orbit the other planets still use is a simplification, and
// those two small departures are what make Neptune's path its own rather than a perfect circle.
// NEPTUNE_DIST above is the semi-major axis and equals (perihelion + aphelion) / 2.
export const NEPTUNE_PERIHELION_DIST = 4459500000 / DIST_SCALE; // 29.81 AU
export const NEPTUNE_APHELION_DIST = 4537300000 / DIST_SCALE; // 30.33 AU
export const NEPTUNE_INCLINATION = 1.77; // degrees, relative to the ecliptic
export const NEPTUNE_LONG_ASC_NODE = 131.783; // degrees, longitude of the ascending node (Ω)
export const NEPTUNE_ARG_PERIHELION = 273.187; // degrees, argument of perihelion (ω)
// Real mean anomaly at epoch is 259.883°, but the generator places Neptune at a random true
// anomaly instead, matching how the other planets, Pluto and Halley are seeded.

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

// === Planetary System: Magnetic Fields ===
// Dipole parameters for the bodies with a global intrinsic magnetic field. Attribute-only data,
// consumed via IMagneticFieldOptions; nothing here is rendered directly.
//
// *_MAG_STRENGTH — surface equatorial dipole field strength, in gauss (Earth ≈ 0.305 G).
// *_MAG_TILT     — dipole tilt away from the body's own rotation axis, in degrees.
// *_MAG_OFFSET   — dipole-centre displacement from the body centre, as a fraction of radius.
// *_MAG_REVERSED — true when the dipole moment points opposite the rotation axis, as Earth's does.
// Strength, tilt, and offset are real published values.
//
// *_MAG_AZIMUTH is NOT a real measurement. A magnetic pole's longitude is epoch- and
// reference-frame-dependent, and this sim's azimuth is a rotation about world Y rather than a
// planetary longitude, so there is nothing meaningful to transcribe. These are plausible fixed
// values chosen so each body's field is stable and distinct from its neighbours.
//
// Venus, Mars, Pluto, Ceres, and the Moon are deliberately absent: they have no global dipole,
// and that absence is itself real data an aurora effect should respect.

// Mercury: very weak but genuinely global, and strongly offset toward the north pole.
export const MERCURY_MAG_STRENGTH = 0.003;
export const MERCURY_MAG_TILT = 0.03;
export const MERCURY_MAG_AZIMUTH = 0; // tilt ≈ 0, so azimuth has no visible effect
export const MERCURY_MAG_OFFSET = 0.2;
export const MERCURY_MAG_REVERSED = true; // same sense as Earth's

export const EARTH_MAG_STRENGTH = 0.305;
export const EARTH_MAG_TILT = 11.5;
export const EARTH_MAG_AZIMUTH = 288;
export const EARTH_MAG_OFFSET = 0.08;
export const EARTH_MAG_REVERSED = true; // geographic north is a magnetic south pole

export const JUPITER_MAG_STRENGTH = 4.17; // by far the strongest planetary field
export const JUPITER_MAG_TILT = 9.6;
export const JUPITER_MAG_AZIMUTH = 200;
export const JUPITER_MAG_OFFSET = 0.1;
export const JUPITER_MAG_REVERSED = false; // opposite sense to Earth's

// Saturn's dipole is almost perfectly aligned with its spin axis — unusually so.
export const SATURN_MAG_STRENGTH = 0.21;
export const SATURN_MAG_TILT = 0.01;
export const SATURN_MAG_AZIMUTH = 0;
export const SATURN_MAG_OFFSET = 0.04;
export const SATURN_MAG_REVERSED = false;

// Uranus and Neptune have wildly tilted, strongly offset fields — the reason their aurorae
// appear far from their geographic poles. Their REVERSED values are the least certain here:
// at these tilts the polarity convention is close to meaningless, so treat them as nominal.
export const URANUS_MAG_STRENGTH = 0.23;
export const URANUS_MAG_TILT = 58.6;
export const URANUS_MAG_AZIMUTH = 48;
export const URANUS_MAG_OFFSET = 0.31;
export const URANUS_MAG_REVERSED = false;

export const NEPTUNE_MAG_STRENGTH = 0.14;
export const NEPTUNE_MAG_TILT = 46.9;
export const NEPTUNE_MAG_AZIMUTH = 79;
export const NEPTUNE_MAG_OFFSET = 0.55; // the most extreme offset in the solar system
export const NEPTUNE_MAG_REVERSED = false;

// The Sun's large-scale dipole component. The real solar field is dominated by its active
// regions and flips every ~11 years; this is the smooth background dipole only.
export const SUN_MAG_STRENGTH = 1.0;
export const SUN_MAG_TILT = 7;
export const SUN_MAG_AZIMUTH = 0;
export const SUN_MAG_OFFSET = 0;
export const SUN_MAG_REVERSED = false;

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
export const ISS_MASS = 419725 / MASS_SCALE;

// === Satellites: Radius ===
export const ISS_RADIUS = 0.1 / RADIUS_SCALE;

// === Satellites: Inclination ===
export const ISS_INCLINATION = 51.64;

// === Satellites: Distance from Earth ===
export const ISS_DIST_FROM_EARTH = EARTH_RADIUS + 410 / DIST_SCALE;

// === Asteroids: Mass ===
export const CERES_MASS = 9.393e20 / MASS_SCALE;
export const VESTA_MASS = 2.59076e20 / MASS_SCALE;
export const PALLAS_MASS = 2.04e20 / MASS_SCALE;
export const HYGIEA_MASS = 8.32e19 / MASS_SCALE;

// === Asteroids: Radius ===
export const CERES_RADIUS = 473 / RADIUS_SCALE;
export const VESTA_RADIUS = 262.7 / RADIUS_SCALE;
export const PALLAS_RADIUS = 256 / RADIUS_SCALE;
export const HYGIEA_RADIUS = 215 / RADIUS_SCALE;

// === Asteroids: Distance ===
export const CERES_DISTANCE = 413700000 / DIST_SCALE;
export const VESTA_DISTANCE = 353400000 / DIST_SCALE;
export const PALLAS_DISTANCE = 414500000 / DIST_SCALE;
export const HYGIEA_DISTANCE = 470300000 / DIST_SCALE;

// == Asteroids: Axial Tilt ===
export const CERES_AXIS = 4.0;

// === Asteroids: Orbital Period ===
export const CERES_ORBITAL_PERIOD_REAL = 1682.0 * 24 * 3600; // ~4.607 Earth years in seconds

// === Comet (Halley): Mass, Radius, Distance ===
// Halley's Comet: 2.2e14 kg
export const COMET_MASS = 2.2e14 / MASS_SCALE;
export const COMET_RADIUS = 11 / RADIUS_SCALE;
export const COMET_PERIHELION_DIST = 88000000 / DIST_SCALE;
export const COMET_APHELION_DIST = 5250000000 / DIST_SCALE;

/** Camera distance (u) at which the warp tunnel is still fully opaque. */
export const WARP_FULL_VIS_DIST = 50;
/** Camera distance (u) at which the warp tunnel has fully faded out. */
export const WARP_FADE_DIST = 200;
/** Peak camera shake displacement (u) applied each frame during warp. */
export const WARP_SHAKE_MAG = 0.002; // No scale factor here; shake is in camera-local space so should feel consistent at all scales.

// === Miscellaneous & Simulation Parameters ===
export const KUIPER_BELT_COUNT = 12000;
export const KUIPER_BELT_INNER_DIST = 4500000000 / DIST_SCALE; // 4,500,000,000 km
export const KUIPER_BELT_OUTER_DIST = 7500000000 / DIST_SCALE; // 7,500,000,000 km
export const KUIPER_BELT_VERTICAL_SPREAD = 100000000 / DIST_SCALE; // 100,000,000 km

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
export const BLACK_HOLE_RADIUS_PER_SOL = 2.95 / RADIUS_SCALE; // Base radius for a black hole of mass MIN_BLACK_HOLE_MASS
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
/**
 * Exponential decay rate (1/sec) used to ease the camera toward a pending Smooth
 * Zoom target — either an orbit-mode target distance from the pivot, or a
 * free-camera dolly delta. Unlike WALL_DT_SMOOTHING, this IS framerate-
 * independent: each frame's blend factor is `1 - exp(-SMOOTH_ZOOM_DECAY_RATE *
 * wallDt)`, so the animation covers the same distance over the same wall-clock
 * time regardless of refresh rate (a fixed per-frame factor would instead finish
 * in the same number of frames, making it snap almost instantly at high FPS and
 * crawl in slow motion at low FPS). 8.5 reduces the remaining distance by ~95%
 * every ~350ms — tuned snappy, not a slow cinematic glide.
 */
export const SMOOTH_ZOOM_DECAY_RATE = 8.5;
/**
 * Orbit-mode Smooth Zoom: once the live distance is within this fraction of the
 * pending target distance, snap to it exactly and clear the pending zoom instead
 * of asymptotically crawling toward it forever.
 */
export const SMOOTH_ZOOM_DIST_EPSILON = 0.001;
/**
 * Free-camera-mode Smooth Zoom (dolly): once the remaining pending translation's
 * length drops below `camera.near * SMOOTH_ZOOM_FREE_CAM_STOP_MULT`, snap it to
 * zero and clear the pending zoom. Expressed as a multiple of camera.near (the
 * codebase's existing "smallest meaningful distance" unit) so it scales sanely
 * regardless of DIST_SCALE.
 */
export const SMOOTH_ZOOM_FREE_CAM_STOP_MULT = 50;

// === N-body force solver ===
/**
 * Plummer softening length in scaled distance units, added as `r² + SOFTENING_EPS²` to
 * every pair separation. Replaces the old hard `r < 0.01` cutoff, which was a force
 * discontinuity that could fling bodies on close approach. Kept far below any real orbital
 * separation so normal orbits are unaffected.
 */
export const SOFTENING_EPS = 0.01;
/**
 * Barnes-Hut opening angle. A node is accepted as a single point mass when
 * `nodeWidth / distance < BH_THETA`. Lower is more accurate and slower; 0 degenerates to
 * exact all-pairs.
 */
export const BH_THETA_DEFAULT = 0.5;
/** Hard depth cap on the Barnes-Hut octree, bounding subdivision when bodies are near-coincident. */
export const BH_MAX_DEPTH = 24;
/**
 * Mass threshold for the cutoff solver, as a fraction of the system's total mass. Bodies at
 * or above this are "significant" and interact exactly with each other; bodies below it feel
 * the significant bodies but not one another. At 1e-6 of total mass, a Sun-dominated system
 * classifies planets and moons as significant while asteroids and debris become tracers.
 */
export const CUTOFF_MASS_FRACTION = 1e-6;

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
export const AUTOPILOT_CIRCULARIZE_RATE = 1.1;
/** Gravity-derived floor multiplier for circularize velocity rotation rate. */
export const AUTOPILOT_CIRCULARIZE_GRAVITY_MARGIN = 4;

/** Safety pad multiplier on brake distance. Must be ≥ 1.5 for smoothstep blend tracking. */
export const AUTOPILOT_BRAKE_PAD = 2.0;

/** Target orbit altitude expressed as a multiple of the target body's radius. */
export const AUTOPILOT_ORBIT_ALTITUDE_FACTOR = 1.5;

/** Relative-speed threshold at which BRAKE hands off to CIRCULARIZE (u/s). */
export const AUTOPILOT_BRAKE_DONE_SPEED = 2;
/** Duration (seconds) to show the "Stable Orbit" HUD notification. */
export const AUTOPILOT_ORBIT_NOTIFY_DURATION = 3.0;
/** Duration (seconds) to show the "Autopilot blocked" HUD notification. */
export const AUTOPILOT_BLOCKED_NOTIFY_DURATION = 2.5;

/** Default fade-in duration (sim-seconds) for the scenario message banner. */
export const SCENARIO_MESSAGE_FADE_IN_SECONDS = 0.4;
/** Default hold duration (sim-seconds) for the scenario message banner. */
export const SCENARIO_MESSAGE_HOLD_SECONDS = 2.0;
/** Default fade-out duration (sim-seconds) for the scenario message banner. */
export const SCENARIO_MESSAGE_FADE_OUT_SECONDS = 0.8;

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
 * Collisions drain the same pool — see the collision damage constants below.
 */
export const HP_MASS_MULTIPLIER = 100;

/**
 * Fraction of a ship's maxShieldPoints below which a shield is treated as fully depleted.
 * Absorbs floating-point residue so a shield left at ~0 after a hit snaps to exactly 0.
 */
export const SHIELD_DEPLETED_EPSILON = 1e-6;

// === Collision damage ===
// Two colliding bodies each lose the same HP: the kinetic energy of their relative motion in
// the centre-of-mass frame (½·μ·v_rel², μ = m₁m₂ / (m₁ + m₂)) × COLLISION_DAMAGE_PER_ENERGY.
// Because HP scales with mass, that equal damage is a large fraction of a light body's HP and
// a small fraction of a heavy body's. Roughly:
//   - Asteroid striking Earth at ≥ 20 km/s → asteroid destroyed, Earth barely scratched
//   - Earth and Mars head-on (~54 km/s)    → Mars destroyed, Earth loses ~70% of its HP
/**
 * Relative speed (20 km/s) at which a small body striking a far heavier one loses exactly its
 * full HP. Slower impacts deal partial damage, subject to COLLISION_MIN_DAMAGE_FRACTION.
 */
export const COLLISION_DISRUPTION_SPEED = 20 / DIST_SCALE;
/**
 * HP damage per unit of collision kinetic energy, derived from COLLISION_DISRUPTION_SPEED so
 * that ½·m·v_d² × this = m × HP_MASS_MULTIPLIER (≈ 5,000).
 */
export const COLLISION_DAMAGE_PER_ENERGY =
    (2 * HP_MASS_MULTIPLIER) / COLLISION_DISRUPTION_SPEED ** 2;
/**
 * Minimum damage per contact, as a fraction of the lighter body's max HP, applied to both
 * bodies. Guarantees the lighter body is destroyed within a bounded number of contacts, so
 * a slow body can never survive indefinitely against a heavier one.
 */
export const COLLISION_MIN_DAMAGE_FRACTION = 0.25;
/** Coefficient of restitution when both bodies survive a collision (0 = stick, 1 = elastic). */
export const COLLISION_RESTITUTION = 0.3;
/** Surviving bodies are pushed apart to (r₁ + r₂) × this factor so they don't re-contact next frame. */
export const COLLISION_SEPARATION_FACTOR = 1.001;

// === Atmospheric drag & damage ===
// A small/light body (satellite, ship, asteroid fragment) passing through a planet's
// atmosphere is continuously slowed and, if moving fast enough, damaged; a large/massive one
// (Ceres-class asteroid, a comet nucleus) is barely affected by either — punching straight
// through to the surface, where the existing collision system takes over. See
// src/physics/atmosphere-density.ts and src/physics/atmospheric-drag.ts.
/** Reference surface density, in bar, that the drag/damage/flame constants below are tuned
 *  against. Surface density *is* surface pressure in bar (IAtmosphereOptions.density), so 1.0
 *  is Earth at sea level. A tuning reference only — every atmosphere sets its own density. */
export const ATMOSPHERE_REFERENCE_DENSITY_BAR = 1.0;
/**
 * Atmosphere density falls off exponentially with altitude above the surface (the standard
 * barometric-formula shape real atmospheres follow): density(h) = surfaceDensity ×
 * exp(−h / scaleHeight), with scaleHeight = (atmosphereRadius − planet.radius) × this and h =
 * altitude above the surface. So the atmosphere radius drives the fall-off — a thicker
 * atmosphere stays dense higher up — as well as acting as the hard outer cutoff for containment
 * and the visual shell.
 */
export const ATMOSPHERE_DENSITY_SCALE_HEIGHT_FRACTION = 0.01;
/** Default atmosphere radius as a multiple of the body's radius (the visual shell and the
 *  physics cutoff are the same radius). */
export const ATMOSPHERE_DEFAULT_RADIUS_FACTOR = 1.07;
/**
 * Relative speed (to the planet) below which atmospheric heat damage is exactly zero, and
 * above which it ramps to full strength at ATMOSPHERE_FULL_INTENSITY_SPEED. Shared with
 * EntryFlameEffect, which uses the same thresholds to drive the visual flame's brightness —
 * "not generating a visible flame" and "not generating meaningful heat damage" are the same
 * condition. This is what makes a low, slow orbiter like the ISS (~7.66 km/s relative to
 * Earth, far under this threshold) immune to heat damage regardless of density or tuning,
 * while still being subject to (slow) drag below.
 */
export const ATMOSPHERE_MIN_SPEED_FOR_EFFECT = 10 / DIST_SCALE;
/** Relative speed at which atmospheric heat damage (and the entry flame) reaches full strength. */
export const ATMOSPHERE_FULL_INTENSITY_SPEED = 150 / DIST_SCALE;
/**
 * Drag strength: a = −ATMOSPHERE_DRAG_COEFFICIENT × density × relSpeed² × (radius² / mass).
 * Applied via the closed-form v(t) = v0 / (1 + k0·v0·t) (see resolveAtmosphericPassage in
 * atmospheric-drag.ts), exact and unconditionally stable for any dt, and unable to reverse
 * relative velocity by construction — no clamping needed. Not gated by speed, unlike damage:
 * even the faint residual density above should sap a little speed continuously, which is what
 * lets a body like the ISS experience a slow, ongoing orbital decay (as it does in reality)
 * rather than either "no drag at all" or a sudden, unrealistic deorbit.
 *
 * Tuned so a ship-scale body (radius²/mass ≈ 1.1×10¹¹ in sim units, from Zenith's
 * SPACESHIP_RADIUS/SPACESHIP_MASS) at ATMOSPHERE_REFERENCE_DENSITY_BAR and
 * ATMOSPHERE_FULL_INTENSITY_SPEED (150 km/s) has its relative speed halved after ~4s of
 * continuous exposure — long enough that thrust can still fight it, short enough that diving
 * into a dense atmosphere is clearly costly. A Ceres-class asteroid's ratio (≈1.4×10³) is ~8
 * orders of magnitude smaller, so it's barely slowed — expected, since this is why massive
 * bodies punch through and ships don't. The ISS's ratio is similar to a ship's, but its very
 * low relative speed and (per ATMOSPHERE_DENSITY_SCALE_HEIGHT_FRACTION) very low local density
 * combine to give it a multi-hour halving time at 1× time scale — a slow, background decay
 * rather than a dramatic one. Retune at runtime alongside the other manually-balanced constants.
 */
export const ATMOSPHERE_DRAG_COEFFICIENT = 1.5e-12;
/**
 * Heat/ablation damage rate: HP/s = ATMOSPHERE_DAMAGE_COEFFICIENT × 0.5 × density ×
 * relSpeed³ × radius² × speedIntensity — kinetic-energy flux through the cross-section (real
 * re-entry heating scales the same way, ∝ ρv³A), gated to zero below
 * ATMOSPHERE_MIN_SPEED_FOR_EFFECT. Deliberately mass-independent: for bodies of similar
 * material density, time-to-destroy = maxHP / damageRate ∝ radius, so burn-through time scales
 * with how "thick" the body is — a big asteroid/comet takes years of sim time to lose
 * meaningful HP this way; a small satellite/fragment/ship burns through its (mass-scaled,
 * hence also tiny) maxHealthPoints in a few seconds at full density and full speed.
 *
 * Derived so an ISS-scale body (were it ever moving fast enough to clear the speed gate, which
 * in normal orbit it is not) would lose its full maxHealthPoints in ~3s at
 * ATMOSPHERE_REFERENCE_DENSITY_BAR and ATMOSPHERE_FULL_INTENSITY_SPEED. Retune at runtime.
 */
export const ATMOSPHERE_DAMAGE_COEFFICIENT = 1.4e-10;

// === Satellite station-keeping ===
// The counterpart to atmospheric drag above: a satellite in a low orbit is continuously slowed by
// the residual atmosphere and spirals inward, exactly as the real ISS does. Real orbital vehicles
// answer that with periodic reboost burns, and these constants tune the equivalent autopilot on the
// Satellite base class. See src/physics/station-keeping.ts.
//
// Reference numbers for the ISS, the body these are tuned against. Its radius²/mass ratio is
// ≈1.44×10¹¹ (ISS_RADIUS²/ISS_MASS); local atmospheric density at its 410 km orbit was
// ≈ 1.6×10⁻³ of Earth's surface value when these were tuned (scale height = 1% of Earth's radius —
// it is now 1% of the atmosphere's thickness, so re-derive these if the ISS is retuned); its speed relative to Earth is v = sqrt(G·EARTH_MASS / 67.81) ≈ 0.0767 u/s
// (7.67 km/s). Feeding those through ATMOSPHERE_DRAG_COEFFICIENT gives k0 ≈ 3.45×10⁻⁴ and a drag
// deceleration of k0·v² ≈ 2.03×10⁻⁶ u/s² — the figure every thrust constant below is sized against.
//
// Worth stating plainly, because it is counter-intuitive and because the ATMOSPHERE_DRAG_COEFFICIENT
// docstring's "slow, background decay" refers only to the *speed* halving time (≈10.5 h): orbital
// altitude decays far faster than speed does. For a near-circular orbit da/dt = −2·a_drag·a / v =
// −3.6×10⁻³ u/s, i.e. the ISS sheds ~360 m of altitude per second of simulated time and would fall
// out of its 410 km orbit in about 19 minutes at 1× if nothing corrected it. So this autopilot is
// load-bearing rather than cosmetic, and because the decay tolerance below is re-crossed within a
// fraction of a second of each correction finishing, a low satellite runs its thrusters almost
// continuously. Do not attach a "burn started" notification to that.
//
// These are game-balance values, not physical ones, in the same spirit as the atmosphere block
// above. Real ISS reboost acceleration is ~7×10⁻³ m/s² (≈1×10⁻⁷ u/s²) — twenty times *weaker* than
// this simulation's deliberately exaggerated drag — so real figures simply cannot hold the orbit.
/**
 * How far a satellite's orbital radius may fall below the radius it was created at before the
 * station-keeping autopilot engages.
 */
export const SATELLITE_ORBIT_DECAY_TOLERANCE = 0.1 / DIST_SCALE;
/**
 * Hysteresis band: once engaged, the autopilot keeps thrusting until the radius error is inside
 * this much tighter tolerance. Without a disengage threshold narrower than
 * SATELLITE_ORBIT_DECAY_TOLERANCE the controller would shut off the instant it re-entered the
 * trigger threshold and immediately re-engage, chattering every frame.
 */
export const SATELLITE_ORBIT_HOLD_TOLERANCE = 0.01 / DIST_SCALE;
/**
 * Maximum acceleration the autopilot may add to the satellite's speed, in u/s² — the analogue of a
 * ship's flightThrustAccel. At 5×10⁻⁴ u/s² this is ≈246× the 2.03×10⁻⁶ u/s² of drag it has to
 * cancel at the ISS's nominal altitude. The generous margin exists because density climbs
 * exponentially as a satellite sags: the same thrust is only ≈27× drag one scale height down and
 * ≈2× at 50 km altitude, so a satellite knocked into a deep dive progressively loses the ability to
 * save itself. That cliff is intended.
 */
export const SATELLITE_MAX_THRUST_ACCEL = 0.05 / DIST_SCALE;
/**
 * Maximum deceleration when the autopilot needs to shed speed rather than add it, in u/s². Larger
 * than the acceleration, following the convention the ships use (see Zenith's FLIGHT_THRUST_DECEL
 * vs FLIGHT_THRUST_ACCEL): overshooting a target orbit should be correctable faster than it was
 * created.
 */
export const SATELLITE_THRUST_DECEL = 0.2 / DIST_SCALE;
/**
 * Maximum rate, in radians/second, at which the autopilot may rotate the satellite's velocity
 * vector toward the direction it wants — the velocity-space analogue of a ship's flightMaxTurnRate,
 * and what stops a correction from snapping the velocity onto a new heading in a single frame.
 *
 * This constant is not free to choose independently: rotating a velocity of magnitude v at ω rad/s
 * *is* a lateral acceleration of v·ω, so the turn rate is a second thrust budget hiding behind an
 * angular name. Keeping the two consistent means ω ≈ SATELLITE_MAX_THRUST_ACCEL / v_circ =
 * 5×10⁻⁴ / 0.0767 ≈ 6.5×10⁻³, rounded to 0.01 here for ≈1.5× the linear authority. A ship-like
 * value such as Zenith's 1.58 rad/s would give 242× the linear thrust, rendering
 * SATELLITE_MAX_THRUST_ACCEL decorative and letting the controller rebuild the velocity vector in
 * one frame. If you retune the thrust, retune this with it.
 */
export const SATELLITE_MAX_TURN_RATE = 0.01;
/**
 * Cap on the outward radial speed the autopilot commands while climbing back to its target radius,
 * in u/s. 5×10⁻⁴ u/s is 50 m/s, and it only binds outside a deficit of
 * SATELLITE_MAX_CLIMB_RATE / SATELLITE_CLIMB_GAIN = 250 m — inside that the proportional gain
 * governs, so the cap exists to keep recovery from a large displacement sane rather than to shape
 * an ordinary correction.
 */
export const SATELLITE_MAX_CLIMB_RATE = 0.05 / DIST_SCALE;
/**
 * Proportional gain, in 1/s, mapping the current altitude deficit to a commanded radial climb speed.
 * The taper this produces is the most important part of the controller: climb speed falls off with
 * the deficit (τ = 1 / gain = 5 s), so a correction arrives at its target radius already nearly
 * radial-free, and recovers the 100 m trigger down to the 10 m hold band in ≈11.5 s of simulated
 * time. A fixed-rate climb would instead reach the target still carrying its full 20 m/s of radial
 * velocity and coast tens of kilometres past it, oscillating wildly around a 100 m tolerance.
 */
export const SATELLITE_CLIMB_GAIN = 0.2;
/**
 * Radius error beyond which the autopilot stops treating the discrepancy as drag decay and simply
 * re-baselines onto whatever orbit the satellite is now in. Something other than drag moved it — a
 * collision bounce, a wormhole transit, a gravity-multiplier change — and without this gate the
 * controller would force a circular orbit at any radius, which is indistinguishable from
 * anti-gravity: a satellite blasted onto an escape trajectory would be dragged back by its own
 * thrusters. 2 u (200 km) sits well above the ~0.23 u a satellite can lose in a single frame at
 * maximum time warp, so ordinary decay never trips it.
 */
export const SATELLITE_MAX_STATION_KEEPING_DEVIATION = 200 / DIST_SCALE;

// === Probe autopilot tuning ===
// Fresh, isolated travel-phase tuning for Probe's TRAVEL/INSERT controller — deliberately not
// shared with the ship autopilot (spaceship.ts) or the satellite station-keeping constants above.
// A probe's post-insertion station-keeping reuses DEFAULT_SATELLITE_HANDLING unmodified instead.
/** Placeholder probe body radius, u. Tune once the model is loaded and its proportions are known. */
export const PROBE_RADIUS = 0.05 / RADIUS_SCALE;
/** Placeholder probe mass, kg-equivalent scaled — small enough it never "wins" a collision. */
export const PROBE_MASS = 500 / MASS_SCALE;
/** Cruise speed during the TRAVEL phase, u/s (20 km/s). Playtest and retune for pacing. */
export const PROBE_MAX_SPEED = 400 / DIST_SCALE;
/** Maximum rate the TRAVEL/INSERT controller may rotate the probe's heading, rad/s. */
export const PROBE_TURN_RATE = 0.5;
/** Acceleration toward cruise speed, u/s² — reaches PROBE_MAX_SPEED in ~120s from rest. */
export const PROBE_ACCEL = PROBE_MAX_SPEED / 120;
/** Deceleration when shedding speed, u/s² — sheds speed 3x faster than it builds it. */
export const PROBE_DECEL = PROBE_ACCEL * 3;
/** Extra margin added to the TRAVEL→INSERT stopping-distance trigger, u. */
export const PROBE_INSERT_ORBIT_PAD = 2.0;
/** Velocity error below which orbit insertion is considered complete, u/s. */
export const PROBE_INSERT_DONE_SPEED = 0.5 / DIST_SCALE;
/**
 * Time constant of the linear zone INSERT's radial command blends into near the goal radius, s.
 * Commanded radial speed is min(stopping-curve speed, |distance to goal| / this), so it falls
 * smoothly to zero at the goal instead of the stopping curve's infinite gain making it chatter.
 */
export const PROBE_INSERT_RADIAL_TIME_CONSTANT = 20;
/** Flat scan duration, seconds. */
export const PROBE_SCAN_BASE_SECONDS = 60;
/** Additional scan seconds per Earth-radius of target body size. */
export const PROBE_SCAN_RADIUS_SCALE_SECONDS = 120;
/**
 * Altitude above a target's surface within which a probe begins scanning, in km — independent of
 * whether it has achieved a stable orbit yet. Shown to the player in the launch modal so they know
 * how close a mission needs to get.
 */
export const PROBE_SCAN_RANGE_KM = 100_000 / DIST_SCALE;

// === Explosion speed scaling ===
// ParticleExplosion scales its outward particle/debris speed by the relative impact speed that
// caused the death, so a gentle bump and a hypervelocity impact no longer look identical.
/** Impact speed at which the explosion renders at its default (multiplier = 1) speed. */
export const EXPLOSION_REFERENCE_IMPACT_SPEED = COLLISION_DISRUPTION_SPEED;
/** Floor on the speed multiplier, so even a very slow impact still shows a visible burst. */
export const EXPLOSION_MIN_SPEED_MULTIPLIER = 0.25;
/** Ceiling on the speed multiplier, so hypervelocity impacts look dramatic without becoming absurd. */
export const EXPLOSION_MAX_SPEED_MULTIPLIER = 15;

// === Explosion size scaling ===
// ParticleExplosion's particle count, speed and sprite size were all tuned against planets and
// asteroids, using absolute floors (5 u/s, 10 u) that are themselves planet-scale. A ship hull is
// roughly 3.7e-4 u across, so those floors produced an explosion with no particles, travelling at
// 500 km/s, drawn with 1,000 km sprites. The limits below keep the original look for anything
// bigger than roughly 250 km across — every planet, moon and asteroid in the game — while letting
// small wrecks scale down to something proportionate.
/** Fewest particles an explosion may have, so a small body still visibly bursts. */
export const EXPLOSION_MIN_PARTICLES = 120;
/** Most particles an explosion may have, for performance on planet-scale deaths. */
export const EXPLOSION_MAX_PARTICLES = 2000;
/** Cap on outward particle/debris speed, as a multiple of the body's own radius per second. */
export const EXPLOSION_SMALL_BODY_SPEED_CAP = 2;
/** Cap on rendered particle size, as a multiple of the body's radius. */
export const EXPLOSION_SMALL_BODY_SIZE_CAP = 4;
/** Base colour for a destroyed ship's explosion. Celestial bodies explode in their own surface
 *  colour; a ship has no such colour, so it burns in a hot fuel-fire orange instead. */
export const SHIP_EXPLOSION_COLOR = 0xffa040;

// === Wormhole tuning ===
/** Default mouth (gate) radius for a newly created wormhole, in sim units. Used for randomization range */
export const WORMHOLE_DEFAULT_RADIUS = EARTH_RADIUS * 1.5;
/** Visual length of the swirling funnel/tail effect, as a multiple of the mouth radius. */
export const WORMHOLE_FUNNEL_LENGTH_FACTOR = 1.2;
/** Number of pooled particles in the funnel vortex effect. */
export const WORMHOLE_FUNNEL_PARTICLE_COUNT = 25000;
/** Distance (as a multiple of exit radius) a teleported body is pushed clear of the exit mouth. */
export const WORMHOLE_EMERGE_BUFFER_FACTOR = 1.0;

// === Wormhole Shortcut scenario ===
// Earth flies a tight circular orbit around the Sun, and a linked wormhole pair acts as a
// literal short-cut: the two gates sit on that same orbit on exactly opposite sides of the
// Sun, so Earth only ever traverses half the circle and its observed period is halved.
// Both gates share WORMHOLE_SHORTCUT_ORBIT_RADIUS — that shared radius is what keeps the
// orbit circular, since the teleport preserves speed exactly. The scenario launches with a
// high gravity multiplier so the motion is watchable without an extreme time scale (which
// would destabilise the integrator). Effective lightspeed scales with sqrt(gMultiplier), so
// these orbital speeds stay far below the clamp.
/** Radius of the circular orbit shared by Earth and both gates (10,000,000 km / DIST_SCALE). */
export const WORMHOLE_SHORTCUT_ORBIT_RADIUS = 10_000_000 / DIST_SCALE;
/**
 * Mouth radius of the two short-cut gates. Capture requires the body to be strictly smaller
 * than the mouth, and a wider mouth also tolerates more time-warp before a frame's chord bows
 * outside it, so this is deliberately roomier than WORMHOLE_DEFAULT_RADIUS.
 */
export const WORMHOLE_SHORTCUT_GATE_RADIUS = EARTH_RADIUS * 3;
export const WORMHOLE_SHORTCUT_G_MULTIPLIER = 2_500_000; // preset gravity at scenario launch
export const WORMHOLE_SHORTCUT_TIME_SCALE = 1; // modest time scale so the orbit is watchable

// === Asteroid Field scenario ===
// Earth (with its Moon) flies a tight circular orbit around the Sun while a dense swarm of
// asteroids occupies a band of that same orbit, directly in Earth's path.
//
// The swarm is COUNTER-ORBITING (retrograde). This is the key to the whole scenario: two
// bodies at the same orbital radius with the same prograde velocity would simply travel
// together with zero relative motion, and two bodies on circular orbits at *different*
// radii never intersect at all. A retrograde swarm stays on a perfectly stable circular
// orbit (it never spirals into the Sun) yet closes on Earth at twice the orbital speed, so
// Earth sweeps straight through the band. Every asteroid shares ASTEROID_FIELD_ORBIT_RADIUS
// so they all have an identical orbital speed and therefore never collide with each other.
//
// Each collision damages Earth by the impact's kinetic energy (see COLLISION_DAMAGE_PER_ENERGY)
// and destroys the asteroid; the Moon eats anything it clips on the way past. At the current
// tuning Earth does not survive the full band — the field still needs rebalancing.

/** Radius of the circular orbit shared by Earth, the Moon's parent, and the asteroid band. */
export const ASTEROID_FIELD_ORBIT_RADIUS = 1_000_000 / DIST_SCALE;
/** Preset gravity multiplier at scenario launch. */
export const ASTEROID_FIELD_G_MULTIPLIER = 1;
/**
 * Modest time scale so Earth visibly moves on launch. Kept ≤ ~20 deliberately: the relative
 * closing speed is 2× orbital, so a larger warp would advance Earth more than the collision
 * capture radius (Earth + asteroid) in a single frame and let it tunnel through the swarm.
 */
export const ASTEROID_FIELD_TIME_SCALE = 8;
/**
 * Number of asteroids in the dense band. The n-body integrator runs 64 substeps per frame
 * at O(n²), so this is a balance: ~130 members costs roughly 9 ms/frame of physics, which
 * leaves enough of the frame budget for rendering while still reading as a dense field.
 */
export const ASTEROID_FIELD_COUNT = 300;
/** Angular length of the band, in degrees. Kept tight so the swarm is genuinely *clustered*
 *  (and locally dense) rather than smeared thinly around a large arc. */
export const ASTEROID_FIELD_ARC_DEG = 60;
/**
 * Angular lead of Earth ahead of the band's trailing edge, in degrees. Earth travels prograde
 * while the band travels retrograde, so this is how long the user watches Earth approach
 * before the first strike — larger values give a longer, calmer run-up.
 */
export const ASTEROID_FIELD_EARTH_LEAD_DEG = 8;
/** Per-asteroid radial jitter (±, sim units) for visual variety. Kept tiny so the orbital
 *  speed spread stays negligible and the swarm never self-collides. */
export const ASTEROID_FIELD_RADIAL_JITTER = 8;
/** Half-height of the band above/below the ecliptic (sim units). Must stay below the
 *  collision capture radius so every asteroid in the band is actually reachable. */
export const ASTEROID_FIELD_VERTICAL_HALF_HEIGHT = 80;
/** Asteroid model radius range (sim units). Big enough to read as rocks; collision damage to
 *  Earth scales with their mass. */
export const ASTEROID_FIELD_RADIUS_MIN = 0.01 / RADIUS_SCALE;
export const ASTEROID_FIELD_RADIUS_MAX = 200 / RADIUS_SCALE;
/** Short trails per asteroid keep the 150-strong swarm legible instead of smeared. */
export const ASTEROID_FIELD_TRAIL_LENGTH = 50;
/** Camera distance used to frame Earth, its Moon, and the local swarm on launch. */
export const ASTEROID_FIELD_CAMERA_DISTANCE = 9_000;

// === Asteroid Defense scenario ===
// The player starts in flight mode in a ship just off Earth's day side while waves of
// asteroids are thrown at Earth. Wave N holds N asteroids, each spawned at a random angle
// around Earth; the next wave follows once every asteroid in the current one has hit Earth,
// been destroyed, or missed.
//
// Each asteroid spawns in Earth's co-moving frame: it inherits Earth's heliocentric velocity
// plus a fixed approach speed aimed straight at Earth. Sitting at essentially Earth's distance
// from the Sun, it also feels essentially the same solar pull, so relative to Earth it travels
// in a straight line — Earth's velocity and its curving orbit are both accounted for, and
// Earth's own gravity only focuses the path further.

/** Preset gravity multiplier at scenario launch (real gravity). */
export const ASTEROID_DEFENSE_G_MULTIPLIER = 1;
/** Real-time pacing, so the flight controls and the incoming waves share one clock. */
export const ASTEROID_DEFENSE_TIME_SCALE = 1;
/**
 * Distance from Earth's centre at which each asteroid spawns (160,000 km / DIST_SCALE).
 * Well beyond bolt reach (~400 u) so the player has to fly out to meet it, and inside the
 * Moon's orbit so the Moon never lies on an approach path.
 */
export const ASTEROID_DEFENSE_SPAWN_DISTANCE = 160_000 / DIST_SCALE;
/** Approach speed relative to Earth (1,200 km/s / DIST_SCALE) — roughly 130 s to impact. */
export const ASTEROID_DEFENSE_APPROACH_SPEED = 1_200 / DIST_SCALE;
/** Maximum spawn elevation above/below Earth's orbital plane, in degrees. */
export const ASTEROID_DEFENSE_MAX_ELEVATION_DEG = 30;
/**
 * Asteroid radius range. Big enough to read as rocks. Collision damage scales with mass, so
 * together with APPROACH_SPEED this sets how hard each impact hits Earth.
 */
export const ASTEROID_DEFENSE_RADIUS_MIN = 100 / RADIUS_SCALE;
export const ASTEROID_DEFENSE_RADIUS_MAX = 500 / RADIUS_SCALE;
/** Long trails so the player can spot incoming asteroids from a distance. */
export const ASTEROID_DEFENSE_TRAIL_LENGTH = 100;
/** Sim seconds before the first wave, so the player can get oriented. */
export const ASTEROID_DEFENSE_FIRST_WAVE_DELAY = 8;
/** Sim seconds between one wave clearing and the next spawning. */
export const ASTEROID_DEFENSE_WAVE_DELAY = 5;
/**
 * Total number of waves the player must survive to win. Wave N holds N asteroids,
 * so ten waves is fifty-five asteroids in total.
 */
export const ASTEROID_DEFENSE_MAX_WAVES = 10;
/**
 * An asteroid farther from Earth than SPAWN_DISTANCE × this factor has missed (e.g. it was
 * deflected) and is removed, so a stray rock can never stall the wave.
 */
export const ASTEROID_DEFENSE_MISS_DISTANCE_FACTOR = 1.5;
/** Sim seconds the "exiting flight mode fails this scenario" warning banner stays fully lit. */
export const ASTEROID_DEFENSE_FLIGHT_WARNING_HOLD_SECONDS = 5;

/**
 * Real-time delay (wall-clock ms, not sim time) between a scenario ending and its outcome
 * modal appearing, so the fail/success moment reads rather than getting stepped on by an
 * instant popup.
 */
export const SCENARIO_OUTCOME_MODAL_DELAY_MS = 1000;
/** The player's ship spawns this far from Earth's centre, on the sunward (day) side. */
export const ASTEROID_DEFENSE_SHIP_ALTITUDE = EARTH_RADIUS * 4;
/** Asteroids never spawn closer than this to the player's ship (20,000 km / DIST_SCALE). */
export const ASTEROID_DEFENSE_SHIP_CLEARANCE = 20_000 / DIST_SCALE;
/** Maximum re-rolls of a spawn direction that lands too close to the player's ship. */
export const ASTEROID_DEFENSE_SPAWN_ATTEMPTS = 5;
/**
 * An asteroid that dies within (Earth radius + asteroid radius) × this factor of Earth's
 * centre is counted as an impact; anywhere else it was destroyed. The margin covers the
 * distance a fast asteroid closes between its last visible frame and the collision.
 */
export const ASTEROID_DEFENSE_IMPACT_MARGIN = 1.25;

// === Extinction Event scenario (Phase 5) ===
// The player, piloting the Osiris Mothership, faces the whole onslaught at once rather than
// in waves: every threat spawns at scenario start, each with its own randomized spawn distance
// and approach speed so they still arrive at staggered times instead of all at once.

/** Preset gravity multiplier at scenario launch (real gravity). */
export const EXTINCTION_EVENT_G_MULTIPLIER = 1;
/** Real-time pacing, so the flight controls and the incoming threats share one clock. */
export const EXTINCTION_EVENT_TIME_SCALE = 1;
/** Total number of asteroids/comets thrown at Earth this scenario. */
export const EXTINCTION_EVENT_THREAT_COUNT = 100;
/** Fraction of threats that roll as a comet rather than an asteroid. */
export const EXTINCTION_EVENT_COMET_CHANCE = 0.2;
/**
 * Range of spawn distance from Earth's centre (km / DIST_SCALE). Randomized per-threat
 * (rather than fixed, as in Asteroid Defense) so 100 simultaneously-spawned threats still
 * arrive at staggered times.
 */
export const EXTINCTION_EVENT_SPAWN_DISTANCE_MIN = 150_000 / DIST_SCALE;
export const EXTINCTION_EVENT_SPAWN_DISTANCE_MAX = 450_000 / DIST_SCALE;
/** Range of approach speed relative to Earth (km/s / DIST_SCALE), randomized per-threat. */
export const EXTINCTION_EVENT_APPROACH_SPEED_MIN = 800 / DIST_SCALE;
export const EXTINCTION_EVENT_APPROACH_SPEED_MAX = 1_200 / DIST_SCALE;
/**
 * Maximum spawn elevation above/below Earth's orbital plane, in degrees. Wider than Asteroid
 * Defense's 30° so 100 spawn points spread out instead of clustering.
 */
export const EXTINCTION_EVENT_MAX_ELEVATION_DEG = 40;
/** Asteroid radius range, reusing Asteroid Defense's values. */
export const EXTINCTION_EVENT_ASTEROID_RADIUS_MIN = 50 / RADIUS_SCALE;
export const EXTINCTION_EVENT_ASTEROID_RADIUS_MAX = 300 / RADIUS_SCALE;
/** Comet radius range — comets are the rarer, more dangerous variety of threat. */
export const EXTINCTION_EVENT_COMET_RADIUS_MIN = 80 / RADIUS_SCALE;
export const EXTINCTION_EVENT_COMET_RADIUS_MAX = 500 / RADIUS_SCALE;
/** Trail length for every threat, so incoming rocks/comets are visible from a distance. */
export const EXTINCTION_EVENT_TRAIL_LENGTH = 100;
/**
 * A threat farther from Earth than its own spawn distance × this factor has missed (e.g. it
 * was deflected) and is removed, so a stray body can never stall the scenario.
 */
export const EXTINCTION_EVENT_MISS_DISTANCE_FACTOR = 1.5;
/**
 * A threat that dies within (Earth radius + threat radius) × this factor of Earth's centre is
 * counted as an impact; anywhere else it was destroyed.
 */
export const EXTINCTION_EVENT_IMPACT_MARGIN = 1.25;
/**
 * A threat is only flagged with the on-screen threat indicator once it comes within this
 * distance of Earth's centre (180,000 km / DIST_SCALE), so the player isn't shown all
 * ~100 threats at once. Some threats spawn inside this radius already (spawn distance can be
 * as low as 150,000 km) and will show as threats from frame one.
 */
export const EXTINCTION_EVENT_THREAT_DISTANCE = 150_000 / DIST_SCALE;
/** The player's Osiris spawns this far from Earth's centre, on the sunward (day) side. */
export const EXTINCTION_EVENT_SHIP_ALTITUDE = EARTH_RADIUS * 6;
/** Threats never spawn closer than this to the player's ship (25,000 km / DIST_SCALE). */
export const EXTINCTION_EVENT_SHIP_CLEARANCE = 25_000 / DIST_SCALE;
/** Maximum re-rolls of a spawn direction that lands too close to the player's ship. */
export const EXTINCTION_EVENT_SPAWN_ATTEMPTS = 5;

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

// === Ship AI warp drive ===
/** Multiplier on a ship's own `autopilotWarpThreshold` before an AI will charge warp.
 *  That threshold is already the full warp→rest stopping distance with a 1.5× margin
 *  baked in, so 1.0 puts an AI on the same footing as the autopilot: warp whenever the
 *  run is long enough that there is still room to shed the speed again afterwards. */
export const AI_WARP_ENGAGE_FACTOR = 1.0;
/** Hysteresis on the above: an AI abandons a charge already in progress only once the
 *  distance falls below this fraction of the engage threshold. Without the gap, a target
 *  drifting across the threshold makes the charge start and abort on alternating frames. */
export const AI_WARP_ABORT_FACTOR = 0.8;
/** Maximum off-axis angle (radians) at which an AI will start or hold a warp charge.
 *  Far tighter than AI_THRUST_ALIGN_ANGLE because warp is flown on a locked heading with
 *  steering disabled: whatever error is present at engagement is error the ship carries
 *  all the way to the drop-out point. */
export const AI_WARP_ALIGN_ANGLE = Math.PI / 90;
/** Safety margin on the distance at which an AI drops out of warp, applied to the ship's
 *  own three-band stopping distance. Matches the margin the autopilot uses for its own
 *  WARP → APPROACH transition. */
export const AI_WARP_DROP_PAD = 1.5;
/** Clearance radius for the straight-line warp corridor, as a multiple of a body's hazard
 *  radius. The corridor is a cylinder rather than avoidance's silhouette cone: a fixed
 *  angular margin that is sensible at steering range sweeps an enormous exclusion volume
 *  when projected down a warp run hundreds of thousands of units long. */
export const AI_WARP_CORRIDOR_PAD = 3;

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

// === Combat ship AI ===
/** Station-keeping distance for the combat AI: 500 m expressed in sim units. */
export const NPC_COMBAT_FOLLOW_DISTANCE = 0.5 / DIST_SCALE;
/** Closing-speed tolerance floor for the combat AI, as a fraction of its hold distance per
 *  second. The follow AI's floor (flightMaxSpeed × AI_CLOSING_SPEED_TOLERANCE = 0.015 u/s on a
 *  Zenith) is six times the speed command at a 500 m hold, so the controller would read "on
 *  station" for every closing speed up to 1.5 km/s and never touch thrust or brake — the ship
 *  would sail through its target and yo-yo instead of settling. */
export const AI_COMBAT_CLOSING_TOLERANCE_RATE = 0.1;
/** Half-angle (radians) of the combat AI's aiming cone about its nose. Matches the Zenith's
 *  player cone at 1080p — atan((260/540)·tan 30°) ≈ 15.5° — but is deliberately a fixed angle
 *  rather than derived from flightMaxPointerOffset and the viewport, so AI accuracy does not
 *  change with the player's window size. */
export const AI_AIM_CONE_ANGLE = Math.PI / 12;
/** Maximum range (sim units) at which the combat AI will pull the trigger: 10 km. */
export const AI_FIRE_RANGE = 10 / DIST_SCALE;
/** Peak angular aim error (radians) folded into the combat AI's aim so it is not a perfect
 *  turret. 0.5° is ~4 m off at the 500 m hold distance (well inside a 37 m hull) and ~87 m off
 *  at the 10 km fire range — accuracy that falls away with distance for free. */
export const AI_AIM_JITTER_ANGLE = Math.PI / 360;
/** Seconds over which the aim jitter drifts to a freshly rolled offset. Drift rather than
 *  per-frame white noise: at 12 rounds/s, re-rolling every frame reads as a shotgun. */
export const AI_AIM_JITTER_PERIOD = 0.6;
/** Trigger discipline: seconds the combat AI holds fire down before resting. Together with
 *  AI_BURST_REST_TIME this gives the NPC a burst rhythm and keeps it clear of the overheat
 *  lockout (a bolt weapon gains 0.1 heat/s firing and sheds 0.8 heat/s released). */
export const AI_BURST_FIRE_TIME = 1.0;
/** Seconds the combat AI holds fire between bursts. */
export const AI_BURST_REST_TIME = 0.5;

// === Test AI Ships scenario ===
/** Fixed time scale for the AI test bed, so runs are comparable to each other. */
export const TEST_AI_SHIPS_TIME_SCALE = 1;
/** Offset (sim units) from the player at which the NPC first spawns and later respawns: 25 km.
 *  Far enough that the NPC has to turn, accelerate and close before it reaches AI_FIRE_RANGE,
 *  so the pursuit behaviour is visible on every respawn. */
export const TEST_AI_SHIPS_SPAWN_DISTANCE = 25 / DIST_SCALE;
/** Sim-seconds between the NPC's destruction and its replacement appearing. */
export const TEST_AI_SHIPS_RESPAWN_DELAY = 3;

// === Comet tail coloring ===
/** Default main color for a comet's particle tail (blue — matches the original look). */
export const DEFAULT_COMET_TAIL_COLOR = 0x7ab8ff;

/** Palette of pleasing main tail colors used by procedural comet generation and the
 *  Add/Edit body panel's randomize action: red, blue, green, purple, orange, yellow, etc. */
export const COMET_TAIL_COLOR_PALETTE = [
    0x7ab8ff, // blue
    0x66e0ff, // cyan
    0x55ffd5, // teal
    0x7aff7a, // green
    0xc8ff66, // lime
    0xffe066, // gold
    0xffaa55, // orange
    0xff5566, // red
    0xff88dd, // pink
    0xbb88ff, // purple
    0xff66ff, // magenta
];
