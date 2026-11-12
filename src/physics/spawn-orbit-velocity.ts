import * as THREE from 'three';

import { G } from '../utilities/consts';
import { OrbitTypeEnum } from '../bodies/body-enums';
import type { Body } from '../bodies/body';
import type { CelestialBody } from '../bodies/celestial-body';
import { computeSystemBarycenter } from '../bodies/system-barycenter';
import { generateBinaryPlacementsFromBasis } from '../procedural/orbital-math';

/**
 * Velocities for a body spawned at an arbitrary point (near the camera, typically) so that it
 * orbits a chosen parent, the system barycenter, or a binary partner from wherever it appears.
 */

/**
 * Orbital velocity at `spawnPos` about a parent at `parentPos`. Circular uses the circular
 * speed; elliptical scales it down by `eccentricity` so the spawn point becomes the apoapsis.
 * The velocity lies in the XZ plane, tilted about the X axis by `inclinationDeg`.
 */
export function computeOrbitVelocityAtPos(
    spawnPos: THREE.Vector3,
    parentPos: THREE.Vector3,
    parentMass: number,
    orbitType: OrbitTypeEnum,
    eccentricity: number,
    inclinationDeg: number,
    gMultiplier: number
): THREE.Vector3 {
    const toParent = spawnPos.clone().sub(parentPos);
    const distance = toParent.length();

    if (distance === 0) return new THREE.Vector3();

    const circularSpeed = Math.sqrt((G * gMultiplier * parentMass) / distance);
    const speed =
        orbitType === OrbitTypeEnum.Elliptical
            ? circularSpeed * Math.sqrt(Math.max(0, 1 - eccentricity))
            : circularSpeed;

    // Perpendicular velocity in XZ plane (ignoring Y component of toParent for horizontal orbit)
    const perp = new THREE.Vector3(-toParent.z, 0, toParent.x).normalize().multiplyScalar(speed);

    // Apply inclination tilt around X axis
    const inclinationRad = (inclinationDeg * Math.PI) / 180;
    perp.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);

    return perp;
}

/**
 * Velocity for a body at `spawnPos` orbiting the live system barycenter (the same helper
 * procedural generation places P-type orbits with), carried along with the barycenter's drift.
 * Null when the system has no stars or black holes to define one.
 */
export function systemBarycenterOrbitVelocity(
    bodies: Body[],
    spawnPos: THREE.Vector3,
    orbitType: OrbitTypeEnum,
    eccentricity: number,
    inclinationDeg: number,
    gMultiplier: number
): THREE.Vector3 | null {
    const barycenter = computeSystemBarycenter(bodies);
    if (!barycenter) return null;
    return barycenter.vel
        .clone()
        .add(
            computeOrbitVelocityAtPos(
                spawnPos,
                barycenter.pos,
                barycenter.mass,
                orbitType,
                eccentricity,
                inclinationDeg,
                gMultiplier
            )
        );
}

/**
 * Velocities that put a new star (at `newPos`, mass `newMass`) and an existing star into a true
 * binary orbit around their shared barycenter. Neither body moves: the barycenter is the
 * mass-weighted point between where they already are. The pair keeps the parent's current
 * velocity as its barycenter drift. The orbit plane follows the same prograde convention as
 * computeOrbitVelocityAtPos, tilted about the line between the stars by `inclinationDeg`.
 */
export function computeBinaryVelocities(
    parent: CelestialBody,
    newPos: THREE.Vector3,
    newMass: number,
    inclinationDeg: number,
    gMultiplier: number
): { parentVel: THREE.Vector3; newVel: THREE.Vector3 } | null {
    const toParent = parent.mesh.position.clone().sub(newPos);
    const separation = toParent.length();
    if (!(separation > 0) || !(parent.mass + newMass > 0)) return null;
    const u = toParent.divideScalar(separation);

    // Prograde direction for the parent around the barycenter (perpendicular to u in XZ),
    // with a fallback when the stars are stacked vertically.
    const velDir = new THREE.Vector3(-u.z, 0, u.x);
    if (velDir.lengthSq() < 1e-12) velDir.set(1, 0, 0);
    velDir.normalize();
    velDir.applyAxisAngle(u, (inclinationDeg * Math.PI) / 180);

    // generateBinaryPlacementsFromBasis moves body 1 along normal × u, so normal = u × velDir.
    const normal = new THREE.Vector3().crossVectors(u, velDir).normalize();

    const [parentPlacement, newPlacement] = generateBinaryPlacementsFromBasis(
        [parent.mass, newMass],
        separation,
        u,
        normal,
        G * gMultiplier
    );

    const drift = parent.velocity.clone();
    return {
        parentVel: parentPlacement.vel.add(drift),
        newVel: newPlacement.vel.add(drift),
    };
}
