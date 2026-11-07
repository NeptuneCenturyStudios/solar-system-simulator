import * as THREE from 'three';
import { Body } from '../bodies/body';
import { Spaceship } from '../bodies/ships/spaceship';
import { surfaceClearance, surfaceVelocityAt } from '../physics/collision';
import { groundedClearanceTolerance } from '../physics/ground-alignment';
import {
    SHIP_LAUNCH_CHARGE_TIME,
    SHIP_LAUNCH_LIFT_HEIGHT,
    SHIP_LAUNCH_LIFT_TIME,
} from '../utilities/consts';

/**
 * Lift-off for grounded ships.
 *
 * A ship on the ground has every flight control locked (Spaceship.controlsLocked). Holding the
 * launch input (W for the player) charges a launch, the same way holding Space charges warp;
 * releasing early cancels it. Once charged, the ship climbs straight up off the surface at a steady
 * rate — riding along with the ground's motion, gravity held off — until it is
 * {@link launchLiftHeight} clear, then flight controls are handed back with the small climb rate it
 * left with. From there it is an ordinary ship: if the pilot does nothing, gravity brings it back
 * down and it grounds again.
 */

/** Ships currently lifting off, stepped every physics substep by {@link applyLaunchLiftSubsteps}. */
const _lifting = new Set<Spaceship>();

const _up = new THREE.Vector3();

/**
 * How high `ship` climbs before controls return: SHIP_LAUNCH_LIFT_HEIGHT, or twice the grounded
 * tolerance (see groundedClearanceTolerance) if that is higher, so a finished lift is never still
 * counted as grounded.
 */
export function launchLiftHeight(ship: Spaceship): number {
    return Math.max(SHIP_LAUNCH_LIFT_HEIGHT, 2 * groundedClearanceTolerance(ship));
}

/** Launch charge progress in [0, 1] while charging, otherwise 0. */
export function launchChargeFill(ship: Spaceship): number {
    if (ship.launchPhase !== 'charging') return 0;
    return Math.min(1, ship.launchChargeTimer / SHIP_LAUNCH_CHARGE_TIME);
}

/** Abort an in-progress launch charge. A lift already under way is left to finish. */
export function cancelLaunchCharge(ship: Spaceship): void {
    if (ship.launchPhase !== 'charging') return;
    ship.launchPhase = 'idle';
    ship.launchChargeTimer = 0;
}

/**
 * Advance the launch charge for one frame.
 *
 * @param ship The ship.
 * @param wantLaunch Whether the launch input is held this frame.
 * @param dt Wall-clock seconds (the warp charge's clock), 0 while paused.
 * @returns True on the frame the charge completes and the lift begins.
 */
export function updateLaunchCharge(ship: Spaceship, wantLaunch: boolean, dt: number): boolean {
    if (ship.launchPhase === 'lifting') return false;

    const ground = ship.groundBody;
    if (!ship.isGrounded || !ground || !wantLaunch) {
        cancelLaunchCharge(ship);
        return false;
    }

    if (ship.launchPhase === 'idle') {
        ship.launchPhase = 'charging';
        ship.launchChargeTimer = 0;
    }
    ship.launchChargeTimer = Math.min(ship.launchChargeTimer + dt, SHIP_LAUNCH_CHARGE_TIME);
    if (ship.launchChargeTimer < SHIP_LAUNCH_CHARGE_TIME) return false;

    ship.launchPhase = 'lifting';
    ship.launchChargeTimer = 0;
    ship.launchBody = ground;
    _lifting.add(ship);
    return true;
}

/**
 * Append the body each lifting ship is climbing away from to `out`, so the physics substep loop
 * can keep those bodies' positions and velocities live for {@link applyLaunchLiftSubsteps}.
 */
export function collectLaunchBodies(out: Body[]): void {
    for (const ship of _lifting) {
        if (ship.launchBody) out.push(ship.launchBody);
    }
}

/** End a lift and hand the controls back. */
function finishLift(ship: Spaceship): void {
    ship.launchPhase = 'idle';
    ship.launchBody = null;
    ship.isGrounded = false;
    ship.groundBody = null;
    _lifting.delete(ship);
}

/**
 * Step every lifting ship for one physics substep. Each one's velocity is set to the ground's own
 * velocity under it (translation and spin, so it rises straight up from where it sat) plus a steady
 * climb along the local vertical; resetting it every substep holds gravity off for the climb.
 *
 * @param dt Sim seconds in this substep.
 */
export function applyLaunchLiftSubsteps(dt: number): void {
    if (_lifting.size === 0 || !(dt > 0)) return;

    for (const ship of _lifting) {
        const body = ship.launchBody;
        if (ship._isDisposed || !ship.mesh) {
            _lifting.delete(ship);
            continue;
        }
        if (!body || body._isDisposed || !body.mesh) {
            finishLift(ship);
            continue;
        }

        const height = launchLiftHeight(ship);
        if (surfaceClearance(ship, body) >= height) {
            finishLift(ship);
            continue;
        }

        _up.subVectors(ship.mesh.position, body.mesh.position);
        const distance = _up.length();
        if (distance < 1e-12) {
            finishLift(ship);
            continue;
        }
        _up.divideScalar(distance);

        surfaceVelocityAt(body, ship.mesh.position, ship.velocity);
        ship.velocity.addScaledVector(_up, height / SHIP_LAUNCH_LIFT_TIME);
    }
}
