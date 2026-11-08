import * as THREE from 'three';
import { Body } from '../bodies/body';
import { Spaceship } from '../bodies/ships/spaceship';
import { flightState, simulationState } from '../simulation/simulation';
import {
    DIST_SCALE,
    G,
    SHIP_GROUND_SETTLE_TIME_FACTOR,
    SHIP_GROUND_SETTLE_TIME_MAX,
    SHIP_GROUND_SETTLE_TIME_MIN,
    SHIP_GROUND_STICK_SPEED,
    SHIP_GROUNDED_CLEARANCE_FRACTION,
    SHIP_GROUNDED_CLEARANCE_MIN,
    SHIP_SURFACE_FRICTION,
} from '../utilities/consts';
import { surfaceClearance, surfaceVelocityAt } from './collision';

/**
 * Per-ship grounded state: the body it rests on and that body's orientation when last seen, so
 * each frame can carry the ship through exactly the rotation the ground made since.
 */
interface IGroundState {
    body: Body;
    prevBodyQuat: THREE.Quaternion;
    /**
     * Where the ship is parked, in the body's own (rotating) frame — the offset from its centre
     * with the body's rotation removed — or null until it has come to rest. See pinToAnchor.
     */
    anchor: THREE.Vector3 | null;
}

const _groundStates = new WeakMap<Spaceship, IGroundState>();

/** Ships grounded as of the last updateGroundAlignment, for the per-substep ground support. */
const _grounded = new Set<Spaceship>();

/**
 * Hull clearance (sim units) within which a grounded ship counts as touching for the per-substep
 * ground support. Contact separates to exactly touching, so this only absorbs rounding; a ship
 * any higher (mid-hop) is left to fall back under gravity.
 */
const GROUND_SUPPORT_TOLERANCE = 0.05 / 1000 / DIST_SCALE; // 5 cm

const _supportUp = new THREE.Vector3();
const _supportFrame = new THREE.Vector3();
const _supportRel = new THREE.Vector3();
const _supportSlide = new THREE.Vector3();

/** Scratch, so the per-frame pass never allocates. */
const _delta = new THREE.Quaternion();
const _settle = new THREE.Quaternion();
const _invPrev = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _shipUp = new THREE.Vector3();
const _targetUp = new THREE.Vector3();
const _IDENTITY = new THREE.Quaternion();
const _LOCAL_UP = new THREE.Vector3(0, 1, 0);

/**
 * Hull clearance within which a ship that was resting on a body still counts as grounded: a
 * fraction of its radius, never less than the SHIP_GROUNDED_CLEARANCE_MIN bounce tolerance.
 */
export function groundedClearanceTolerance(ship: Spaceship): number {
    return Math.max(ship.radius * SHIP_GROUNDED_CLEARANCE_FRACTION, SHIP_GROUNDED_CLEARANCE_MIN);
}

/**
 * Rotates `ship` by the world-space rotation `q`, keeping every orientation that describes it in
 * step: the mesh, the control frame (mesh = frame × bank, so a world-space premultiply preserves
 * the bank), and — for the ship being flown — the flight camera frame, which
 * updateFlightControls() copies back into the control frame at the start of the next frame.
 */
export function rotateShip(ship: Spaceship, q: THREE.Quaternion): void {
    ship.mesh.quaternion.premultiply(q).normalize();
    ship.controlFrameQuat.premultiply(q).normalize();
    if (flightState.activeShip === ship) flightState.flightCameraQuat.premultiply(q).normalize();
}

/**
 * Orientation physics for ships resting on a surface. Gravity and the contact model only act on a
 * ship's velocity, so on its own a landed ship keeps a fixed orientation in inertial space while
 * the planet turns beneath it: over a few hours it appears to roll over and pivot on the ground.
 * Each frame, for every ship touching (or still within a hair of) the ground:
 *
 * 0. **Parking.** Once a grounded ship has come to rest it is anchored to that spot of the body and
 *    put back there every frame, moving with the ground (see pinToAnchor), until a launch lifts it
 *    off. This keeps it from drifting under time warp. While parked it is immovable: something
 *    shoving it is undone at the end of the frame.
 * 1. **Co-rotation.** The ship is turned by the same rotation the ground body made since the last
 *    frame. Parking carries its *position* around with the spin; this carries its *attitude*, so a
 *    parked ship keeps its heading relative to the ground.
 *    It uses the body's actual quaternion change, so axial spin and tidal locking both work.
 * 2. **Settling.** Gravity acting on a hull resting at an angle tips it over onto a face. The ship
 *    is rotated, along the shortest arc, to bring its belly flat against the local surface — or its
 *    back, if it is resting more than 90° over (a ship that crashed upside down stays upside down).
 *    The remaining tilt decays as e^(−t/τ) with τ ∝ √(L / g), the natural tipping time of a body of
 *    half-length L in surface gravity g. Flight controls are locked on the ground, so nothing
 *    fights it; a launch (simulation/ship-launch.ts) is the way off.
 *
 * It also sets each ship's `isGrounded` / `groundBody`, which lock every flight control while the
 * ship sits on the ground (see Spaceship.controlsLocked).
 *
 * Runs once per frame, after the collision pass has written each ship's groundContactBody.
 *
 * @param bodies Every live body (non-ships are skipped).
 * @param dt Sim seconds this frame covered; 0 while paused.
 */
export function updateGroundAlignment(bodies: readonly Body[], dt: number): void {
    for (const body of bodies) {
        if (!(body instanceof Spaceship)) continue;
        const ship = body;
        const contact = ship.groundContactBody;
        ship.groundContactBody = null;
        if (ship._isDisposed || !ship.mesh) {
            _grounded.delete(ship);
            continue;
        }

        // ── Grounded? Parked, a contact this frame, or still touching the body it rested on ──
        let state = _groundStates.get(ship);
        // A launch lifting the ship off releases it from the ground.
        if (state && ship.launchPhase === 'lifting') state.anchor = null;
        let ground: Body | null = contact;
        const anchored = !!state?.anchor && !state.body._isDisposed && !!state.body.mesh;
        if (anchored && state) {
            // Parked: carried rigidly by the ground, whatever the substeps did to it this frame.
            pinToAnchor(ship, state);
            ground = state.body;
        } else if (!ground && state && !state.body._isDisposed && state.body.mesh) {
            if (surfaceClearance(ship, state.body) <= groundedClearanceTolerance(ship)) {
                ground = state.body;
            }
        }
        if (!ground || ground._isDisposed || !ground.mesh) {
            ship.isGrounded = false;
            ship.groundBody = null;
            _groundStates.delete(ship);
            _grounded.delete(ship);
            continue;
        }
        ship.isGrounded = true;
        ship.groundBody = ground;
        _grounded.add(ship);

        // Newly grounded, or now resting on a different body: start tracking from here.
        if (!state || state.body !== ground) {
            state = { body: ground, prevBodyQuat: ground.mesh.quaternion.clone(), anchor: null };
            _groundStates.set(ship, state);
            continue;
        }

        // Come to rest (not skidding or hopping away): park it where it is, set down onto the
        // ground. Not gated on the hull touching: under time warp each frame's substeps leave a
        // grounded ship up to metres off the surface, so it would never count as touching.
        if (!state.anchor && ship.launchPhase !== 'lifting' && isResting(ship, ground, dt)) {
            _anchorUp.subVectors(ship.mesh.position, ground.mesh.position);
            const distance = _anchorUp.length();
            if (distance > 1e-12) {
                _anchorUp.divideScalar(distance);
                ship.mesh.position.addScaledVector(_anchorUp, -surfaceClearance(ship, ground));
                state.anchor = new THREE.Vector3()
                    .subVectors(ship.mesh.position, ground.mesh.position)
                    .applyQuaternion(_invPrev.copy(ground.mesh.quaternion).invert());
                surfaceVelocityAt(ground, ship.mesh.position, ship.velocity);
            }
        }

        // ── 1. Co-rotation: Δq = q_now · q_prev⁻¹ ──
        _invPrev.copy(state.prevBodyQuat).invert();
        _delta.copy(ground.mesh.quaternion).multiply(_invPrev).normalize();
        state.prevBodyQuat.copy(ground.mesh.quaternion);
        if (Math.abs(_delta.w) < 1 - 1e-15) rotateShip(ship, _delta);

        if (!(dt > 0)) continue;

        // ── 2. Settling: tip the nearer of belly / back flat onto the surface ──
        _up.subVectors(ship.mesh.position, ground.mesh.position);
        const distance = _up.length();
        if (distance < 1e-12) continue;
        _up.divideScalar(distance);

        _shipUp.copy(_LOCAL_UP).applyQuaternion(ship.mesh.quaternion);
        _targetUp.copy(_up);
        if (_shipUp.dot(_up) < 0) _targetUp.negate();

        const gravity = (G * Math.max(0, ground.mass)) / (distance * distance);
        const halfLength = ship.radius * 0.5;
        const tau =
            gravity > 0
                ? THREE.MathUtils.clamp(
                      SHIP_GROUND_SETTLE_TIME_FACTOR * Math.sqrt(halfLength / gravity),
                      SHIP_GROUND_SETTLE_TIME_MIN,
                      SHIP_GROUND_SETTLE_TIME_MAX
                  )
                : SHIP_GROUND_SETTLE_TIME_MAX;
        const alpha = 1 - Math.exp(-dt / tau);

        // slerpQuaternions copies its first argument into the target first, so the full tilt
        // goes in a separate scratch from the partial step.
        _delta.setFromUnitVectors(_shipUp, _targetUp);
        _settle.slerpQuaternions(_IDENTITY, _delta, alpha);
        rotateShip(ship, _settle);
    }
}

const _anchorRel = new THREE.Vector3();
const _anchorUp = new THREE.Vector3();

/**
 * Whether a grounded `ship` has come to rest on `ground`: its velocity relative to the ground under
 * it is slower than the larger of SHIP_GROUND_STICK_SPEED and twice the speed gravity adds in a
 * frame (the same frame-scaled allowance as the contact model's resting test, so time warp does
 * not stop a ship from ever counting as at rest).
 */
function isResting(ship: Spaceship, ground: Body, dt: number): boolean {
    _anchorUp.subVectors(ship.mesh.position, ground.mesh.position);
    const distance = _anchorUp.length();
    if (distance < 1e-12) return false;
    const gravity =
        (G * simulationState.gMultiplier * Math.max(0, ground.mass)) / (distance * distance);
    const allowance = Math.max(SHIP_GROUND_STICK_SPEED, 2 * gravity * Math.max(0, dt));
    surfaceVelocityAt(ground, ship.mesh.position, _anchorRel);
    return _anchorRel.subVectors(ship.velocity, _anchorRel).length() <= allowance;
}

/**
 * Put a parked ship back exactly where it was parked, moving with the ground there.
 *
 * Holding a resting ship by velocity alone (the per-substep support) lets it drift: each substep it
 * moves in a straight line while the ground turns along an arc, and gravity only pulls it back
 * approximately. At 1× that is invisible; under heavy time warp a substep covers minutes of the
 * planet's spin, and the ship slides, lifts off and is carried away. Static friction holds a
 * parked craft rigidly, so once at rest the ship is kept at a fixed point of the body's own frame
 * — set from the body's end-of-frame position and orientation — with the ground's velocity there.
 */
function pinToAnchor(ship: Spaceship, state: IGroundState): void {
    const anchor = state.anchor;
    const body = state.body;
    if (!anchor) return;
    ship.mesh.position.copy(anchor).applyQuaternion(body.mesh.quaternion).add(body.mesh.position);
    surfaceVelocityAt(body, ship.mesh.position, ship.velocity);
}

/** Whether `ship` should get per-substep ground support (grounded and not driven by a procedure). */
function isSupported(ship: Spaceship): boolean {
    return ship.isGrounded && ship.launchPhase !== 'lifting' && ship.landingPhase === 'idle';
}

/**
 * Append the body each grounded ship rests on to `out`, so the physics substep loop keeps those
 * bodies' positions and velocities live for {@link applyGroundSupportSubsteps}.
 */
export function collectGroundBodies(out: Body[]): void {
    for (const ship of _grounded) {
        if (!ship._isDisposed && isSupported(ship) && ship.groundBody) out.push(ship.groundBody);
    }
}

/**
 * Continuous ground support for resting ships, once per physics substep.
 *
 * The collision pass runs once per frame, so without this a grounded ship falls through the
 * ground for a whole frame of substeps — ½·g·T², worst on high-gravity bodies and under time warp
 * — and is pushed back out at the end. Real ground pushes back continuously: while the hull is
 * touching, any velocity into the surface (relative to the ground's own co-rotating velocity) is
 * removed, and sliding is braked by Coulomb friction at μ·g, sticking outright at or below
 * SHIP_GROUND_STICK_SPEED — the continuous form of resolveShipContact's resting contact.
 *
 * A ship lifting off or flying the landing procedure is left alone; their own substep passes
 * drive it.
 *
 * @param dt Sim seconds in this substep.
 */
export function applyGroundSupportSubsteps(dt: number): void {
    if (_grounded.size === 0 || !(dt > 0)) return;

    for (const ship of _grounded) {
        if (ship._isDisposed || !ship.mesh) {
            _grounded.delete(ship);
            continue;
        }
        if (!isSupported(ship)) continue;
        const ground = ship.groundBody;
        if (!ground || ground._isDisposed || !ground.mesh) continue;
        // Mid-hop: gravity brings it back down; the collision pass handles the landing.
        if (surfaceClearance(ship, ground) > GROUND_SUPPORT_TOLERANCE) continue;

        _supportUp.subVectors(ship.mesh.position, ground.mesh.position);
        const distance = _supportUp.length();
        if (distance < 1e-12) continue;
        _supportUp.divideScalar(distance);

        surfaceVelocityAt(ground, ship.mesh.position, _supportFrame);
        _supportRel.subVectors(ship.velocity, _supportFrame);

        // Normal: the ground stops motion into it; leaving it (a hop) is untouched.
        const normalSpeed = _supportRel.dot(_supportUp);
        if (normalSpeed < 0) _supportRel.addScaledVector(_supportUp, -normalSpeed);

        // Tangential: stick when slow, otherwise Coulomb friction at μ·g.
        _supportSlide.copy(_supportRel).addScaledVector(_supportUp, -_supportRel.dot(_supportUp));
        const slideSpeed = _supportSlide.length();
        if (slideSpeed > 0) {
            const gravity =
                (G * simulationState.gMultiplier * Math.max(0, ground.mass)) /
                (distance * distance);
            const braked =
                slideSpeed <= SHIP_GROUND_STICK_SPEED
                    ? slideSpeed
                    : Math.min(slideSpeed, SHIP_SURFACE_FRICTION * gravity * dt);
            _supportRel.addScaledVector(_supportSlide, -braked / slideSpeed);
        }

        ship.velocity.copy(_supportFrame).add(_supportRel);
    }
}
