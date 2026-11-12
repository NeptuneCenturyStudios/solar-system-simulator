import type { IDamageEffectiveness } from '../interfaces';

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
    /** Scenario: the player, in the Osiris, is hunted by a mixed force of AI Darts and Zeniths. Win by destroying them all; lose if the Osiris is destroyed. */
    OsirisAmbush = 9,
    /** Test scenario: a small Team Earth vs Team Alien fleet battle near Earth, under locked guidance. */
    TeamSkirmish = 10,
    /** Scenario: a distress call, a red wormhole near Earth, and a full Team Earth vs alien fleet battle. */
    AlienInvasion = 11,
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

// Body data based on JPL Horizons
// Source: https://ssd.jpl.nasa.gov/horizons/app.html#/

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
export const TITAN_MASS = 1.34553e23 / MASS_SCALE;
export const URANUS_MASS = 8.681e25 / MASS_SCALE;
export const NEPTUNE_MASS = 1.02413e26 / MASS_SCALE;
export const PLUTO_MASS = 1.303e22 / MASS_SCALE;
export const CHARON_MASS = 1.5897e21 / MASS_SCALE; // GM = 106.10 km³/s² (PLU060)

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
export const TITAN_RADIUS = 2575.5 / RADIUS_SCALE;
export const URANUS_RADIUS = 25362 / RADIUS_SCALE;
export const NEPTUNE_RADIUS = 24622 / RADIUS_SCALE;
export const PLUTO_RADIUS = 1188.3 / RADIUS_SCALE;
export const CHARON_RADIUS = 606 / RADIUS_SCALE;

// === Planetary System: Distance ===
export const MERCURY_DIST = 57909000 / DIST_SCALE;
export const VENUS_DIST = 108210000 / DIST_SCALE;
export const EARTH_DIST = 149600000 / DIST_SCALE;
export const MOON_DIST_FROM_EARTH = 384400 / DIST_SCALE;
export const MARS_DIST = 227956000 / DIST_SCALE;
export const JUPITER_DIST = 778479000 / DIST_SCALE;
export const IO_DIST_FROM_JUPITER = 421700 / DIST_SCALE;
export const EUROPA_DIST_FROM_JUPITER = 671100 / DIST_SCALE;
export const GANYMEDE_DIST_FROM_JUPITER = 1070400 / DIST_SCALE;
export const CALLISTO_DIST_FROM_JUPITER = 1882700 / DIST_SCALE;
export const SATURN_DIST = 1432041000 / DIST_SCALE;
export const TITAN_DIST_FROM_SATURN = 1221870 / DIST_SCALE;
export const URANUS_DIST = 2867043000 / DIST_SCALE;
export const NEPTUNE_DIST = 4498400000 / DIST_SCALE;
export const PLUTO_DIST = 5906380000 / DIST_SCALE;
export const CHARON_DIST_FROM_PLUTO = 19595.762 / DIST_SCALE;

/** One astronomical unit in simulation units (same scaling as every other distance). */
export const AU = EARTH_DIST;

// === Render Distance (Options → Graphics) ===
// The camera far plane, expressed in AU. The default reaches Saturn from Earth (max separation
// ~11.1 AU) but not Uranus (min ~17 AU), so outer planets and the Kuiper belt are culled.
export const RENDER_DISTANCE_MIN_AU = 0.1;
export const RENDER_DISTANCE_MAX_AU = 100;
export const RENDER_DISTANCE_DEFAULT_AU = 12;

// === Render Scale (Options → Graphics) ===
// Fraction of the window's resolution the 3D scene is drawn at before it is stretched to fill the
// screen. Per-pixel cost (clouds, star surfaces, atmosphere, shadows) goes with its square, so
// 0.75 does ~56% of the work and 0.5 ~25%. The HUD is always drawn at full resolution.
export const RENDER_SCALE_MIN = 0.5;
export const RENDER_SCALE_MAX = 1;
export const RENDER_SCALE_STEP = 0.05;
export const RENDER_SCALE_DEFAULT = 1;

// === Exposure (Options → Graphics) ===
// Multiplier applied to the linear scene before the tone-mapping curve (renderer.toneMappingExposure).
export const EXPOSURE_MIN = 0.25;
export const EXPOSURE_MAX = 4;
export const EXPOSURE_STEP = 0.05;
export const EXPOSURE_DEFAULT = 1;

// === Mercury: Orbital Elements (J2000) ===
// Mercury is the most eccentric of the eight planets (e = 0.2056): its distance from the Sun
// swings from 46.0 to 69.8 million km over an 88-day year, a 52% change, and its orbit rides
// 7.0° above and below the ecliptic. A flat circle hides both of those.
// These are JPL Horizons (Mercury 199, Sun-centred, J2000 ecliptic) osculating elements at J2000
// directly, at exactly JD 2451545.0 TDB.
// MERCURY_DIST above is the semi-major axis and equals (perihelion + aphelion) / 2 to within
// 0.001%.
export const MERCURY_PERIHELION_DIST = 46001210 / DIST_SCALE; // 46,001,210 km (0.3075 AU)
export const MERCURY_APHELION_DIST = 69816927 / DIST_SCALE; // 69,816,927 km (0.4667 AU)
export const MERCURY_INCLINATION = 7.005014; // degrees, relative to the ecliptic
export const MERCURY_LONG_ASC_NODE = 48.330539; // degrees, longitude of the ascending node (Ω)
export const MERCURY_ARG_PERIHELION = 29.124282; // degrees, argument of perihelion (ω)
export const MERCURY_MEAN_ANOMALY_J2000 = 174.795883; // degrees

// === Venus: Orbital Elements (J2000) ===
// Venus has the roundest orbit of any planet (e = 0.0068, only 3.4° out of the ecliptic), so a
// circle would nearly do — but "nearly" is still a 1.46 million km variation in Sun distance,
// and the node and perihelion directions point where they really point.
// These are JPL Horizons (Venus 299, Sun-centred, J2000 ecliptic) osculating elements at J2000
// directly, at exactly JD 2451545.0 TDB.
// VENUS_DIST above is the semi-major axis and equals (perihelion + aphelion) / 2 to within
// 0.002%.
export const VENUS_PERIHELION_DIST = 107477137 / DIST_SCALE; // 107,477,137 km (0.7184 AU)
export const VENUS_APHELION_DIST = 108939199 / DIST_SCALE; // 108,939,199 km (e ≈ 0.00676)
export const VENUS_INCLINATION = 3.39459; // degrees, relative to the ecliptic
export const VENUS_LONG_ASC_NODE = 76.678374; // degrees, longitude of the ascending node (Ω)
export const VENUS_ARG_PERIHELION = 55.185967; // degrees, argument of perihelion (ω)
export const VENUS_MEAN_ANOMALY_J2000 = 50.114772; // degrees

// === Earth: Orbital Elements (J2000) ===
// Earth's orbit is the least exotic of all: nearly circular (e ≈ 0.0167) and lying in the
// ecliptic by definition, because Earth's own orbital plane *is* the reference plane that every
// other inclination here is measured against. It is nonetheless built from real orbital
// elements like every other planet in this file, because the two things a flat circle gets
// wrong are both real: the small eccentricity makes the Sun distance vary by ~1.7% over the
// year (perihelion in early January, aphelion in early July), and the argument of perihelion
// points that ellipse the correct way round the ecliptic.
// These are JPL Horizons (Earth 399, Sun-centred, J2000 ecliptic) osculating elements at exactly
// J2000 (JD 2451545.0 TDB). Body-centre elements wobble with the Moon (Earth's centre circles the
// Earth–Moon barycenter monthly), so the perihelion and aphelion differ from the long-run
// fact-sheet values by up to ~0.1%.
// EARTH_DIST above is the long-run mean semi-major axis (it keys the time scale to the real
// period); the osculating one here, (perihelion + aphelion) / 2 = 1.0004 AU, is very slightly larger.
export const EARTH_PERIHELION_DIST = 147102955 / DIST_SCALE; // 147,102,955 km (0.98332 AU)
export const EARTH_APHELION_DIST = 152227074 / DIST_SCALE; // 152,227,074 km (1.01758 AU)
// Earth defines the ecliptic, so its inclination to it is zero by definition. Horizons reports
// 0.0004° at J2000 (the Moon's wobble) — numerically indistinguishable from zero, and using it
// would tilt Earth a hair out of the very plane the other planets share.
export const EARTH_INCLINATION = 0;
// With zero inclination Ω has no meaning (Horizons' own Ω swings by degrees from one minute to
// the next), and only the longitude of perihelion ϖ = Ω + ω matters: 101.8089° at J2000. Ω keeps
// its fact-sheet value and ω is set so that Ω + ω = ϖ.
export const EARTH_LONG_ASC_NODE = -11.26064; // degrees, longitude of the ascending node (Ω)
export const EARTH_ARG_PERIHELION = 113.069577; // degrees, argument of perihelion (ω)
export const EARTH_MEAN_ANOMALY_J2000 = 358.617256; // degrees

// === Moon: Orbital Elements (J2000, orbit about Earth) ===
// The Moon is the one natural satellite modelled from real orbital elements, for the same
// reason Neptune, Pluto and Earth are: a flat circle loses two things that are plainly
// visible. The first is eccentricity — at J2000 e ≈ 0.063 the Earth–Moon distance swings from
// 357,821 km at perigee to 405,997 km at apogee, a 13% difference that also makes the Moon's
// orbital speed vary from ≈0.96 to ≈1.09 km/s. The second is the orbital plane: the Moon
// orbits ≈5.24° out of the ecliptic, so it spends half of each month north of Earth's orbit
// plane and half south of it.
//
// Note which plane it is inclined to: the *ecliptic*, not Earth's equator. That is unusual
// among moons — most regular satellites orbit their primary's equatorial plane — and it is
// convenient here, because this simulation's local Earth frame is already ecliptic-aligned.
// The elements below therefore drop straight into stateVectorsFromElements() with no frame
// rotation required.
//
// These are JPL Horizons (Moon 301, Earth-centred body centre, J2000 ecliptic) osculating
// elements at exactly J2000 (JD 2451545.0 TDB). They reproduce the Moon's real position at J2000
// (ecliptic longitude ≈223.3°).
// Osculating elements swing widely around the long-run means because of the Sun's perturbation
// (perigee 356,000–370,000 km, e 0.03–0.08), which is why they differ from the textbook mean
// values (363,300 / 405,500 km, e 0.0549, i 5.145°). MOON_DIST_FROM_EARTH above stays the mean
// semi-major axis; the osculating one here, (perigee + apogee) / 2 = 381,875 km, is smaller.
// The node regresses once per 18.6 years and the line of apsides rotates once per 8.85 years;
// this simulation integrates full Sun–Earth–Moon n-body gravity, so those precessions emerge
// from the physics on their own.
export const MOON_PERIGEE_DIST = 357760 / DIST_SCALE; // 357,760 km
export const MOON_APOGEE_DIST = 405989 / DIST_SCALE; // 405,989 km (e ≈ 0.0631)
export const MOON_INCLINATION = 5.240273; // degrees, inclination to the ecliptic
export const MOON_LONG_ASC_NODE = 123.958055; // degrees (Ω)
export const MOON_ARG_PERIGEE = 308.922673; // degrees (ω)
export const MOON_MEAN_ANOMALY_J2000 = 146.673275; // degrees
// The Moon's rotation axis is not perpendicular to its orbital plane: the lunar equator is
// tilted 6.687° to the orbit (Cassini's laws). Recorded for completeness — the body is tidally
// locked and the simulation currently spins it about the orbit normal, so this tilt is not
// applied to the geometry.
export const MOON_OBLIQUITY = 6.687; // degrees, lunar equator to orbit

// === Io: Orbital Elements (J2000, orbit about Jupiter) ===
// JPL Horizons (Io 501, Jupiter-centred body centre, J2000 ecliptic) osculating elements at
// exactly J2000 (JD 2451545.0 TDB, a 1-minute-step pull so no interpolation is needed), so Io
// starts in its true place around Jupiter and the Jupiter–Io pair matches the Jupiter state taken
// from the same epoch. The angles are measured against the ecliptic, not Jupiter's equator, which
// is why the inclination is ≈2.2° (Jupiter's equator is tilted 3.1° to its orbit).
//
// Io goes round in 1.77 days, so a one-day-apart bracket is more than half an orbit wide and its
// angles cannot be averaged; an exact-epoch row sidesteps that. (A mean-longitude interpolation
// of the old daily rows agreed with this to 0.0015°.)
export const IO_PERIAPSIS_DIST = 420046 / DIST_SCALE; // 420,046 km
export const IO_APOAPSIS_DIST = 424027 / DIST_SCALE; // 424,027 km (e ≈ 0.00472)
export const IO_INCLINATION = 2.212618; // degrees, inclination to the ecliptic
export const IO_LONG_ASC_NODE = 336.852445; // degrees (Ω)
export const IO_ARG_PERIAPSIS = 66.164885; // degrees (ω)
export const IO_MEAN_ANOMALY_J2000 = 335.153206; // degrees

// === Callisto: Orbital Elements (J2000, orbit about Jupiter) ===
// JPL Horizons (Callisto 504, Jupiter-centred body centre, J2000 ecliptic) osculating elements at
// exactly J2000 (JD 2451545.0 TDB), measured against the ecliptic like Io's (see above).
export const CALLISTO_PERIAPSIS_DIST = 1868766 / DIST_SCALE; // 1,868,766 km
export const CALLISTO_APOAPSIS_DIST = 1896780 / DIST_SCALE; // 1,896,780 km (e ≈ 0.00744)
export const CALLISTO_INCLINATION = 2.016916; // degrees, inclination to the ecliptic
export const CALLISTO_LONG_ASC_NODE = 337.94261; // degrees (Ω)
export const CALLISTO_ARG_PERIAPSIS = 16.126895; // degrees (ω)
export const CALLISTO_MEAN_ANOMALY_J2000 = 85.118889; // degrees

// === Europa: Orbital Elements (J2000, orbit about Jupiter) ===
// JPL Horizons (Europa 502, Jupiter-centred body centre, J2000 ecliptic) osculating elements at
// exactly J2000 (JD 2451545.0 TDB), measured against the ecliptic like Io's (see above).
export const EUROPA_PERIAPSIS_DIST = 664662 / DIST_SCALE; // 664,662 km
export const EUROPA_APOAPSIS_DIST = 677835 / DIST_SCALE; // 677,835 km (e ≈ 0.00981)
export const EUROPA_INCLINATION = 1.790971; // degrees, inclination to the ecliptic
export const EUROPA_LONG_ASC_NODE = 332.628732; // degrees (Ω)
export const EUROPA_ARG_PERIAPSIS = 254.647142; // degrees (ω)
export const EUROPA_MEAN_ANOMALY_J2000 = 345.411037; // degrees

// === Ganymede: Orbital Elements (J2000, orbit about Jupiter) ===
// JPL Horizons (Ganymede 503, Jupiter-centred body centre, J2000 ecliptic) osculating elements at
// exactly J2000 (JD 2451545.0 TDB), measured against the ecliptic like Io's (see above).
export const GANYMEDE_PERIAPSIS_DIST = 1068938 / DIST_SCALE; // 1,068,938 km
export const GANYMEDE_APOAPSIS_DIST = 1072057 / DIST_SCALE; // 1,072,057 km (e ≈ 0.00146)
export const GANYMEDE_INCLINATION = 2.214148; // degrees, inclination to the ecliptic
export const GANYMEDE_LONG_ASC_NODE = 343.172846; // degrees (Ω)
export const GANYMEDE_ARG_PERIAPSIS = 319.807813; // degrees (ω)
export const GANYMEDE_MEAN_ANOMALY_J2000 = 277.048768; // degrees

// === Titan: Orbital Elements (J2000, orbit about Saturn) ===
// JPL Horizons (Titan 606, Saturn-centred body centre, J2000 ecliptic) osculating elements at
// exactly J2000 (JD 2451545.0 TDB), measured against the ecliptic like the Galilean moons'. Titan
// orbits in Saturn's equatorial plane, so the ≈27.7° inclination is Saturn's axial tilt (26.73°)
// seen from the ecliptic, not an unusually tilted orbit.
export const TITAN_PERIAPSIS_DIST = 1186986.656 / DIST_SCALE; // 1,186,986.656 km
export const TITAN_APOAPSIS_DIST = 1256882.946 / DIST_SCALE; // 1,256,882.946 km (e ≈ 0.0286)
export const TITAN_INCLINATION = 27.71833887; // degrees, inclination to the ecliptic
export const TITAN_LONG_ASC_NODE = 169.2391603; // degrees (Ω)
export const TITAN_ARG_PERIAPSIS = 164.4091286; // degrees (ω)
export const TITAN_MEAN_ANOMALY_J2000 = 163.4361975; // degrees

// === Mars: Orbital Elements (J2000) ===
// Mars's orbit is noticeably oval (e = 0.0933): the Sun distance ranges from 206.7 to 249.3
// million km over a 687-day year, which is what drives the planet's seasons, and the orbital
// plane is tilted 1.85° to the ecliptic.
// These are JPL Horizons (Mars 499, Sun-centred, J2000 ecliptic) osculating elements at J2000
// directly, at exactly JD 2451545.0 TDB.
// MARS_DIST above is the semi-major axis and equals (perihelion + aphelion) / 2 to within 0.01%.
export const MARS_PERIHELION_DIST = 206668970 / DIST_SCALE; // 206,668,970 km (1.3815 AU)
export const MARS_APHELION_DIST = 249209296 / DIST_SCALE; // 249,209,296 km (e ≈ 0.09332)
export const MARS_INCLINATION = 1.849876; // degrees, relative to the ecliptic
export const MARS_LONG_ASC_NODE = 49.562006; // degrees, longitude of the ascending node (Ω)
export const MARS_ARG_PERIHELION = 286.537383; // degrees, argument of perihelion (ω)
export const MARS_MEAN_ANOMALY_J2000 = 19.356483; // degrees

// === Jupiter: Orbital Elements (J2000) ===
// Jupiter's eccentricity is small (e = 0.0488), but the orbit is so vast that it still moves the
// Sun distance by 76.0 million km between perihelion and aphelion, and the plane sits 1.31° off
// the ecliptic. Both are real, so both are modelled.
// These are JPL Horizons (Jupiter 599, Sun-centred, J2000 ecliptic) osculating elements at exactly
// J2000 (JD 2451545.0 TDB). JUPITER_DIST above is Jupiter's long-run mean semi-major axis (it keys
// the time scale to the real period); the osculating one here, (perihelion + aphelion) / 2 =
// 5.204 AU, is slightly different. Body-centre elements wobble with the Galilean moons, which are
// now placed from their own J2000 states, so the pair stays consistent.
export const JUPITER_PERIHELION_DIST = 740573663 / DIST_SCALE; // 740,573,663 km (4.9504 AU)
export const JUPITER_APHELION_DIST = 816541569 / DIST_SCALE; // 816,541,569 km (e ≈ 0.04879)
export const JUPITER_INCLINATION = 1.304631; // degrees, relative to the ecliptic
export const JUPITER_LONG_ASC_NODE = 100.49115; // degrees, longitude of the ascending node (Ω)
export const JUPITER_ARG_PERIHELION = 275.069067; // degrees, argument of perihelion (ω)
export const JUPITER_MEAN_ANOMALY_J2000 = 18.815627; // degrees

// === Saturn: Orbital Elements (J2000) ===
// Saturn's orbit is the most eccentric of the giants (e = 0.0556) and tilted 2.48° to the
// ecliptic — the largest orbital inclination of any planet bright enough to see with the naked
// eye.
// These are JPL Horizons (Saturn 699, Sun-centred, J2000 ecliptic) osculating elements at J2000
// directly, at exactly JD 2451545.0 TDB.
// SATURN_DIST above is Saturn's long-run mean semi-major axis (it keys the time scale to the real
// period); the osculating one here, (perihelion + aphelion) / 2 = 9.582 AU, is slightly larger.
export const SATURN_PERIHELION_DIST = 1353682191 / DIST_SCALE; // 1,353,682,191 km (9.0488 AU)
export const SATURN_APHELION_DIST = 1513190220 / DIST_SCALE; // 1,513,190,220 km (e ≈ 0.05564)
export const SATURN_INCLINATION = 2.484252; // degrees, relative to the ecliptic
export const SATURN_LONG_ASC_NODE = 113.69966; // degrees, longitude of the ascending node (Ω)
export const SATURN_ARG_PERIHELION = 335.865594; // degrees, argument of perihelion (ω)
export const SATURN_MEAN_ANOMALY_J2000 = 320.425557; // degrees

// === Uranus: Orbital Elements (J2000) ===
// Uranus's orbit is close to circular (e = 0.0444) and barely tilted (0.77°), but at 19 AU that
// small eccentricity still moves the Sun distance by 255 million km over its 84-year orbit.
// These are JPL Horizons (Uranus 799, Sun-centred, J2000 ecliptic) osculating elements at J2000
// directly, at exactly JD 2451545.0 TDB.
// URANUS_DIST above is Uranus's long-run mean semi-major axis (it keys the time scale to the real
// period); the osculating one here, (perihelion + aphelion) / 2 = 19.23 AU, is slightly different.
// Body-centre elements wobble with the moons, and Ω is poorly defined at 0.77° inclination, so Ω
// and ω move a tenth of a degree per day (their sum ϖ + M, which fixes the position, stays put).
export const URANUS_PERIHELION_DIST = 2749080518 / DIST_SCALE; // 2,749,080,518 km (18.3765 AU)
export const URANUS_APHELION_DIST = 3004497768 / DIST_SCALE; // 3,004,497,768 km (e ≈ 0.04439)
export const URANUS_INCLINATION = 0.772676; // degrees, relative to the ecliptic
export const URANUS_LONG_ASC_NODE = 74.004746; // degrees, longitude of the ascending node (Ω)
export const URANUS_ARG_PERIHELION = 96.588725; // degrees, argument of perihelion (ω)
export const URANUS_MEAN_ANOMALY_J2000 = 142.889576; // degrees

// === Neptune: Orbital Elements (J2000) ===
// Neptune's orbit is far less exotic than Pluto's — eccentricity 0.011 against Pluto's 0.25,
// and only 1.77° out of the ecliptic — but those two small departures are still real, and they
// are what make Neptune's path its own rather than a perfect circle.
// These are JPL Horizons (Neptune 899, Sun-centred, J2000 ecliptic) osculating elements at J2000
// directly, at exactly JD 2451545.0 TDB.
// NEPTUNE_DIST above is Neptune's long-run mean semi-major axis (it keys the time scale to the
// real period); the osculating one here, (perihelion + aphelion) / 2 = 30.09 AU, is slightly
// larger. Body-centre elements wobble with Triton, so ω and M move a few hundredths of a degree
// per day (their sum ϖ + M, which fixes the position, stays put).
export const NEPTUNE_PERIHELION_DIST = 4451548601 / DIST_SCALE; // 4,451,548,601 km (29.7568 AU)
export const NEPTUNE_APHELION_DIST = 4552424871 / DIST_SCALE; // 4,552,424,871 km (e ≈ 0.01120)
export const NEPTUNE_INCLINATION = 1.770214; // degrees, relative to the ecliptic
export const NEPTUNE_LONG_ASC_NODE = 131.783877; // degrees, longitude of the ascending node (Ω)
export const NEPTUNE_ARG_PERIHELION = 267.315805; // degrees, argument of perihelion (ω)
export const NEPTUNE_MEAN_ANOMALY_J2000 = 266.105016; // degrees

// === Pluto: Orbital Elements (J2000) ===
// Pluto's orbit is the most eccentric and most inclined of the major bodies — it crosses inside
// Neptune's orbit near perihelion — so it is the body where real elements matter most.
// These are JPL Horizons (Pluto 999, Sun-centred, J2000 ecliptic) osculating elements at J2000
// directly, at exactly JD 2451545.0 TDB.
// PLUTO_DIST above is Pluto's long-run mean semi-major axis (it keys the time scale to the real
// period); the osculating one here, (perihelion + aphelion) / 2 = 39.57 AU, is slightly larger.
// Body-centre elements wobble with Charon (Pluto's centre circles the system barycenter every
// 6.4 days), so e, i, Ω and ω swing noticeably from day to day (their sum ϖ + M, which fixes the
// position, stays put).
export const PLUTO_PERIHELION_DIST = 4443097133 / DIST_SCALE; // 4,443,097,133 km (29.7003 AU)
export const PLUTO_APHELION_DIST = 7396455796 / DIST_SCALE; // 7,396,455,796 km (e ≈ 0.24945)
export const PLUTO_INCLINATION = 17.235653; // degrees, relative to the ecliptic
export const PLUTO_LONG_ASC_NODE = 110.03994; // degrees, longitude of the ascending node (Ω)
export const PLUTO_ARG_PERIHELION = 115.178666; // degrees, argument of perihelion (ω)
export const PLUTO_MEAN_ANOMALY_J2000 = 14.143655; // degrees

// === Charon: Orbital Elements (J2000, orbit about Pluto) ===
// JPL Horizons (Charon 901, Pluto-centred body centre, J2000 ecliptic, PLU060/DE440) osculating
// elements at exactly J2000 (JD 2451545.0 TDB). Charon orbits in Pluto's equatorial plane, so the
// ≈112.9° inclination is Pluto's 119.6° axial tilt seen from the ecliptic, not an unusually tilted
// orbit. The orbit is almost perfectly circular (e ≈ 0.00016) and Charon is tidally locked.
export const CHARON_PERIAPSIS_DIST = 19592.60580516936 / DIST_SCALE; // 19,592.606 km
export const CHARON_APOAPSIS_DIST = 19598.91827731688 / DIST_SCALE; // 19,598.918 km
export const CHARON_INCLINATION = 112.8908097641467; // degrees, inclination to the ecliptic
export const CHARON_LONG_ASC_NODE = 227.3916867008565; // degrees (Ω)
export const CHARON_ARG_PERIAPSIS = 172.5855027165132; // degrees (ω)
export const CHARON_MEAN_ANOMALY_J2000 = 148.6651344828103; // degrees

// === Planetary System: Spin Pole (degrees) ===
// Each body's *_AXIS / *_AZIMUTH pair names its spin pole — the end its angular momentum points
// out of (right-hand rule) — in J2000 ecliptic coordinates, consumed by spinPoleQuaternion()
// (utilities/spin-pole.ts):
//
//     *_AXIS    = 90° − β_pole   (angle from ecliptic north; > 90° means a retrograde spinner)
//     *_AZIMUTH = λ_pole + 90°   (mod 360°)
//
// *_AXIS is therefore measured from the ECLIPTIC normal, not the body's own orbit normal, so it
// is not the textbook obliquity (Mercury's is 0.03° to its orbit but 7.0° to the ecliptic,
// because its orbit is inclined 7°).
//
// Source: IAU WGCCRE 2015 (Archinal et al. 2018, Celest. Mech. Dyn. Astr. 130:22), J2000
// constant terms of α₀/δ₀ (the T-rate and periodic terms are < 1° and dropped), converted to the
// ecliptic with ε = 23.4393°. The IAU gives the NORTH pole for planets (north side of the
// invariable plane) but the POSITIVE (right-hand) pole for dwarf planets; Venus and Uranus spin
// retrograde (negative W), so their spin pole is the antipode of the listed north pole.
export const SUN_AXIS = 7.25; //     α₀=286.13°, δ₀= 63.87° → λ=345.8°, β=+82.75°
export const MERCURY_AXIS = 7.04; // α₀=281.01°, δ₀= 61.45° → λ=318.2°, β=+82.96°
export const VENUS_AXIS = 178.76; // α₀=272.76°, δ₀= 67.16° (north) → spin pole λ=210.2°, β=−88.76°
export const EARTH_AXIS = 23.44; //  α₀=  0.00°, δ₀= 90.00° → λ= 90.0°, β=+66.56°
export const MARS_AXIS = 26.72; //   α₀=317.68°, δ₀= 52.89° → λ=352.9°, β=+63.28°
export const JUPITER_AXIS = 2.22; // α₀=268.06°, δ₀= 64.50° → λ=247.8°, β=+87.78°
export const SATURN_AXIS = 28.05; // α₀= 40.59°, δ₀= 83.54° → λ= 79.5°, β=+61.95°
export const URANUS_AXIS = 97.72; // α₀=257.31°, δ₀=−15.18° (north) → spin pole λ=77.7°, β=−7.72°
export const NEPTUNE_AXIS = 28.03; // α₀=299.36°, δ₀= 43.46° → λ=319.2°, β=+61.97°
export const PLUTO_AXIS = 112.82; // α₀=132.99°, δ₀= −6.16° (positive pole) → λ=137.4°, β=−22.82°

export const SUN_AZIMUTH = 75.8;
export const MERCURY_AZIMUTH = 48.2;
export const VENUS_AZIMUTH = 300.2;
export const EARTH_AZIMUTH = 180;
export const MARS_AZIMUTH = 82.9;
export const JUPITER_AZIMUTH = 337.8;
export const SATURN_AZIMUTH = 169.5;
export const URANUS_AZIMUTH = 167.7;
export const NEPTUNE_AZIMUTH = 49.2;
export const PLUTO_AZIMUTH = 227.4;
export const CERES_AZIMUTH = 101.2; // α₀=291.42°, δ₀= 66.76° (positive pole) → λ=11.2°, β=+81.55°

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
export const SATURN_ORBITAL_PERIOD_REAL = 10755.699 * 24 * 3600;
export const URANUS_ORBITAL_PERIOD_REAL = 30685.4 * 24 * 3600;
export const NEPTUNE_ORBITAL_PERIOD_REAL = 60190.03 * 24 * 3600;
export const PLUTO_ORBITAL_PERIOD_REAL = 90560 * 24 * 3600;

// === Satellites: Mass ===
export const ISS_MASS = 419725 / MASS_SCALE;

// === Satellites: Radius ===
export const ISS_RADIUS = 0.1 / RADIUS_SCALE;

// === Satellites: Inclination ===
export const ISS_INCLINATION = 51.64; // to Earth's equator (createSatellite builds it there)

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

// === Asteroids & Halley: Orbital Elements (JPL Horizons, J2000) ===
// Ceres, Vesta, Pallas, Hygiea and Halley use JPL Horizons osculating elements at J2000
// (Sun-centred, J2000 ecliptic), the same epoch as the planets, taken at exactly JD 2451545.0 TDB.

// Ceres uses JPL Horizons (SB: 1 Ceres, Sun-centred, J2000 ecliptic) osculating elements at J2000
// directly, at exactly JD 2451545.0 TDB.
export const CERES_DISTANCE = 413861914 / DIST_SCALE; // semi-major axis (413,861,914 km)
export const CERES_PERIHELION_DIST = 381425227 / DIST_SCALE; // 381,425,227 km
export const CERES_APHELION_DIST = 446298601 / DIST_SCALE; // 446,298,601 km (e ≈ 0.07838)
export const CERES_INCLINATION = 10.58336; // degrees
export const CERES_LONG_ASC_NODE = 80.494357; // degrees (Ω)
export const CERES_ARG_PERIHELION = 73.922863; // degrees (ω)
export const CERES_MEAN_ANOMALY_J2000 = 6.176655; // degrees

// Vesta uses JPL Horizons (SB: 4 Vesta, Sun-centred, J2000 ecliptic) osculating elements at J2000
// directly, at exactly JD 2451545.0 TDB.
export const VESTA_DISTANCE = 353280598 / DIST_SCALE; // semi-major axis (353,280,598 km)
export const VESTA_PERIHELION_DIST = 321477414 / DIST_SCALE; // 321,477,414 km
export const VESTA_APHELION_DIST = 385083781 / DIST_SCALE; // 385,083,781 km (e ≈ 0.09002)
export const VESTA_INCLINATION = 7.133936; // degrees
export const VESTA_LONG_ASC_NODE = 103.951437; // degrees (Ω)
export const VESTA_ARG_PERIHELION = 149.586668; // degrees (ω)
export const VESTA_MEAN_ANOMALY_J2000 = 341.023834; // degrees

// Pallas uses JPL Horizons (SB: 2 Pallas, Sun-centred, J2000 ecliptic) osculating elements at J2000
// directly, at exactly JD 2451545.0 TDB.
export const PALLAS_DISTANCE = 414733539 / DIST_SCALE; // semi-major axis (414,733,539 km)
export const PALLAS_PERIHELION_DIST = 319492664 / DIST_SCALE; // 319,492,664 km
export const PALLAS_APHELION_DIST = 509974414 / DIST_SCALE; // 509,974,414 km (e ≈ 0.22964)
export const PALLAS_INCLINATION = 34.84614; // degrees
export const PALLAS_LONG_ASC_NODE = 173.197799; // degrees (Ω)
export const PALLAS_ARG_PERIHELION = 310.265638; // degrees (ω)
export const PALLAS_MEAN_ANOMALY_J2000 = 352.960286; // degrees

// Hygiea uses JPL Horizons (SB: 10 Hygiea, Sun-centred, J2000 ecliptic) osculating elements at
// J2000 directly, at exactly JD 2451545.0 TDB.
export const HYGIEA_DISTANCE = 469501148 / DIST_SCALE; // semi-major axis (469,501,148 km)
export const HYGIEA_PERIHELION_DIST = 413412290 / DIST_SCALE; // 413,412,290 km
export const HYGIEA_APHELION_DIST = 525590005 / DIST_SCALE; // 525,590,005 km (e ≈ 0.11946)
export const HYGIEA_INCLINATION = 3.842651; // degrees
export const HYGIEA_LONG_ASC_NODE = 283.663205; // degrees (Ω)
export const HYGIEA_ARG_PERIHELION = 314.368234; // degrees (ω)
export const HYGIEA_MEAN_ANOMALY_J2000 = 339.214814; // degrees

// == Asteroids: Axial Tilt ===
// Ecliptic spin pole, same convention as the planetary block (Ceres' azimuth lives there).
export const CERES_AXIS = 8.45;

// Pallas' spin pole sits at ecliptic (λ, β) = (30°, -16°) ± 5° (Carry et al. 2010, Icarus 205,
// 460), which is an obliquity of ~84° to Pallas' own orbital plane. The tilt below is 90° - β,
// measured from the ecliptic normal like every *_AXIS here, and Pallas' orbit is itself inclined
// 34.85°, so 106° is the value that reproduces the published pole - the 84° headline figure would
// point the axis 22° away from it. The azimuth uses the same λ_pole + 90° mapping documented in
// the spin pole block above.
export const PALLAS_AXIS = 106;
export const PALLAS_AZIMUTH = 120;

// Hygiea's pole points south of the ecliptic: Vernazza et al. 2019 (Nature Astronomy 4, 136) give
// RA 319, Dec -46, which converts to ecliptic longitude 306.6, latitude -28.6 (published as 306,
// -29). That is an obliquity of ~120 - a genuinely retrograde spinner whose axis really does lean
// more than 90 degrees from the ecliptic normal, so an AXIS above 90 is correct, not a sign slip.
export const HYGIEA_AXIS = 118.6;
export const HYGIEA_AZIMUTH = 36.6;

// Vesta's pole is the IAU/Dawn solution: RA 309.031, Dec +42.235 (IAU WGCCRE 2013, the "Claudia
// Double-Prime" system; Dawn's gravity solution agrees to 0.01 deg). Converted to ecliptic that is
// longitude 330.8, latitude 57.7, giving an obliquity of 27.5 deg to Vesta's orbit - which matches
// the published 27.46 deg, so the conversion and the mapping below are cross-checked against an
// independent number rather than just internally consistent.
export const VESTA_AXIS = 32.3;
export const VESTA_AZIMUTH = 60.8;

// === Asteroids: Orbital Period ===
export const CERES_ORBITAL_PERIOD_REAL = 1682.0 * 24 * 3600; // ~4.607 Earth years in seconds
// Pallas: 4.62 Julian years (1,686.044 days). Keys its rotation speed to its orbit, exactly as
// CERES_ORBITAL_PERIOD_REAL does, so the spin stays telescopically correct at any gravity setting.
export const PALLAS_ORBITAL_PERIOD_REAL = 1686.044 * 24 * 3600;
// Hygiea: 5.56 Julian years (2,031.01 days).
export const HYGIEA_ORBITAL_PERIOD_REAL = 2031.01 * 24 * 3600;
// Vesta: 3.63 Julian years (1,325.75 days).
export const VESTA_ORBITAL_PERIOD_REAL = 1325.75 * 24 * 3600;

// === Comet (Halley): Mass, Radius, Distance ===
// Halley's Comet: 2.2e14 kg
export const COMET_MASS = 2.2e14 / MASS_SCALE;
export const COMET_RADIUS = 11 / RADIUS_SCALE;
// Orbit: Horizons SB: 1P/Halley. Retrograde (i > 90°). Osculating, so the semi-major axis
// (17.9 AU) and aphelion (35.3 AU) differ slightly from the long-run mean values.
export const COMET_PERIHELION_DIST = 87749221 / DIST_SCALE; // 87,749,221 km (0.5866 AU)
export const COMET_APHELION_DIST = 5274289477 / DIST_SCALE; // 5,274,289,477 km (e ≈ 0.96727)
export const HALLEY_SEMI_MAJOR_AXIS = 2_682_085_628 / DIST_SCALE; // 17.9 AU
export const COMET_INCLINATION = 162.196043; // degrees
export const COMET_LONG_ASC_NODE = 59.507865; // degrees (Ω)
export const COMET_ARG_PERIHELION = 112.449622; // degrees (ω)
export const COMET_MEAN_ANOMALY_J2000 = 65.848901; // degrees
export const HALLEY_ORBITAL_PERIOD_REAL = 27728.046088 * 24 * 3600;

/** Peak camera shake displacement (u) applied each frame during warp. */
export const WARP_SHAKE_MAG = 0.002; // No scale factor here; shake is in camera-local space so should feel consistent at all scales.

// === Miscellaneous & Simulation Parameters ===
export const KUIPER_BELT_COUNT = 12000;
export const KUIPER_BELT_INNER_DIST = 4500000000 / DIST_SCALE; // 4,500,000,000 km
export const KUIPER_BELT_OUTER_DIST = 7500000000 / DIST_SCALE; // 7,500,000,000 km
export const KUIPER_BELT_VERTICAL_SPREAD = 100000000 / DIST_SCALE; // 100,000,000 km
/** Peak opacity of the Kuiper belt points once the camera is far enough out to see them. */
export const KUIPER_BELT_OPACITY = 0.4;
// Kuiper belt objects are far too small and dim to see from inside the system; the belt only reads
// as a structure from well outside it. Its opacity follows the camera's distance from the system
// centre: invisible inside FADE_START (just past the outer edge, ~57 AU), fully visible beyond
// FADE_END (~80 AU), which the camera reaches near its maximum zoom-out (~87 AU).
export const KUIPER_BELT_FADE_START_DIST = 8500000000 / DIST_SCALE; // 8,500,000,000 km
export const KUIPER_BELT_FADE_END_DIST = 12000000000 / DIST_SCALE; // 12,000,000,000 km

// === Star Light ===
/** The DIST_SCALE at which the base light intensity values below were tuned. */
export const LIGHT_INTENSITY_REFERENCE_DIST_SCALE = 100;
/** Point-light decay exponent. */
export const STAR_LIGHT_DECAY = 1;

// Base light intensity values, tuned at DIST_SCALE = LIGHT_INTENSITY_REFERENCE_DIST_SCALE.
const BASE_SUN_LIGHT_INTENSITY = 50_000_000;
export const BASE_STAR_LIGHT_INTENSITY_MIN = 10_000_000;
export const BASE_STAR_LIGHT_INTENSITY_MAX = 100_000_000;

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

/**
 * Fixed reference intensity that STAR_LIGHT_EXPOSURE is calibrated against: a star of this
 * intensity delivers an irradiance of π at 1 AU. Deliberately independent of
 * BASE_SUN_LIGHT_INTENSITY, so raising or lowering the Sun's intensity actually changes how bright
 * the scene is (normalizing by the Sun's own intensity would cancel any change to it out).
 */
const BASE_STAR_LIGHT_EXPOSURE_REFERENCE_INTENSITY = 20_000_000;
const STAR_LIGHT_EXPOSURE_REFERENCE_INTENSITY = BASE_STAR_LIGHT_EXPOSURE_REFERENCE_INTENSITY * STAR_LIGHT_SCALE;

/**
 * Converts a star's light intensity (the value stored on the star and shown in the editor) into
 * the intensity of its three.js point light. Chosen so a star of
 * STAR_LIGHT_EXPOSURE_REFERENCE_INTENSITY delivers an irradiance of π at 1 AU: under three's
 * Lambert shading a surface facing it then shows exactly its texture's colour. The Sun's
 * irradiance at 1 AU is π × (SUN_LIGHT_INTENSITY / reference), so BASE_SUN_LIGHT_INTENSITY is a
 * real brightness knob.
 *
 * Every consumer of star light (surfaces, atmospheres, clouds, rings, Earth's day/night, the sky)
 * reads the point light's intensity, so this one factor moves them all together. Irradiance
 * thresholds (EARTH_*_IRRADIANCE, STAR_HIDE_SKY_RADIANCE) are expressed with it.
 */
export const STAR_LIGHT_EXPOSURE =
    Math.PI / (STAR_LIGHT_EXPOSURE_REFERENCE_INTENSITY / Math.pow(AU, STAR_LIGHT_DECAY));

/**
 * Ambient fill light (the world's base plus each star's share). Scaled with STAR_LIGHT_EXPOSURE
 * so unlit sides stay as dark as they always looked once the output is tone mapped.
 */
export const WORLD_AMBIENT_INTENSITY = 0.05 * STAR_LIGHT_EXPOSURE;
export const STAR_AMBIENT_INTENSITY = 0.05 * STAR_LIGHT_EXPOSURE;

/**
 * Most stars any star-lighting effect considers at once: the lens flare, sun rays, Earth's
 * day/night shader and the atmosphere shells. One constant so they always stay in sync.
 */
export const MAX_LIGHTING_STARS = 4;

// === Shadows (see src/effects/shadows/) ===
/** Most bodies cast eclipse shadows at once: the ones nearest the camera. */
export const MAX_SHADOW_OCCLUDERS = 8;
/** Most stars whose disc size the eclipse shader knows (any further ones cast hard-edged shadows). */
export const MAX_SHADOW_STARS = 8;
/** Most ships rendered into the ship shadow atlas at once (High); Low uses 1. */
export const MAX_SHIP_SHADOW_CASTERS = 4;
/** Ship shadow atlas edge in texels, per shadow quality. */
export const SHIP_SHADOW_ATLAS_SIZE_LOW = 1024;
export const SHIP_SHADOW_ATLAS_SIZE_HIGH = 2048;
/** Ships farther than this from the camera (surface to camera) cast no shadow-map shadow. */
export const SHIP_SHADOW_CASTER_RANGE = 5 / DIST_SCALE; // 5 km
/**
 * How far behind a ship (along the light) its shadow is drawn. A ship farther than this above the
 * ground casts no shadow onto it — at that height the shadow is a faint smudge anyway.
 */
export const SHIP_SHADOW_THROW = 5 / DIST_SCALE; // 5 km
/**
 * Half-width of a ship's shadow tile as a fraction of its radius. The model's longest dimension
 * equals the radius, so the hull reaches 0.5; the rest is margin for the penumbra kernel.
 */
export const SHIP_SHADOW_TILE_HALF_WIDTH = 0.6;
/** Render layer the ship hulls are put on so the shadow pass draws only them. */
export const SHADOW_CASTER_LAYER = 5;
/**
 * Render layer that body nodes are moved to (off layer 0) while the screen-size LOD hides them
 * from the main camera (drawing/body-lod.ts). The click-picking raycaster enables it, so a hidden
 * body stays clickable and its velocity-snap target stays hittable.
 */
export const BODY_LOD_HIDDEN_LAYER = 6;

/**
 * How often a body name panel re-formats its distance text, per Name Panel Updates setting, in
 * milliseconds (0 = every frame). Panel position follows the body every frame regardless.
 */
export const NAME_PANEL_TEXT_INTERVAL_MS = Object.freeze({ low: 250, medium: 100, high: 0 });

/**
 * Screen-size LOD for bodies (drawing/body-lod.ts). Sizes are the body's apparent radius in
 * pixels. Each boundary has an `enter` size (drop to the coarser tier below it) and a larger
 * `exit` size (return above it), so a body hovering at a boundary does not flicker.
 *
 *   Full    — the body as built: full sphere, atmosphere, clouds, rings.
 *   Reduced — the sphere is drawn with a low-poly proxy (child effects unchanged; they already
 *             reduce themselves when small). Physics, eclipses and the surface patch still read
 *             the full geometry, which is never swapped.
 *   Dot     — the body and everything attached to it is hidden from the main camera and drawn
 *             as one point in a shared Points buffer.
 *
 * A dot's brightness is the light the body really reflects toward the camera: star irradiance at
 * the body (normalized by STAR_LIGHT_EXPOSURE, so the reference star gives π at 1 AU) × DOT_ALBEDO × the
 * body's angular radius² (radians). That flux is placed on a log scale like a magnitude, because
 * a few-pixel dot cannot be lit physically: Venus and Mars differ ~100× in flux, yet both are
 * naked-eye objects. Reference fluxes (log10) seen from Earth: Venus −8.6…−7.6, Jupiter −8.7,
 * Mercury −9.2, Mars −8.9…−9.9, Saturn −9.7, Uranus −11.4, Vesta −12.9, Charon −15.3.
 */
export const BODY_LOD_TUNING = Object.freeze({
    /** Full ↔ Reduced boundary. */
    REDUCED: Object.freeze({ enter: 24, exit: 32 }),
    /** Reduced ↔ Dot boundary. */
    DOT: Object.freeze({ enter: 1.5, exit: 2.25 }),
    /** Segments of the shared low-poly proxy sphere. */
    REDUCED_WIDTH_SEGMENTS: 32,
    REDUCED_HEIGHT_SEGMENTS: 16,
    /** Point size of a distant-body dot, in pixels (scaled with the render scale). */
    DOT_SIZE_PX: 2.5,
    /** Dots past the far plane are pulled in along their view ray to this fraction of it, so
     *  they stay visible beyond the Render Distance without moving on screen. */
    DOT_FAR_FRACTION: 0.95,
    /** Threshold multiplier per Distant Body Detail setting. Higher = coarser sooner. */
    DETAIL_SCALE: Object.freeze({ low: 2, medium: 1, high: 0.5 }),
    /** Reflectivity assumed for every body's dot (bodies carry no albedo of their own). */
    DOT_ALBEDO: 0.3,
    /** log10 flux at which a dot fades out completely under a dark sky. Lower = fainter bodies
     *  show (about Uranus seen from Earth by default). */
    DOT_LIMIT_LOG_FLUX: -11.7,
    /** Decades of flux above the limit at which a dot reaches full brightness (about Venus and
     *  Jupiter from Earth). Larger = a gentler fade between faint and bright bodies. */
    DOT_SPAN_DECADES: 3,
    /** How many decades a full daytime sky raises the limit. 4.5 hides even Venus at its
     *  closest; lower it to let the brightest planets show through the day. */
    DOT_DAY_LIMIT_DECADES: 4.5,
});

/** How far beyond the hull of a landed ship the player rig is set down when stepping out (E). */
export const DISEMBARK_DISTANCE = 0.01 / DIST_SCALE; // 10 m

// === Player rig on foot (bodies/player-rig.ts, physics/player-rig-physics.ts) ===
/** Mass of the player on foot (80 kg). Negligible gravity on anything else. */
export const PLAYER_MASS = 80 / MASS_SCALE;
/** Collision radius of the player's body: probe spheres against ship hulls. */
export const PLAYER_RADIUS = 0.0003 / DIST_SCALE; // 0.3 m
/** Eye height above the feet. */
export const PLAYER_EYE_HEIGHT = 0.0017 / DIST_SCALE; // 1.7 m
/** Heights above the feet of the probe spheres tested against ship hulls (knee, chest). */
export const PLAYER_HULL_PROBE_HEIGHTS = [0.0005 / DIST_SCALE, 0.0013 / DIST_SCALE]; // 0.5 m, 1.3 m
/** Walking speed over the ground (velocity convention: km/s / DIST_SCALE). */
export const PLAYER_WALK_SPEED = 0.0014 / DIST_SCALE; // 1.4 m/s
/** Sprinting speed over the ground (Shift). */
export const PLAYER_SPRINT_SPEED = 0.006 / DIST_SCALE; // 6 m/s
/** Take-off speed of a jump: ≈ 0.6 m high on Earth, ≈ 3.8 m on the Moon. */
export const PLAYER_JUMP_SPEED = 0.0035 / DIST_SCALE; // 3.5 m/s
/**
 * Friction coefficient between feet and ground. Every change of ground speed (starting, stopping,
 * turning) is limited to μ·g, so walking is sluggish where gravity is weak.
 */
export const PLAYER_TRACTION_MU = 1.0;
/** Height above the drawn ground within which the player counts as standing on it. */
export const PLAYER_GROUND_TOLERANCE = 0.00005 / DIST_SCALE; // 5 cm
/** Ground-relative speed at or below which a player with no input comes to rest and is parked. */
export const PLAYER_STICK_SPEED = 0.0002 / DIST_SCALE; // 0.2 m/s
/** Height of the shadow-only figure the player casts on the ground (feet to top of head). */
export const PLAYER_SHADOW_HEIGHT = 0.0018 / DIST_SCALE; // 1.8 m
/** Shoulder width of the player's shadow figure. */
export const PLAYER_SHADOW_WIDTH = 0.00045 / DIST_SCALE; // 45 cm
/** Front-to-back depth of the player's shadow figure. */
export const PLAYER_SHADOW_DEPTH = 0.00025 / DIST_SCALE; // 25 cm
/** Radius of the shadow figure's head. */
export const PLAYER_SHADOW_HEAD_RADIUS = 0.00012 / DIST_SCALE; // 12 cm

// === Headlamp on foot (camera/headlamp.ts) ===
/**
 * Beam reach: the light fades smoothly to zero here. three.js clamps inverse-square falloff below
 * 0.1 sim units (`max(d^decay, 0.01)`), far beyond human scale, so the lamp uses decay 0 and lets
 * the cutoff window `(1 - (d / range)^4)^2` shape the fade instead.
 */
export const HEADLAMP_RANGE = 0.06 / DIST_SCALE; // 60 m
/** Beam half-angle (radians). */
export const HEADLAMP_ANGLE = (25 * Math.PI) / 180;
/** Fraction of the cone that is soft edge (0 = hard rim, 1 = fully soft). */
export const HEADLAMP_PENUMBRA = 0.5;
/** Beam intensity, in the same irradiance units as star light (sunlight at 1 AU ≈ π). */
export const HEADLAMP_INTENSITY = 0.3 * Math.PI;
/** Beam colour: a warm white. */
export const HEADLAMP_COLOR = 0xfff2e0;
/** The lamp sits this far above the eye, so the lit ground is not perfectly flat-shaded. */
export const HEADLAMP_EYE_OFFSET = 0.0001 / DIST_SCALE; // 10 cm

// === Head bob / camera sway on foot (camera/head-bob.ts) ===
/** Ground distance covered per full stride (two footfalls). */
export const HEAD_BOB_STRIDE_LENGTH = 0.0016 / DIST_SCALE; // 1.6 m
/** Vertical bob amplitude at walking speed. */
export const HEAD_BOB_VERTICAL_WALK = 0.00003 / DIST_SCALE; // 3 cm
/** Vertical bob amplitude at sprinting speed. */
export const HEAD_BOB_VERTICAL_SPRINT = 0.00008 / DIST_SCALE; // 8 cm
/** Side-to-side sway amplitude, as a fraction of the vertical bob. */
export const HEAD_BOB_LATERAL_RATIO = 0.6;
/** Peak camera roll at sprinting speed, in radians (≈ 0.8°). */
export const HEAD_BOB_ROLL_SPRINT = 0.014;
/** Rate (1/s, wall clock) at which bob amplitude eases toward its target. */
export const HEAD_BOB_EASE_RATE = 8;
/** Landing dip: eye drop per unit of impact speed (sim units / (sim units/s)), in seconds. */
export const HEAD_BOB_LANDING_DIP_PER_SPEED = 0.04;
/** Largest landing dip. */
export const HEAD_BOB_LANDING_DIP_MAX = 0.0004 / DIST_SCALE; // 40 cm
/** Angular frequency (rad/s) of the critically damped spring that recovers the landing dip. */
export const HEAD_BOB_LANDING_SPRING = 12;

// === Surface precision patch (effects/surface-precision-patch.ts) ===
/**
 * Camera altitude (sim units) above a body's drawn surface below which the ground under the
 * camera is redrawn by the precision patch. Above it the body mesh's float32 rounding (≈ radius ×
 * 6e-8: ~4 m on Jupiter) is far below a pixel.
 */
export const SURFACE_PATCH_MAX_ALTITUDE = 500 / DIST_SCALE; // 500 km
/**
 * The patch splits a triangle while its longest edge exceeds this × its distance from the camera,
 * so triangles grow geometrically with distance and the vertices near the camera stay tiny.
 */
export const SURFACE_PATCH_SUBDIVIDE_RATIO = 1.0;
/** Shortest triangle edge (sim units) the patch splits down to. */
export const SURFACE_PATCH_MIN_EDGE = 1 / 1000 / DIST_SCALE; // 1 m
/** Hard cap on the patch's triangle count; splitting stops once it is reached. */
export const SURFACE_PATCH_MAX_TRIANGLES = 30000;
/**
 * The patch is rebuilt around a new origin once the point under the camera has moved more than
 * this × the camera's altitude (or onto a different quad of the body mesh).
 */
export const SURFACE_PATCH_REBUILD_FRACTION = 0.25;

// === Sky / atmosphere lighting ===
// A sky is lit by the exact irradiance each star's point light delivers to the body (its
// intensity, STAR_LIGHT_DECAY and light distance), the same light the surface receives, with no
// reference or normalisation. So the star-light constants above set the sky's brightness too.
/**
 * Earth's day/night switch, in illuminance: Σ star irradiance × luminance(light colour) × N·L,
 * the same units three.js lights the surface with. These are absolute visibility thresholds, not
 * an Earth reference: a spot receiving less than EARTH_NIGHT_IRRADIANCE shows the night texture
 * and city lights, more than EARTH_DAY_IRRADIANCE shows the day texture, smoothly in between.
 * For scale, with STAR_LIGHT_DECAY = 1 the Sun gives π (≈3.14) at 1 AU, ≈0.33 at Saturn and
 * ≈0.10 at Neptune; a white dwarf gives ≈0.0003 at 1 AU. The thresholds were tuned before
 * STAR_LIGHT_EXPOSURE (as 0.15 and 1.5), so they are scaled by it to switch at the same places.
 */
export const EARTH_NIGHT_IRRADIANCE = 0.15 * STAR_LIGHT_EXPOSURE;
export const EARTH_DAY_IRRADIANCE = 1.5 * STAR_LIGHT_EXPOSURE;
/**
 * Surface pressure (bar) above which the visual atmosphere thickens quickly. The visual optical
 * depth grows with log(1 + pressure / knee), normalised to 1 at 1 bar. A very low knee makes even
 * thin atmospheres read as a mostly opaque sky, as Mars's dusty 0.006-bar sky does (≈0.56 of
 * Earth's), while near-vacuum ones (Pluto, 1e-5 bar ≈ 0.06) stay clear enough to show stars, and
 * Venus (≈1.39) thickens without blowing out. Lower it to make thin skies more opaque.
 */
export const ATMOSPHERE_VISUAL_PRESSURE_KNEE_BAR = 1e-12;
/**
 * Rayleigh (tinted) vertical optical depth of a 1-bar atmosphere, on the tint's brightest channel.
 * 0.25 is close to Earth's real blue-channel depth. (It was 0.4 under the old un-encoded output;
 * with correct output that veiled the whole disc in pale blue. The limb glow barely changes,
 * because grazing rays are optically thick at either value.)
 */
export const ATMOSPHERE_RAYLEIGH_ZENITH_DEPTH = 0.25;
/**
 * Absorption of the colours a tint lacks, as a vertical optical depth per decade of surface
 * pressure above 1 bar (× log10(pressure); 0 at or below Earth's pressure, ≈1.18 for Venus).
 * Scattering alone turns a thick, yellow-tinted sky blue from the ground (the scattered colours
 * are used up first); absorbing the complement, as Venus's air absorbs blue, keeps thick skies the
 * colour of their tint. Keyed to pressure, not the visual depth curve, so tuning
 * ATMOSPHERE_VISUAL_PRESSURE_KNEE_BAR for thin skies doesn't change it.
 */
export const ATMOSPHERE_ABSORPTION_ZENITH_DEPTH = 0.6;
/** Mie (grey haze, sun glare) vertical optical depth of a 1-bar atmosphere. */
export const ATMOSPHERE_MIE_ZENITH_DEPTH = 0.04;

/**
 * A dying star's red-giant radius, as a multiple of its pre-expansion radius, is rolled uniformly
 * in [MIN, MAX]. Real orbit-to-Sun-radius ratios are Mercury ≈ 83x, Venus ≈ 155x and Earth ≈ 215x,
 * so 200-250x always swallows Mercury and Venus, and Earth when the roll lands above ~215x.
 */
export const RED_GIANT_MIN_EXPANSION = 200;
export const RED_GIANT_MAX_EXPANSION = 250;

export const BROWN_DWARF_MASS_THRESHOLD = SUN_MASS * 0.08;
export const MIN_NEUTRON_STAR_MASS = SUN_MASS * 1.4;
export const MAX_NEUTRON_STAR_MASS = SUN_MASS * 3;
export const MIN_BLACK_HOLE_MASS = SUN_MASS * 3;
export const BLACK_HOLE_RADIUS_PER_SOL = 2.95 / RADIUS_SCALE; // Base radius for a black hole of mass MIN_BLACK_HOLE_MASS
/**
 * Coordinate-gizmo scaling. The gizmo must look right on a 0.0005 u probe and on a 7,000 u
 * star, and stay grabbable at any zoom — one world-space size cannot do all three, so the
 * gizmo size is recomputed every frame from the body radius AND the camera distance.
 *
 *   arrowLen = max(GIZMO_MIN_PROTRUSION * radius,
 *                  min(GIZMO_BODY_SCALE * radius,
 *                      GIZMO_MAX_SCREEN_FRACTION * viewportWorldHeight))
 *
 * where viewportWorldHeight is the height of the view frustum at the body's depth. The body
 * term keeps the arrows a fixed multiple of the body (so they wrap a satellite and a star
 * alike); the screen term stops the arrows running off-screen when you zoom in close to a
 * large body; the protrusion floor stops them sinking inside the body when you zoom into its
 * surface. All dimensions (axis arrows, gimbal rings, knobs, arrow heads) scale together.
 */
export const GIZMO_TUNING = Object.freeze({
    /** Base velocity-arrow length per u/s of speed. Shared with the velocity-drag mapping. */
    VELOCITY_ARROW_SCALE: 50,
    /** Arrow length as a multiple of body radius when the body is framed normally (was the
     *  implicit 6x from the old `radius / 10` scale on the 60-unit base arrow). */
    BODY_SCALE: 6,
    /** Minimum arrow length as a multiple of body radius, so the arrows always clear the
     *  surface even when the screen-space cap would otherwise shrink them below the body. */
    MIN_PROTRUSION: 1.2,
    /** Maximum arrow length as a fraction of the viewport height at the body's depth, so the
     *  gizmo can never dominate or run off-screen when the camera is very close. */
    MAX_SCREEN_FRACTION: 0.45,
    /** Gizmo shaft pick tolerance as a fraction of the arrow length. The raycaster's default
     *  1-unit line threshold is meaningless at these scales, so it is set from this. */
    PICK_TOLERANCE_FRACTION: 0.12,
    /** Lower bound on the shaft pick tolerance, so a very small gizmo is still clickable. */
    PICK_TOLERANCE_FLOOR: 0.0005,
});
export const GRAV_ARROW_SCALE = 15000;
/** Gravity-arrow length cap as a multiple of the gizmo arrow length, so the (informational)
 *  gravity arrow can never dwarf the body the way the old fixed 3000-unit cap did. */
export const GRAV_ARROW_MAX_GIZMO_MULTIPLE = 6;

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
 * the significant bodies but not one another. At 5e-10 of total mass, a Sun-dominated system
 * classifies planets, dwarf planets and moons as significant while asteroids and debris become
 * tracers. It sits just under Charon (≈8e-10) so Pluto and Charon, a binary whose mutual pull
 * dominates Charon's motion, interact; Ceres (≈4.7e-10) is the largest body left below it.
 */
export const CUTOFF_MASS_FRACTION = 5e-10;

// === Flight controls ===
export const FLIGHT_MAX_POINTER_OFFSET = 260; // pixels before reaching full turn rate
/** Outer radius (px) of the aim reticle ring at the end of the steering line. Target assist
 *  engages on a threat that touches this ring. */
export const STEERING_RETICLE_RADIUS = 24;
/** Outer radius (px) of the gray steering origin circle centred on the ship's nose. */
export const STEERING_ORIGIN_RADIUS = 124;
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
export const HP_MASS_MULTIPLIER = 1000;

/**
 * Fraction of a ship's maxShieldPoints below which a shield is treated as fully depleted.
 * Absorbs floating-point residue so a shield left at ~0 after a hit snaps to exactly 0.
 */
export const SHIELD_DEPLETED_EPSILON = 1e-6;

/**
 * Damage effectiveness for sources with no shield/hull preference (collisions, atmospheric
 * heating): raw damage applies at full strength to every layer.
 */
export const NEUTRAL_DAMAGE_EFFECTIVENESS: Readonly<IDamageEffectiveness> = { shield: 1, hull: 1 };

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

// === Ship landing bounce ===
// Ships are the one body class that must not ricochet. A ship hitting anything is meant to settle
// onto it — a ship that falls onto a planet should touch down, hop a little, and stay there under
// gravity, not be flung back out into the sky the way COLLISION_RESTITUTION = 0.3 throws it (30%
// of a km/s-scale fall is kilometres of rebound). The two constants below turn a ship contact into
// a near-inelastic one that still reads as a landing rather than a snap-to-stop.

/**
 * Anchor height for a ship's touchdown hop, in metres — the height the bounce is tuned against on
 * an Earth-like surface. Kept small on purpose: this is the settle-out of a landing, not a bounce.
 *
 * The push itself is a fixed speed (see SHIP_LANDING_BOUNCE_SPEED), so this height is what the
 * ship gets under Earth-surface gravity and every other body scales off its own gravity: a lower-g
 * surface lofts the ship higher (≈9 m on the Moon, ≈4 m on Mars), a higher-g one lower (≈0.6 m on
 * Jupiter), which is exactly what a fixed impulse does under different gravity.
 */
export const SHIP_LANDING_BOUNCE_HEIGHT_M = 1.5;

/** Earth-surface gravity in sim units/s² — the reference SHIP_LANDING_BOUNCE_SPEED is derived from. */
const EARTH_SURFACE_GRAVITY = (G * EARTH_MASS) / EARTH_RADIUS ** 2;

/**
 * Hard cap on the speed a ship rebounds with after a collision, in sim units/s. Derived from
 * SHIP_LANDING_BOUNCE_HEIGHT_M and Earth-surface gravity (v = √(2gh)), so it is exactly the launch
 * speed for that hop on an Earth-like surface.
 *
 * A speed cap rather than a restitution factor, deliberately: a restitution factor scales with the
 * impact speed, so the harder the fall the worse the rebound — which is the behaviour being removed
 * here. Every ship landing, fast or slow, leaves the surface at no more than this.
 */
export const SHIP_LANDING_BOUNCE_SPEED = Math.sqrt(
    2 * EARTH_SURFACE_GRAVITY * (SHIP_LANDING_BOUNCE_HEIGHT_M / 1000 / DIST_SCALE)
);

/**
 * Fraction of a ship's incoming closing speed returned on a bounce, applied *before* the
 * SHIP_LANDING_BOUNCE_SPEED cap. This is the energy loss that lets a ship settle instead of
 * hopping forever: a hard landing rebounds at the cap (one hop), lands again and leaves at this
 * fraction of that, so the arc shrinks geometrically and the ship is at rest after a bounce or two.
 */
export const SHIP_LANDING_BOUNCE_RESTITUTION = 0.05;

/**
 * Closing speed (sim units/s) below which a ship contact is treated as resting contact and hands
 * back no rebound at all. Without it a grounded ship re-bounces every frame off the speed gravity
 * adds in that frame, which reads as jitter. The effective threshold also scales up with the
 * per-frame gravity speed (see resolveShipContact), so time warp does not turn resting into hopping.
 */
export const SHIP_LANDING_REST_SPEED = 0.5 / 1000 / DIST_SCALE; // 0.5 m/s

/**
 * Coulomb friction coefficient between a ship and whatever it is touching. The tangential impulse
 * of a contact is capped at this × the normal impulse, so a ship skidding along the ground loses
 * μ·g of sliding speed per second (≈10 m/s² on Earth at 1.0) and a steep crash, whose normal impulse
 * is large, is stopped almost dead in a single contact.
 */
export const SHIP_SURFACE_FRICTION = 1.0;

/**
 * Sliding speed (sim units/s) at the contact point below which a ship simply sticks to the ground
 * — its tangential motion relative to the surface (including the surface's spin) is cancelled
 * outright. This is the static-friction stand-in that stops the last slow creep once Coulomb
 * friction has done the heavy braking.
 */
export const SHIP_GROUND_STICK_SPEED = 2 / 1000 / DIST_SCALE; // 2 m/s

/**
 * Ship contacts are separated to exactly touching ((r₁ + r₂) × this) rather than
 * COLLISION_SEPARATION_FACTOR. That factor is relative, so on an Earth-sized body its 0.1% is
 * ~6 km — every ground contact would teleport the ship kilometres into the sky and gravity would
 * turn that into a long fall and another impact. Touching exactly also lets a grounded ship
 * re-contact every frame, which is what keeps friction acting on it.
 */
export const SHIP_CONTACT_SEPARATION_FACTOR = 1.0;

/**
 * Ship-vs-ship contact tests the actual model triangles (see ship-mesh-collision.ts). This caps
 * how many touching triangle pairs one contact gathers for its normal and contact point — enough
 * to average out a single sliver, without walking every triangle of a deep overlap.
 */
export const SHIP_MESH_MAX_CONTACT_PAIRS = 32;

/**
 * Bisection steps used to find how far two intersecting hulls must move apart along the contact
 * normal. Each halves the error, so 6 steps resolve the depth to 1/64 of the hulls' box overlap.
 */
export const SHIP_MESH_PENETRATION_ITERATIONS = 6;

/**
 * Most poses a single frame's relative motion is sampled at when two ships close faster than the
 * thinner hull's thickness per frame (continuous collision, so fast fighters can't tunnel
 * through a hull between frames).
 */
export const SHIP_MESH_CCD_MAX_SAMPLES = 8;

/**
 * Spacing between CCD samples, as a fraction of the thinnest hull dimension of the two ships.
 * Half the thickness means a hull can never fall entirely between two samples.
 */
export const SHIP_MESH_CCD_STEP_FRACTION = 0.5;

/**
 * Scale applied to each hull's bounding box for the cheap box-vs-box reject before the triangle
 * test. A little slack keeps animated parts (e.g. the World Destroyer's spinning spiral) from
 * poking outside the box they were measured in at load.
 */
export const SHIP_MESH_BOUNDS_PADDING = 1.05;

/**
 * How quickly a grounded ship tips flat onto its belly (or back), as a multiple of its natural
 * tipping time √(L / g) — L its half-length, g the local surface gravity. The remaining tilt decays
 * as e^(−t/τ) with τ = this × √(L / g), so a fighter on Earth settles in about a second, while on
 * a small moon or asteroid it rocks over slowly. Runs on sim time.
 */
export const SHIP_GROUND_SETTLE_TIME_FACTOR = 1.0;

/** Bounds (sim seconds) on the settle time constant above, for extreme or degenerate gravity. */
export const SHIP_GROUND_SETTLE_TIME_MIN = 0.1;
export const SHIP_GROUND_SETTLE_TIME_MAX = 20;

/**
 * Hull clearance, as a fraction of the ship's radius, within which a ship that touched the ground
 * on an earlier frame still counts as grounded on a frame with no contact. Resting contact sinks
 * in by only one frame of gravity, which at very low time scales can round away to nothing.
 */
export const SHIP_GROUNDED_CLEARANCE_FRACTION = 0.02;

/**
 * Minimum hull clearance (km, scaled by DIST_SCALE) within which a ship that touched the ground
 * still counts as grounded — the bounce tolerance. On a low-gravity body a small touchdown hop
 * climbs a long way (the same rebound speed rises ~16× higher on Pluto than on Earth), and without
 * this floor the ship would count as airborne mid-hop and hand the controls back. Within it the
 * ship stays grounded while gravity brings it back down and it settles. Must stay well under
 * SHIP_LAUNCH_LIFT_HEIGHT so a launch clears it.
 */
export const SHIP_GROUNDED_CLEARANCE_MIN = 10 / 1000 / DIST_SCALE; // 10 m

/**
 * Seconds W must be held on a grounded ship to charge its lift-off (see simulation/ship-launch.ts).
 * Wall-clock, like the warp charge. Releasing early cancels the charge.
 */
export const SHIP_LAUNCH_CHARGE_TIME = 1.5;

/**
 * Height (km, scaled by DIST_SCALE) a launching ship rises above the ground before flight controls
 * are handed back. Raised for large hulls so it always clears the grounded tolerance above.
 */
export const SHIP_LAUNCH_LIFT_HEIGHT = 75 / 1000 / DIST_SCALE; // 200 m

/** Sim seconds a launching ship takes to rise SHIP_LAUNCH_LIFT_HEIGHT (a steady vertical climb). */
export const SHIP_LAUNCH_LIFT_TIME = 1.5;

// === Ship landing procedure (see simulation/ship-landing.ts) ===

/**
 * Hull-to-surface clearance (km, scaled by DIST_SCALE) within which the flight HUD shows its
 * altimeter beside the steering ring.
 */
export const HUD_ALTIMETER_MAX_ALTITUDE = 500 / DIST_SCALE; // 500 km

/**
 * Hull-to-ground clearance (km, scaled by DIST_SCALE) within which E starts a landing on the
 * nearest landable body.
 */
export const SHIP_LANDING_MAX_ALTITUDE = 10 / DIST_SCALE; // 10 km

/**
 * Sideways (and climbing) speed relative to the surface (sim units/s) at or below which the
 * braking phase counts as stopped, so — once level — the ship begins its descent.
 */
export const SHIP_LANDING_HOLD_SPEED = 1 / 1000 / DIST_SCALE; // 1 m/s

/** Attitude error (radians) at or below which a landing ship counts as level over the ground. */
export const SHIP_LANDING_ALIGN_TOLERANCE = (2 * Math.PI) / 180; // 2°

/**
 * Descent rate (sim units/s) a landing ship is held to over the last stretch of its fall. Below
 * SHIP_LANDING_REST_SPEED, so touchdown is resting contact and gives back no bounce.
 */
export const SHIP_LANDING_TOUCHDOWN_SPEED = 0.4 / 1000 / DIST_SCALE; // 0.4 m/s

/** Fastest a landing ship is allowed to fall (sim units/s), however high it starts. */
export const SHIP_LANDING_MAX_DESCENT_SPEED = 200 / 1000 / DIST_SCALE; // 200 m/s

/**
 * Deceleration (sim units/s²) the descent profile is planned against: the allowed fall speed at
 * height h is √(2·a·h), so the ship arrives at the ground at touchdown speed. Halved further for
 * a ship whose spare thrust over local gravity is weaker than this.
 */
export const SHIP_LANDING_PROFILE_DECEL = 5 / 1000 / DIST_SCALE; // 5 m/s²

// === Atmospheric drag & damage ===
// A small/light body (satellite, ship, asteroid fragment) passing through a planet's
// atmosphere is continuously slowed and, if moving fast enough, damaged; a large/massive one
// (Ceres-class asteroid, a comet nucleus) is barely affected by either — punching straight
// through to the surface, where the existing collision system takes over. See
// src/physics/atmosphere-density.ts and src/physics/atmospheric-drag.ts.
/** Reference surface density, in bar, that the drag/damage constants below are tuned
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
export const WORMHOLE_SHORTCUT_ORBIT_RADIUS = 5_000_000 / DIST_SCALE;
/**
 * Mouth radius of the two short-cut gates. Capture requires the body to be strictly smaller
 * than the mouth, and a wider mouth also tolerates more time-warp before a frame's chord bows
 * outside it, so this is deliberately roomier than WORMHOLE_DEFAULT_RADIUS.
 */
export const WORMHOLE_SHORTCUT_GATE_RADIUS = EARTH_RADIUS * 3;
export const WORMHOLE_SHORTCUT_G_MULTIPLIER = 1; // preset gravity at scenario launch
export const WORMHOLE_SHORTCUT_TIME_SCALE = 4096; // modest time scale so the orbit is watchable

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
export const ASTEROID_DEFENSE_SPAWN_DISTANCE = 117_000 / DIST_SCALE;
/** Approach speed relative to Earth (90 km/s / DIST_SCALE) */
export const ASTEROID_DEFENSE_APPROACH_SPEED = 900 / DIST_SCALE;
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

// === Ship AI speed mode (the player's R-key High/Low toggle) ===
/** Hull gap (sim units) at which an AI in high-speed mode hands off to low speed: 40 km, five
 *  times the dogfight engage range. High mode brakes to arrive here already inside the
 *  low-speed envelope — braking to the hold distance instead would still be doing tens of km/s
 *  at the 8 km dogfight range, since the high tier's decel is enormous in absolute terms. */
export const AI_HIGH_SPEED_HANDOFF_RANGE = 40 / DIST_SCALE;
/** Hull gap (sim units) beyond which a low-speed AI switches up to high speed: 400 km. Well
 *  above the handoff range — the gap between the two is the hysteresis that stops the mode
 *  flipping back and forth around a single distance. */
export const AI_HIGH_SPEED_ENGAGE_RANGE = 400 / DIST_SCALE;
/** For a controller whose hold distance is large (the 5,000 km follower), the handoff range is
 *  this multiple of the hold distance, and the engage range scales with it, so the thresholds
 *  stay on the far side of the station it is keeping. */
export const AI_HIGH_SPEED_HANDOFF_FACTOR = 2;

// === Ship AI warp drive ===
/** An AI warps only when the warp plan's ETA (charge + warp leg + conventional remainder) is
 *  below this fraction of the ETA flying the whole way conventionally (high-tier boost).
 *  See planWarp() in simulation/ai/navigation/warp-navigation.ts. */
export const AI_WARP_ETA_RATIO = 0.7;
/** ...and only when that saves at least this many wall-clock seconds. Measured in wall time
 *  because the warp charge spools in wall time: at high time scale its two seconds cost
 *  thousands of sim-seconds, and a run boost covers in under a wall second isn't worth it. */
export const AI_WARP_MIN_TIME_SAVED = 3;
/** A warp leg is only worth flying when its speed cap (see AI_WARP_DROP_PAD and the decision
 *  margin) is at least this multiple of the ship's best conventional speed. */
export const AI_WARP_MIN_SPEED_GAIN = 2;
/** Hysteresis: once a charge is running, both ETA tests above are relaxed by this factor, so
 *  a plan hovering on the boundary can't make the charge start and abort on alternating
 *  frames. */
export const AI_WARP_ABORT_FACTOR = 0.8;
/** Maximum off-axis angle (radians) at which an AI will start or hold a warp charge.
 *  Far tighter than AI_THRUST_ALIGN_ANGLE because warp is flown on a locked heading with
 *  steering disabled: whatever error is present at engagement is error the ship carries
 *  all the way to the drop-out point. */
export const AI_WARP_ALIGN_ANGLE = Math.PI / 90;
/** Safety margin on the boost and cruise bands of the distance at which an AI drops out of
 *  warp — the part of the run flown on conventional brakes after the warp drive lets go. */
export const AI_WARP_DROP_PAD = 1.5;
/** Safety margin on the *warp* band of that distance (warp max → boost max at flightWarpDecel).
 *  Much tighter than AI_WARP_DROP_PAD: warp deceleration is enormous and deterministic, so a
 *  1.5× pad on it left the ship 100,000+ km short, boosting the rest of the way for minutes. */
export const AI_WARP_BAND_DROP_PAD = 1.1;
/** Frames of travel at the projected warp speed added to the drop distance. The ship keeps
 *  moving at warp for one frame after it decides to drop out (deceleration starts on the next
 *  frame's step), so 2 leaves one frame of slack. Smaller than AI_AVOID_DECISION_MARGIN, which
 *  covers reacting to an obstacle rather than a known, fixed stopping point. */
export const AI_WARP_DECISION_MARGIN = 2;
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
// Every distance below (hold, engage, break, extend, fire range) is measured hull to hull — the
// centre-to-centre distance minus both ships' radii (FollowShipAI.hullGap) — so the same numbers
// work against a 37 m fighter and a 500 m-radius capital ship.
/** Station-keeping distance for the combat AI: 500 m expressed in sim units. */
export const NPC_COMBAT_FOLLOW_DISTANCE = 0.5 / DIST_SCALE;
/** Share of a capital ship's usable weapon reach (the smaller of AI_FIRE_RANGE and its
 *  longest-reaching weapon group) that it holds station at, hull to hull. Capitals don't
 *  dogfight; they stand off and trade fire. Kept low enough that the far edge of the follow
 *  dead band (× 1 + NPC_FOLLOW_DEAD_BAND) is still inside that reach. */
export const AI_CAPITAL_STANDOFF_FRACTION = 0.6;
/** Half-width of a capital ship's slack zone around its standoff, as a fraction of it (the
 *  NPC_FOLLOW_DEAD_BAND equivalent). Tighter than the default so a multi-km standoff doesn't
 *  leave a window of kilometres in which the ship parks wherever it happens to stop. */
export const AI_CAPITAL_DEAD_BAND = 0.1;
/** Sim-seconds a combat AI's shot may stay blocked by a teammate before it picks a different
 *  target. Ships on station don't move, so without this a screened shot is held forever. */
export const AI_FRIENDLY_BLOCK_RETARGET_SECS = 4;
/** Floor (sim units, hull to hull) on a capital ship's standoff distance: 2 km, so a capital
 *  armed only with short-range weapons still keeps well clear of the other hull. */
export const AI_CAPITAL_MIN_STANDOFF = 2 / DIST_SCALE;
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
/** Random spread (± fraction) applied to each burst and rest phase the combat AI rolls. A fleet
 *  is built on one frame and stepped with one sim dt, so fixed-length phases would keep every
 *  ship's trigger opening on the same frame forever — the whole fleet volleying in unison.
 *  Symmetric, so the mean duty cycle (and the heat budget it was sized for) is unchanged. */
export const AI_BURST_TIME_JITTER = 0.3;
/** Weapon choice: target shield fraction at or below which the combat AI treats the shield as
 *  down and scores its weapons on hull effectiveness alone. Above 0 on purpose — on a Zenith
 *  (40 shield, 20 hull) a missile into the last 2 shield points still puts ~12 into the hull. */
export const AI_SHIELD_DOWN_FRACTION = 0.05;
/** Weapon choice: target shield fraction at or above which weapons are scored on shield
 *  effectiveness alone. Between this and AI_SHIELD_DOWN_FRACTION the two blend smoothly. */
export const AI_SHIELD_UP_FRACTION = 0.25;
/** Weapon choice: score lost per unit of thermal load (0.5 → a mount at 80 % heat scores
 *  0.6×), so a hot weapon yields to a cool one before it reaches the overheat lockout. */
export const AI_WEAPON_HEAT_PENALTY = 0.5;
/** Weapon choice: how much better (fractionally) another mount must score before the combat AI
 *  switches to it. Hysteresis — keeps two near-equal mounts from trading places every frame. */
export const AI_WEAPON_SWITCH_MARGIN = 0.2;
/** Weapon choice: minimum wall-clock seconds between switches, unless the current mount can't
 *  fire at all (overheated or out of reach). */
export const AI_WEAPON_MIN_DWELL = 0.5;
/** Range (sim units) inside which the combat AI stops station-keeping and starts dogfighting:
 *  8 km. Outside it the follow controller flies the approach (boost, warp, braking). */
export const AI_DOGFIGHT_ENGAGE_RANGE = 8 / DIST_SCALE;
/** The dogfight is abandoned only beyond AI_DOGFIGHT_ENGAGE_RANGE × this, so a target hovering
 *  near the boundary can't flip the controller between modes on alternating frames. Has to stay
 *  comfortably clear of AI_DOGFIGHT_EXTEND_DISTANCE, or an extend would end the dogfight. */
export const AI_DOGFIGHT_DISENGAGE_FACTOR = 1.5;
/** How far behind and beside a target that is facing the NPC its attack run aims (sim units):
 *  600 m. Steering for a point off the target's flank rather than its nose turns a joust into
 *  an angled pass that swings round toward the tail. Scaled down to zero as the target turns
 *  away, leaving pure lead pursuit once the NPC is behind it. */
export const AI_DOGFIGHT_FLANK_OFFSET = 0.6 / DIST_SCALE;
/** Half-angle (radians) within which two ships pointing at each other count as head-on. */
export const AI_DOGFIGHT_HEAD_ON_ANGLE = Math.PI / 6;
/** Time to collision (seconds) at which a head-on merge breaks off — about what a Zenith needs to
 *  swing 60° off the collision line. Time rather than range, so a slow merge (an NPC that has
 *  just turned to face a pursuer) gets to shoot before breaking, while a full-speed joust (1 km/s
 *  combined) still breaks at 1.2 km. */
export const AI_DOGFIGHT_HEAD_ON_BREAK_TIME = 1.2;
/** Range (sim units) inside which a target sitting behind the NPC and pointing at it counts as
 *  an overshoot, and the NPC breaks rather than turning across its guns: 1 km. */
export const AI_DOGFIGHT_OVERSHOOT_DISTANCE = 1 / DIST_SCALE;
/** Minimum opening speed (sim units/s) for the overshoot rule: 100 m/s. What separates "I flew
 *  past my target" from "my target is chasing me" — both put the target behind the NPC with its
 *  nose on it, but only after an overshoot are the two ships flying apart. Without it a chased
 *  NPC reads every pursuit as an overshoot and runs instead of fighting. */
export const AI_DOGFIGHT_OVERSHOOT_OPENING_SPEED = 0.1 / DIST_SCALE;
/** Half-angle (radians) of the target's nose within which the NPC considers itself tracked.
 *  An extending NPC still tracked by a target that is keeping pace can't outrun it, so after
 *  AI_DOGFIGHT_EXTEND_MIN_TIME it turns back in to fight rather than run out the clock. */
export const AI_DOGFIGHT_THREAT_ANGLE = Math.PI / 6;
/** Range (sim units) inside which the NPC breaks off whenever it is still closing, whatever the
 *  geometry: 200 m, a few hull lengths. The last line of defence against ramming. */
export const AI_DOGFIGHT_COLLISION_DISTANCE = 0.2 / DIST_SCALE;
/** Angle (radians) off the nose the NPC turns to when it breaks off. */
export const AI_DOGFIGHT_BREAK_ANGLE = Math.PI / 3;
/** Separation (sim units) the NPC opens up during an extend before turning back in: 2.5 km —
 *  enough room to complete the turn and line up a fresh attack. */
export const AI_DOGFIGHT_EXTEND_DISTANCE = 2.5 / DIST_SCALE;
/** Minimum sim-seconds spent extending, so a break is a committed manoeuvre and not a twitch. */
export const AI_DOGFIGHT_EXTEND_MIN_TIME = 1.5;
/** Half-angle (radians) of the target's nose inside which the NPC considers itself in the line
 *  of fire and starts evading: 25°. A little wider than the 15.5° aim cone, so it starts sliding
 *  out before the reticle can reach it rather than once it already has. */
export const AI_EVADE_CONE_ANGLE = (25 * Math.PI) / 180;
/** Hull-to-hull range (sim units) inside which the target's guns are treated as a threat: 3 km.
 *  Beyond it the NPC presses its attack and lets distance do the dodging. */
export const AI_EVADE_RANGE = 3 / DIST_SCALE;
/** Largest share of the heading given to evasion (0–1). 0.6 bends the course ~56° off the
 *  attack line — enough to slide across the target's view at the speeds a Zenith flies. */
export const AI_EVADE_MAX_WEIGHT = 0.85;
/** Evasion weight multiplier while the NPC has its own shot lined up. Below 1 makes it trade
 *  some safety to keep its guns on target; 1 would make it a pure dodger, 0 a pure jouster. */
export const AI_EVADE_SHOT_WEIGHT_FACTOR = 0.1;
/** Range of sim-seconds between jinks while evading. Randomised within it, so the timing can't
 *  be learned. */
export const AI_EVADE_JINK_MIN_PERIOD = 0.7;
export const AI_EVADE_JINK_MAX_PERIOD = 1.5;
/** Smallest / largest swing (radians) of a jink about the "straight out of the cone" direction.
 *  Each jink alternates side, so the NPC weaves outward instead of drifting predictably. */
export const AI_EVADE_JINK_MIN_ANGLE = (15 * Math.PI) / 180;
export const AI_EVADE_JINK_MAX_ANGLE = (60 * Math.PI) / 180;
/** Aspect (radians) inside which the NPC stops trying to get round a target that is facing it,
 *  and jousts instead — turns in, trades shots head-on, passes: 40°. */
export const AI_DOGFIGHT_JOUST_ENTER_ASPECT = (40 * Math.PI) / 180;
/** Aspect beyond which a joust is abandoned for positioning: 55°. */
export const AI_DOGFIGHT_JOUST_EXIT_ASPECT = (55 * Math.PI) / 180;
/** Ceiling on evasion while jousting with the nose on the target (0–1): a light jink, so the
 *  pass isn't a free shot, without pulling the guns off. */
export const AI_DOGFIGHT_JOUST_EVADE_WEIGHT = 0.15;
/** In a dogfight the NPC holds thrust whenever its nose is within this angle of where it wants
 *  to go: 90°. Much wider than the follow AI's AI_THRUST_ALIGN_ANGLE, because thrust is also
 *  what swings the velocity onto the nose — coasting through every turn bleeds the fight away. */
export const AI_DOGFIGHT_THRUST_ALIGN_ANGLE = Math.PI / 2;
/** How far behind the target (hull to hull) the NPC tries to position itself before settling
 *  into a gun run: 400 m — close enough to hit, far enough to have room to track a turn. */
export const AI_DOGFIGHT_TAIL_DISTANCE = 0.4 / DIST_SCALE;
/** Aspect (angle off the target's nose to the NPC, radians) beyond which the NPC counts as on
 *  the target's tail and switches from positioning to a gun run: 120°. */
export const AI_DOGFIGHT_TAIL_ENTER_ASPECT = (120 * Math.PI) / 180;
/** Aspect below which it loses the tail and goes back to positioning: 100°. The gap with
 *  AI_DOGFIGHT_TAIL_ENTER_ASPECT keeps it from flickering between the two. */
export const AI_DOGFIGHT_TAIL_EXIT_ASPECT = (100 * Math.PI) / 180;
/** Longest lead (sim-seconds) applied to the positioning point when steering for it, so a far
 *  point isn't led so far ahead that the NPC flies off to where the target won't be. */
export const AI_DOGFIGHT_POSITION_MAX_LEAD = 1.0;
/** A boost dash only starts with the nose within this angle (radians) of where it wants to go,
 *  since boost thrust is along the nose and can't be steered much in the fraction of a second a
 *  dash lasts. Held to twice this once the dash is under way. */
export const AI_DASH_ALIGN_ANGLE = (15 * Math.PI) / 180;
/** Shortest run (sim units, along the nose) worth a dash: 300 m. */
export const AI_DASH_MIN_DISTANCE = 0.3 / DIST_SCALE;
/** How far an evasive dash carries the NPC across the target's line of fire: 500 m — ~45° of the
 *  target's view at 500 m range, out of the aim cone in a single move. */
export const AI_EVADE_DASH_DISTANCE = 1 / DIST_SCALE;
/** Longest a dash may hold boost (sim-seconds). At Zenith boost acceleration 0.4 s is roughly
 *  1.5 km — a hard cap in case the release logic never fires. */
export const AI_DASH_MAX_TIME = 0.4;
/** Sim-seconds between dashes, so boost is a punctuating move rather than the ship's default. */
export const AI_DASH_COOLDOWN = 2;
/** Maximum sim-seconds spent extending, in case neither the separation nor the "still tracked"
 *  exit fires — e.g. a target that keeps pace but isn't pointing at the NPC. */
export const AI_DOGFIGHT_EXTEND_MAX_TIME = 4;

// === Test AI Ships scenario ===
/** Fixed time scale for the AI test bed, so runs are comparable to each other. */
export const TEST_AI_SHIPS_TIME_SCALE = 1;
/** Offset (sim units) from the player at which the NPC first spawns and later respawns: 25 km.
 *  Far enough that the NPC has to turn, accelerate and close before it reaches AI_FIRE_RANGE,
 *  so the pursuit behaviour is visible on every respawn. */
export const TEST_AI_SHIPS_SPAWN_DISTANCE = 25 / DIST_SCALE;
/** Sim-seconds between the NPC's destruction and its replacement appearing. */
export const TEST_AI_SHIPS_RESPAWN_DELAY = 3;

// === Osiris Ambush scenario ===
/** Fixed time scale, so runs are comparable to each other. */
export const OSIRIS_AMBUSH_TIME_SCALE = 1;
/** Hostile ships the player must destroy to win. */
export const OSIRIS_AMBUSH_NPC_COUNT = 15;
/** Fraction of the hostiles that are Darts; the rest are Zeniths. */
export const OSIRIS_AMBUSH_DART_FRACTION = 0.5;
/** Distance (sim units) from the player at which the hostiles spawn. */
export const OSIRIS_AMBUSH_SPAWN_DISTANCE = 10 / DIST_SCALE;
/** Minimum angle (degrees) between two ships' bearings from the player, so a wave arrives from
 *  several directions instead of in a clump. Best effort — relaxed if it can't be satisfied. */
export const OSIRIS_AMBUSH_MIN_SEPARATION_DEG = 40;

// === Team Skirmish test scenario ===
/** Fixed time scale, so runs are comparable to each other. */
export const TEAM_SKIRMISH_TIME_SCALE = 1;
/** Distance of the battle's centre from Earth's centre, on the sunward side (≈38,000 km). */
export const TEAM_SKIRMISH_EARTH_DISTANCE = EARTH_RADIUS * 6;
/** Distance (sim units) between the two fleets' centres at spawn: 30 km. */
export const TEAM_SKIRMISH_FLEET_SEPARATION = 30 / DIST_SCALE;
/** Spacing (sim units) between fighters in the same fleet's spawn line: 1.5 km. */
export const TEAM_SKIRMISH_FIGHTER_SPACING = 1.5 / DIST_SCALE;
/** Offset (sim units) of each fleet's capital ship behind its fighter line: 6 km. */
export const TEAM_SKIRMISH_CAPITAL_OFFSET = 6 / DIST_SCALE;
/** Side-by-side spacing (sim units) between capital ships in the same fleet: 2 km. */
export const TEAM_SKIRMISH_CAPITAL_SPACING = 2 / DIST_SCALE;
/** AI fighters per team (the player flies an extra fighter for Team Earth). */
export const TEAM_SKIRMISH_FIGHTERS_PER_TEAM = 3;

// === Alien Invasion scenario ===
/** Fixed time scale for the scenario. */
export const ALIEN_INVASION_TIME_SCALE = 1;
/** Sim-seconds after the distress call before the alien fleet emerges, wherever the player is. */
export const ALIEN_INVASION_ARRIVAL_SECS = 90;
/** The fleet emerges early once the player is this close to the wormhole: 25 km. */
export const ALIEN_INVASION_ARRIVAL_RANGE = 40 / DIST_SCALE;
/** Distance of the wormhole from Earth's centre, on the sunward side (≈38,000 km). */
export const ALIEN_INVASION_WORMHOLE_EARTH_DISTANCE = EARTH_RADIUS * 6;
/** Radius of the wormhole's mouth: 3 km — wide enough for a Harbinger to emerge through. */
export const ALIEN_INVASION_WORMHOLE_RADIUS = 3 / DIST_SCALE;
/** Distance from the wormhole to the centre of the Team Earth fleet's fighter line: 25 km. */
export const ALIEN_INVASION_FLEET_STANDOFF = 25 / DIST_SCALE;
/** Spacing between Team Earth fighters in their formation grid: 1.5 km. */
export const ALIEN_INVASION_FIGHTER_SPACING = 1.5 / DIST_SCALE;
/** Offset of the Team Earth capital row behind the fighters: 6 km. */
export const ALIEN_INVASION_CAPITAL_OFFSET = 6 / DIST_SCALE;
/** Side-by-side spacing between Team Earth capital ships: 3 km. */
export const ALIEN_INVASION_CAPITAL_SPACING = 3 / DIST_SCALE;
/** Distance of the player's spawn point behind the Team Earth capital row: 50 km. */
export const ALIEN_INVASION_PLAYER_FLEET_DISTANCE = 50 / DIST_SCALE;
/** How far past the wormhole's mouth (exit side) an emerging ship appears: 8 km — enough
 *  room that a ship turning or braking right after it emerges does not drift back across the
 *  (lethal, unlinked) mouth, while staying well short of the Team Earth line (25 km). */
export const ALIEN_INVASION_EMERGE_OFFSET = 8 / DIST_SCALE;
/** Spread of emerging fighters across the wormhole's mouth: 1 km spacing. */
export const ALIEN_INVASION_EMERGE_SPACING = 2 / DIST_SCALE;
/** Sim-seconds between groups of ships emerging from the wormhole. */
export const ALIEN_INVASION_EMERGE_INTERVAL = 0;
/** Fighters per emerging group (the motherships come through first, on their own). */
export const ALIEN_INVASION_EMERGE_GROUP_SIZE = 5;
/** Sim-seconds the wormhole stays open after the last ship has emerged. */
export const ALIEN_INVASION_WORMHOLE_LINGER = 4;
/** Sim-seconds between the wormhole re-opening (when the motherships turn on Earth) and the
 *  World Destroyer coming through it. */
export const ALIEN_INVASION_WORLD_DESTROYER_DELAY = 5;
/** Bombarding motherships hold this multiple of the target's radius from its centre. The target
 *  is excluded from obstacle avoidance while bombarding, so this standoff is what keeps the ship
 *  clear of the surface and atmosphere. */
export const ALIEN_INVASION_BOMBARD_STANDOFF_FACTOR = 1.6;

// === Ship AI autopilot ===
// The Ship AI autopilot (simulation/ai/autopilot-ship-ai.ts) flies only through controlInput, in
// the world frame, so every maneuver is "point the nose along the world velocity you want and hold
// the forward speed at its magnitude" (navigation/velocity-control.ts). These tune that controller
// and the orbits built on it.
/** Natural/artificial orbit radius floor, as a multiple of the target's avoidance hazard radius.
 *  Keeps every orbit comfortably outside the sphere obstacle avoidance would flee from — for a
 *  star that sphere is already 1.5R, so its orbit comes out wider than the classic 1.5R. */
export const AI_AUTOPILOT_ORBIT_HAZARD_MARGIN = 1.15;
/** Artificial orbit speed is capped at radius × turn rate ÷ this, so the ship can turn fast
 *  enough to follow the circle with margin left over for radial corrections. */
export const AI_AUTOPILOT_ORBIT_TURN_PAD = 2;
/** Radial correction speed per unit of radius error, as a fraction of the orbit speed per orbit
 *  radius (dimensionless) — how hard an orbit leans back toward its target radius. */
export const AI_AUTOPILOT_ORBIT_RADIAL_GAIN = 2;
/** Cap on the radial correction speed, as a fraction of the orbit speed. */
export const AI_AUTOPILOT_ORBIT_RADIAL_MAX_FRACTION = 0.35;
/** Natural orbit: insertion burn is finished once the relative velocity is within this fraction
 *  of circular speed and the radius within this fraction of the target radius. */
export const AI_AUTOPILOT_ORBIT_SETTLE_BAND = 0.02;
/** Natural orbit: while coasting, a correction burn starts once radius or speed error exceeds
 *  this fraction (hysteresis against AI_AUTOPILOT_ORBIT_SETTLE_BAND). */
export const AI_AUTOPILOT_ORBIT_DRIFT_BAND = 0.06;
/** Approach is complete once the gap to the orbit radius is within this fraction of the orbit
 *  radius. */
export const AI_AUTOPILOT_ARRIVAL_TOLERANCE = 0.15;
/** Sim-seconds the approach must spend unable to match the target (commanded speed above the
 *  ship's boost max) while the range keeps opening before "unable to catch" is reported. */
export const AI_AUTOPILOT_OUTPACED_TIME = 10;
/** An artificial orbit is infeasible when gravity at the orbit radius exceeds this fraction of
 *  the ship's thrust acceleration on its current tier — it would be fighting a fall it can't
 *  hold. The autopilot then falls back to a natural orbit. */
export const AI_AUTOPILOT_ARTIFICIAL_MAX_G_FRACTION = 0.5;
/** Orbit distance field limits (meters, hull to hull / surface to hull). */
export const AI_AUTOPILOT_ORBIT_DISTANCE_MIN_M = 100;
export const AI_AUTOPILOT_ORBIT_DISTANCE_MAX_M = 1000000;
/** Default orbit distance (meters). */
export const AI_AUTOPILOT_ORBIT_DISTANCE_DEFAULT_M = 2000;
/** Speed tier selection: go to the high tier once the required world speed exceeds this
 *  fraction of the low tier's boost max. */
export const AI_AUTOPILOT_HIGH_TIER_ENGAGE = 0.9;
/** Speed tier selection: drop back to the low tier only once the required world speed is below
 *  this fraction of the low tier's boost max, and the ship itself is already inside the low
 *  tier's boost envelope — the gap to AI_AUTOPILOT_HIGH_TIER_ENGAGE is the hysteresis. */
export const AI_AUTOPILOT_LOW_TIER_RELEASE = 0.6;
/** Forward-speed error (fraction of the commanded speed, floored at a fraction of cruise) below
 *  which the velocity controller counts the throttle as settled — trail/HUD only. */
export const AI_AUTOPILOT_SPEED_SETTLED = 0.02;

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

// === Cloud layers ===
/**
 * Cloud deck bounds as multiples of the body radius. Stylised rather than to scale (Earth's real
 * cloud tops sit ~0.2% above the surface), so the volume still reads from orbit. The flat (Low)
 * tier draws a single sphere at the top radius; the volumetric tiers march between the two.
 */
export const CLOUD_BASE_FACTOR = 1.01;
export const CLOUD_TOP_FACTOR = 1.03;
/**
 * Flat/volumetric LOD by the body's angular radius (radians) as seen from the camera. Below
 * FADE_START only the flat layer draws (it looks the same at a fraction of the cost when the
 * planet is small); above FADE_END only the volumetric deck; in between they crossfade, so the
 * swap never pops. ≈ 1.1°–2.3°, about 20–40 px of radius on a 1080p screen at a 60° FOV.
 */
export const CLOUD_VOLUMETRIC_FADE_START = 0.02;
export const CLOUD_VOLUMETRIC_FADE_END = 0.04;
/**
 * View-ray samples through the cloud deck per quality tier. A ray takes one sample per
 * 1/CLOUD_SAMPLES_PER_THICKNESS of the deck's thickness, clamped to [MIN, MAX]: a ray straight
 * down the deck gets MIN, a long grazing one (toward the horizon from the surface, or the
 * limb from orbit) up to MAX, so it isn't left with steps longer than the clouds are tall.
 */
export const CLOUD_SAMPLES_PER_THICKNESS = 12;
export const CLOUD_STEPS_MEDIUM = 24;
export const CLOUD_MAX_STEPS_MEDIUM = 64;
export const CLOUD_STEPS_HIGH = 48;
export const CLOUD_MAX_STEPS_HIGH = 128;
/** Samples toward each star (self-shadowing) per quality tier. */
export const CLOUD_LIGHT_STEPS_MEDIUM = 2;
export const CLOUD_LIGHT_STEPS_HIGH = 4;
/**
 * Vertical optical depth through the thickest part of a cloud at density scale 1. Thick enough
 * that a whole cloud is opaque, low enough that thin margins and wisps stay translucent.
 */
export const CLOUD_OPTICAL_DEPTH = 12;
