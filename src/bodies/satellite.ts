import * as THREE from 'three';

import { ISatelliteCreationOptions, ISatelliteHandling, IStateDependencies } from '../interfaces';
import { CelestialBody } from './celestial-body';
import { BodyTypeEnum } from './body-enums';
import { resolveStationKeeping } from '../physics/station-keeping';
import {
    SATELLITE_CLIMB_GAIN,
    SATELLITE_MAX_CLIMB_RATE,
    SATELLITE_MAX_STATION_KEEPING_DEVIATION,
    SATELLITE_MAX_THRUST_ACCEL,
    SATELLITE_MAX_TURN_RATE,
    SATELLITE_ORBIT_DECAY_TOLERANCE,
    SATELLITE_ORBIT_HOLD_TOLERANCE,
    SATELLITE_THRUST_DECEL,
} from '../utilities/consts';

/** Scratch vector so the per-frame station-keeping guard never allocates. */
const _radial = new THREE.Vector3();

/**
 * Default station-keeping tuning, applied to any satellite that doesn't supply its own. Lives here
 * rather than in consts.ts because it needs ISatelliteHandling, and consts.ts is deliberately
 * import-free.
 */
export const DEFAULT_SATELLITE_HANDLING: ISatelliteHandling = {
    maxThrustAccel: SATELLITE_MAX_THRUST_ACCEL,
    thrustDecel: SATELLITE_THRUST_DECEL,
    maxTurnRate: SATELLITE_MAX_TURN_RATE,
    orbitDecayTolerance: SATELLITE_ORBIT_DECAY_TOLERANCE,
    orbitHoldTolerance: SATELLITE_ORBIT_HOLD_TOLERANCE,
    maxClimbRate: SATELLITE_MAX_CLIMB_RATE,
    climbGain: SATELLITE_CLIMB_GAIN,
    maxStationKeepingDeviation: SATELLITE_MAX_STATION_KEEPING_DEVIATION,
};

export class Satellite extends CelestialBody {
    /**
     * Body this satellite orbits, and the reference frame its station-keeping works in. Null when
     * the satellite was created without one, in which case it never station-keeps.
     */
    orbitParent: CelestialBody | null;

    /**
     * Orbital radius the station-keeping autopilot holds. Captured from the satellite's actual
     * spawn geometry rather than from the requested `distance`, because `createSatellite` applies
     * `yVariation` after the inclination rotation and the two can disagree.
     */
    targetOrbitRadius: number;

    /** Station-keeping tuning — the satellite equivalent of a ship's handling object. */
    readonly handling: ISatelliteHandling;

    /** Master switch for station-keeping. On by default whenever an orbit parent is known. */
    stationKeepingEnabled: boolean;

    /** Whether a correction burn is currently running. Drives the engage/disengage hysteresis. */
    stationKeepingActive = false;

    /**
     * Persistent unit normal of the orbital plane, so a frame in which the satellite's motion is
     * momentarily radial (or zero) can still recover the plane it was actually orbiting in.
     */
    private readonly orbitNormal = new THREE.Vector3();

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: ISatelliteCreationOptions
    ) {
        super(
            dependencies,
            scene,
            {
                radius: options.radius,
                pos: options.pos,
                vel: options.vel,
                mass: options.mass,
                id: options.id,
                name: options.name,
                trailColor: options.trailColor,
                maxTrail: options.maxTrail,
                hasRings: false,
                rotation: options.rotation,
                mesh: options.mesh,
                tidalLock: options.tidalLock,
            },
            BodyTypeEnum.Satellite
        );

        // Assigned in the constructor body, not as field initializers: useDefineForClassFields
        // means initializers run before this point and could not see super()'s results.
        this.handling = options.handling ?? DEFAULT_SATELLITE_HANDLING;

        // The explicit option wins; the tidal-lock target is a pragmatic fallback so existing call
        // sites keep working, but the two are genuinely different ideas — a satellite may be locked
        // to something other than the body it orbits — so prefer `orbitParent` when creating one.
        this.orbitParent = options.orbitParent ?? this.tidalLockTarget ?? null;
        this.stationKeepingEnabled = this.orbitParent !== null;

        const parent = this.orbitParent;
        this.targetOrbitRadius = parent
            ? options.pos.distanceTo(parent.mesh.position)
            : options.distance;

        if (parent) {
            // Seed the orbital plane from the spawn state vectors.
            _radial.subVectors(options.pos, parent.mesh.position);
            this.orbitNormal.crossVectors(_radial, options.vel.clone().sub(parent.velocity));
            if (this.orbitNormal.lengthSq() > 1e-18) this.orbitNormal.normalize();
            else this.orbitNormal.set(0, 0, 0);
        }
    }

    /**
     * Re-baselines the orbit the autopilot holds. Defaults to whatever radius the satellite is at
     * right now, which is what a caller wants after deliberately moving it.
     */
    setStationKeepingTarget(radius?: number): void {
        if (radius !== undefined) {
            this.targetOrbitRadius = radius;
        } else if (this.orbitParent) {
            this.targetOrbitRadius = this.mesh.position.distanceTo(this.orbitParent.mesh.position);
        }
        this.stationKeepingActive = false;
    }

    /** Points the autopilot at a different primary, re-baselining onto the current orbit. */
    setOrbitParent(parent: CelestialBody | null): void {
        this.orbitParent = parent;
        this.stationKeepingEnabled = parent !== null;
        this.setStationKeepingTarget();
    }

    /**
     * Per-rendered-frame update. Beyond the inherited visual work this also runs station-keeping,
     * which mutates `velocity`. That goes slightly beyond what the base docstring calls "purely
     * visual properties", but it is the established meaning of this hook in practice — see
     * `BlackHole.updateVisuals`, which transfers mass between bodies from here. What the hook really
     * is is the once-per-frame tick that runs after the n-body integrator's `writeBack()`, when
     * `mesh.position` and `velocity` are authoritative again.
     *
     * That cadence is deliberate: atmospheric drag, the disturbance station-keeping exists to
     * cancel, is applied once per frame with this same `dtTotal` from `checkAtmosphericEntry`.
     * Running the controller per physics substep would have it react N times to a disturbance
     * applied once, and would additionally require registering satellites as integrator "live
     * slots", which today covers only ships and the autopilot's target.
     */
    override updateVisuals(dtTotal: number, cameraPos?: THREE.Vector3) {
        super.updateVisuals(dtTotal, cameraPos);

        if (this._isDisposed) return;

        this.updateStationKeeping(dtTotal);
    }

    /**
     * Holds the satellite's orbit against atmospheric drag, thrusting back up to
     * `targetOrbitRadius` whenever it has decayed past the handling's decay tolerance.
     */
    private updateStationKeeping(dtTotal: number): void {
        if (!this.stationKeepingEnabled) return;

        const parent = this.orbitParent;
        if (!parent || parent._isDisposed) {
            // The primary is gone; there is no orbit left to hold.
            this.orbitParent = null;
            this.stationKeepingEnabled = false;
            this.stationKeepingActive = false;
            return;
        }

        // The velocity gizmo writes straight into `velocity` while the user drags it, outside the
        // repositioning guard that pauses the rest of this pass. Without this check the autopilot
        // would silently undo every edit; instead, accept whatever orbit the user sets and hold it.
        if (this.dependencies.gizmo?.target === this) {
            this.setStationKeepingTarget();
            return;
        }

        const rLen = this.mesh.position.distanceTo(parent.mesh.position);
        if (Math.abs(this.targetOrbitRadius - rLen) > this.handling.maxStationKeepingDeviation) {
            // Too far off for drag to explain — a collision bounce, a wormhole transit, a
            // gravity-multiplier change. Adopt the new orbit rather than forcing the old one, which
            // at this magnitude would amount to hauling the satellite around under thrust.
            this.setStationKeepingTarget(rLen);
            return;
        }

        this.stationKeepingActive = resolveStationKeeping(
            this,
            parent,
            this.targetOrbitRadius,
            this.handling,
            this.dependencies.getG(),
            this.orbitNormal,
            this.stationKeepingActive,
            dtTotal
        );
    }
}
