import * as THREE from 'three';
import { Body } from '../bodies/body';
import { BodyTypeEnum } from '../bodies/body-enums';
import { BlackHole } from '../bodies/black-hole';
import { Star } from '../bodies/star';
import { Spaceship } from '../bodies/ships/spaceship';
import { surfaceClearance, surfaceVelocityAt } from '../physics/collision';
import { rotateShip } from '../physics/ground-alignment';
import {
    G,
    SHIP_LANDING_ALIGN_TOLERANCE,
    SHIP_LANDING_HOLD_SPEED,
    SHIP_LANDING_MAX_ALTITUDE,
    SHIP_LANDING_MAX_DESCENT_SPEED,
    SHIP_LANDING_PROFILE_DECEL,
    SHIP_LANDING_TOUCHDOWN_SPEED,
} from '../utilities/consts';
import { simulationState } from './simulation';

/**
 * Landing procedure for ships.
 *
 * Started on a ship within SHIP_LANDING_MAX_ALTITUDE of a landable surface (E for the player).
 * Every flight control is locked for the duration (Spaceship.controlsLocked); the procedure flies
 * the ship itself, with the ship's own tuning:
 *
 * 1. **Braking.** The ship sheds its speed relative to the surface beneath it — the body's
 *    co-rotating frame, v + ω × r, the same one its atmosphere uses — at the ship's band decel
 *    rates, while turning at its flightMaxTurnRate to bring its belly (−Y) level toward the ground
 *    with its heading kept. The body's gravity is held off, so once stopped it hovers over one
 *    spot on the ground. A body spinning fast enough that its surface frame accelerates harder than
 *    the ship can brake makes this slow or impossible; that is expected.
 * 2. **Descending.** Once stopped and level, gravity is let back in and pulls the ship straight
 *    down. Sideways drift is cancelled, and thrust opposes the fall only when it is faster than a
 *    profile that tapers to SHIP_LANDING_TOUCHDOWN_SPEED at the ground — slow enough that the
 *    contact model treats touchdown as resting contact, with no bounce.
 * 3. **Touchdown.** When the hull touches the ground the ship is grounded (physics/
 *    ground-alignment.ts) and the procedure ends; a launch (simulation/ship-launch.ts) is the way
 *    back up.
 *
 * Everything here works on a Spaceship, not the player, so ship AI can drive it the same way.
 */

/** Ships currently landing. */
const _landing = new Set<Spaceship>();

/** Body types a ship can never land on (stars and black holes are excluded by class too). */
const UNLANDABLE_TYPES =
    BodyTypeEnum.Star |
    BodyTypeEnum.BlackHole |
    BodyTypeEnum.WhiteDwarf |
    BodyTypeEnum.BrownDwarf |
    BodyTypeEnum.Pulsar |
    BodyTypeEnum.Wormhole |
    BodyTypeEnum.SpaceShip |
    BodyTypeEnum.Probe;

/** Scratch, so the per-substep pass never allocates. */
const _up = new THREE.Vector3();
const _frameVel = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _lateral = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _x = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _target = new THREE.Quaternion();
const _stepped = new THREE.Quaternion();
const _delta = new THREE.Quaternion();
const _inv = new THREE.Quaternion();

/** Outcome of a landing, reported once by {@link updateLandings}. */
export interface ILandingOutcome {
    ship: Spaceship;
    body: Body | null;
    outcome: 'touchdown' | 'aborted';
}

/** Whether `body` is something a ship can set down on. */
export function isLandable(body: Body): boolean {
    if (!body || body._isDisposed || !body.mesh) return false;
    if (body instanceof Star || body instanceof BlackHole || body instanceof Spaceship) {
        return false;
    }
    return (body.bodyType & UNLANDABLE_TYPES) === 0;
}

/**
 * The nearest landable body whose drawn surface is within SHIP_LANDING_MAX_ALTITUDE of `ship`'s
 * hull, or null.
 */
export function findLandingSurface(ship: Spaceship, bodies: readonly Body[]): Body | null {
    if (ship._isDisposed || !ship.mesh) return null;
    let best: Body | null = null;
    let bestClearance = SHIP_LANDING_MAX_ALTITUDE;
    for (const body of bodies) {
        if (body === ship || !isLandable(body)) continue;
        // Cheap reject on the bounding spheres before the hull/facet-accurate clearance.
        const centreGap =
            body.mesh.position.distanceTo(ship.mesh.position) - body.radius - ship.radius;
        if (centreGap > SHIP_LANDING_MAX_ALTITUDE) continue;
        const clearance = surfaceClearance(ship, body);
        if (clearance <= bestClearance) {
            bestClearance = clearance;
            best = body;
        }
    }
    return best;
}

/** Whether `ship` is in a state a landing can start from (ignoring range). */
export function canBeginLanding(ship: Spaceship): boolean {
    return (
        !ship._isDisposed &&
        !!ship.mesh &&
        ship.landingPhase === 'idle' &&
        !ship.isGrounded &&
        ship.launchPhase === 'idle' &&
        !ship.warpActive &&
        !ship.warpDecelerating
    );
}

/**
 * Start a landing on `body`. Refused (false) while grounded, launching, already landing, or at warp.
 * A pending warp charge is cancelled, and any boost-decel / stop-brake ramp is dropped: the
 * procedure does its own braking.
 */
export function beginLanding(ship: Spaceship, body: Body): boolean {
    if (!canBeginLanding(ship) || !isLandable(body)) return false;

    if (ship.warpCharging) ship.cancelWarpCharge();
    ship.boostDecelerating = false;
    ship.downshiftDecelerating = false;
    ship.stopBraking = false;

    ship.landingPhase = 'braking';
    ship.landingBody = body;
    ship.landingAligned = false;
    _landing.add(ship);
    return true;
}

/** End a landing without touching the ship's velocity: gravity simply takes over again. */
export function cancelLanding(ship: Spaceship): void {
    ship.landingPhase = 'idle';
    ship.landingBody = null;
    ship.landingAligned = false;
    _landing.delete(ship);
}

/**
 * Turn a landing ship toward level: its +Y along the local vertical (away from the body's centre),
 * its nose along its current heading projected onto the horizon. Rate-limited by the ship's
 * flightMaxTurnRate, and applied through rotateShip so the mesh, control frame and (for the
 * player) the flight camera turn together. Sets `ship.landingAligned`.
 *
 * Call once per frame per landing ship, before applyFrameOrientation.
 *
 * @param dt Steering-clock seconds (see simulation/steering-clock.ts).
 */
export function applyLandingAttitude(ship: Spaceship, dt: number): void {
    const body = ship.landingBody;
    if (ship.landingPhase === 'idle' || !body || body._isDisposed || !body.mesh || !ship.mesh) {
        return;
    }

    _up.subVectors(ship.mesh.position, body.mesh.position);
    if (_up.lengthSq() < 1e-24) return;
    _up.normalize();

    // Heading: the nose flattened onto the horizon. With the nose (nearly) straight up or down,
    // fall back to the ship's top/bottom so the level attitude still keeps its sense of "ahead".
    _fwd.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
    const noseUp = _fwd.dot(_up);
    _fwd.addScaledVector(_up, -noseUp);
    if (_fwd.lengthSq() < 1e-6) {
        // Nose up: the belly faces "ahead" once pitched level; nose down: the top does.
        _fwd.set(0, noseUp > 0 ? -1 : 1, 0).applyQuaternion(ship.controlFrameQuat);
        _fwd.addScaledVector(_up, -_fwd.dot(_up));
        if (_fwd.lengthSq() < 1e-12) return;
    }
    _fwd.normalize();
    _x.crossVectors(_up, _fwd).normalize();
    _basis.makeBasis(_x, _up, _fwd);
    _target.setFromRotationMatrix(_basis);

    const remaining = ship.controlFrameQuat.angleTo(_target);
    if (remaining > 1e-9 && dt > 0) {
        _stepped
            .copy(ship.controlFrameQuat)
            .rotateTowards(_target, ship.handling.flightMaxTurnRate * dt);
        _inv.copy(ship.controlFrameQuat).invert();
        _delta.copy(_stepped).multiply(_inv).normalize();
        rotateShip(ship, _delta);
    }
    ship.landingAligned = ship.controlFrameQuat.angleTo(_target) <= SHIP_LANDING_ALIGN_TOLERANCE;
}

/**
 * {@link applyLandingAttitude} for every landing ship except `skip` (the ship the player's flight
 * controls already turned this frame).
 *
 * @param dt Steering-clock seconds.
 */
export function applyLandingAttitudes(dt: number, skip: Spaceship | null): void {
    for (const ship of _landing) {
        if (ship !== skip) applyLandingAttitude(ship, dt);
    }
}

/**
 * Step every landing ship for one physics substep (see the module comment for the phases).
 *
 * @param dt Sim seconds in this substep.
 */
export function applyLandingSubsteps(dt: number): void {
    if (_landing.size === 0 || !(dt > 0)) return;

    for (const ship of _landing) {
        const body = ship.landingBody;
        if (ship._isDisposed || !ship.mesh) {
            cancelLanding(ship);
            continue;
        }
        // A lost body is reported by updateLandings; just stop flying toward it.
        if (!body || body._isDisposed || !body.mesh) continue;
        // Already down: updateLandings ends it this frame.
        if (ship.isGrounded) continue;

        _up.subVectors(ship.mesh.position, body.mesh.position);
        const distance = _up.length();
        if (distance < 1e-12) continue;
        _up.divideScalar(distance);

        const gravity =
            (G * simulationState.gMultiplier * Math.max(0, body.mass)) / (distance * distance);
        const h = ship.handling;

        surfaceVelocityAt(body, ship.mesh.position, _frameVel);
        _rel.subVectors(ship.velocity, _frameVel);

        if (ship.landingPhase === 'braking') {
            // Stop relative to the ground under the ship, at the decel rate for its speed band.
            const speed = _rel.length();
            if (speed > 0) {
                const next = Math.max(0, speed - ship.decelRateForSpeed(speed, h) * dt);
                _rel.multiplyScalar(next / speed);
            }
            ship.velocity.copy(_frameVel).add(_rel);
            // Hold the body's gravity off so a stopped ship hovers.
            ship.velocity.addScaledVector(_up, gravity * dt);

            if (_rel.length() <= SHIP_LANDING_HOLD_SPEED && ship.landingAligned) {
                ship.landingPhase = 'descending';
            }
            continue;
        }

        // ── Descending: gravity pulls, thrust only keeps the fall in check ──
        const vertical = _rel.dot(_up);
        _lateral.copy(_rel).addScaledVector(_up, -vertical);
        const lateralSpeed = _lateral.length();
        if (lateralSpeed > 0) {
            const next = Math.max(0, lateralSpeed - h.flightThrustDecel * dt);
            _lateral.multiplyScalar(next / lateralSpeed);
        }

        const height = Math.max(0, surfaceClearance(ship, body));
        const spareDecel = h.flightThrustDecel - gravity;
        const profileDecel =
            spareDecel > 0 ? Math.min(SHIP_LANDING_PROFILE_DECEL, 0.5 * spareDecel) : 0;
        const allowedDescent = THREE.MathUtils.clamp(
            Math.sqrt(2 * profileDecel * height),
            SHIP_LANDING_TOUCHDOWN_SPEED,
            SHIP_LANDING_MAX_DESCENT_SPEED
        );

        let newVertical = vertical;
        const descent = -vertical;
        if (descent > allowedDescent) {
            newVertical += Math.min(descent - allowedDescent, h.flightThrustDecel * dt);
        }

        ship.velocity.copy(_frameVel).add(_lateral).addScaledVector(_up, newVertical);
    }
}

/**
 * Finish or abort landings, once per frame after updateGroundAlignment: a ship that is now grounded
 * has touched down; one whose body is gone is aborted.
 *
 * @returns Each landing that ended this frame, for the caller to report.
 */
export function updateLandings(): ILandingOutcome[] {
    if (_landing.size === 0) return [];
    const outcomes: ILandingOutcome[] = [];
    for (const ship of _landing) {
        const body = ship.landingBody;
        if (ship._isDisposed || !ship.mesh) {
            cancelLanding(ship);
            continue;
        }
        if (ship.isGrounded) {
            const ground = ship.groundBody ?? body;
            cancelLanding(ship);
            outcomes.push({ ship, body: ground, outcome: 'touchdown' });
            continue;
        }
        if (!body || body._isDisposed || !body.mesh) {
            cancelLanding(ship);
            outcomes.push({ ship, body: null, outcome: 'aborted' });
        }
    }
    return outcomes;
}
