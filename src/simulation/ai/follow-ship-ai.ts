import * as THREE from 'three';
import { ShipAI } from './ship-ai';
import { brakingSpeedLimit } from './obstacle-avoidance';
import { flightState, simulationState } from '../simulation';
import { formatDistance, formatSpeed, formatThrottle } from './ai-debug-format';
import { steerToward } from './navigation/steering';
import { updateWarpCruise, wantWarp } from './navigation/warp-navigation';
import {
    AI_APPROACH_SAFETY_PAD,
    AI_BOOST_ENGAGE_FACTOR,
    AI_CLOSING_SPEED_TOLERANCE,
    AI_FOLLOW_APPROACH_GAIN,
    AI_HIGH_SPEED_ENGAGE_RANGE,
    AI_HIGH_SPEED_HANDOFF_FACTOR,
    AI_HIGH_SPEED_HANDOFF_RANGE,
    AI_THRUST_ALIGN_ANGLE,
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
const _relVel = new THREE.Vector3();
const _forward = new THREE.Vector3();

/** A ship's collision radius, or 0 when it has none that can be trusted. */
export function hullRadius(ship: Spaceship): number {
    return Number.isFinite(ship.radius) && ship.radius > 0 ? ship.radius : 0;
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
 *
 * The straight line to the target is filtered through the shared obstacle
 * avoidance layer before it becomes a heading, so a player parked on the far
 * side of a star gets tailed around the limb rather than through it.
 */
export class FollowShipAI extends ShipAI {
    // Annotated rather than inferred: a readonly property keeps its literal type, which would
    // make a subclass's own name a type error against this one.
    readonly name: string = 'Follow';

    /** Latched boost state, for hysteresis around the engage threshold. */
    private boosting = false;

    // ── Debug telemetry ──────────────────────────────────────────────────────
    // Plain fields written during update() and only read (and formatted) by debugLines(), so
    // recording them costs nothing when the overlay is off.
    /** What the approach controller did on its last update. */
    protected debugPhase = 'IDLE';
    /** Range to the target, in sim units. */
    protected debugRange = 0;
    /** Measured closing speed (positive = closing), in sim units/s. */
    protected debugClosing = 0;
    /** Commanded closing speed, in sim units/s. */
    protected debugDesiredClosing = 0;

    /**
     * @param ship The ship this controller pilots.
     * @param followDistance Station-keeping distance in sim units. Defaults to
     *   NPC_FOLLOW_DISTANCE (5,000 km / DIST_SCALE).
     */
    constructor(
        ship: Spaceship,
        protected readonly followDistance: number = NPC_FOLLOW_DISTANCE
    ) {
        super(ship);
    }

    /**
     * Resolve the ship to follow: the ship the player is currently flying, or
     * failing that the last ship they spawned (so the NPC still tails a parked
     * ship the player has stepped out of).
     */
    protected getTarget(): Spaceship | null {
        const target = flightState.activeShip ?? flightState.knownShip;
        if (!target || target === this.ship) return null;
        if (target._isDisposed || !target.mesh) return null;
        if (!simulationState.bodies.includes(target)) return null;
        return target;
    }

    /**
     * Clearance between this ship's hull and the target's, given the distance between their
     * centres. Negative once the hulls overlap.
     *
     * Every range decision — hold distance, engage range, break-off distances, fire range — is
     * measured on this rather than centre to centre. A hold distance is meant as space between
     * the two ships, and centre-to-centre it quietly shrinks by the target's radius: 500 m from a
     * 37 m fighter leaves plenty of room, but 500 m from the centre of a 500 m-radius capital ship
     * is its hull plating, and the follower holds station by ramming it.
     */
    protected hullGap(target: Spaceship, centreDistance: number): number {
        return centreDistance - hullRadius(target) - hullRadius(this.ship);
    }

    /**
     * Range (sim units, hull to hull) at which a high-speed approach hands off to low speed.
     *
     * At least AI_HIGH_SPEED_HANDOFF_RANGE, and twice the hold distance for a controller that
     * keeps a far-off station, so the handoff never lands inside the station it is holding.
     */
    private highSpeedHandoffRange(): number {
        return Math.max(
            AI_HIGH_SPEED_HANDOFF_RANGE,
            this.followDistance * AI_HIGH_SPEED_HANDOFF_FACTOR
        );
    }

    /**
     * Pick the flight tier — the AI-side equivalent of the player's R key.
     *
     * High speed is for long hauls: the low tier tops out at a few km/s, so crossing hundreds
     * of km under boost takes minutes. Low speed is for everything close — the dogfight and
     * station-keeping are tuned for it, and the high tier covers their whole range in a frame.
     *
     * - Up to high beyond the engage range, or whenever the target is faster than the low tier
     *   can fly (it would never be caught, or kept up with, otherwise).
     * - Back to low inside the handoff range. The high-speed approach brakes to arrive there
     *   (see update()), so the ship is already inside the low-speed envelope when it switches.
     * - Low with nothing to chase.
     *
     * Idempotent within a frame. A refused change (warp, autopilot or a stop-brake in progress
     * own the ship's speed) is simply retried next frame, so no state is kept for it.
     *
     * Must run before anything reads `ship.handling` this frame.
     */
    protected updateSpeedMode(target: Spaceship | null): void {
        const ship = this.ship;
        if (!target) {
            if (ship.highSpeedMode) ship.setHighSpeedMode(false);
            return;
        }

        const range = this.hullGap(target, ship.mesh.position.distanceTo(target.mesh.position));
        const handoff = this.highSpeedHandoffRange();
        const engage = AI_HIGH_SPEED_ENGAGE_RANGE * (handoff / AI_HIGH_SPEED_HANDOFF_RANGE);
        const outruns = target.velocity.length() > ship.lowSpeedHandling.flightBoostMaxSpeed;

        if (ship.highSpeedMode) {
            if (range <= handoff && !outruns) ship.setHighSpeedMode(false);
        } else if (range > engage || outruns) {
            ship.setHighSpeedMode(true);
        }
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

    /**
     * Width of the dead band around the commanded closing speed, inside which the ship coasts
     * rather than pulsing thrust or brake.
     *
     * Scaled with the command so a band tight enough to be useful at walking pace does not
     * chatter constantly at boost speed, and floored so it never collapses to zero.
     *
     * Overridable because the floor is tied to the ship's normal max speed, which only makes
     * sense while the hold distance is large enough for the commanded speed to reach that scale.
     * A controller holding station at close range commands speeds far below it and would read
     * "on station" at every speed it can actually fly — see CombatShipAI.
     */
    protected closingSpeedTolerance(desiredClosing: number, h: ISpaceshipHandling): number {
        return Math.max(
            h.flightMaxSpeed * AI_CLOSING_SPEED_TOLERANCE,
            Math.abs(desiredClosing) * AI_CLOSING_SPEED_TOLERANCE
        );
    }

    /**
     * Put the stick over toward a world-space heading.
     *
     * The heading is expressed in the ship's own control frame and the yaw/pitch error turned
     * into stick deflection, so the turn is rate-limited and smoothed by the ship's handling
     * exactly as a human pilot's would be.
     *
     * Sign convention: ships are +Z forward / +Y up, which puts the pilot's right at -X.
     * applySteering() computes yawDelta = -steerX * turnRate and pitchDelta = +steerY * turnRate
     * and post-multiplies both onto the control frame, so both errors are negated here to steer
     * *toward* the heading rather than away from it.
     *
     * @param heading Unit direction to turn toward, in world space.
     */
    protected steerToward(heading: THREE.Vector3): void {
        steerToward(this.ship, heading);
    }

    override debugLines(): string[] {
        return [
            `${this.name} · ${this.debugPhase}`,
            `Range ${formatDistance(this.debugRange)}  hold ${formatDistance(this.followDistance)}`,
            `Closing ${formatSpeed(this.debugClosing, true)}  want ${formatSpeed(this.debugDesiredClosing, true)}`,
            `Throttle ${formatThrottle(this.ship.controlInput)}  ${this.ship.highSpeedMode ? 'HIGH' : 'LOW'} speed`,
        ];
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
     * Fly one frame of an active warp — see updateWarpCruise() in navigation/warp-navigation.ts.
     *
     * @param dist Current hull-to-hull distance to the target, in sim units.
     */
    private flyWarpCruise(dist: number, simDt: number): void {
        this.boosting = false;
        updateWarpCruise(this.ship, this.avoidance, dist - this.followDistance, _directDir, simDt);
    }

    update(_dt: number, simDt: number): void {
        const ship = this.ship;
        const input = ship.controlInput;

        const target = this.getTarget();
        // Before `ship.handling` is read: the tier picked here is the one flown this frame.
        this.updateSpeedMode(target);
        const h = ship.handling;
        if (!target) {
            // Nobody to follow — release the controls and coast.
            this.debugPhase = 'NO TARGET';
            this.standDown();
            return;
        }

        _toTarget.subVectors(target.mesh.position, ship.mesh.position);
        const dist = _toTarget.length();
        // Hull-to-hull: what every range decision below is measured on (see hullGap).
        const range = this.hullGap(target, dist);
        this.debugRange = range;
        if (dist < 1e-6) {
            this.debugPhase = 'NO TARGET';
            this.standDown();
            return;
        }
        _dir.copy(_toTarget).divideScalar(dist);
        _directDir.copy(_dir);

        // ── Warp cruise ──────────────────────────────────────────────────────
        // Ahead of avoidance, because avoidance hands back a corrected heading and a speed
        // cap — and at warp the ship can act on neither. The only live control is the drive.
        if (ship.warpActive) {
            this.debugPhase = 'WARP CRUISE';
            this.flyWarpCruise(range, simDt);
            return;
        }

        // ── Obstacle avoidance ───────────────────────────────────────────────
        // Bend the straight line to the target around anything in the way. The result is still
        // just a heading and a speed cap, so everything below is unchanged — the ship flies the
        // detour under its own handling limits exactly as it flies the direct line.
        const avoid = this.avoidance.evaluate(_dir, simDt);
        _dir.copy(avoid.heading);

        this.steerToward(_dir);
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
            this.debugPhase = 'FLEE';
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
        //
        // In high-speed mode the station is the handoff range instead of the hold distance, so
        // the approach brakes to arrive there already slow enough for low speed to take over
        // (see updateSpeedMode); the low-speed approach then closes the rest of the way. Sized so
        // the slack zone's far edge sits just inside the handoff range — the proportional
        // approach only creeps up on that edge, and would otherwise stall outside the handoff
        // and never hand off.
        const standoff = ship.highSpeedMode
            ? Math.max(
                  this.followDistance,
                  this.highSpeedHandoffRange() / (1 + 2 * NPC_FOLLOW_DEAD_BAND)
              )
            : this.followDistance;
        const slack = standoff * NPC_FOLLOW_DEAD_BAND;
        const rawGap = range - standoff; // positive = too far away
        const gap = rawGap > slack ? rawGap - slack : rawGap < -slack ? rawGap + slack : 0;

        // ── Warp ─────────────────────────────────────────────────────────────
        // Held as a level, exactly like the player holding Space through the charge:
        // Spaceship.updateWarpIntentState() turns the edges into the same charge / engage /
        // cancel calls the key handler makes. Normal flight controls stay live while the
        // charge spools, so the steering above keeps the nose on target the whole time — and
        // if it drifts off, this goes false again and the charge is abandoned.
        input.warp = wantWarp(ship, this.avoidance, gap, _directDir, avoid, simDt);

        // Cap the approach at a speed we could still shed before reaching the hazard's surface.
        // Only ever a reduction: avoidance can slow the chase down, never speed it up.
        const desiredClosing = Math.min(this.desiredClosingSpeed(gap, h), avoid.speedLimit);

        // Actual closing speed, measured relative to the target so an orbiting
        // player ship doesn't read as "running away".
        _relVel.subVectors(ship.velocity, target.velocity);
        const closing = _relVel.dot(_dir);

        const tolerance = this.closingSpeedTolerance(desiredClosing, h);

        this.debugPhase = ship.warpCharging
            ? 'WARP CHARGE'
            : aligned
              ? 'APPROACH'
              : 'APPROACH · TURNING';
        this.debugClosing = closing;
        this.debugDesiredClosing = desiredClosing;

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
