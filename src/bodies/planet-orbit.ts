import * as THREE from 'three';
import { stateVectorsFromElements } from '../procedural/orbital-math.js';

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
 * Builds a planet's initial state vector from its real J2000 orbital elements.
 *
 * The semi-major axis and eccentricity are derived from the two apsides rather than stored
 * separately: perihelion and aphelion are what the NASA fact sheets publish, and
 * `a = (q + Q) / 2`, `e = (Q − q) / (Q + q)` reproduces the published `a` and `e` for every
 * major planet. Deriving them from one pair of numbers means the three can never drift apart.
 *
 * Angles are in degrees because that is how the fact sheets publish them; `trueAnomalyRad`
 * stays in radians because that is what the simulation feeds it. Callers that place the body
 * at a random point along its orbit simply pass a random value here.
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
