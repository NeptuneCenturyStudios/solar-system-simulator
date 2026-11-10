import * as THREE from 'three';

/**
 * Spin-pole orientation from a body's `rotation.tilt` / `rotation.azimuth` (degrees).
 *
 * Frame: the reference (ecliptic) plane is XZ, ecliptic longitude λ runs from +X toward +Z, and
 * the prograde orbit normal — ecliptic north — is **−Y** (see `stateVectorsFromElements`).
 *
 * `(tilt, azimuth)` name the body's **spin pole** (the end its angular momentum points out of,
 * by the right-hand rule) in ecliptic coordinates:
 *
 *     β (ecliptic latitude)  = 90° − tilt
 *     λ (ecliptic longitude) = azimuth − 90°
 *
 * so tilt 0 is spin aligned with prograde orbital motion, tilt > 90° is a retrograde spinner, and
 * the world pole vector is `(cosβ·cosλ, −sinβ, cosβ·sinλ)` = `(sin t·sin a, −cos t, −sin t·cos a)`.
 *
 * The mesh's local +Y is its spin pole, and spin is applied as a positive rotation about local +Y,
 * so a positive `rotationSpeed` spins right-handed about this pole. Retrograde spinners therefore
 * get a tilt > 90° and a POSITIVE speed; a negative speed on top of that would cancel the flip.
 */

const _X = new THREE.Vector3(1, 0, 0);
const _Y = new THREE.Vector3(0, 1, 0);
const _flip = new THREE.Quaternion().setFromAxisAngle(_X, Math.PI);
const _qa = new THREE.Quaternion();
const _qt = new THREE.Quaternion();

/**
 * Quaternion taking local +Y to the spin pole. Built from axis-angle rotations rather than
 * `setFromUnitVectors`, so it has no antiparallel singularity at tilt = 180°.
 */
export function spinPoleQuaternion(
    tiltDeg: number,
    azimuthDeg: number,
    out: THREE.Quaternion = new THREE.Quaternion()
): THREE.Quaternion {
    _qa.setFromAxisAngle(_Y, THREE.MathUtils.degToRad(azimuthDeg));
    _qt.setFromAxisAngle(_X, THREE.MathUtils.degToRad(tiltDeg));
    // flip · yaw(a) · tilt(t): the yaw/tilt pair is the legacy +Y-up construction, and the 180°
    // turn about +X carries its +Y "north" onto this frame's −Y ecliptic north.
    return out.copy(_flip).multiply(_qa).multiply(_qt);
}

/** World-space unit spin-pole direction for the given tilt/azimuth. */
export function spinPoleDirection(
    tiltDeg: number,
    azimuthDeg: number,
    out: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 {
    const t = THREE.MathUtils.degToRad(tiltDeg);
    const a = THREE.MathUtils.degToRad(azimuthDeg);
    return out.set(Math.sin(t) * Math.sin(a), -Math.cos(t), -Math.sin(t) * Math.cos(a));
}

/** Unit direction in the XZ plane that the pole leans toward (ecliptic longitude azimuth − 90°). */
export function spinPoleLeanDirection(
    azimuthDeg: number,
    out: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 {
    const a = THREE.MathUtils.degToRad(azimuthDeg);
    return out.set(Math.sin(a), 0, -Math.cos(a));
}
