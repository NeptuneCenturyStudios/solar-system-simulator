import * as THREE from 'three';
import { flyVelocity } from '../navigation/velocity-control';
import { selectSpeedTier } from '../navigation/speed-tier';
import { gravityAccel } from '../navigation/target-geometry';
import { formatDistance, formatSpeed } from '../ai-debug-format';
import {
    AI_AUTOPILOT_ARTIFICIAL_MAX_G_FRACTION,
    AI_AUTOPILOT_ORBIT_DRIFT_BAND,
    AI_AUTOPILOT_ORBIT_RADIAL_GAIN,
    AI_AUTOPILOT_ORBIT_RADIAL_MAX_FRACTION,
    AI_AUTOPILOT_ORBIT_TURN_PAD,
} from '../../../utilities/consts';
import type { IManeuver, IManeuverContext, ManeuverActivity, ManeuverStatus } from './maneuver';
import { orbitFrame } from './maneuver';

// Scratch — reused every frame.
const _radial = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _desiredRel = new THREE.Vector3();
const _desiredVel = new THREE.Vector3();
const _relVel = new THREE.Vector3();

/**
 * Circle the target under power — the EVE-style "orbit at N metres". Works around anything,
 * including ships, which have no gravity to orbit.
 *
 * Every frame flies the world velocity `target.velocity + tangent × v_orbit + radial × correction`
 * through the shared velocity controller. With the nose on that heading the controller holds the
 * throttle the whole time, and the drift decay that comes with a held key is what bends the
 * velocity round the circle: it acts as lateral damping, pulling the velocity onto the nose as
 * the nose turns. The same damping soaks up a weak gravitational pull, so the circle also holds
 * around small bodies.
 *
 * `v_orbit` is the low tier's cruise speed, or less on a tight circle — the ship has to be able to
 * turn round it (radius × turn rate) with margin to spare for corrections. Tying it to the low tier
 * keeps the circle speed the same whichever tier the target's own motion forces the ship onto.
 *
 * The orbit radius is re-read from the context every frame, so the command can move it live (the
 * Flight Controls distance field does exactly that).
 *
 * A target moving faster than this ship can fly simply leaves it behind — the velocity controller
 * saturates, and the command's approach takes over again once the gap opens up.
 *
 * Reports `infeasible` when gravity at the orbit radius is too strong to fight on thrust (see
 * AI_AUTOPILOT_ARTIFICIAL_MAX_G_FRACTION); the command then falls back to a natural orbit.
 */
export class ArtificialOrbitManeuver implements IManeuver {
    activity: ManeuverActivity = 'inserting';

    /** True once the circle has first settled within the drift band. */
    established = false;

    // Debug telemetry.
    private debugRadius = 0;
    private debugTargetRadius = 0;
    private debugOrbitSpeed = 0;
    private debugSpeedErr = 0;

    reset(): void {
        this.activity = 'inserting';
        this.established = false;
    }

    update(ctx: IManeuverContext, simDt: number): ManeuverStatus {
        const { ship, target, avoidance } = ctx;
        const R = ctx.orbitRadius;
        const r = orbitFrame(ship, target, ctx.orbitNormal, _radial, _normal, _tangent);
        this.debugRadius = r;
        this.debugTargetRadius = R;

        const h = ship.handling;
        if (
            gravityAccel(target, R) >
            h.flightThrustAccel * AI_AUTOPILOT_ARTIFICIAL_MAX_G_FRACTION
        ) {
            return 'infeasible';
        }

        const low = ship.lowSpeedHandling;
        const vOrbit = Math.min(
            low.flightMaxSpeed,
            (R * low.flightMaxTurnRate) / AI_AUTOPILOT_ORBIT_TURN_PAD
        );
        this.debugOrbitSpeed = vOrbit;

        const radialErr = (R - r) / R;
        const radialSpeed = THREE.MathUtils.clamp(
            AI_AUTOPILOT_ORBIT_RADIAL_GAIN * vOrbit * radialErr,
            -AI_AUTOPILOT_ORBIT_RADIAL_MAX_FRACTION * vOrbit,
            AI_AUTOPILOT_ORBIT_RADIAL_MAX_FRACTION * vOrbit
        );
        _desiredRel.copy(_tangent).multiplyScalar(vOrbit).addScaledVector(_radial, radialSpeed);

        _relVel.subVectors(ship.velocity, target.velocity);
        const speedErr = vOrbit > 0 ? _relVel.distanceTo(_desiredRel) / vOrbit : 0;
        this.debugSpeedErr = speedErr;
        if (
            !this.established &&
            Math.abs(radialErr) < AI_AUTOPILOT_ORBIT_DRIFT_BAND &&
            speedErr < AI_AUTOPILOT_ORBIT_DRIFT_BAND * 2
        ) {
            this.established = true;
        }

        _desiredVel.copy(target.velocity).add(_desiredRel);
        selectSpeedTier(ship, _desiredVel.length(), 0);
        const flown = flyVelocity(ship, avoidance, _desiredVel, simDt, target);
        this.activity = flown.flee ? 'evading' : this.established ? 'orbiting' : 'inserting';
        return 'running';
    }

    debugLines(): string[] {
        return [
            `Artificial orbit · ${this.established ? 'HOLDING' : 'ENTERING'}`,
            `Radius ${formatDistance(this.debugRadius)}  want ${formatDistance(this.debugTargetRadius)}`,
            `Orbit speed ${formatSpeed(this.debugOrbitSpeed)}  vel err ${(this.debugSpeedErr * 100).toFixed(1)}%`,
        ];
    }
}
