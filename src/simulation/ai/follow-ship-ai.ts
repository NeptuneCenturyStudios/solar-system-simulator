import * as THREE from 'three';
import { ShipAI } from './ship-ai';
import { flightState, simulationState } from '../simulation';
import {
    AI_CLOSING_SPEED_TOLERANCE,
    AI_FOLLOW_APPROACH_GAIN,
    AI_STEER_FULL_DEFLECTION_ANGLE,
    AI_THRUST_ALIGN_ANGLE,
    NPC_FOLLOW_DEAD_BAND,
    NPC_FOLLOW_DISTANCE,
} from '../../utilities/consts';
import type { Spaceship } from '../../bodies/ships/spaceship';

// Scratch vectors — reused every frame to keep the per-frame allocation count at zero.
const _toTarget = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _local = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _invFrame = new THREE.Quaternion();

/**
 * The first (and simplest) concrete ship AI: tail the player's ship and hold
 * station at NPC_FOLLOW_DISTANCE.
 *
 * Steering is expressed as stick deflection rather than a direct quaternion
 * snap, so the ship is rate-limited by `handling.flightMaxTurnRate` and smoothed
 * by `handling.flightSteerSmoothRate` exactly as it would be under a human
 * pilot — an AI ship banks into its turns and overshoots slightly, same as you.
 *
 * Throttle is a proportional controller on the *relative* closing speed rather
 * than on raw distance, so the NPC holds station against a player ship that is
 * itself moving (e.g. coasting along an orbit) instead of chasing a stale point.
 */
export class FollowShipAI extends ShipAI {
    readonly name = 'Follow';

    /**
     * @param ship The ship this controller pilots.
     * @param followDistance Station-keeping distance in sim units. Defaults to
     *   NPC_FOLLOW_DISTANCE (5,000 km / DIST_SCALE).
     */
    constructor(
        ship: Spaceship,
        private readonly followDistance: number = NPC_FOLLOW_DISTANCE
    ) {
        super(ship);
    }

    /**
     * Resolve the ship to follow: the ship the player is currently flying, or
     * failing that the last ship they spawned (so the NPC still tails a parked
     * ship the player has stepped out of).
     */
    private getTarget(): Spaceship | null {
        const target = flightState.activeShip ?? flightState.knownShip;
        if (!target || target === this.ship) return null;
        if (target._isDisposed || !target.mesh) return null;
        if (!simulationState.bodies.includes(target)) return null;
        return target;
    }

    update(_dt: number): void {
        const ship = this.ship;
        const input = ship.controlInput;
        const h = ship.handling;

        const target = this.getTarget();
        if (!target) {
            // Nobody to follow — release the controls and coast.
            ship.resetControlInput();
            ship.updateBoostDecelState();
            return;
        }

        _toTarget.subVectors(target.mesh.position, ship.mesh.position);
        const dist = _toTarget.length();
        if (dist < 1e-6) {
            ship.resetControlInput();
            ship.updateBoostDecelState();
            return;
        }
        _dir.copy(_toTarget).divideScalar(dist);

        // ── Steering ─────────────────────────────────────────────────────────
        // Express the desired heading in the ship's own control frame, then turn
        // the yaw/pitch error into stick deflection.
        //
        // Sign convention: ships are +Z forward / +Y up, which puts the pilot's
        // right at -X. applySteering() computes yawDelta = -steerX * turnRate and
        // pitchDelta = +steerY * turnRate and post-multiplies both onto the
        // control frame, so both errors are negated here to steer *toward* the
        // target rather than away from it.
        _invFrame.copy(ship.controlFrameQuat).invert();
        _local.copy(_dir).applyQuaternion(_invFrame);

        const yawErr = Math.atan2(_local.x, _local.z);
        const pitchErr = Math.atan2(_local.y, Math.hypot(_local.x, _local.z));

        input.steerX = THREE.MathUtils.clamp(-yawErr / AI_STEER_FULL_DEFLECTION_ANGLE, -1, 1);
        input.steerY = THREE.MathUtils.clamp(-pitchErr / AI_STEER_FULL_DEFLECTION_ANGLE, -1, 1);

        // This controller doesn't roll — banking is applied visually by applySteering().
        input.rollLeft = false;
        input.rollRight = false;
        input.fire = false;

        // ── Throttle ─────────────────────────────────────────────────────────
        // Only thrust while roughly nose-on. Off-axis, the ship just turns —
        // otherwise it would accelerate sideways while still coming around.
        _forward.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
        const aligned = _forward.dot(_dir) > Math.cos(AI_THRUST_ALIGN_ANGLE);

        // Dead band around the hold distance stops thrust/brake chatter on station.
        const band = this.followDistance * NPC_FOLLOW_DEAD_BAND;
        const gap = dist - this.followDistance; // positive = too far away
        const inDeadBand = Math.abs(gap) <= band;

        // Desired closing speed, proportional to how far out of position we are.
        const desiredClosing = inDeadBand
            ? 0
            : THREE.MathUtils.clamp(
                  gap * AI_FOLLOW_APPROACH_GAIN,
                  -h.flightMaxSpeed,
                  h.flightBoostMaxSpeed
              );

        // Actual closing speed, measured relative to the target so an orbiting
        // player ship doesn't read as "running away".
        _relVel.subVectors(ship.velocity, target.velocity);
        const closing = _relVel.dot(_dir);

        const tolerance = Math.max(h.flightMaxSpeed * AI_CLOSING_SPEED_TOLERANCE, 1e-9);

        if (!aligned) {
            // Turning to face the target: no forward thrust, but keep shedding
            // speed if we're closing faster than we want to.
            input.thrust = false;
            input.boost = false;
            input.brake = closing > desiredClosing + tolerance;
        } else if (closing < desiredClosing - tolerance) {
            input.thrust = true;
            input.boost = desiredClosing > h.flightMaxSpeed;
            input.brake = false;
        } else if (closing > desiredClosing + tolerance) {
            input.thrust = false;
            input.boost = false;
            input.brake = true;
        } else {
            // On station and matching the target's velocity — coast.
            input.thrust = false;
            input.boost = false;
            input.brake = false;
        }

        ship.thrustActive = input.thrust || input.boost || input.brake;

        // Shed boost speed on release, exactly as the player's ship does.
        ship.updateBoostDecelState();
    }
}
