import * as THREE from 'three';
import { Body } from '../bodies/body';
import { PlayerRig } from '../bodies/player-rig';
import { Spaceship } from '../bodies/ships/spaceship';
import { simulationState } from '../simulation/simulation';
import {
    G,
    PLAYER_EYE_HEIGHT,
    PLAYER_GROUND_TOLERANCE,
    PLAYER_HULL_PROBE_HEIGHTS,
    PLAYER_JUMP_SPEED,
    PLAYER_RADIUS,
    PLAYER_STICK_SPEED,
    PLAYER_TRACTION_MU,
} from '../utilities/consts';
import { surfaceReachFactor } from './body-surface';
import { surfaceVelocityAt } from './collision';
import { closestHullPoint } from './ship-mesh-collision';

/**
 * Physics of the player on foot (see bodies/player-rig.ts).
 *
 * The integrator applies gravity to the rig like any other body. On top of that:
 *
 * - **Per substep** ({@link applyPlayerRigSubsteps}): ground contact (the feet never sink below the
 *   drawn surface, and motion into it is removed — no bounce), walking (the ground-relative
 *   tangential velocity steers toward the requested walk velocity, each change limited to μ·g by
 *   friction), and jumping (a fixed take-off speed along the local up). Airborne, gravity alone.
 *   All velocities are measured relative to the ground under the feet — the body's co-rotating
 *   frame, v + ω × r — so "standing still" means standing still on a spinning planet.
 * - **Per frame** ({@link updatePlayerRigFrame}): parking (a grounded player at rest with no input
 *   is pinned to that spot of the body, like a parked ship, so it cannot drift under time warp),
 *   ship hulls blocking the way, and a final snap onto the ground.
 */

let _rig: PlayerRig | null = null;

/** Scratch, so the per-substep pass never allocates. */
const _up = new THREE.Vector3();
const _frameVel = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _change = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();
const _probe = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _push = new THREE.Vector3();
const _shipRel = new THREE.Vector3();

/** Make `rig` the active player (or none). Pass null when leaving surface mode. */
export function setActivePlayerRig(rig: PlayerRig | null): void {
    _rig = rig;
}

/** The active player rig, or null when not in surface mode. */
export function getActivePlayerRig(): PlayerRig | null {
    return _rig && !_rig._isDisposed ? _rig : null;
}

/**
 * Append the body the player stands on to `out`, so the physics substep loop keeps its position
 * and velocity live for {@link applyPlayerRigSubsteps}.
 */
export function collectPlayerRigBodies(out: Body[]): void {
    const rig = getActivePlayerRig();
    if (rig && !rig.homeBody._isDisposed) out.push(rig.homeBody);
}

/** Whether `body` can still be stood on. */
function isLiveGround(body: Body): boolean {
    return !body._isDisposed && !!body.mesh;
}

/**
 * Writes the unit local up at the rig's feet into `_up` and returns the feet's height above the
 * drawn ground (negative when below it), or NaN when the feet are at the body's centre.
 */
function heightAboveGround(rig: PlayerRig, ground: Body): number {
    _up.subVectors(rig.mesh.position, ground.mesh.position);
    const distance = _up.length();
    if (distance < 1e-12) return NaN;
    _up.divideScalar(distance);
    const groundRadius = ground.radius * (ground.mesh.scale.x || 1) * rig.reachFactor;
    return distance - groundRadius;
}

/** Surface gravity of `ground` at the rig's feet (sim units / s²). */
function gravityAt(rig: PlayerRig, ground: Body): number {
    const distanceSq = rig.mesh.position.distanceToSquared(ground.mesh.position);
    if (!(distanceSq > 0)) return 0;
    return (G * simulationState.gMultiplier * Math.max(0, ground.mass)) / distanceSq;
}

/**
 * Lift feet that are below the ground back onto it and remove any velocity into the ground,
 * recording the removed speed as the rig's lastImpactSpeed. Expects `_up` from heightAboveGround,
 * and `_frameVel` / `_rel` set for the rig.
 */
function resolveGroundContact(rig: PlayerRig, height: number): void {
    if (height >= 0) return;
    rig.mesh.position.addScaledVector(_up, -height);
    const normalSpeed = _rel.dot(_up);
    if (normalSpeed < 0) {
        _rel.addScaledVector(_up, -normalSpeed);
        rig.lastImpactSpeed = Math.max(rig.lastImpactSpeed, -normalSpeed);
    }
}

/**
 * Step the player for one physics substep: ground contact, walking and jumping.
 *
 * @param dt Sim seconds in this substep.
 */
export function applyPlayerRigSubsteps(dt: number): void {
    const rig = getActivePlayerRig();
    if (!rig || !(dt > 0)) return;
    const ground = rig.homeBody;
    if (!isLiveGround(ground)) return;
    // Any input wakes a parked player; otherwise it is carried rigidly by the ground each frame
    // (updatePlayerRigFrame).
    if (rig.anchorLocal) {
        if (!rig.hasMoveInput && !rig.jumpQueued) return;
        rig.anchorLocal = null;
    }

    const height = heightAboveGround(rig, ground);
    if (!Number.isFinite(height)) return;

    surfaceVelocityAt(ground, rig.mesh.position, _frameVel);
    _rel.subVectors(rig.velocity, _frameVel);

    resolveGroundContact(rig, height);
    rig.isGrounded = height <= PLAYER_GROUND_TOLERANCE;

    if (rig.isGrounded) {
        // Walking: steer the ground-relative tangential velocity toward the requested one. Feet
        // push on the ground through friction, so the change is limited to μ·g — the same limit
        // that brakes a player who lets go of the keys.
        const normalSpeed = _rel.dot(_up);
        _tangent.copy(_rel).addScaledVector(_up, -normalSpeed);

        _desired.set(0, 0, 0);
        if (rig.hasMoveInput) {
            _desired.copy(rig.moveDir).addScaledVector(_up, -rig.moveDir.dot(_up));
            const len = _desired.length();
            if (len > 1e-12) _desired.multiplyScalar(rig.moveSpeed / len);
            else _desired.set(0, 0, 0);
        }

        _change.subVectors(_desired, _tangent);
        const needed = _change.length();
        const available = PLAYER_TRACTION_MU * gravityAt(rig, ground) * dt;
        if (needed > available && needed > 0) _change.multiplyScalar(available / needed);
        _tangent.add(_change);

        _rel.copy(_tangent).addScaledVector(_up, normalSpeed);

        if (rig.jumpQueued) {
            rig.jumpQueued = false;
            _rel.addScaledVector(_up, PLAYER_JUMP_SPEED);
            rig.isGrounded = false;
        }
    }

    rig.velocity.copy(_frameVel).add(_rel);
}

/**
 * Per-frame pass, after physics and the collision pass: parking, ship hulls, ground snap.
 *
 * @param bodies Every live body (ships among them block the player).
 * @param dt Sim seconds this frame covered; 0 while paused.
 */
export function updatePlayerRigFrame(bodies: readonly Body[], dt: number): void {
    const rig = getActivePlayerRig();
    if (!rig) return;
    const ground = rig.homeBody;
    if (!isLiveGround(ground)) return;

    if (rig.anchorLocal) {
        // Parked: put the feet back exactly where they were parked, moving with the ground.
        rig.mesh.position
            .copy(rig.anchorLocal)
            .applyQuaternion(ground.mesh.quaternion)
            .add(ground.mesh.position);
        surfaceVelocityAt(ground, rig.mesh.position, rig.velocity);
        rig.isGrounded = true;
        refreshReach(rig, ground);
        return;
    }

    blockByShipHulls(rig, bodies);

    // Never end a frame below the drawn ground (the last substep's drift can sink the feet a hair).
    refreshReach(rig, ground);
    const height = heightAboveGround(rig, ground);
    if (!Number.isFinite(height)) return;
    surfaceVelocityAt(ground, rig.mesh.position, _frameVel);
    _rel.subVectors(rig.velocity, _frameVel);
    resolveGroundContact(rig, height);
    rig.velocity.copy(_frameVel).add(_rel);
    if (height <= PLAYER_GROUND_TOLERANCE) rig.isGrounded = true;

    // Come to rest with no input: park here, set down onto the ground. The allowance scales with
    // the frame's gravity so that, under time warp, a resting player still counts as at rest.
    if (rig.isGrounded && !rig.hasMoveInput && !rig.jumpQueued) {
        const allowance = Math.max(
            PLAYER_STICK_SPEED,
            2 * gravityAt(rig, ground) * Math.max(0, dt)
        );
        if (_rel.length() <= allowance) {
            if (height > 0) rig.mesh.position.addScaledVector(_up, -height);
            rig.anchorLocal = new THREE.Vector3()
                .subVectors(rig.mesh.position, ground.mesh.position)
                .applyQuaternion(_invQuat.copy(ground.mesh.quaternion).invert());
            surfaceVelocityAt(ground, rig.mesh.position, rig.velocity);
        }
    }

    // A jump only counts if pressed while standing: one that was not taken this frame is dropped
    // rather than fired on the next touchdown.
    if (dt > 0) rig.jumpQueued = false;
}

/** Re-measure where the drawn ground lies under the feet (a raycast only for model bodies). */
function refreshReach(rig: PlayerRig, ground: Body): void {
    _up.subVectors(rig.mesh.position, ground.mesh.position);
    if (_up.lengthSq() < 1e-24) return;
    _up.normalize();
    rig.reachFactor = surfaceReachFactor(ground, _up);
}

/**
 * Keep the player out of ship hulls. Probe spheres at knee and chest height are tested against
 * each nearby ship's hull; a penetrating probe pushes the player out along the horizontal part of
 * the contact normal (walls block, nothing lifts the player onto a hull), and velocity into the
 * hull, relative to the ship, is removed.
 */
function blockByShipHulls(rig: PlayerRig, bodies: readonly Body[]): void {
    const ground = rig.homeBody;
    _up.subVectors(rig.mesh.position, ground.mesh.position);
    if (_up.lengthSq() < 1e-24) return;
    _up.normalize();

    const reach = PLAYER_EYE_HEIGHT + PLAYER_RADIUS;
    for (const body of bodies) {
        if (!(body instanceof Spaceship) || body._isDisposed || !body.mesh) continue;
        const ship = body;
        if (ship.mesh.position.distanceTo(rig.mesh.position) > ship.radius + reach) continue;

        for (const probeHeight of PLAYER_HULL_PROBE_HEIGHTS) {
            _probe.copy(rig.mesh.position).addScaledVector(_up, probeHeight);
            const distance = closestHullPoint(ship, _probe, _closest);
            if (!(distance < PLAYER_RADIUS)) continue;

            // Away from the hull, flattened onto the ground plane.
            _push.subVectors(_probe, _closest);
            if (distance < 1e-15) {
                // Probe on the hull surface (or inside a box fallback): push away from the centre.
                _push.subVectors(_probe, ship.mesh.position);
            }
            _push.addScaledVector(_up, -_push.dot(_up));
            if (_push.lengthSq() < 1e-30) continue;
            _push.normalize();

            const depth = PLAYER_RADIUS - Math.max(0, distance);
            rig.mesh.position.addScaledVector(_push, depth);

            _shipRel.subVectors(rig.velocity, ship.velocity);
            const into = _shipRel.dot(_push);
            if (into < 0) rig.velocity.addScaledVector(_push, -into);
        }
    }
}
