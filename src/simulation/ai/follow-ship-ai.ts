import * as THREE from 'three';
import { ShipAI } from './ship-ai';
import { brakingSpeedLimit } from './obstacle-avoidance';
import { flightState, simulationState } from '../simulation';
import type { IAvoidanceResult } from './obstacle-avoidance';
import {
    AI_APPROACH_SAFETY_PAD,
    AI_AVOID_DECISION_MARGIN,
    AI_BOOST_ENGAGE_FACTOR,
    AI_CLOSING_SPEED_TOLERANCE,
    AI_FOLLOW_APPROACH_GAIN,
    AI_STEER_FULL_DEFLECTION_ANGLE,
    AI_THRUST_ALIGN_ANGLE,
    AI_WARP_ABORT_FACTOR,
    AI_WARP_ALIGN_ANGLE,
    AI_WARP_DROP_PAD,
    AI_WARP_ENGAGE_FACTOR,
    NPC_FOLLOW_DEAD_BAND,
    NPC_FOLLOW_DISTANCE,
} from '../../utilities/consts';
import type { Spaceship } from '../../bodies/ships/spaceship';
import type { ISpaceshipHandling } from '../../interfaces';

// Scratch vectors — reused every frame to keep the per-frame allocation count at zero.
const _toTarget = new THREE.Vector3();
const _dir = new THREE.Vector3();
/** The unbent bearing to the target, kept separate from `_dir` (which avoidance overwrites
 *  with its corrected heading). Warp is flown on a locked straight line, so every warp
 *  decision has to reason about the direct line rather than the detour. */
const _directDir = new THREE.Vector3();
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
 * Throttle is a proportional controller on the *relative* closing speed, capped
 * by what the ship can actually brake away before it arrives. Working in
 * relative terms lets it hold station against a player ship that is itself
 * moving (coasting along an orbit, say) instead of chasing a stale point.
 *
 * The straight line to the target is filtered through the shared obstacle
 * avoidance layer before it becomes a heading, so a player parked on the far
 * side of a star gets tailed around the limb rather than through it.
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
        // Clears controlInput.warp along with everything else, so a ship that loses its
        // target abandons a charge, or drops out of warp, on the next intent update.
        this.ship.resetControlInput();
        this.ship.updateBoostDecelState();
    }

    /**
     * Speed this ship will be doing by the time its controller next gets a say, if it spends
     * the interval accelerating under warp power.
     *
     * Warp decisions are made once per rendered frame on wall-clock time while the ship moves
     * at sim rate, and warp acceleration is violent enough that at high time scale a single
     * frame covers the entire span from boost speed to maximum warp. Reasoning about where
     * the ship is going therefore has to use the speed it will have, not the one it has.
     */
    private projectedWarpSpeed(fwdSpeed: number, simDt: number): number {
        const h = this.ship.handling;
        return Math.min(fwdSpeed + h.flightWarpAccel * simDt, h.flightWarpSpeed);
    }

    /**
     * Decide whether to ask for warp, given how far out of position we are.
     *
     * Warp is worth it when the ship would otherwise spend minutes crossing the gap under
     * boost, and it is only *safe* when the ship can still shed the speed again afterwards —
     * which is the same question the ship's own `autopilotWarpThreshold` already answers, so
     * that threshold is reused rather than re-derived here.
     *
     * The checks are ordered cheapest-first: the corridor scan at the end walks every body in
     * the system, and only runs once a ship is genuinely far away and lined up.
     */
    private wantWarp(gap: number, avoid: IAvoidanceResult, simDt: number): boolean {
        const ship = this.ship;

        // A deceleration phase owns the throttle until it completes — the ship would refuse
        // the charge anyway, and holding the intent up against it just churns.
        if (ship.warpDecelerating || ship.boostDecelerating || ship.stopBraking) return false;

        // Already close enough, or about to hit something, or part-way around it: in none of
        // those cases is there a straight line worth locking onto.
        if (gap <= 0) return false;
        if (avoid.flee || avoid.hazard) return false;

        // Far enough out for the run to pay for itself. Once a charge is running the gate is
        // relaxed, so a target drifting back and forth across it can't make the charge start
        // and abort on alternating frames.
        const threshold =
            ship.autopilotWarpThreshold *
            AI_WARP_ENGAGE_FACTOR *
            (ship.warpCharging ? AI_WARP_ABORT_FACTOR : 1);
        if (gap < threshold) return false;

        // Line up on the *direct* bearing, not the avoidance-corrected heading: warp flies
        // wherever the nose is pointing at engagement and cannot be steered afterwards, so
        // any error here is error the ship carries the whole way.
        _forward.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
        if (_forward.dot(_directDir) < Math.cos(AI_WARP_ALIGN_ANGLE)) return false;

        // Don't start a charge for a warp that can't be flown. At high time scale one frame
        // under warp power can cover more ground than the whole gap, and the cruise logic
        // would have to bail out immediately — after a two-second spool and with the ship
        // committed to a deceleration it can't thrust out of. Better never to light it.
        const projected = this.projectedWarpSpeed(ship.velocity.dot(_forward), simDt);
        if (gap <= projected * simDt * AI_AVOID_DECISION_MARGIN) return false;

        // The entire remaining run has to be clear. Deliberately conservative: dropping out of
        // warp leaves the ship shedding speed with thrust locked out, so it cannot obey an
        // avoidance speed cap on the way down and must not be aimed at anything to begin with.
        // A blocked corridor simply means no warp — the ship boosts instead and ordinary
        // avoidance walks it around the obstacle until the straight line opens up.
        return this.avoidance.straightPathClearance(_directDir, gap) === Infinity;
    }

    /**
     * Fly one frame of an active warp.
     *
     * There is exactly one decision available up here — stay in, or drop out — because warp
     * disables steering, roll, thrust and weapons. So the stick is centred and every other
     * input released, both to reflect that and so nothing stale is left holding the controls
     * when the drive lets go.
     *
     * Dropping out is timed off the ship's own three-band deceleration model: the moment the
     * remaining runway stops comfortably exceeding what it would take to shed the current
     * speed, warp ends and the rest of the approach is flown normally. Ships do not reach full
     * warp speed on short runs — acceleration and stopping distance are both paid out of the
     * same gap — so reading the speed live rather than assuming maximum keeps the drop-out
     * proportionate to how fast the ship actually got going.
     *
     * @param dist Current distance to the target, in sim units.
     * @param simDt Sim-time seconds this frame. Load-bearing: the decision runs once per
     *   rendered frame on wall-clock time while the ship moves at sim rate, so at high time
     *   warp it can cross the entire stopping distance between two consecutive checks. The
     *   distance travelled before the next look is therefore added to the trigger, the same
     *   correction (and the same margin) the avoidance lookahead applies for the same reason.
     */
    private updateWarpCruise(dist: number, simDt: number): void {
        const ship = this.ship;
        const input = ship.controlInput;

        // Nothing on this ship is flyable during warp; release it all.
        input.thrust = false;
        input.boost = false;
        input.brake = false;
        input.rollLeft = false;
        input.rollRight = false;
        input.steerX = 0;
        input.steerY = 0;
        input.fire = false;
        this.boosting = false;
        ship.thrustActive = false;

        _forward.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
        const fwdSpeed = ship.velocity.dot(_forward);
        const gap = dist - this.followDistance;

        // The range at which it is already too late to start shedding speed: the runway the
        // ship needs, plus however far it travels before this decision comes round again.
        //
        // Both terms are measured at the speed the ship will be doing by then, not the one it
        // is doing now, and that distinction is load-bearing rather than fussy. Warp
        // acceleration is enormous — a Zenith gains 30,000 u/s per second — so at high time
        // scale a single frame takes the ship from boost speed to full warp and moves it tens
        // of millions of units. Judged on the current speed the ship reads as comfortably
        // short of the trigger, then overshoots the target by orders of magnitude on the very
        // next frame. Judged on the projected speed it correctly declines to stay in warp it
        // cannot get out of, and simply flies the approach under boost instead.
        const nextSpeed = this.projectedWarpSpeed(fwdSpeed, simDt);
        const dropDistance =
            ship.stoppingDistanceFrom(nextSpeed) * AI_WARP_DROP_PAD +
            nextSpeed * simDt * AI_AVOID_DECISION_MARGIN;

        // Out of runway — any later and the ship sails straight past.
        if (gap <= dropDistance) {
            input.warp = false;
            return;
        }

        // The target has drifted off the locked heading far enough that this run no longer
        // arrives anywhere near it. Drop out and re-aim under normal flight.
        if (_forward.dot(_directDir) < Math.cos(AI_THRUST_ALIGN_ANGLE)) {
            input.warp = false;
            return;
        }

        // Something moved into the corridor closer than the ship can stop. Start shedding now:
        // deceleration is not instant, and thrust is locked out for all of it.
        if (this.avoidance.straightPathClearance(_forward, gap) <= dropDistance) {
            input.warp = false;
            return;
        }

        input.warp = true;
    }

    update(_dt: number, simDt: number): void {
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
        _directDir.copy(_dir);

        // ── Warp cruise ──────────────────────────────────────────────────────
        // Ahead of avoidance, because avoidance hands back a corrected heading and a speed
        // cap — and at warp the ship can act on neither. The only live control is the drive.
        if (ship.warpActive) {
            this.updateWarpCruise(dist, simDt);
            return;
        }

        // ── Obstacle avoidance ───────────────────────────────────────────────
        // Bend the straight line to the target around anything in the way. The result is still
        // just a heading and a speed cap, so everything below is unchanged — the ship flies the
        // detour under its own handling limits exactly as it flies the direct line.
        const avoid = this.avoidance.evaluate(_dir, simDt);
        _dir.copy(avoid.heading);

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

        // About to hit something. Station-keeping is no longer the question: _dir already points
        // clear of the hazard, so get on that heading and run. Braking alone wouldn't do it —
        // a ship shedding speed inside a gravity well is still falling into it.
        if (avoid.flee) {
            input.thrust = aligned;
            input.boost = aligned;
            input.brake = false;
            input.warp = false;
            this.boosting = aligned;
            ship.thrustActive = input.thrust || input.boost;
            ship.updateBoostDecelState();
            return;
        }

        // Slack zone around the hold distance. Shrinking the gap by the zone's
        // width (rather than zeroing it inside) keeps the commanded speed
        // continuous across the boundary — a hard switch there makes the ship
        // drift out, lunge back, and settle into a small permanent oscillation.
        const slack = this.followDistance * NPC_FOLLOW_DEAD_BAND;
        const rawGap = dist - this.followDistance; // positive = too far away
        const gap = rawGap > slack ? rawGap - slack : rawGap < -slack ? rawGap + slack : 0;

        // ── Warp ─────────────────────────────────────────────────────────────
        // Held as a level, exactly like the player holding Space through the charge:
        // Spaceship.updateWarpIntentState() turns the edges into the same charge / engage /
        // cancel calls the key handler makes. Normal flight controls stay live while the
        // charge spools, so the steering above keeps the nose on target the whole time — and
        // if it drifts off, this goes false again and the charge is abandoned.
        input.warp = this.wantWarp(gap, avoid, simDt);

        // Cap the approach at a speed we could still shed before reaching the hazard's surface.
        // Only ever a reduction: avoidance can slow the chase down, never speed it up.
        const desiredClosing = Math.min(this.desiredClosingSpeed(gap, h), avoid.speedLimit);

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
            // Boost needs no special case near an obstacle: the commanded speed above is already
            // capped at what the ship can steer past, and wantBoost() only engages when the
            // command exceeds normal max — so a cap that rules boost out has already ruled it out.
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
