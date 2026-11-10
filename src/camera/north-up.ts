import * as THREE from 'three';

/**
 * North-up viewing frame.
 *
 * The simulation's ecliptic north is world **−Y**: orbits run from +X toward +Z, and X × Z = −Y
 * (see `stateVectorsFromElements` and `utilities/spin-pole.ts`). The camera and ships treat that
 * direction as "up", so the solar system is seen from the north: Earth north-up, orbits
 * counterclockwise.
 *
 * THREE.Spherical and 'YXZ' Euler angles both assume +Y up. The helpers below rotate into a frame
 * where ecliptic north is +Y (180° about +X), do the familiar math there, and rotate back.
 */

/** Ecliptic north, world −Y. Shared and frozen: copy it, never mutate it. */
export const ECLIPTIC_NORTH: Readonly<THREE.Vector3> = Object.freeze(new THREE.Vector3(0, -1, 0));

/** 180° about +X: maps −Y to +Y. A half-turn is its own inverse, so it maps both ways. */
export const NORTH_UP_QUAT: Readonly<THREE.Quaternion> = Object.freeze(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
);

/** Keeps the orbit camera off the poles, where the spherical azimuth degenerates. */
const PHI_MIN = 0.1;
const PHI_MAX = Math.PI - 0.1;

const _spherical = new THREE.Spherical();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Orbits a camera offset (camera position − pivot) about ecliptic north, in place.
 * @param offset  Offset to rotate; overwritten with the result.
 * @param dTheta  Change in azimuth about ecliptic north (radians).
 * @param dPhi    Change in polar angle from ecliptic north (radians), clamped off the poles.
 */
export function orbitOffset(offset: THREE.Vector3, dTheta: number, dPhi: number): THREE.Vector3 {
    offset.applyQuaternion(NORTH_UP_QUAT);
    _spherical.setFromVector3(offset);
    _spherical.theta += dTheta;
    _spherical.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, _spherical.phi + dPhi));
    offset.setFromSpherical(_spherical);
    return offset.applyQuaternion(NORTH_UP_QUAT);
}

/**
 * Free-look rotation of a camera orientation, in place: yaw about ecliptic north, pitch about the
 * camera's right axis, pitch clamped to ±90° so the view never flips over the pole.
 */
export function freeLook(quat: THREE.Quaternion, dYaw: number, dPitch: number): THREE.Quaternion {
    quat.premultiply(NORTH_UP_QUAT);
    _euler.setFromQuaternion(quat, 'YXZ');
    _euler.y += dYaw;
    _euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, _euler.x + dPitch));
    quat.setFromEuler(_euler);
    return quat.premultiply(NORTH_UP_QUAT);
}
