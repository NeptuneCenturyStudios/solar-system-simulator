import * as THREE from 'three';
import { AI_AUTOPILOT_SPEED_SETTLED, AI_THRUST_ALIGN_ANGLE } from '../../../utilities/consts';
import { steerToward } from './steering';
import type { Body } from '../../../bodies/body';
import type { Spaceship } from '../../../bodies/ships/spaceship';
import type { ObstacleAvoidance } from '../obstacle-avoidance';

/** Below this speed (u/s) a commanded velocity has no meaningful direction. */
const SPEED_EPSILON = 1e-9;

// Scratch — reused every call to keep the per-frame allocation count at zero.
const _dir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _perp = new THREE.Vector3();

/** What flyVelocity() did this frame. A reused object — read it, don't retain it. */
export interface IVelocityControlResult {
    /** Nose within AI_THRUST_ALIGN_ANGLE of the heading, so the throttle is live. */
    aligned: boolean;
    /** The commanded speed is beyond this tier's boost max — the velocity can't be matched. */
    saturated: boolean;
    /** Obstacle avoidance called an emergency; the ship is running from a hazard. */
    flee: boolean;
    /** The forward speed actually commanded this frame (after the avoidance and tier caps). */
    commandedSpeed: number;
}

const _result: IVelocityControlResult = {
    aligned: false,
    saturated: false,
    flee: false,
    commandedSpeed: 0,
};

/**
 * Fly a desired **world** velocity — the one control primitive the flight model offers a pilot
 * that can only thrust along its nose.
 *
 * Under any held throttle key, `applyFlightThrustSubstep` decays the part of the world velocity
 * perpendicular to the nose, so the velocity converges onto the nose. Pointing the nose along the
 * velocity you want and holding the forward speed at its magnitude therefore *is* flying that
 * velocity, and the drift decay does the steering of the velocity vector for free. Near a moving
 * planet the nose consequently points mostly along the planet's own motion — the frame the ship's
 * speed caps and drift decay live in is the world, not the planet.
 *
 * Throttle: with the nose on the heading, thrust, brake (and boost when above cruise) are all held
 * at once and `speedSetpoint` set to the commanded speed. The substep governor then accelerates
 * when below the setpoint and brakes when above it, landing on it exactly within a substep, so the
 * speed holds at any frame rate or time scale. Holding a key the whole time also keeps the drift
 * decay working. Boost stays held for as long as the ship is above cruise speed, because releasing
 * it there starts the boost-decel ramp, which locks thrust out and sheds speed all the way down to
 * cruise.
 *
 * Off the heading, the ship only turns: no new speed along a nose pointing the wrong way, but any
 * excess over the command is still shed.
 *
 * The heading is filtered through obstacle avoidance first, and the speed capped at what
 * avoidance allows, exactly as the follow controller does.
 *
 * Writes steering, thrust/boost/brake and `speedSetpoint` into `ship.controlInput`. Leaves `warp`
 * and `fire` released — callers that want either set them afterwards.
 *
 * @param desiredVel World velocity to fly (u/s). Read only.
 * @param ignore A body avoidance should not treat as a hazard (the autopilot's own target).
 */
export function flyVelocity(
    ship: Spaceship,
    avoidance: ObstacleAvoidance,
    desiredVel: THREE.Vector3,
    simDt: number,
    ignore: Body | null = null
): IVelocityControlResult {
    const input = ship.controlInput;
    const h = ship.handling;
    const result = _result;

    _forward.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);

    const desiredSpeed = desiredVel.length();
    if (desiredSpeed > SPEED_EPSILON) _dir.copy(desiredVel).divideScalar(desiredSpeed);
    else _dir.copy(_forward); // Nothing to point at: hold the nose where it is and stop.

    const avoid = avoidance.evaluate(_dir, simDt, ignore);
    steerToward(ship, avoid.heading);
    input.warp = false;
    input.fire = false;

    result.saturated = desiredSpeed > h.flightBoostMaxSpeed;
    result.flee = avoid.flee;

    if (avoid.flee) {
        // About to hit something: get on the escape heading and run at full power.
        input.speedSetpoint = null;
        const aligned = _forward.dot(avoid.heading) > Math.cos(AI_THRUST_ALIGN_ANGLE);
        input.thrust = aligned;
        input.boost = aligned;
        input.brake = false;
        result.aligned = aligned;
        result.commandedSpeed = h.flightBoostMaxSpeed;
        ship.thrustActive = aligned;
        ship.updateBoostDecelState();
        return result;
    }

    const commanded = Math.min(desiredSpeed, avoid.speedLimit, h.flightBoostMaxSpeed);
    const fwdSpeed = ship.forwardSpeedInFrame(_forward);
    const aligned = _forward.dot(avoid.heading) > Math.cos(AI_THRUST_ALIGN_ANGLE);
    result.aligned = aligned;
    result.commandedSpeed = commanded;

    // Above cruise, boost must stay held or the release starts the boost-decel ramp.
    const aboveCruise = fwdSpeed > h.flightMaxSpeed;

    if (aligned) {
        input.speedSetpoint = commanded;
        input.thrust = true;
        input.brake = true;
        input.boost = commanded > h.flightMaxSpeed || aboveCruise;
    } else if (fwdSpeed > commanded) {
        // Turning, but too fast: shed the excess (brake stops at the setpoint).
        input.speedSetpoint = commanded;
        input.thrust = false;
        input.brake = true;
        input.boost = aboveCruise;
    } else if (aboveCruise) {
        // Turning at boost speed: hold the speed — the setpoint at the current speed makes boost
        // add nothing and brake take nothing away — rather than release into the decel ramp.
        input.speedSetpoint = fwdSpeed;
        input.thrust = false;
        input.brake = false;
        input.boost = true;
    } else {
        // Turning at cruise speed or below: just turn.
        input.speedSetpoint = null;
        input.thrust = false;
        input.brake = false;
        input.boost = false;
    }

    // Trail and HUD: show the engines working only while the throttle is actually changing the
    // ship's speed or swinging its velocity onto the nose — not while it merely holds a setpoint.
    const tolerance = Math.max(commanded, h.flightMaxSpeed) * AI_AUTOPILOT_SPEED_SETTLED;
    _perp.copy(ship.velocity).addScaledVector(_forward, -ship.velocity.dot(_forward));
    const working = Math.abs(fwdSpeed - commanded) > tolerance || _perp.length() > tolerance;
    ship.thrustActive = (input.thrust || input.brake || input.boost) && working;

    ship.updateBoostDecelState();
    return result;
}

/**
 * Coast — no throttle — with the nose held along `heading`.
 *
 * Releasing the throttle is only safe at or below cruise: above it, letting go of boost starts the
 * boost-decel ramp, which brakes the ship all the way down to cruise. So above cruise boost stays
 * held with the setpoint at the current forward speed, which makes it add nothing (and leaves
 * brake with nothing to take away): the ship keeps its speed, and the drift decay that comes with
 * a held key keeps the velocity on the nose.
 *
 * Used for a natural orbit, where gravity does the flying: holding the nose along the world
 * velocity means the "Nose-Aligned Drift" setting, if on, has nothing to rotate.
 */
export function coastAlong(ship: Spaceship, heading: THREE.Vector3): void {
    const input = ship.controlInput;
    steerToward(ship, heading);
    input.warp = false;
    input.fire = false;
    input.thrust = false;
    input.brake = false;

    _forward.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
    const fwdSpeed = ship.forwardSpeedInFrame(_forward);
    if (fwdSpeed > ship.handling.flightMaxSpeed) {
        input.boost = true;
        input.speedSetpoint = fwdSpeed;
    } else {
        input.boost = false;
        input.speedSetpoint = null;
    }
    ship.thrustActive = false;
    ship.updateBoostDecelState();
}
