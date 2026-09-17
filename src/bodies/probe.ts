import * as THREE from 'three';

import {
    IDeathOptions,
    IProbeCreationOptions,
    IProbeHandling,
    IStateDependencies,
} from '../interfaces';
import { CelestialBody } from './celestial-body';
import { Satellite, DEFAULT_SATELLITE_HANDLING } from './satellite';
import { BodyTypeEnum } from './body-enums';
import { createShipContainerMesh, loadShipModelInto } from './ships/ship-model-loader';
import {
    DIST_SCALE,
    EARTH_RADIUS,
    PROBE_ACCEL,
    PROBE_DECEL,
    PROBE_INSERT_DONE_SPEED,
    PROBE_INSERT_ORBIT_PAD,
    PROBE_MAX_SPEED,
    PROBE_SCAN_BASE_SECONDS,
    PROBE_SCAN_RADIUS_SCALE_SECONDS,
    PROBE_SCAN_RANGE_KM,
    PROBE_TURN_RATE,
} from '../utilities/consts';

/** Scratch vectors so the per-frame probe autopilot never allocates. */
const _toTarget = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _currentDir = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _tangential = new THREE.Vector3();
const _desiredRelVel = new THREE.Vector3();
const _velDelta = new THREE.Vector3();
const _turnAxis = new THREE.Vector3();
const _angularMomentum = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_FORWARD = new THREE.Vector3(0, 0, 1);

/** Below this a vector is treated as having no meaningful direction. */
const DIRECTION_EPSILON = 1e-9;
const DIRECTION_EPSILON_SQ = DIRECTION_EPSILON * DIRECTION_EPSILON;

/**
 * Updates `orbitNormal` from the probe's current motion and writes the unit tangential direction
 * of its orbit into `out`. Duplicated from station-keeping.ts's private `computeTangential` (same
 * "fresh, isolated" reasoning as `rotateTowards` above) rather than a fixed `radial × worldUp`
 * assumption: a probe's approach trajectory can arrive at any inclination, and unlike a ship, a
 * probe rarely has the thrust margin to force an inclined orbit into the equatorial plane the
 * fixed assumption would demand — see the note on stepInsert.
 *
 * @returns false when no tangential direction exists even with the cached normal.
 */
function computeTangential(
    radialDir: THREE.Vector3,
    relVel: THREE.Vector3,
    orbitNormal: THREE.Vector3,
    out: THREE.Vector3
): boolean {
    _angularMomentum.crossVectors(radialDir, relVel);
    if (_angularMomentum.lengthSq() >= DIRECTION_EPSILON_SQ) {
        orbitNormal.copy(_angularMomentum).normalize();
    }
    if (orbitNormal.lengthSq() < DIRECTION_EPSILON_SQ) return false;

    out.crossVectors(orbitNormal, radialDir);
    if (out.lengthSq() < DIRECTION_EPSILON_SQ) return false;

    out.normalize();
    return true;
}

/**
 * Rotates `dir` toward `target` by at most `maxAngle` radians, in place. Duplicated from
 * station-keeping.ts's private `rotateTowards` rather than imported: the probe autopilot is a
 * fresh, isolated controller (matching the codebase's own precedent of the ship autopilot
 * inlining its own orbit-speed math instead of sharing a module for one small piece of vector
 * math — see station-keeping.ts's `resolveStationKeeping` doc comment).
 */
function rotateTowards(
    dir: THREE.Vector3,
    target: THREE.Vector3,
    maxAngle: number,
    fallbackAxis: THREE.Vector3
): boolean {
    const angle = dir.angleTo(target);
    if (angle <= 1e-12) return true;

    _turnAxis.crossVectors(dir, target);
    if (_turnAxis.lengthSq() < DIRECTION_EPSILON_SQ) {
        _turnAxis.copy(fallbackAxis);
        if (_turnAxis.lengthSq() < DIRECTION_EPSILON_SQ) return true;
    }

    const step = Math.min(angle, Math.max(0, maxAngle));
    dir.applyAxisAngle(_turnAxis.normalize(), step).normalize();

    return step >= angle;
}

export type ProbePhase = 'TRAVEL' | 'INSERT' | 'DONE';

/** Fresh, isolated travel-phase tuning shared by every probe that doesn't supply its own. */
export const DEFAULT_PROBE_HANDLING: IProbeHandling = {
    maxSpeed: PROBE_MAX_SPEED,
    turnRate: PROBE_TURN_RATE,
    accel: PROBE_ACCEL,
    decel: PROBE_DECEL,
};

/**
 * A player-launched probe satellite: flies itself to `missionTarget`, attempts to insert into a
 * circular orbit at the requested altitude for long-term station-keeping, and independently scans
 * for a duration based on the target's size before unlocking its hidden IPlanetaryAttributes.
 *
 * Scanning is deliberately decoupled from the flight-phase state machine below: it begins as soon
 * as the probe comes within PROBE_SCAN_RANGE_KM of the target's surface, in ANY flight phase, so a
 * mission doesn't depend on ever achieving a fully converged orbit (which for close/fast orbits
 * around massive bodies may take a long time or never happen at all — see stepInsert). Successful
 * orbit insertion is kept as a fallback trigger too, so a requested altitude wider than the scan
 * range still eventually scans once that orbit is reached.
 *
 * Extends Satellite so that once orbit is achieved, the existing station-keeping (atmospheric
 * drag correction) and tidal-lock machinery take over unmodified, exactly as the ISS uses them —
 * only the TRAVEL/INSERT autopilot getting there is new, isolated code.
 */
export class Probe extends Satellite {
    readonly probeHandling: IProbeHandling;
    readonly missionTarget: CelestialBody;
    /** Desired circular-orbit radius from missionTarget's center, frozen at launch (u). */
    readonly insertGoalRadius: number;

    probePhase: ProbePhase = 'TRAVEL';
    /** Persistent unit normal of the orbital plane INSERT is converging into — see computeTangential. */
    private readonly insertOrbitNormal = new THREE.Vector3();

    /** True once scanning has begun — independent of `probePhase`; see the class doc comment. */
    scanStarted = false;
    /** True once the scan has finished and attributes are unlocked. */
    scanComplete = false;
    scanTotalSeconds = 0;
    scanRemainingSeconds = 0;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: IProbeCreationOptions
    ) {
        const containerMesh = createShipContainerMesh();
        // Destructure out the probe-only fields so the object passed to Satellite's constructor
        // has exactly ISatelliteCreationOptions's shape (avoids a TS excess-property error).
        const { probeHandling, missionTarget, altitudeKm, ...satelliteOptions } = options;
        super(dependencies, scene, {
            ...satelliteOptions,
            mesh: containerMesh,
            distance: 0,
            orbitParent: undefined,
            handling: DEFAULT_SATELLITE_HANDLING,
        });

        // Overrides Satellite's constructor, which hard-codes BodyTypeEnum.Satellite. bodyType is
        // a plain mutable field, so this is the entire cost of giving probes their own type.
        this.bodyType = BodyTypeEnum.Probe;

        this.probeHandling = probeHandling ?? DEFAULT_PROBE_HANDLING;
        this.missionTarget = missionTarget;
        this.insertGoalRadius = missionTarget.radius + altitudeKm / DIST_SCALE;

        // Correct model orientation so that the rear is facing the camera and not the front
        const MODEL_ROTATION = new THREE.Euler(
            THREE.MathUtils.degToRad(0),
            THREE.MathUtils.degToRad(10),
            THREE.MathUtils.degToRad(90)
        );

        loadShipModelInto(containerMesh, 'probe/SpaceProbe', options.radius, MODEL_ROTATION).catch(
            (e) => {
                console.warn('Probe model load failed — using placeholder mesh', e);
            }
        );
    }

    override updateVisuals(dtTotal: number, cameraPos?: THREE.Vector3): void {
        // CelestialBody's tidal-lock rotation and Satellite's station-keeping — both inert until
        // completeInsertion() configures them.
        super.updateVisuals(dtTotal, cameraPos);
        if (this._isDisposed) return;

        switch (this.probePhase) {
            case 'TRAVEL':
                this.stepTravel(dtTotal);
                break;
            case 'INSERT':
                this.stepInsert(dtTotal);
                break;
            case 'DONE':
                break;
        }
        if (this._isDisposed) return;

        // Independent of flight phase — see the class doc comment.
        this.updateScan(dtTotal);
    }

    override die(deathOptions?: IDeathOptions): void {
        // Clear this probe's own HUD countdown if it dies mid-scan.
        if (this.scanStarted && !this.scanComplete) {
            this.activeScan = null;
        }
        super.die(deathOptions);
    }

    /**
     * Turn-rate-limited heading + accel/decel-limited speed toward the target, commanding
     * velocity relative to the target's own motion so the probe leads a moving body instead of
     * chasing a receding point. Mirrors the two-stage (rotate, then throttle) shape of
     * resolveStationKeeping in physics/station-keeping.ts.
     */
    private stepTravel(dt: number): void {
        const target = this.missionTarget;
        if (!target || target._isDisposed) {
            this.probePhase = 'DONE';
            return;
        }

        const dtc = Math.abs(dt);
        _toTarget.subVectors(target.mesh.position, this.mesh.position);
        const distance = _toTarget.length();
        if (distance < DIRECTION_EPSILON) {
            this.probePhase = 'INSERT';
            return;
        }
        _toTarget.divideScalar(distance);

        _relVel.subVectors(this.velocity, target.velocity);
        const currentSpeed = _relVel.length();

        if (currentSpeed >= DIRECTION_EPSILON) {
            _currentDir.copy(_relVel).divideScalar(currentSpeed);
            rotateTowards(_currentDir, _toTarget, this.probeHandling.turnRate * dtc, WORLD_UP);
        } else {
            _currentDir.copy(_toTarget);
        }

        const desiredSpeed = this.probeHandling.maxSpeed;
        const speedError = desiredSpeed - currentSpeed;
        const rate = speedError >= 0 ? this.probeHandling.accel : this.probeHandling.decel;
        const maxStep = Math.max(0, rate) * dtc;
        const newSpeed = Math.max(
            0,
            currentSpeed + Math.sign(speedError) * Math.min(maxStep, Math.abs(speedError))
        );

        this.velocity.copy(target.velocity).addScaledVector(_currentDir, newSpeed);

        const stoppingDistance =
            (newSpeed * newSpeed) / (2 * Math.max(this.probeHandling.decel, DIRECTION_EPSILON));
        const insertTrigger = this.insertGoalRadius + stoppingDistance + PROBE_INSERT_ORBIT_PAD;
        if (distance <= insertTrigger) {
            this.probePhase = 'INSERT';
        }
    }

    /**
     * Merges the ship autopilot's BRAKE+CIRCULARIZE phases (spaceship.ts, reference only — not
     * shared code) into a single phase, since a probe has no boost/brake tiers to preserve across
     * two phases. Unlike the ship autopilot, this tracks the probe's OWN orbital plane (via
     * computeTangential, same technique as station-keeping.ts) rather than assuming an equatorial
     * orbit — a ship has the thrust margin to force an arbitrary approach flat, a probe generally
     * doesn't, and the fixed-equatorial assumption made insertion silently unconverge (never
     * complete or fail — just orbit forever) whenever the approach trajectory wasn't already
     * within a fraction of a degree of equatorial.
     */
    private stepInsert(dt: number): void {
        const target = this.missionTarget;
        if (!target || target._isDisposed) {
            this.probePhase = 'DONE';
            return;
        }

        const gEff = this.dependencies.getG();
        if (gEff <= 0 || target.mass <= 0) return;

        _radial.subVectors(this.mesh.position, target.mesh.position);
        const r = _radial.length();
        if (r < DIRECTION_EPSILON) return;
        _radial.divideScalar(r);

        // Speed the probe already has from gravity (real n-body integration, not this
        // controller) before any thrust below is applied this frame. Capping the commanded
        // speed at max(maxSpeed, currentSpeed) — not max(maxSpeed, vOrbit) — means the
        // autopilot's own thrust can never push the probe past its rated max speed; it can
        // only redirect/hold speed gravity has already provided. If a target's true orbital
        // speed exceeds what maxSpeed plus gravitational infall ever supplies, insertion
        // simply never converges and the probe keeps sinking toward the atmospheric burn-up
        // path in animation-loop.ts — a real mission failure rather than free propulsion.
        _relVel.subVectors(this.velocity, target.velocity);
        const currentSpeed = _relVel.length();

        if (!computeTangential(_radial, _relVel, this.insertOrbitNormal, _tangential)) {
            // Degenerate (purely radial motion, or momentarily stationary relative to the
            // target) — fall back to an equatorial guess just to keep making progress; the
            // next non-degenerate frame reseeds insertOrbitNormal from live state.
            _tangential.crossVectors(_radial, WORLD_UP);
            if (_tangential.lengthSq() < DIRECTION_EPSILON_SQ) {
                _tangential.crossVectors(_radial, WORLD_FORWARD);
            }
            _tangential.normalize();
        }

        const vOrbit = Math.sqrt((gEff * target.mass) / r);
        const decelRate = Math.max(this.probeHandling.decel, DIRECTION_EPSILON);

        // Signed distance to the goal: positive while still outside it (need to close in),
        // negative if gravity/thrust interplay ever overshoots inside it (need to climb back
        // out). Symmetric around insertGoalRadius, rather than clamping to 0 once inside it —
        // clamping meant any circular orbit at ANY r < insertGoalRadius would satisfy the
        // completion check below (vOrbit(r) is always exactly correct for wherever the probe
        // happens to be), so an overshoot would silently settle for a smaller orbit than
        // requested instead of correcting back out to the real target altitude.
        const signedRemaining = r - this.insertGoalRadius;
        const vSafeApproach = Math.min(
            this.probeHandling.maxSpeed,
            Math.sqrt(2 * decelRate * Math.abs(signedRemaining))
        );
        const radialCommand = signedRemaining >= 0 ? -vSafeApproach : vSafeApproach;
        const alpha =
            this.probeHandling.maxSpeed > DIRECTION_EPSILON
                ? 1 - vSafeApproach / this.probeHandling.maxSpeed
                : 1;

        // Tangential target is evaluated at the FIXED goal radius, not the probe's current r —
        // see the note above on why using vOrbit(r) here was the actual bug.
        const vOrbitGoal = Math.sqrt((gEff * target.mass) / this.insertGoalRadius);

        _desiredRelVel
            .copy(_tangential)
            .multiplyScalar(vOrbitGoal * alpha)
            .addScaledVector(_radial, radialCommand);

        const insertCap = Math.max(this.probeHandling.maxSpeed, currentSpeed);
        const desiredLen = _desiredRelVel.length();
        if (desiredLen > insertCap) _desiredRelVel.multiplyScalar(insertCap / desiredLen);

        // Explicit gravity compensation, same structure as the ship's BRAKE/CIRCULARIZE phases.
        // This only offsets the real inward pull so a commanded tangential speed doesn't decay
        // out from under the probe mid-maneuver — it doesn't add net forward speed. _relVel is
        // still valid here (nothing has touched this.velocity yet this frame).
        const gravAccel = (gEff * target.mass) / (r * r);
        const tangentialSpeed = _relVel.dot(_tangential);
        const speedRatio = Math.max(0, Math.min(1, tangentialSpeed / vOrbit));
        const gravCompFraction = 1 - speedRatio * speedRatio;
        this.velocity.addScaledVector(_radial, gravAccel * gravCompFraction * dt);

        _relVel.subVectors(this.velocity, target.velocity);
        _velDelta.subVectors(_desiredRelVel, _relVel);
        const deltaLen = _velDelta.length();

        // Completion requires BOTH velocity match AND actually having reached the goal radius.
        // Velocity alone isn't enough: this controller is designed to closely track its own
        // continuously-recalculated desiredRelVel throughout the whole descent (that's what the
        // safety-curve fixes above rely on), so deltaLen can dip below tolerance well before r
        // reaches insertGoalRadius — handing off to station-keeping mid-descent, with the orbit
        // baselined from wherever it happened to be rather than a clean circular orbit at the
        // requested altitude. A gas giant's huge margin absorbs that slop invisibly; a small,
        // tightly-orbited body doesn't — the residual eccentricity swings its much shorter-period
        // orbit's periapsis into the surface within a few laps.
        const positionConverged = Math.abs(signedRemaining) < PROBE_INSERT_ORBIT_PAD;
        if (deltaLen < PROBE_INSERT_DONE_SPEED && positionConverged) {
            this.velocity.copy(target.velocity).add(_desiredRelVel);
            this.completeInsertion();
            return;
        }

        const rate = Math.max(this.probeHandling.accel, this.probeHandling.decel);
        const mag = Math.min(rate * Math.abs(dt), deltaLen);
        this.velocity.addScaledVector(_velDelta.divideScalar(deltaLen), mag);

        // Hard safety clamp: the probe's ACTUAL closing speed toward the physical SURFACE must
        // never exceed what its own decel budget can stop from here, no matter how much of this
        // frame's rate-limited thrust above went toward the tangential mismatch instead of the
        // radial one (the two compete for the same shared thrust budget — deltaLen blends both
        // into one vector — so a probe entering INSERT already carrying a large tangential
        // velocity difference, e.g. a "chasing from behind" approach, can starve the radial
        // correction for several frames). Deliberately measured against target.radius, not
        // insertGoalRadius: this is a collision-avoidance floor, independent of the requested
        // altitude, and must still hold even while signedRemaining above is negative (climbing
        // back out from an overshoot) and the probe could otherwise keep sinking toward the
        // actual surface. Unconditional and NOT rate limited — a steering preference can lag,
        // a crash cannot.
        const vSafeSurface = Math.min(
            this.probeHandling.maxSpeed,
            Math.sqrt(2 * decelRate * Math.max(r - target.radius, 0))
        );
        _relVel.subVectors(this.velocity, target.velocity);
        const vrAfter = _relVel.dot(_radial);
        if (vrAfter < -vSafeSurface) {
            this.velocity.addScaledVector(_radial, -vSafeSurface - vrAfter);
        }
    }

    /**
     * Hands off to the existing, unmodified station-keeping and tidal-lock systems — see
     * Satellite.setOrbitParent (station-keeping) and CelestialBody.advanceRotation (tidal lock).
     * `tidalLockAngularSpeed` is left at 0 so advanceRotation auto-derives it from the probe's
     * actual r×v on its first tick, rather than precomputing omega manually.
     */
    private completeInsertion(): void {
        this.setOrbitParent(this.missionTarget);

        this.tidalLockTarget = this.missionTarget;
        this.tidalLockSpinAxis.set(0, 1, 0);
        this.tidalLockFaceAxisLocal.set(0, 0, 1);
        this.tidalLockAngularSpeed = 0;
        this._tidalLockConfigured = true;
        this.tidalLockEnabled = true;

        this.probePhase = 'DONE';
    }

    /**
     * Starts the scan timer as soon as the probe comes within PROBE_SCAN_RANGE_KM of the target's
     * surface, independent of `probePhase` — see the class doc comment for why this is decoupled
     * from orbit insertion.
     */
    private updateScan(dt: number): void {
        const target = this.missionTarget;
        if (!target || target._isDisposed || this.scanComplete) return;

        if (!this.scanStarted) {
            const distance = this.mesh.position.distanceTo(target.mesh.position);
            const altitude = distance - target.radius;
            if (altitude > PROBE_SCAN_RANGE_KM) return;
            this.beginScan();
        }

        this.scanRemainingSeconds = Math.max(0, this.scanRemainingSeconds - Math.abs(dt));
        // Shown on the probe's own HUD label, not the target's — see the class doc comment.
        this.activeScan = {
            remainingSeconds: this.scanRemainingSeconds,
            totalSeconds: this.scanTotalSeconds,
        };

        if (this.scanRemainingSeconds <= 0) {
            target.discoverAllAttributes();
            this.activeScan = null;
            this.scanComplete = true;
        }
    }

    private beginScan(): void {
        this.scanStarted = true;
        this.scanTotalSeconds =
            PROBE_SCAN_BASE_SECONDS +
            (this.missionTarget.radius / EARTH_RADIUS) * PROBE_SCAN_RADIUS_SCALE_SECONDS;
        this.scanRemainingSeconds = this.scanTotalSeconds;
    }
}
