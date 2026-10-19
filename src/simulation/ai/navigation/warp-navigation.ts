import * as THREE from 'three';
import {
    AI_THRUST_ALIGN_ANGLE,
    AI_WARP_ABORT_FACTOR,
    AI_WARP_ALIGN_ANGLE,
    AI_WARP_BAND_DROP_PAD,
    AI_WARP_DECISION_MARGIN,
    AI_WARP_DROP_PAD,
    AI_WARP_ETA_RATIO,
    AI_WARP_MIN_SPEED_GAIN,
    AI_WARP_MIN_TIME_SAVED,
} from '../../../utilities/consts';
import { simulationState } from '../../simulation';
import type { Body } from '../../../bodies/body';
import type { Spaceship } from '../../../bodies/ships/spaceship';
import type { IAvoidanceResult, ObstacleAvoidance } from '../obstacle-avoidance';

// Scratch — reused every call to keep the per-frame allocation count at zero.
const _forward = new THREE.Vector3();

/**
 * Should this trip be warped, and how?
 *
 * Warp is chosen on ETA, not distance. The alternative to warping is flying conventionally on
 * the high tier's boost, and warp only pays when it gets the ship there meaningfully sooner —
 * after the charge spools, and after whatever is left to fly conventionally at the end of the
 * leg.
 *
 * A leg runs to the target, or to the first thing in the straight corridor, whichever comes
 * first. Requiring the *whole* run to be clear (as this once did) meant a moon sitting a million
 * km in front of a planet vetoed warp for the entire approach, and the ship crawled the rest of
 * the way at boost speed. Now the ship warps up to the moon, flies round it conventionally, and
 * plans again on the far side.
 *
 * A leg is flown at a capped speed (see warpSpeedCap), so a short leg — or any leg at high time
 * scale — is warped slower rather than not at all.
 */
export interface IWarpPlan {
    /** True when warping beats flying conventionally by the margins in consts.ts. */
    worth: boolean;
    /** Length of the warp leg (u): to the target's stopping point, or up to the first blocker. */
    leg: number;
    /** Warp speed ceiling for this leg (u/s); see warpSpeedCap(). */
    speedCap: number;
    /** Sim-seconds to arrive by warp: charge + leg + conventional remainder. */
    etaWarp: number;
    /** Sim-seconds to arrive flying conventionally the whole way. */
    etaConventional: number;
    /** Why the last decision came out the way it did — shown on the AI debug overlay. */
    reason: string;
}

/** The plan from the most recent planWarp() / wantWarp() call. Read it straight after the call. */
export const lastWarpPlan: IWarpPlan = {
    worth: false,
    leg: 0,
    speedCap: 0,
    etaWarp: Infinity,
    etaConventional: Infinity,
    reason: '',
};

/** Clear `lastWarpPlan` to a "no warp" result, so nothing from a previous call (or another ship)
 *  survives into a decision that bailed out early. */
function resetPlan(reason: string): IWarpPlan {
    const plan = lastWarpPlan;
    plan.worth = false;
    plan.leg = 0;
    plan.speedCap = 0;
    plan.etaWarp = Infinity;
    plan.etaConventional = Infinity;
    plan.reason = reason;
    return plan;
}

/**
 * Speed a ship will be doing by the time its controller next gets a say, if it spends the
 * interval accelerating under warp power.
 *
 * Warp decisions are made once per rendered frame on wall-clock time while the ship moves at
 * sim rate, and warp acceleration is violent enough that at high time scale a single frame
 * covers the entire span from boost speed to maximum warp. Reasoning about where the ship is
 * going therefore has to use the speed it will have, not the one it has.
 *
 * @param cap The warp speed cap in force (controlInput.warpSpeedCap), or null for none.
 */
export function projectedWarpSpeed(
    ship: Spaceship,
    fwdSpeed: number,
    simDt: number,
    cap: number | null = null
): number {
    const h = ship.handling;
    const ceiling = cap === null ? h.flightWarpSpeed : Math.min(h.flightWarpSpeed, cap);
    return Math.max(fwdSpeed, Math.min(fwdSpeed + h.flightWarpAccel * simDt, ceiling));
}

/** Distance (u) the warp band itself takes: shedding `speed` down to boost max at warp decel. */
function warpBandDistance(ship: Spaceship, speed: number): number {
    const h = ship.handling;
    const b = h.flightBoostMaxSpeed;
    return speed > b ? (speed * speed - b * b) / (2 * h.flightWarpDecel) : 0;
}

/**
 * Range (u) at which a ship doing `speed` has to leave warp: the warp band of its stopping
 * distance (lightly padded — warp decel is enormous and deterministic), the conventional bands
 * below it (padded as usual), and how far it travels before the deceleration starts.
 */
function dropDistanceAt(ship: Spaceship, speed: number, simDt: number): number {
    const b = ship.handling.flightBoostMaxSpeed;
    return (
        warpBandDistance(ship, speed) * AI_WARP_BAND_DROP_PAD +
        ship.stoppingDistanceFrom(Math.min(speed, b)) * AI_WARP_DROP_PAD +
        speed * simDt * AI_WARP_DECISION_MARGIN
    );
}

/**
 * The fastest warp speed from which a run of `leg` still ends safely: the speed whose drop
 * distance (dropDistanceAt) is exactly `leg`.
 *
 * Above boost max the drop distance is the quadratic
 *   P_w/(2d_w)·v² + (simDt·margin)·v + P·stop(b) − P_w·b²/(2d_w)
 * and this is its root. The `simDt` term is what makes the cap shrink at high time scale, where
 * a single frame of travel would otherwise carry the ship past the point it needed to drop out.
 *
 * Returns 0 when not even boost speed fits.
 */
export function warpSpeedCap(ship: Spaceship, leg: number, simDt: number): number {
    const h = ship.handling;
    const b = h.flightBoostMaxSpeed;
    const a = AI_WARP_BAND_DROP_PAD / (2 * h.flightWarpDecel);
    const k = simDt * AI_WARP_DECISION_MARGIN;
    const c =
        AI_WARP_DROP_PAD * ship.stoppingDistanceFrom(b) -
        (AI_WARP_BAND_DROP_PAD * b * b) / (2 * h.flightWarpDecel) -
        leg;
    const disc = k * k - 4 * a * c;
    if (disc < 0) return 0;
    const v = (-k + Math.sqrt(disc)) / (2 * a);
    return THREE.MathUtils.clamp(v, 0, h.flightWarpSpeed);
}

/**
 * Best speed the ship can fly *without* warp — the high tier's boost max, which an AI switches
 * to for any long run (see selectSpeedTier).
 */
function conventionalSpeed(ship: Spaceship): number {
    return ship.autopilotHandling.flightBoostMaxSpeed;
}

/** Sim-seconds to fly `distance` conventionally: spool up to boost speed, cruise, brake. */
function conventionalTime(ship: Spaceship, distance: number): number {
    if (distance <= 0) return 0;
    const h = ship.autopilotHandling;
    const v = conventionalSpeed(ship);
    return distance / v + v / (2 * h.flightBoostAccel) + v / (2 * h.flightBoostDecel);
}

/**
 * Sim-seconds to fly a warp leg of `leg` with speed ceiling `vCap`: a trapezoid of warp
 * acceleration, cruise and warp deceleration, or a triangle when the leg is too short to reach
 * the ceiling.
 */
function warpLegTime(ship: Spaceship, leg: number, vCap: number): number {
    if (leg <= 0 || vCap <= 0) return 0;
    const h = ship.handling;
    const accel = h.flightWarpAccel;
    const decel = h.flightWarpDecel;
    const rampDistance = (vCap * vCap) / (2 * accel) + (vCap * vCap) / (2 * decel);
    if (leg >= rampDistance) {
        return vCap / accel + vCap / decel + (leg - rampDistance) / vCap;
    }
    const peak = Math.sqrt((2 * leg * accel * decel) / (accel + decel));
    return peak / accel + peak / decel;
}

/**
 * Work out the warp plan for a run of `gap` along `directDir`, into `lastWarpPlan`.
 *
 * Costs a full pass over `simulationState.bodies` (the corridor scan), so it is guarded by a
 * cheap ETA test first: a run conventional flight covers within the minimum saving can never be
 * worth a warp, whatever the corridor looks like.
 *
 * @param gap Distance still to cover before the ship is where it wants to stop (u).
 * @param directDir Unit bearing of the direct line to the destination.
 * @param ignore A body that never blocks the corridor (the autopilot's own target).
 */
export function planWarp(
    ship: Spaceship,
    avoidance: ObstacleAvoidance,
    gap: number,
    directDir: THREE.Vector3,
    simDt: number,
    ignore: Body | null = null
): IWarpPlan {
    const plan = resetPlan('arrived');
    if (gap <= 0) return plan;
    plan.etaConventional = conventionalTime(ship, gap);

    // The charge spools on wall time; everything else moves at sim rate. Converting the charge
    // into sim-seconds keeps the comparison honest at any time scale.
    const timeScale = Math.max(simulationState.timeScale, 1e-6);
    const relax = ship.warpCharging ? AI_WARP_ABORT_FACTOR : 1;
    const minSaved = AI_WARP_MIN_TIME_SAVED * relax * timeScale;
    const chargeLeft = ship.warpActive
        ? 0
        : Math.max(
              0,
              ship.handling.flightWarpChargeTime - (ship.warpCharging ? ship.warpChargeTimer : 0)
          ) * timeScale;

    // Cheap rejection before the corridor scan.
    if (plan.etaConventional - chargeLeft < minSaved) {
        plan.reason = 'too short to pay for the charge';
        return plan;
    }

    const clearance = avoidance.straightPathClearance(directDir, gap, ignore);
    const leg = Math.min(gap, clearance);
    const speedCap = warpSpeedCap(ship, leg, simDt);
    plan.leg = leg;
    plan.speedCap = speedCap;
    const blocker = clearance < gap ? avoidance.corridorBlocker : null;
    if (speedCap < conventionalSpeed(ship) * AI_WARP_MIN_SPEED_GAIN * relax) {
        plan.reason = blocker
            ? `${blocker.name || 'body'} too close ahead`
            : 'leg too short for a useful warp speed';
        return plan;
    }

    // Warp to the drop point, shed the warp band at warp decel (fast: it covers its own distance
    // in a fraction of a second), then fly whatever is left conventionally.
    const dropAt = Math.min(leg, dropDistanceAt(ship, speedCap, simDt));
    const bandDistance = warpBandDistance(ship, speedCap);
    const bandTime = (speedCap - ship.handling.flightBoostMaxSpeed) / ship.handling.flightWarpDecel;
    plan.etaWarp =
        chargeLeft +
        warpLegTime(ship, leg - dropAt, speedCap) +
        Math.max(0, bandTime) +
        conventionalTime(ship, gap - leg + Math.max(0, dropAt - bandDistance));

    const saved = plan.etaConventional - plan.etaWarp;
    plan.worth =
        plan.etaWarp < plan.etaConventional * (AI_WARP_ETA_RATIO / relax) && saved > minSaved;
    plan.reason = plan.worth
        ? blocker
            ? `leg to ${blocker.name || 'body'}`
            : 'clear run'
        : 'boost is about as fast';
    return plan;
}

/**
 * Decide whether to ask for warp, given how far short of where it wants to be the ship is.
 *
 * Gates in order: no deceleration phase owning the throttle, no emergency evade, a warp plan that
 * beats conventional flight (planWarp), and the nose lined up on the direct line. The plan
 * is left in `lastWarpPlan` either way, so a controller can see that a warp *would* be worth it
 * and line the nose up for one.
 *
 * When this returns true it also writes the plan's speed cap into `controlInput.warpSpeedCap`,
 * so the cap is in force from the frame the drive lights.
 *
 * @param gap Distance still to cover before the ship is where it wants to stop (u).
 * @param directDir Unit bearing of the *direct* line to the destination — not an
 *   avoidance-corrected heading. Warp flies wherever the nose points at engagement and cannot be
 *   steered afterwards, so any error here is error the ship carries the whole way.
 * @param avoid This frame's avoidance result.
 * @param ignore A body that never blocks the corridor (the autopilot's own target).
 */
export function wantWarp(
    ship: Spaceship,
    avoidance: ObstacleAvoidance,
    gap: number,
    directDir: THREE.Vector3,
    avoid: IAvoidanceResult,
    simDt: number,
    ignore: Body | null = null
): boolean {
    // A deceleration phase owns the throttle until it completes — the ship would refuse the
    // charge anyway, and holding the intent up against it just churns.
    if (ship.warpDecelerating || ship.boostDecelerating || ship.stopBraking) {
        resetPlan('decelerating');
        return false;
    }

    // Already there, or about to hit something.
    if (gap <= 0) {
        resetPlan('arrived');
        return false;
    }
    if (avoid.flee) {
        resetPlan('evading');
        return false;
    }
    // Merely steering round something is NOT a reason to skip warp. Avoidance looks along a wide
    // cone and holds a detour until the direct line clears it by a margin, so it reports a hazard
    // far more often than anything actually lies on the straight warp line. That line is what
    // the corridor scan in planWarp() checks — and it limits the leg to the first thing in it.

    const plan = planWarp(ship, avoidance, gap, directDir, simDt, ignore);
    if (!plan.worth) return false;

    _forward.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
    if (_forward.dot(directDir) < Math.cos(AI_WARP_ALIGN_ANGLE)) {
        plan.reason = 'lining up';
        return false;
    }

    ship.controlInput.warpSpeedCap = plan.speedCap;
    plan.reason = ship.warpCharging ? 'charging' : 'engaging';
    return true;
}

/**
 * Fly one frame of an active warp.
 *
 * There is exactly one decision available up here — stay in, or drop out — because warp
 * disables steering, roll, thrust and weapons. So the stick is centred and every other input
 * released, both to reflect that and so nothing stale is left holding the controls when the
 * drive lets go.
 *
 * The leg ends at the destination or at the first thing in the corridor ahead, whichever is
 * nearer. The speed cap is re-sized to the remaining leg every frame, and the drive is released
 * the moment the remaining leg stops comfortably exceeding what it would take to shed the speed
 * — measured at the speed the ship will be doing by the next decision, not the one it has now.
 * Warp acceleration is enormous (a Zenith gains 30,000 u/s per second), so at high time scale a
 * single frame can take a ship from boost speed to full warp; judged on the current speed it
 * would read as comfortably short of the drop point, then overshoot by orders of magnitude.
 *
 * @param gap Distance still to cover before the ship is where it wants to stop (u).
 * @param directDir Unit bearing of the direct line to the destination.
 * @param simDt Sim-time seconds this frame. Load-bearing: the decision runs once per rendered
 *   frame on wall-clock time while the ship moves at sim rate, so at high time warp it can cross
 *   the entire stopping distance between two consecutive checks.
 * @param ignore A body that never blocks the corridor (the autopilot's own target).
 */
export function updateWarpCruise(
    ship: Spaceship,
    avoidance: ObstacleAvoidance,
    gap: number,
    directDir: THREE.Vector3,
    simDt: number,
    ignore: Body | null = null
): void {
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
    input.speedSetpoint = null;
    ship.thrustActive = false;

    _forward.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
    const fwdSpeed = ship.velocity.dot(_forward);

    // The destination has drifted off the locked heading far enough that this run no longer
    // arrives anywhere near it. Drop out and re-aim under normal flight.
    if (_forward.dot(directDir) < Math.cos(AI_THRUST_ALIGN_ANGLE)) {
        input.warp = false;
        return;
    }

    // Remaining leg: to the destination, or to whatever has moved into the corridor ahead.
    const leg = Math.min(gap, avoidance.straightPathClearance(_forward, gap, ignore));
    const cap = warpSpeedCap(ship, leg, simDt);
    input.warpSpeedCap = cap;

    // Out of runway — any later and the ship sails past (or into what's ahead).
    const nextSpeed = projectedWarpSpeed(ship, fwdSpeed, simDt, cap);
    if (leg <= dropDistanceAt(ship, nextSpeed, simDt)) {
        input.warp = false;
        return;
    }

    input.warp = true;
}
