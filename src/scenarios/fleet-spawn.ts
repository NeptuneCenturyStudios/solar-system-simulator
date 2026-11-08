import * as THREE from 'three';

import type { IStateDependencies } from '../interfaces';
import type { Spaceship } from '../bodies/ships/spaceship';
import type { ShipTeam } from '../bodies/ships/ship-team';
import { CombatShipAI } from '../simulation/ai/combat-ship-ai';
import { createNpcShip, registerNpcShip } from '../simulation/ai/npc-manager';

/**
 * Helpers shared by the fleet-battle scenarios (Team Skirmish, Alien Invasion) for building
 * team ships, either inside a generator or live in a running scenario.
 */

/** Point a ship along `heading` (ships are +Z forward; lookAt aims -Z, hence the inversion). */
export function orientShipAlong(ship: Spaceship, heading: THREE.Vector3): void {
    const eye = ship.mesh.position.clone().add(heading);
    const m = new THREE.Matrix4().lookAt(eye, ship.mesh.position, new THREE.Vector3(0, 1, 0));
    ship.mesh.quaternion.setFromRotationMatrix(m);
    ship.controlFrameQuat.copy(ship.mesh.quaternion);
}

/** Put a ship on a team, with guidance forced on. */
export function enlistShip(ship: Spaceship, team: ShipTeam): void {
    ship.team = team;
    ship.guidanceEnabled = true;
    ship.guidanceLocked = true;
}

export interface ISpawnFleetShipOptions {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    shipTypeId: string;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    heading: THREE.Vector3;
    team: ShipTeam;
    name: string;
}

/**
 * Build a combat-AI ship on `team`, guidance locked on, facing `heading`. Like createNpcShip,
 * this does not touch the simulation — see {@link addShipLive} for a running scenario.
 */
export function spawnFleetShip(options: ISpawnFleetShipOptions): Spaceship {
    const ship = createNpcShip({
        dependencies: options.dependencies,
        scene: options.scene,
        position: options.position,
        velocity: options.velocity.clone(),
        shipTypeId: options.shipTypeId,
        name: options.name,
        team: options.team,
        ai: (s) => new CombatShipAI(s),
    });
    enlistShip(ship, options.team);
    orientShipAlong(ship, options.heading);
    return ship;
}

/**
 * Hand a ship built mid-scenario to the live simulation. Order matters: the body list first,
 * the NPC registry second, so the registry never holds a ship the physics loop cannot see.
 */
export function addShipLive(dependencies: IStateDependencies, ship: Spaceship): void {
    dependencies.addBody(ship);
    if (ship.ai) registerNpcShip(ship);
}
