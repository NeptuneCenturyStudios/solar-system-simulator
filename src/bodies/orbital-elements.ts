/**
 * Keplerian orbital elements, in both directions: the elements a body is *placed* on, and the
 * elements it is *currently* flying (osculating elements derived from its live state vector).
 *
 * Pure — no THREE.js, no scene references — following the same convention as
 * body-attribute-display.ts and body-attributes.ts. That keeps the inverse solver importable
 * from a plain Node script for round-trip verification, and lets the Vue layer consume the
 * results as numbers and strings without pulling the renderer in.
 *
 * Angle convention (must match `stateVectorsFromElements` in procedural/orbital-math.ts, which
 * is the forward transform this module inverts):
 *   - the reference plane is XZ (the ecliptic), and angles are measured from +X toward +Z;
 *   - that makes the prograde orbit normal −Y, not +Y;
 *   - `inclinationDeg` tilts the orbital plane about the node line, so a positive inclination
 *     lifts the body out of the ecliptic on the −Y side as it crosses the ascending node.
 */

/** The three numeric components of a position or velocity vector in sim units. */
export interface IVector3Like {
    x: number;
    y: number;
    z: number;
}

/**
 * The orbital elements a body was placed on. Distances are in simulation distance units and
 * angles in degrees, matching how the NASA fact sheets publish a real orbit and how the
 * `*_PERIHELION_DIST` / `*_INCLINATION` blocks in consts.ts store it.
 */
export interface IBodyOrbitElements {
    /** Closest approach to the parent (periapsis), in simulation distance units. */
    perihelion: number;
    /** Farthest point from the parent (apoapsis), in simulation distance units. */
    aphelion: number;
    /** Inclination of the orbital plane to the ecliptic, in degrees. */
    inclinationDeg: number;
    /** Longitude of the ascending node (Ω), in degrees. */
    longitudeAscendingNodeDeg: number;
    /** Argument of periapsis (ω), measured from the ascending node, in degrees. */
    argumentOfPeriapsisDeg: number;
}

/**
 * The elements a body is flying right now, derived from its current position and velocity
 * relative to its orbital reference frame. N-body drift means these change over time, which is
 * the point: they are a live measurement, not a description of the orbit as created.
 */
export interface ILiveOrbitElements {
    /** True for an elliptical orbit; false when the body is on an escape (hyperbolic) path. */
    isBound: boolean;
    /** Semi-major axis `a`. Negative for an unbound orbit, where only its magnitude is useful. */
    semiMajorAxis: number;
    /** Eccentricity `e`. At or above 1 means the orbit is not closed. */
    eccentricity: number;
    /** Periapsis distance, or null when the orbit is unbound and has no apoapsis. */
    periapsis: number | null;
    /** Apoapsis distance, or null when the orbit is unbound. */
    apoapsis: number | null;
    /** Current distance from the orbital reference frame, in simulation distance units. */
    distance: number;
    /** Current speed relative to the orbital reference frame, in simulation distance units/s. */
    speed: number;
    /** Inclination of the orbital plane to the ecliptic, in degrees, in [0, 180]. */
    inclinationDeg: number;
    /** Longitude of the ascending node (Ω), in degrees, in [0, 360). */
    longitudeAscendingNodeDeg: number;
    /** Argument of periapsis (ω), in degrees, in [0, 360). */
    argumentOfPeriapsisDeg: number;
    /** Position along the orbit from periapsis, in degrees, in (-180, 180]. */
    trueAnomalyDeg: number;
}

/** Below this eccentricity the orbit is treated as circular, where ω has no meaning. */
const CIRCULAR_ECCENTRICITY_EPSILON = 1e-7;

/** Below this inclination (radians) the orbital plane matches the ecliptic, so Ω has no meaning. */
const EQUATORIAL_INCLINATION_EPSILON = 1e-7;

/** Semi-major axis implied by a pair of apsides: `a = (q + Q) / 2`. */
export function semiMajorAxisFromApsides(perihelion: number, aphelion: number): number {
    return (perihelion + aphelion) / 2;
}

/** Eccentricity implied by a pair of apsides: `e = (Q − q) / (Q + q)`. */
export function eccentricityFromApsides(perihelion: number, aphelion: number): number {
    return (aphelion - perihelion) / (aphelion + perihelion);
}

/**
 * Build an element set from a pair of apsides plus the three orientation angles. Deriving `a`
 * and `e` from the apsides means the five numbers can never disagree: the fact sheets publish
 * perihelion and aphelion, and `a`/`e` follow from them.
 */
export function orbitElementsFromApsides(
    perihelion: number,
    aphelion: number,
    inclinationDeg: number,
    longitudeAscendingNodeDeg: number,
    argumentOfPeriapsisDeg: number
): IBodyOrbitElements {
    return {
        perihelion,
        aphelion,
        inclinationDeg,
        longitudeAscendingNodeDeg,
        argumentOfPeriapsisDeg,
    };
}

function dot(a: IVector3Like, b: IVector3Like): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: IVector3Like, b: IVector3Like): IVector3Like {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}

function length(v: IVector3Like): number {
    return Math.sqrt(dot(v, v));
}

/**
 * Rotate `v` about the unit axis `axis` by `angleRad` (Rodrigues' formula). Used to undo the
 * inclination tilt, bringing the live state vector back into the flat reference plane where the
 * in-plane angles (argument of latitude, argument of periapsis) are plain `atan2`s.
 */
function rotateAboutAxis(v: IVector3Like, axis: IVector3Like, angleRad: number): IVector3Like {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const axial = dot(axis, v) * (1 - cos);
    const axisCrossV = cross(axis, v);

    return {
        x: v.x * cos + axisCrossV.x * sin + axis.x * axial,
        y: v.y * cos + axisCrossV.y * sin + axis.y * axial,
        z: v.z * cos + axisCrossV.z * sin + axis.z * axial,
    };
}

/** Normalize an angle in degrees into [0, 360). */
function toDegrees360(angleDeg: number): number {
    const wrapped = angleDeg % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Normalize an angle in degrees into (-180, 180]. */
function toDegreesSigned(angleDeg: number): number {
    const wrapped = toDegrees360(angleDeg);
    return wrapped > 180 ? wrapped - 360 : wrapped;
}

/**
 * Invert {@link stateVectorsFromElements}: recover the classical orbital elements from a state
 * vector relative to the orbital reference frame.
 *
 * @param relPos  Position relative to the parent/barycentre, in simulation distance units.
 * @param relVel  Velocity relative to the parent/barycentre, in simulation distance units/s.
 * @param mu      Standard gravitational parameter of the parent: effective G × parent mass.
 * @returns The live elements, or null when they cannot be derived (a body sitting exactly on
 *          the reference point, a non-positive μ, or a radial trajectory with no orbital plane).
 */
export function orbitalElementsFromStateVectors(
    relPos: IVector3Like,
    relVel: IVector3Like,
    mu: number
): ILiveOrbitElements | null {
    if (!(mu > 0) || !Number.isFinite(mu)) return null;

    const distance = length(relPos);
    const speed = length(relVel);
    if (!(distance > 0) || !Number.isFinite(distance)) return null;

    // Specific angular momentum. Its direction is the orbit normal, which for a prograde orbit
    // in this simulation's convention is −Y (see the module header).
    const angularMomentum = cross(relPos, relVel);
    const angularMomentumLength = length(angularMomentum);
    if (!(angularMomentumLength > 1e-20)) return null;

    // Inclination is the angle between the orbit normal and the reference normal (−Y).
    const cosInclination = Math.max(
        -1,
        Math.min(1, -angularMomentum.y / angularMomentumLength)
    );
    const inclinationRad = Math.acos(cosInclination);
    const inclinationDeg = (inclinationRad * 180) / Math.PI;

    // Node line: the reference normal crossed with the orbit normal, lying in both planes.
    // Written out for the constant (0, −1, 0) reference normal: (−h.z, 0, h.x).
    const nodeX = -angularMomentum.z;
    const nodeZ = angularMomentum.x;
    const nodeLength = Math.hypot(nodeX, nodeZ);

    const isEquatorial = nodeLength < EQUATORIAL_INCLINATION_EPSILON;
    const longitudeAscendingNodeDeg = isEquatorial ? 0 : toDegrees360(atan2Deg(nodeZ, nodeX));

    // Undo the inclination tilt so the remaining angles are measured in the flat XZ plane.
    const nodeDir: IVector3Like = isEquatorial
        ? { x: 1, y: 0, z: 0 }
        : { x: nodeX / nodeLength, y: 0, z: nodeZ / nodeLength };
    const flatPos = rotateAboutAxis(relPos, nodeDir, -inclinationRad);
    const flatVel = rotateAboutAxis(relVel, nodeDir, -inclinationRad);

    // Eccentricity vector, from the state vector directly: it lies in the orbital plane, so the
    // tilt does not affect its length. e = (v × h)/μ − r̂
    const eccentricityVector = cross(flatVel, cross(flatPos, flatVel));
    const flatRadius = length(flatPos);
    const flatSpeedSquared = dot(flatVel, flatVel);
    const eVec: IVector3Like = {
        x: eccentricityVector.x / mu - flatPos.x / flatRadius,
        y: 0,
        z: eccentricityVector.z / mu - flatPos.z / flatRadius,
    };
    const eccentricity = Math.hypot(eVec.x, eVec.z);
    const isNearlyCircular = eccentricity < CIRCULAR_ECCENTRICITY_EPSILON;

    // Arguments are measured from the node direction toward the direction of motion, which in
    // the flat plane is simply increasing atan2(z, x) — so subtracting the node angle is enough.
    const nodeAngleRad = Math.atan2(nodeDir.z, nodeDir.x);
    const argumentOfLatitudeRad = Math.atan2(flatPos.z, flatPos.x) - nodeAngleRad;
    const periapsisAngleRad = isNearlyCircular
        ? nodeAngleRad
        : Math.atan2(eVec.z, eVec.x);

    const argumentOfPeriapsisDeg = isNearlyCircular
        ? 0
        : toDegrees360(((periapsisAngleRad - nodeAngleRad) * 180) / Math.PI);
    const trueAnomalyDeg = toDegreesSigned(
        ((argumentOfLatitudeRad - (periapsisAngleRad - nodeAngleRad)) * 180) / Math.PI
    );

    // Vis-viva gives the semi-major axis; negative means the body is on an escape trajectory.
    const inverseSemiMajorAxis = 2 / distance - flatSpeedSquared / mu;
    const isBound = inverseSemiMajorAxis > 0;
    const semiMajorAxis = Math.abs(inverseSemiMajorAxis) > 1e-20 ? 1 / inverseSemiMajorAxis : 0;

    // Semi-latus rectum, from which both apsides follow.
    const semiLatusRectum = (angularMomentumLength * angularMomentumLength) / mu;
    const periapsis = semiLatusRectum / (1 + eccentricity);
    const apoapsis = isBound && eccentricity < 1 ? semiLatusRectum / (1 - eccentricity) : null;

    return {
        isBound,
        semiMajorAxis,
        eccentricity,
        periapsis: Number.isFinite(periapsis) ? periapsis : null,
        apoapsis: apoapsis !== null && Number.isFinite(apoapsis) ? apoapsis : null,
        distance,
        speed,
        inclinationDeg,
        longitudeAscendingNodeDeg,
        argumentOfPeriapsisDeg,
        trueAnomalyDeg,
    };
}

/** `Math.atan2` in degrees, for the two places that need an angle rather than a ratio. */
function atan2Deg(y: number, x: number): number {
    return (Math.atan2(y, x) * 180) / Math.PI;
}
