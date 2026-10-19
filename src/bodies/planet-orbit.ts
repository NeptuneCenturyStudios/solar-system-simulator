import * as THREE from 'three';
import {
    stateVectorsFromElements,
    trueAnomalyFromMeanAnomaly,
} from '../procedural/orbital-math.js';

/** The real solar orbit a planet is placed on, described in simulation distance units. */
export interface IPlanetOrbitElements {
    /** Closest approach to the Sun (perihelion), in simulation distance units. */
    perihelion: number;
    /** Farthest point from the Sun (aphelion), in simulation distance units. */
    aphelion: number;
    /** Inclination of the orbital plane to the ecliptic, in degrees. */
    inclinationDeg: number;
    /** Longitude of the ascending node (Ω), in degrees. */
    longitudeAscendingNodeDeg: number;
    /** Argument of perihelion (ω), measured from the ascending node, in degrees. */
    argumentOfPeriapsisDeg: number;
}

/** Position, velocity and the derived shape of a planet's orbit. */
export interface IPlanetOrbit {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    /** Semi-major axis `a`, derived as (perihelion + aphelion) / 2. */
    semiMajorAxis: number;
    /** Eccentricity `e`, derived from the two apsides. */
    eccentricity: number;
}

/**
 * True anomaly for a given mean anomaly on the orbit described by a pair of apsides. The J2000
 * mean anomaly is what the fact sheets (indirectly) publish; this turns it into the true anomaly
 * that {@link planetOrbitFromElements} and the planet constructors take.
 *
 * @param meanAnomalyDeg Mean anomaly `M` in degrees, any real value.
 * @param perihelion Closest approach, in the same units as `aphelion`.
 * @param aphelion Farthest point, in the same units as `perihelion`.
 * @returns True anomaly in radians, measured from perihelion.
 */
export function trueAnomalyFromApsides(
    meanAnomalyDeg: number,
    perihelion: number,
    aphelion: number
): number {
    const eccentricity = (aphelion - perihelion) / (aphelion + perihelion);
    return trueAnomalyFromMeanAnomaly(THREE.MathUtils.degToRad(meanAnomalyDeg), eccentricity);
}

/**
 * Builds a planet's initial state vector from its real J2000 orbital elements.
 *
 * The semi-major axis and eccentricity are derived from the two apsides rather than stored
 * separately: `a = (q + Q) / 2`, `e = (Q − q) / (Q + q)`. Deriving them from one pair of numbers
 * means the three can never drift apart. The elements in consts.ts are JPL Horizons osculating
 * elements at J2000, so `a` and `e` are the instantaneous values at that epoch, which differ a
 * little from the long-run means the NASA fact sheets publish.
 *
 * Angles are in degrees because that is how Horizons publishes them; `trueAnomalyRad`
 * stays in radians because that is what the simulation feeds it. Callers place the body at its
 * real J2000 position (see {@link trueAnomalyFromApsides}) or at any other point along its orbit.
 *
 * @param elements Real orbital shape and orientation (see {@link IPlanetOrbitElements}).
 * @param trueAnomalyRad Position along the orbit `ν`, measured from perihelion
 *                        (0 = perihelion, π = aphelion, negative = retrograde direction).
 * @param mu Standard gravitational parameter of the parent: effective G × Sun mass.
 */
export function planetOrbitFromElements(
    elements: IPlanetOrbitElements,
    trueAnomalyRad: number,
    mu: number
): IPlanetOrbit {
    const { perihelion, aphelion, inclinationDeg, longitudeAscendingNodeDeg } = elements;
    const semiMajorAxis = (perihelion + aphelion) / 2;
    const eccentricity = (aphelion - perihelion) / (aphelion + perihelion);

    const { pos, vel } = stateVectorsFromElements({
        semiMajorAxis,
        eccentricity,
        inclinationRad: THREE.MathUtils.degToRad(inclinationDeg),
        longitudeAscendingNodeRad: THREE.MathUtils.degToRad(longitudeAscendingNodeDeg),
        argumentOfPeriapsisRad: THREE.MathUtils.degToRad(elements.argumentOfPeriapsisDeg),
        trueAnomalyRad,
        mu,
    });

    return { pos, vel, semiMajorAxis, eccentricity };
}
