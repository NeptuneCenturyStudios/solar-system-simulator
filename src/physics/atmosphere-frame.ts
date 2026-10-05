import * as THREE from 'three';
import { CelestialBody } from '../bodies/celestial-body';

/**
 * Local spin axis of a body's mesh. `CelestialBody.advanceRotation` spins the mesh about its
 * own local Y (`mesh.rotateOnAxis(_Y_AXIS, …)`), so local Y *is* the spin axis in body space;
 * its world direction is recovered by rotating this through the mesh quaternion.
 */
const _LOCAL_SPIN_AXIS = new THREE.Vector3(0, 1, 0);

/** Scratch: the world-space spin axis. */
const _spinAxisWorld = new THREE.Vector3();
/** Scratch: vector from the planet's centre to the sample point. */
const _radius = new THREE.Vector3();
/** Scratch: the local spin velocity ω × r. */
const _spinVelocity = new THREE.Vector3();

/**
 * Writes the velocity of `planet`'s co-rotating atmosphere at `point` into `out`.
 *
 * A planet's atmosphere travels with the planet: it is carried along by the planet's own
 * translational velocity *and* swept around by its axial rotation. So the air velocity at a
 * point is
 *
 *     v_atm = planet.velocity + ω × r,     r = point − planet.position,   ω = spinAxis · rotationSpeed
 *
 * This is the reference frame a small body is "captured" into once it is inside the atmosphere:
 * drag pulls the body toward `v_atm`, and a ship measures its speed relative to it, so a craft
 * co-moving with the air stays put over the ground instead of the surface sweeping out from
 * under it.
 *
 * The spin term is skipped for a body whose `rotationSpeed` is zero or non-finite (a
 * non-rotating world), leaving pure translation. Tidal-locked bodies, whose orientation is
 * servoed rather than spun, likewise fall back to translation — capturing their true orbital
 * rotation is left for a later pass.
 *
 * @param planet The atmosphere-bearing body. Must have a valid `mesh`.
 * @param point  World-space sample point (the small body's position).
 * @param out    Destination vector, overwritten.
 * @returns `out`, for chaining.
 */
export function computeAtmosphereFrameVelocity(
    planet: CelestialBody,
    point: THREE.Vector3,
    out: THREE.Vector3
): THREE.Vector3 {
    out.copy(planet.velocity);

    const spinRate = planet.rotationSpeed;
    if (!Number.isFinite(spinRate) || spinRate === 0 || !planet.mesh) return out;

    _spinAxisWorld.copy(_LOCAL_SPIN_AXIS).applyQuaternion(planet.mesh.quaternion);
    _radius.subVectors(point, planet.mesh.position);
    out.add(_spinVelocity.crossVectors(_spinAxisWorld, _radius).multiplyScalar(spinRate));

    return out;
}
