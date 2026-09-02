import * as THREE from 'three';
import { Spaceship } from '../../bodies/ships/spaceship';
import { getShipTypeById } from '../../bodies/ships/ship-registry';
import { Body } from '../../bodies/body';
import { createUniqueId } from '../../utilities/utilities';
import { flightState, simulationState } from '../simulation';
import { FollowShipAI } from './follow-ship-ai';

/**
 * Registry and lifecycle for AI-piloted (non-player) ships.
 *
 * NPC ships are ordinary bodies in `simulationState.bodies` — gravity, collision
 * and weapons all apply to them normally. This module keeps the parallel
 * `simulationState.npcShips` list so the animation loop and physics substep can
 * drive their controllers without scanning every body each frame.
 */

/** Scratch vector reused by stepNpcShips — avoids a per-ship, per-frame allocation. */
const _npcForward = new THREE.Vector3();

/** Options for building an NPC ship. */
export interface ICreateNpcShipOptions {
    /** Shared dependency bag passed through to the ship constructor. */
    dependencies: object;
    scene: THREE.Scene;
    /** World position to spawn at. */
    position: THREE.Vector3;
    /** Initial velocity (e.g. an orbital velocity so it doesn't fall into the star). */
    velocity: THREE.Vector3;
    /** Ship type id from ship-registry.ts. Falls back to the first registered type. */
    shipTypeId?: string;
    /** Display name. Defaults to the ship type's own name. */
    name?: string;
}

/** Add a ship to the NPC registry. Safe to call twice. */
export function registerNpcShip(ship: Spaceship): void {
    if (!simulationState.npcShips.includes(ship)) {
        simulationState.npcShips.push(ship);
    }
}

/**
 * Remove a body from the NPC registry, if it is one. Called from the body:dead
 * and body:removed handlers, so it accepts any Body rather than just a Spaceship.
 */
export function unregisterNpcShip(body: Body | null | undefined): void {
    if (!body) return;
    const index = simulationState.npcShips.indexOf(body as Spaceship);
    if (index !== -1) {
        simulationState.npcShips.splice(index, 1);
    }
}

/** Drop every NPC from the registry. Called during system teardown. */
export function clearNpcShips(): void {
    simulationState.npcShips.length = 0;
}

/**
 * Build an AI-piloted ship, ready to be added to a system's body list.
 *
 * This deliberately does NOT touch `simulationState` — a SolarSystemGenerator
 * runs asynchronously, before its bodies have been handed to the simulation, and
 * a ship in the NPC registry but not yet in `simulationState.bodies` would be
 * flown by its AI while gravity was not yet acting on it. Generators push the
 * returned ship into their own `bodies` array; `registerNpcShipsIn()` then picks
 * it up once the system goes live.
 *
 * @returns The new ship, with its controller attached.
 */
export function createNpcShip(options: ICreateNpcShipOptions): Spaceship {
    const shipType = getShipTypeById(options.shipTypeId);
    const ship = shipType.create(
        options.dependencies,
        options.scene,
        options.position,
        options.velocity,
        createUniqueId('npc-ship')
    );

    if (options.name) ship.name = options.name;

    // Attach the controller. This is the whole pluggable-AI seam: swap this line
    // for a different ShipAI subclass and the ship flies to different rules.
    ship.ai = new FollowShipAI(ship);

    // NPC ships keep their label visible — unlike the player's ship, which hides
    // its label so it doesn't clutter the cockpit view.
    if (ship.label) ship.label.visible = true;
    if (ship.labelLine) ship.labelLine.visible = true;

    // Engine trail, same as the player's ship gets on flight entry.
    ship.trail.init();

    return ship;
}

/**
 * Register every AI-piloted ship found in `bodies`.
 *
 * Called by spawn() in index.ts once a generated system has been handed to
 * `simulationState.bodies`, so any scenario generator can include AI ships in
 * its output and have them picked up automatically — no per-scenario wiring.
 */
export function registerNpcShipsIn(bodies: Body[]): void {
    for (const body of bodies) {
        if (body instanceof Spaceship && body.ai) registerNpcShip(body);
    }
}

/**
 * Run one frame of every NPC controller.
 *
 * Frame-level only: each AI writes its intent into its ship's controlInput, and
 * the resulting steering/roll is folded into the ship's control frame and mesh
 * orientation. Thrust is applied separately, per physics substep, by
 * `updateSimulation()` in physics.ts — that split mirrors how the player's ship
 * is driven, and is what keeps AI thrust correctly interleaved with gravity at
 * high time-warp.
 *
 * @param dt    Wall-clock seconds since the previous frame (not time-scaled).
 * @param simDt Sim-time seconds advanced this frame (wall dt × time scale).
 */
export function stepNpcShips(dt: number, simDt: number): void {
    if (simulationState.isPaused || simulationState.timeScale === 0) return;

    for (const ship of simulationState.npcShips) {
        if (!ship || ship._isDisposed || !ship.mesh || !ship.ai) continue;
        // If the player has taken this ship over, or the autopilot has it, they
        // own the controls this frame — the AI stands down.
        if (ship === flightState.activeShip || ship.autopilotActive) continue;

        // Advance any warp/boost/stop deceleration first. These phases are driven
        // frame-level (not per substep), and while one is active
        // applyFlightThrustSubstep() deliberately refuses to add thrust — so
        // without this the ship would enter boostDecelerating on a boost release
        // and stay stuck there forever, coasting at boost speed with the AI
        // unable to slow it down. updateFlightControls() does the same for the
        // player's ship, and animation-loop.ts for the parked known ship.
        if (
            ship.warpActive ||
            ship.warpDecelerating ||
            ship.boostDecelerating ||
            ship.stopBraking
        ) {
            _npcForward.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
            ship.advanceWarpSpeed(simDt, _npcForward);
        }

        ship.ai.update(dt);
        ship.applyFrameOrientation(dt);
    }
}
