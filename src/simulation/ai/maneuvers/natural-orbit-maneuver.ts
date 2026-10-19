import * as THREE from 'three';
import { coastAlong, flyVelocity } from '../navigation/velocity-control';
import { selectSpeedTier } from '../navigation/speed-tier';
import { circularSpeed } from '../navigation/target-geometry';
import { formatDistance, formatSpeed } from '../ai-debug-format';
import {
    AI_AUTOPILOT_ORBIT_DRIFT_BAND,
    AI_AUTOPILOT_ORBIT_RADIAL_GAIN,
    AI_AUTOPILOT_ORBIT_RADIAL_MAX_FRACTION,
    AI_AUTOPILOT_ORBIT_SETTLE_BAND,
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
const _velDir = new THREE.Vector3();

/** Fraction of the low tier's cruise speed below which a body's circular speed counts as "no
 *  gravity worth orbiting" — an asteroid you would wait days to go once round. */
const MIN_CIRCULAR_SPEED_FRACTION = 0.001;

/**
 * Hold a natural (gravity-driven) orbit around a celestial body.
 *
 * - **Insert**: fly the world velocity `target.velocity + tangent × v_circ(r) + radial ×
 *   correction`. The correction leans the orbit back toward its target radius, so the burn both
 *   circularises and fixes the altitude. Flown through the shared velocity controller, so it is
 *   precise at any time scale.
 * - **Coast**: once the relative velocity matches a circular orbit at the right radius, release
 *   the throttle and let gravity fly. The nose follows the *world* velocity, so the "Nose-Aligned
 *   Drift" setting, if on, has nothing to rotate.
 * - **Station-keeping**: perturbations (the star's pull on a planet's orbiter, mostly) slowly bend
 *   the orbit; once radius or speed drifts out of AI_AUTOPILOT_ORBIT_DRIFT_BAND another insertion
 *   burn pulls it back inside AI_AUTOPILOT_ORBIT_SETTLE_BAND.
 *
 * Reports `infeasible` when the body has too little gravity to orbit (see
 * MIN_CIRCULAR_SPEED_FRACTION); the command then switches to an artificial orbit.
 */
export class NaturalOrbitManeuver implements IManeuver {
    activity: ManeuverActivity = 'inserting';

    /** True once the first insertion has settled — the orbit has been established. */
    established = false;
    /** True while burning (insert / correction), false while coasting. */
    private burning = true;

    // Debug telemetry.
    private debugRadius = 0;
    private debugTargetRadius = 0;
    private debugSpeedErr = 0;
    private debugCircular = 0;

    reset(): void {
        this.activity = 'inserting';
        this.established = false;
        this.burning = true;
    }

    update(ctx: IManeuverContext, simDt: number): ManeuverStatus {
        const { ship, target, avoidance } = ctx;
        const R = ctx.orbitRadius;
        const r = orbitFrame(ship, target, ctx.orbitNormal, _radial, _normal, _tangent);
        this.debugRadius = r;
        this.debugTargetRadius = R;

        const vCirc = circularSpeed(target, Math.max(r, 1e-9));
        this.debugCircular = vCirc;
        if (vCirc < ship.lowSpeedHandling.flightMaxSpeed * MIN_CIRCULAR_SPEED_FRACTION) {
            return 'infeasible';
        }

        // Target relative velocity: circular at the current radius, plus a capped radial term
        // that walks the radius back to R. Outward when too low, inward when too high.
        const radialErr = (R - r) / R;
        const radialSpeed = THREE.MathUtils.clamp(
            AI_AUTOPILOT_ORBIT_RADIAL_GAIN * vCirc * radialErr,
            -AI_AUTOPILOT_ORBIT_RADIAL_MAX_FRACTION * vCirc,
            AI_AUTOPILOT_ORBIT_RADIAL_MAX_FRACTION * vCirc
        );
        _desiredRel.copy(_tangent).multiplyScalar(vCirc).addScaledVector(_radial, radialSpeed);

        _relVel.subVectors(ship.velocity, target.velocity);
        const speedErr = _relVel.distanceTo(_desiredRel) / vCirc;
        this.debugSpeedErr = speedErr;
        const radiusErr = Math.abs(radialErr);

        // Hysteresis between burning and coasting.
        if (this.burning) {
            if (
                speedErr < AI_AUTOPILOT_ORBIT_SETTLE_BAND &&
                radiusErr < AI_AUTOPILOT_ORBIT_SETTLE_BAND
            ) {
                this.burning = false;
                this.established = true;
            }
        } else if (
            speedErr > AI_AUTOPILOT_ORBIT_DRIFT_BAND ||
            radiusErr > AI_AUTOPILOT_ORBIT_DRIFT_BAND
        ) {
            this.burning = true;
        }

        _desiredVel.copy(target.velocity).add(_desiredRel);
        selectSpeedTier(ship, _desiredVel.length(), 0);

        if (this.burning) {
            const flown = flyVelocity(ship, avoidance, _desiredVel, simDt, target);
            this.activity = flown.flee ? 'evading' : 'inserting';
        } else {
            const speed = ship.velocity.length();
            if (speed > 0) _velDir.copy(ship.velocity).divideScalar(speed);
            else _velDir.copy(_tangent);
            coastAlong(ship, _velDir);
            this.activity = 'orbiting';
        }
        return 'running';
    }

    debugLines(): string[] {
        return [
            `Natural orbit · ${this.burning ? (this.established ? 'CORRECTING' : 'INSERTING') : 'COASTING'}`,
            `Radius ${formatDistance(this.debugRadius)}  want ${formatDistance(this.debugTargetRadius)}`,
            `Circular ${formatSpeed(this.debugCircular)}  vel err ${(this.debugSpeedErr * 100).toFixed(1)}%`,
        ];
    }
}
