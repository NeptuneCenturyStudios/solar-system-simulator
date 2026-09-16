import * as THREE from 'three';
import { Body } from '../bodies/body';
import { CelestialBody } from '../bodies/celestial-body';
import { ISatelliteHandling } from '../interfaces';
import { EffectiveGForce } from '../types';

/** Scratch vectors so the per-frame station-keeping pass never allocates. */
const _radial = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _angularMomentum = new THREE.Vector3();
const _tangential = new THREE.Vector3();
const _desiredRelVel = new THREE.Vector3();
const _currentDir = new THREE.Vector3();
const _desiredDir = new THREE.Vector3();
const _turnAxis = new THREE.Vector3();

/** Below this a vector is treated as having no meaningful direction. */
const DIRECTION_EPSILON = 1e-9;
/** Squared counterpart, for length comparisons that skip the sqrt. */
const DIRECTION_EPSILON_SQ = DIRECTION_EPSILON * DIRECTION_EPSILON;

/**
 * Rotates `dir` toward `target` by at most `maxAngle` radians, in place.
 *
 * This is the velocity-space counterpart to `Spaceship.steerToward`, which rate-limits a
 * *quaternion* via `Quaternion.rotateTowards` and so cannot be reused here — a satellite steers its
 * velocity vector, not a hull. Both vectors must already be unit length. Rotating about the
 * normalized cross product sweeps the shortest arc (it stays in the plane containing both
 * directions), and clamping the step to the angle that remains makes overshoot impossible at any dt.
 *
 * The cross product vanishes when the two directions are parallel (already handled by the
 * zero-angle test) or exactly antiparallel, where no arc is uniquely shortest; in the latter case
 * `fallbackAxis` — the orbit normal — is used, which turns the velocity within the orbital plane.
 *
 * @returns true when `dir` ended up exactly on `target` rather than being cut short by `maxAngle`.
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

/**
 * Updates `orbitNormal` from the satellite's current motion and writes the unit tangential
 * direction of its orbit into `out`.
 *
 * The orbit plane comes from the satellite's own state — normal = r̂ × v_rel, tangential =
 * normal × r̂ — rather than from world up, so a correction preserves whatever inclination the
 * satellite already has. The ship autopilot instead builds its tangential as `radial × worldUp`
 * (see the BRAKE/CIRCULARIZE/TIDAL_LOCK phases in spaceship.ts), which forces an *equatorial*
 * orbit. That is fine for parking a ship in a fresh orbit, but copied here it would torque the ISS
 * out of its 51.64° inclination a little more every frame until the orbit lay in the ecliptic.
 *
 * The sign works out without needing to know the codebase's plane convention: for a circular orbit
 * (r × v) × r = v|r|², so `out` comes back parallel to the current velocity. (A prograde +X → +Z
 * orbit here has its angular momentum along −Y, and the double cross product recovers the prograde
 * direction from that just as it would from +Y.)
 *
 * When the angular momentum is degenerate — zero relative velocity, or motion exactly along the
 * radius, which a collision or a user reposition can produce — the previously cached normal is
 * reused rather than falling back to an arbitrary world axis, so a satellite knocked briefly radial
 * recovers into the plane it was actually orbiting in.
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
 * Advances one frame of station-keeping for `satellite` around `parent`, mutating
 * `satellite.velocity` directly. Pure with respect to the rest of the simulation: it never touches
 * `healthPoints`, never calls `.die()` and never reads the bodies array, mirroring the contract
 * `resolveAtmosphericPassage` follows in atmospheric-drag.ts.
 *
 * Runs at the same once-per-frame `dtTotal` cadence as atmospheric drag, so the thrust it applies
 * and the drag it exists to cancel always see the same timestep.
 *
 * The command is a circular orbit at the satellite's *current* radius, plus a proportional outward
 * climb closing whatever altitude has been lost. That command is applied in two independently
 * rate-limited stages — turn the velocity vector toward the commanded direction at no more than
 * `maxTurnRate`, then change its magnitude at no more than `maxThrustAccel`/`thrustDecel`. Each
 * stage is clamped against its own target, so no amount of time-warp can make it overshoot or
 * oscillate; in particular the climb is capped at `deficit / dt`, so one very large frame cannot
 * carry the satellite past the radius it is climbing back toward.
 *
 * Engaging takes a full `orbitDecayTolerance` of lost altitude, but disengaging takes the much
 * tighter `orbitHoldTolerance` — two thresholds rather than one, so the autopilot cannot chatter on
 * and off. Crucially, the frame that restores the altitude commands a climb of exactly zero, i.e.
 * pure circular flight, and the correction stays engaged until that command has actually been
 * reached. Cutting off any earlier would freeze in the residual climb rate, and even 0.5 m/s of
 * leftover radial velocity at the ISS's orbital rate produces a ~440 m eccentric excursion —
 * several times the decay this exists to hold.
 *
 * @param dt This frame's elapsed simulation time. May be negative: the simulation runs in reverse
 *   at negative `timeScale`, and every rate limit here is a magnitude, so the sign is stripped. A
 *   satellite should hold its orbit up whichever way time is flowing.
 * @param orbitNormal Persistent unit normal of the satellite's orbital plane, read and updated in
 *   place so a momentarily degenerate orbit can fall back on the last good value.
 * @param wasActive Whether a correction was already running, which selects between the engage and
 *   disengage thresholds.
 * @returns whether a correction is still running after this frame.
 */
export function resolveStationKeeping(
    satellite: Body,
    parent: CelestialBody,
    targetOrbitRadius: number,
    handling: ISatelliteHandling,
    gEff: EffectiveGForce,
    orbitNormal: THREE.Vector3,
    wasActive: boolean,
    dt: number
): boolean {
    // Reverse time still decays the orbit, so correct by the magnitude of the step. A zero dt is
    // also how a paused simulation arrives here.
    const dtc = Math.abs(dt);
    if (dtc <= DIRECTION_EPSILON || gEff <= 0 || parent.mass <= 0) return wasActive;

    _radial.subVectors(satellite.mesh.position, parent.mesh.position);
    const rLen = _radial.length();
    if (rLen < DIRECTION_EPSILON) return wasActive;
    _radial.divideScalar(rLen);

    // Positive when the satellite has dropped below the radius it is meant to hold. A negative
    // deficit (sitting higher than its target) counts as restored: this autopilot arrests decay, it
    // does not drag a naturally higher orbit back down.
    const deficit = targetOrbitRadius - rLen;
    const altitudeRestored =
        deficit <= (wasActive ? handling.orbitHoldTolerance : handling.orbitDecayTolerance);

    // Idle and still within tolerance — by far the common case, and it costs nothing.
    if (altitudeRestored && !wasActive) return false;

    _relVel.subVectors(satellite.velocity, parent.velocity);
    if (!computeTangential(_radial, _relVel, orbitNormal, _tangential)) return wasActive;

    // Circular speed at the radius the satellite is at right now, not the one it is climbing
    // toward — the climb term below is what does the moving, and commanding the target radius's
    // speed here would instead raise the orbit's apoapsis and leave it eccentric. Inlined rather
    // than calling physics.ts's calculateOrbitalSpeed, which would pull a heavy import cycle in for
    // one sqrt; the ship autopilot inlines the same expression for the same reason.
    const vCircular = Math.sqrt((gEff * parent.mass) / rLen);

    // Proportional climb, capped by the configured ceiling and by deficit/dt so one frame of
    // climbing can never travel further than the deficit it is closing. Zero once the altitude is
    // back, which makes the closing command pure circular flight.
    const climb = altitudeRestored
        ? 0
        : Math.min(handling.climbGain * deficit, handling.maxClimbRate, deficit / dtc);

    _desiredRelVel.copy(_tangential).multiplyScalar(vCircular).addScaledVector(_radial, climb);

    const desiredSpeed = _desiredRelVel.length();
    if (desiredSpeed < DIRECTION_EPSILON) return wasActive;
    _desiredDir.copy(_desiredRelVel).divideScalar(desiredSpeed);

    const currentSpeed = _relVel.length();

    // ── Stage 1: steer the velocity vector, rate-limited by the turn rate ────
    let headingReached: boolean;
    if (currentSpeed >= DIRECTION_EPSILON) {
        _currentDir.copy(_relVel).divideScalar(currentSpeed);
        headingReached = rotateTowards(
            _currentDir,
            _desiredDir,
            handling.maxTurnRate * dtc,
            orbitNormal
        );
    } else {
        // Stationary relative to the parent — there is no heading to rotate, so adopt the commanded
        // one outright and let the throttle stage build the speed up.
        _currentDir.copy(_desiredDir);
        headingReached = true;
    }

    // ── Stage 2: throttle, rate-limited by thrust accel / decel ─────────────
    const speedError = desiredSpeed - currentSpeed;
    const maxSpeedStep =
        Math.max(0, speedError >= 0 ? handling.maxThrustAccel : handling.thrustDecel) * dtc;
    const speedReached = maxSpeedStep >= Math.abs(speedError);
    const newSpeed = Math.max(
        0,
        currentSpeed + Math.sign(speedError) * Math.min(maxSpeedStep, Math.abs(speedError))
    );

    // A pure re-parametrization of the existing relative velocity — the direction came from
    // rotating the real one and the magnitude from stepping the real speed — so nothing the
    // controller did not model gets clobbered.
    satellite.velocity.copy(parent.velocity).addScaledVector(_currentDir, newSpeed);

    // Stay engaged until the altitude is back *and* the closing pure-circular command was actually
    // reached, so a burn never ends with leftover radial velocity.
    return !altitudeRestored || !headingReached || !speedReached;
}
