import * as THREE from 'three';
import { Body } from '../bodies/body';
import { BodyTypeEnum } from '../bodies/body-enums';
import { BlackHole } from '../bodies/black-hole';
import { Star } from '../bodies/star';
import { Spaceship } from '../bodies/ships/spaceship';
import { shipSurfaceClearance, surfaceClearance, surfaceVelocityAt } from '../physics/collision';
import { rotateShip } from '../physics/ground-alignment';
import {
    clearShipGroundPlane,
    groundPlaneClearance,
    sampleGroundPlane,
    shipGroundPlaneWorld,
    shipTerrainUpWorld,
    updateShipGroundPlane,
} from '../physics/ground-plane';
import {
    G,
    SHIP_LANDING_ALIGN_TOLERANCE,
    SHIP_LANDING_HOLD_SPEED,
    SHIP_LANDING_MAX_ALTITUDE,
    SHIP_LANDING_MAX_DESCENT_SPEED,
    SHIP_LANDING_MAX_SLOPE,
    SHIP_LANDING_PROFILE_DECEL,
    SHIP_LANDING_SLOPE_BLEND_END,
    SHIP_LANDING_SLOPE_BLEND_START,
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
 * The body's gravity acts on the ship throughout; nothing holds it off. Speed is measured relative
 * to the surface beneath the ship — the body's co-rotating frame, v + ω × r, the same one its
 * atmosphere uses — so a ship at 0 m/s stays over one spot on the ground and simply falls.
 * "Level", "vertical" and "sideways" are taken against the surrounding terrain (the normal of the
 * ground fitted over a few hull-lengths around the spot below — see physics/ground-plane.ts), not
 * the direction away from the body's centre, so on an irregular asteroid the ship lines up with,
 * and descends onto, the face it is over.
 *
 * 1. **Braking.** The ship sheds its sideways and climbing speed at the ship's band decel rates,
 *    while turning at its flightMaxTurnRate to bring its belly (−Y) level toward the ground with
 *    its heading kept. Gravity pulls it down meanwhile; thrust opposes the fall only when it is
 *    faster than the descent profile (below), so a ship braking low or over a heavy body loses
 *    height but never falls dangerously fast. A body spinning fast enough that its surface frame
 *    accelerates harder than the ship can brake makes this slow or impossible; that is expected.
 * 2. **Descending.** Once stopped sideways and level, the slope of the ground plane under the hull
 *    relative to the surrounding terrain is checked: steeper than SHIP_LANDING_MAX_SLOPE ends the landing
 *    (the same check refuses to start one). Otherwise the same descent continues at the ship's
 *    thrust decel. Sideways drift is cancelled, and thrust opposes the fall only when it is faster
 *    than a profile that tapers to SHIP_LANDING_TOUCHDOWN_SPEED at the ground — slow enough that
 *    the contact model treats touchdown as resting contact, with no bounce. Over the last few
 *    ship radii the ship tilts from level to the slope, so it touches down flush on it.
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
const _radial = new THREE.Vector3();
const _planeNormal = new THREE.Vector3();
const _planePoint = new THREE.Vector3();
const _tilt = new THREE.Quaternion();
const _partialTilt = new THREE.Quaternion();
const _IDENTITY = new THREE.Quaternion();

/** How a landing ended. */
export enum LandingOutcome {
    /** The ship is down on the ground. */
    Touchdown = 'touchdown',
    /** The body it was landing on is gone. */
    Aborted = 'aborted',
    /** Braking ended over ground steeper than SHIP_LANDING_MAX_SLOPE. */
    TooSteep = 'too-steep',
}

/** Outcome of a landing, reported once by {@link updateLandings}. */
export interface ILandingOutcome {
    ship: Spaceship;
    body: Body | null;
    outcome: LandingOutcome;
    /** Slope (radians) of the ground under the ship, for LandingOutcome.TooSteep. */
    slope: number;
}

/** Whether {@link beginLanding} started a landing, and if not, why. */
export enum LandingStartResult {
    Started = 'started',
    /** Grounded, launching, already landing, at warp, or the body can't be landed on. */
    NotReady = 'not-ready',
    /** The ground under the ship is steeper than SHIP_LANDING_MAX_SLOPE. */
    TooSteep = 'too-steep',
}

/** Result of {@link beginLanding}. */
export interface ILandingStart {
    result: LandingStartResult;
    /** Slope (radians) of the ground under the ship, when it was measured. */
    slope: number;
}

/** Landings ended in a substep for being over too steep ground: ship → slope (radians). */
const _tooSteep = new Map<Spaceship, { body: Body; slope: number }>();

/** "slope 42° (max 35°)", for the too-steep landing messages. */
export function formatSlope(slope: number): string {
    const deg = Math.round(THREE.MathUtils.radToDeg(slope));
    const max = Math.round(THREE.MathUtils.radToDeg(SHIP_LANDING_MAX_SLOPE));
    return `slope ${deg}° (max ${max}°)`;
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
            body.mesh.position.distanceTo(ship.mesh.position) - body.contactRadius - ship.radius;
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
 * Start a landing on `body`. Refused while grounded, launching, already landing, or at warp
 * (NotReady), and when the ground plane under the hull is steeper than SHIP_LANDING_MAX_SLOPE
 * (TooSteep). A pending warp charge is cancelled, and any boost-decel / stop-brake ramp is
 * dropped: the procedure does its own braking.
 */
export function beginLanding(ship: Spaceship, body: Body): ILandingStart {
    if (!canBeginLanding(ship) || !isLandable(body)) {
        return { result: LandingStartResult.NotReady, slope: 0 };
    }

    const slope = sampleGroundPlane(ship, body, _up, _planePoint, _planeNormal);
    if (slope !== null && slope > SHIP_LANDING_MAX_SLOPE) {
        return { result: LandingStartResult.TooSteep, slope };
    }

    if (ship.warpCharging) ship.cancelWarpCharge();
    ship.boostDecelerating = false;
    ship.downshiftDecelerating = false;
    ship.stopBraking = false;

    ship.landingPhase = 'braking';
    ship.landingBody = body;
    ship.landingAligned = false;
    _landing.add(ship);
    return { result: LandingStartResult.Started, slope: slope ?? 0 };
}

/**
 * Append the body each landing ship is setting down on to `out`, so the physics substep loop can
 * keep those bodies' positions and velocities live for {@link applyLandingSubsteps}.
 */
export function collectLandingBodies(out: Body[]): void {
    for (const ship of _landing) {
        if (ship.landingBody) out.push(ship.landingBody);
    }
}

/** End a landing without touching the ship's velocity: gravity simply takes over again. */
export function cancelLanding(ship: Spaceship): void {
    ship.landingPhase = 'idle';
    ship.landingBody = null;
    ship.landingAligned = false;
    // A grounded ship keeps its plane for ground alignment; one still in the air drops it.
    if (!ship.isGrounded) clearShipGroundPlane(ship);
    _landing.delete(ship);
}

/**
 * Turn a landing ship toward its landing attitude: its +Y along the normal of the surrounding
 * terrain (see physics/ground-plane.ts; the local vertical when it can't be sampled) while
 * braking, and — once descending — tilting from there to the normal of the
 * ground plane under its hull over the final SHIP_LANDING_SLOPE_BLEND_START →
 * SHIP_LANDING_SLOPE_BLEND_END ship radii, so it touches down flush on a slope. Its nose stays
 * along its current heading, projected onto that plane. Rate-limited by the ship's
 * flightMaxTurnRate, and applied through rotateShip so the mesh, control frame and (for the
 * player) the flight camera turn together. Sets `ship.landingAligned` (level, for braking) and
 * refreshes the ship's cached ground plane.
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

    // "Level" is the surrounding terrain (the local vertical if it could not be sampled).
    const plane = updateShipGroundPlane(ship, body);
    if (!shipTerrainUpWorld(ship, body, _radial)) return;
    _up.copy(_radial);
    if (plane && ship.landingPhase === 'descending') {
        shipGroundPlaneWorld(ship, body, _planeNormal, _planePoint);
        const start = SHIP_LANDING_SLOPE_BLEND_START * ship.radius;
        const end = SHIP_LANDING_SLOPE_BLEND_END * ship.radius;
        const clearance = groundPlaneClearance(ship, _planeNormal, _planePoint);
        const t = THREE.MathUtils.clamp((start - clearance) / Math.max(start - end, 1e-12), 0, 1);
        if (t > 0) {
            _tilt.setFromUnitVectors(_radial, _planeNormal);
            _partialTilt.slerpQuaternions(_IDENTITY, _tilt, t);
            _up.applyQuaternion(_partialTilt).normalize();
        }
    }

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

        const distance = ship.mesh.position.distanceTo(body.mesh.position);
        if (distance < 1e-12) continue;
        // Vertical / sideways are taken against the surrounding terrain (cached this frame by
        // applyLandingAttitude), so the ship stops over, and descends onto, the face below it.
        if (!shipTerrainUpWorld(ship, body, _up)) continue;

        const gravity =
            (G * simulationState.gMultiplier * Math.max(0, body.mass)) / (distance * distance);
        const h = ship.handling;

        surfaceVelocityAt(body, ship.mesh.position, _frameVel);
        _rel.subVectors(ship.velocity, _frameVel);

        // Gravity acts throughout (the integrator has already applied it); thrust only sheds
        // sideways and climbing motion and keeps the fall within the descent profile.
        const braking = ship.landingPhase === 'braking';
        // Braking runs at the ship's band decel for its speed; the descent at its thrust decel.
        const decel = braking ? ship.decelRateForSpeed(_rel.length(), h) : h.flightThrustDecel;
        const step = decel * dt;

        let vertical = _rel.dot(_up);
        _lateral.copy(_rel).addScaledVector(_up, -vertical);
        const lateralSpeed = _lateral.length();
        if (lateralSpeed > 0) {
            _lateral.multiplyScalar(Math.max(0, lateralSpeed - step) / lateralSpeed);
        }

        if (braking && vertical > 0) {
            // Climbing: brake it toward zero (gravity helps).
            vertical = Math.max(0, vertical - step);
        } else {
            vertical = limitDescent(vertical, allowedDescentSpeed(ship, body, gravity), step);
        }

        ship.velocity.copy(_frameVel).add(_lateral).addScaledVector(_up, vertical);

        if (
            braking &&
            ship.landingAligned &&
            _lateral.length() <= SHIP_LANDING_HOLD_SPEED &&
            vertical <= SHIP_LANDING_HOLD_SPEED
        ) {
            // Stopped over the final spot (it may have drifted while braking): check the slope
            // there before committing. The plane was sampled this frame by applyLandingAttitude.
            const plane = ship.groundPlane;
            if (plane && plane.body === body && plane.slope > SHIP_LANDING_MAX_SLOPE) {
                _tooSteep.set(ship, { body, slope: plane.slope });
                cancelLanding(ship);
                continue;
            }
            ship.landingPhase = 'descending';
        }
    }
}

/**
 * Fastest a landing ship may fall at its current height: a profile √(2·a·h) that tapers to
 * SHIP_LANDING_TOUCHDOWN_SPEED at the ground, with `a` limited to half the ship's thrust decel
 * left over after the body's gravity, and capped at SHIP_LANDING_MAX_DESCENT_SPEED.
 */
function allowedDescentSpeed(ship: Spaceship, body: Body, gravity: number): number {
    const height = Math.max(0, shipSurfaceClearance(ship, body));
    const spareDecel = ship.handling.flightThrustDecel - gravity;
    const profileDecel =
        spareDecel > 0 ? Math.min(SHIP_LANDING_PROFILE_DECEL, 0.5 * spareDecel) : 0;
    return THREE.MathUtils.clamp(
        Math.sqrt(2 * profileDecel * height),
        SHIP_LANDING_TOUCHDOWN_SPEED,
        SHIP_LANDING_MAX_DESCENT_SPEED
    );
}

/**
 * Thrust against a fall faster than `allowed`, by at most `maxStep` this substep. A slower fall
 * (or a climb) is returned unchanged.
 *
 * @param vertical Velocity along the local up (negative = falling).
 */
function limitDescent(vertical: number, allowed: number, maxStep: number): number {
    const excess = -vertical - allowed;
    return excess > 0 ? vertical + Math.min(excess, maxStep) : vertical;
}

/**
 * Finish or abort landings, once per frame after updateGroundAlignment: a ship that is now grounded
 * has touched down; one whose body is gone is aborted.
 *
 * @returns Each landing that ended this frame, for the caller to report.
 */
export function updateLandings(): ILandingOutcome[] {
    if (_landing.size === 0 && _tooSteep.size === 0) return [];
    const outcomes: ILandingOutcome[] = [];
    for (const [ship, { body, slope }] of _tooSteep) {
        if (ship._isDisposed) continue;
        outcomes.push({ ship, body, outcome: LandingOutcome.TooSteep, slope });
    }
    _tooSteep.clear();
    for (const ship of _landing) {
        const body = ship.landingBody;
        if (ship._isDisposed || !ship.mesh) {
            cancelLanding(ship);
            continue;
        }
        if (ship.isGrounded) {
            const ground = ship.groundBody ?? body;
            cancelLanding(ship);
            outcomes.push({ ship, body: ground, outcome: LandingOutcome.Touchdown, slope: 0 });
            continue;
        }
        if (!body || body._isDisposed || !body.mesh) {
            cancelLanding(ship);
            outcomes.push({ ship, body: null, outcome: LandingOutcome.Aborted, slope: 0 });
        }
    }
    return outcomes;
}
