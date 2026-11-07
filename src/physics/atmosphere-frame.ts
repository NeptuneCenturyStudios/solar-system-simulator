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
/** Scratch: tidal-lock target → body offset. */
const _toBody = new THREE.Vector3();
/** Scratch: body velocity relative to its tidal-lock target. */
const _relVel = new THREE.Vector3();

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
 * non-rotating world), leaving pure translation.
 *
 * Tidal-locked bodies are servoed to face their target rather than spun, and their
 * `rotationSpeed` is only an arbitrary construction-time seed (see
 * `CelestialBody.getRotationPeriod`) — using it would make the surface frame sweep orders of
 * magnitude too fast. Their spin is instead the live rate at which the direction to the target
 * turns about `tidalLockSpinAxis` (the axis the servo rotates about):
 *
 *     ω = axis · ((r × v_rel) · axis) / |r_⊥|²,   r = body − target,   v_rel = v_body − v_target
 *
 * where r_⊥ is r projected onto the plane normal to the axis.
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

    const target = planet.tidalLockTarget;
    if (
        planet.tidalLockEnabled &&
        planet._tidalLockConfigured &&
        target &&
        !target._isDisposed &&
        target.mesh &&
        planet.mesh
    ) {
        _spinAxisWorld.copy(planet.tidalLockSpinAxis).normalize();
        _toBody.subVectors(planet.mesh.position, target.mesh.position);
        _relVel.subVectors(planet.velocity, target.velocity);
        const axial = _toBody.dot(_spinAxisWorld);
        const planarSq = _toBody.lengthSq() - axial * axial;
        if (!(planarSq > 1e-24)) return out;
        const lockRate =
            _spinVelocity.crossVectors(_toBody, _relVel).dot(_spinAxisWorld) / planarSq;
        if (!Number.isFinite(lockRate) || lockRate === 0) return out;

        _radius.subVectors(point, planet.mesh.position);
        out.add(_spinVelocity.crossVectors(_spinAxisWorld, _radius).multiplyScalar(lockRate));
        return out;
    }

    const spinRate = planet.rotationSpeed;
    if (!Number.isFinite(spinRate) || spinRate === 0 || !planet.mesh) return out;

    _spinAxisWorld.copy(_LOCAL_SPIN_AXIS).applyQuaternion(planet.mesh.quaternion);
    _radius.subVectors(point, planet.mesh.position);
    out.add(_spinVelocity.crossVectors(_spinAxisWorld, _radius).multiplyScalar(spinRate));

    return out;
}
