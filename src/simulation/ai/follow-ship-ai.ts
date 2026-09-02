import * as THREE from 'three';
import { ShipAI } from './ship-ai';
import { flightState, simulationState } from '../simulation';
import {
    AI_APPROACH_SAFETY_PAD,
    AI_BOOST_ENGAGE_FACTOR,
    AI_CLOSING_SPEED_TOLERANCE,
    AI_FOLLOW_APPROACH_GAIN,
    AI_STEER_FULL_DEFLECTION_ANGLE,
    AI_THRUST_ALIGN_ANGLE,
    NPC_FOLLOW_DEAD_BAND,
    NPC_FOLLOW_DISTANCE,
} from '../../utilities/consts';
import type { Spaceship } from '../../bodies/ships/spaceship';
import type { ISpaceshipHandling } from '../../interfaces';

// Scratch vectors — reused every frame to keep the per-frame allocation count at zero.
const _toTarget = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _local = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _invFrame = new THREE.Quaternion();

/**
 * Highest speed from which a ship can still shed all of its motion within
 * `distance`, given the two deceleration regimes it actually flies with:
 * flightBoostDecel while above flightMaxSpeed, flightThrustDecel below it.
 *
 * This is the inverse of the ship's stopping-distance curve, and it is what
 * keeps an approach from committing to a speed the ship cannot get rid of in
 * time. A pure proportional controller has no notion of this: it will happily
 * ask for boost speed at a range that needs ten times the runway, sail past the
 * target, and come back — the rubber-banding this replaces.
 */
function brakingSpeedLimit(distance: number, h: ISpaceshipHandling): number {
    if (distance <= 0) return 0;

    // Runway needed to brake from normal max speed to a standstill.
    const lowRegimeDistance = (h.flightMaxSpeed * h.flightMaxSpeed) / (2 * h.flightThrustDecel);
    if (distance <= lowRegimeDistance) {
        return Math.sqrt(2 * h.flightThrustDecel * distance);
    }

    // Anything left over is covered at the (much higher) boost decel rate.
    const remaining = distance - lowRegimeDistance;
    const speedSquared = h.flightMaxSpeed * h.flightMaxSpeed + 2 * h.flightBoostDecel * remaining;
    return Math.min(Math.sqrt(speedSquared), h.flightBoostMaxSpeed);
}

/**
 * The first (and simplest) concrete ship AI: tail the player's ship and hold
 * station at NPC_FOLLOW_DISTANCE.
 *
 * Steering is expressed as stick deflection rather than a direct quaternion
 * snap, so the ship is rate-limited by `handling.flightMaxTurnRate` and smoothed
 * by `handling.flightSteerSmoothRate` exactly as it would be under a human
 * pilot — an AI ship banks into its turns and overshoots slightly, same as you.
 *
 * Throttle is a proportional controller on the *relative* closing speed, capped
 * by what the ship can actually brake away before it arrives. Working in
 * relative terms lets it hold station against a player ship that is itself
 * moving (coasting along an orbit, say) instead of chasing a stale point.
 */
export class FollowShipAI extends ShipAI {
    readonly name = 'Follow';

    /** Latched boost state, for hysteresis around the engage threshold. */
    private boosting = false;

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

    /**
     * Closing speed to aim for, given how far out of position we are.
     *
     * Positive means "move toward the target", negative "back off". The command
     * is the smaller of a proportional term (which shapes the gentle final
     * approach) and the braking limit (which governs everything further out).
     */
    private desiredClosingSpeed(gap: number, h: ISpaceshipHandling): number {
        if (gap === 0) return 0;

        const distance = Math.abs(gap);
        const runway = distance / AI_APPROACH_SAFETY_PAD;
        let speed = Math.min(distance * AI_FOLLOW_APPROACH_GAIN, brakingSpeedLimit(runway, h));

        // Backing off is flown in reverse, which the ship caps at normal max speed.
        if (gap < 0) speed = Math.min(speed, h.flightMaxSpeed);

        return Math.sign(gap) * speed;
    }

    /**
     * Decide whether to hold boost, with hysteresis: engage only once the
     * command is meaningfully above normal max speed, then hold until it drops
     * back under normal max. Without the gap between those two thresholds the
     * boost key flickers on and off around a single value.
     */
    private wantBoost(desiredClosing: number, h: ISpaceshipHandling): boolean {
        this.boosting = this.boosting
            ? desiredClosing > h.flightMaxSpeed
            : desiredClosing > h.flightMaxSpeed * AI_BOOST_ENGAGE_FACTOR;
        return this.boosting;
    }

    /** Release the controls and let the ship coast. */
    private standDown(): void {
        this.boosting = false;
        this.ship.resetControlInput();
        this.ship.updateBoostDecelState();
    }

    update(_dt: number): void {
        const ship = this.ship;
        const input = ship.controlInput;
        const h = ship.handling;

        const target = this.getTarget();
        if (!target) {
            // Nobody to follow — release the controls and coast.
            this.standDown();
            return;
        }

        _toTarget.subVectors(target.mesh.position, ship.mesh.position);
        const dist = _toTarget.length();
        if (dist < 1e-6) {
            this.standDown();
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

        // Slack zone around the hold distance. Shrinking the gap by the zone's
        // width (rather than zeroing it inside) keeps the commanded speed
        // continuous across the boundary — a hard switch there makes the ship
        // drift out, lunge back, and settle into a small permanent oscillation.
        const slack = this.followDistance * NPC_FOLLOW_DEAD_BAND;
        const rawGap = dist - this.followDistance; // positive = too far away
        const gap = rawGap > slack ? rawGap - slack : rawGap < -slack ? rawGap + slack : 0;

        const desiredClosing = this.desiredClosingSpeed(gap, h);

        // Actual closing speed, measured relative to the target so an orbiting
        // player ship doesn't read as "running away".
        _relVel.subVectors(ship.velocity, target.velocity);
        const closing = _relVel.dot(_dir);

        // Scale the tolerance with the command: a band tight enough to be useful
        // at walking pace would chatter constantly at boost speed.
        const tolerance = Math.max(
            h.flightMaxSpeed * AI_CLOSING_SPEED_TOLERANCE,
            Math.abs(desiredClosing) * AI_CLOSING_SPEED_TOLERANCE
        );

        if (!aligned) {
            // Turning to face the target: no forward thrust, but keep shedding
            // speed if we're closing faster than we want to.
            this.boosting = false;
            input.thrust = false;
            input.boost = false;
            input.brake = closing > desiredClosing + tolerance;
        } else if (closing < desiredClosing - tolerance) {
            input.thrust = true;
            input.boost = this.wantBoost(desiredClosing, h);
            input.brake = false;
        } else if (closing > desiredClosing + tolerance) {
            this.boosting = false;
            input.thrust = false;
            input.boost = false;
            input.brake = true;
        } else {
            // On station and matching the target's velocity — coast.
            this.boosting = false;
            input.thrust = false;
            input.boost = false;
            input.brake = false;
        }

        ship.thrustActive = input.thrust || input.boost || input.brake;

        // Shed boost speed on release, exactly as the player's ship does.
        ship.updateBoostDecelState();
    }
}
