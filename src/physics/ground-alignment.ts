import * as THREE from 'three';
import { Body } from '../bodies/body';
import { Spaceship } from '../bodies/ships/spaceship';
import { flightState } from '../simulation/simulation';
import {
    G,
    SHIP_GROUND_SETTLE_TIME_FACTOR,
    SHIP_GROUND_SETTLE_TIME_MAX,
    SHIP_GROUND_SETTLE_TIME_MIN,
    SHIP_GROUNDED_CLEARANCE_FRACTION,
} from '../utilities/consts';
import { surfaceClearance } from './collision';

/**
 * Per-ship grounded state: the body it rests on and that body's orientation when last seen, so
 * each frame can carry the ship through exactly the rotation the ground made since.
 */
interface IGroundState {
    body: Body;
    prevBodyQuat: THREE.Quaternion;
}

const _groundStates = new WeakMap<Spaceship, IGroundState>();

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
 * Rotates `ship` by the world-space rotation `q`, keeping every orientation that describes it in
 * step: the mesh, the control frame (mesh = frame × bank, so a world-space premultiply preserves
 * the bank), and — for the ship being flown — the flight camera frame, which
 * updateFlightControls() copies back into the control frame at the start of the next frame.
 */
function rotateShip(ship: Spaceship, q: THREE.Quaternion): void {
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
 * 1. **Co-rotation.** The ship is turned by the same rotation the ground body made since the last
 *    frame. Friction already carries its *position* around with the spin (see resolveShipContact);
 *    this carries its *attitude*, so a parked ship keeps its heading relative to the ground.
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
        if (ship._isDisposed || !ship.mesh) continue;

        // ── Grounded? A contact this frame, or still touching the body it was resting on ──
        let state = _groundStates.get(ship);
        let ground: Body | null = contact;
        if (!ground && state && !state.body._isDisposed && state.body.mesh) {
            const tolerance = ship.radius * SHIP_GROUNDED_CLEARANCE_FRACTION;
            if (surfaceClearance(ship, state.body) <= tolerance) ground = state.body;
        }
        if (!ground || ground._isDisposed || !ground.mesh) {
            ship.isGrounded = false;
            ship.groundBody = null;
            _groundStates.delete(ship);
            continue;
        }
        ship.isGrounded = true;
        ship.groundBody = ground;

        // Newly grounded, or now resting on a different body: start tracking from here.
        if (!state || state.body !== ground) {
            state = { body: ground, prevBodyQuat: ground.mesh.quaternion.clone() };
            _groundStates.set(ship, state);
            continue;
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
