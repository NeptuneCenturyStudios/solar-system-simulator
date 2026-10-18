import * as THREE from 'three';
import { muzzleWorldPosition } from '../ship-effects/weapons/weapon';
import type { Spaceship } from '../bodies/ships/spaceship';

/** Scratch vector — reused every call to keep the per-frame allocation count at zero. */
const _muzzle = new THREE.Vector3();

/**
 * Turn a ship's trigger state into weapon calls.
 *
 * The one place either pilot's intent becomes a shot: the player path writes `fire`/`aimDir`
 * from the reticle, a ShipAI writes them from its firing solution, and both arrive here. Muzzle
 * placement, rate of fire, thermal load and beam termination therefore cannot drift apart
 * between a player-flown ship and an AI-flown one — exactly the guarantee `controlInput` already
 * gives for handling.
 *
 * @param ship The ship whose control input to act on.
 * @param simDt Sim-time seconds this frame (wall dt × time scale). Load-bearing: a bolt weapon's
 *   rate-of-fire cooldown and thermal model both run on sim time, so slowing the time warp slows
 *   the rate of fire and the heat build-up along with everything else the ships do.
 */
export function applyWeaponInput(ship: Spaceship, simDt: number): void {
    if (ship.weapons.length === 0) return;

    const input = ship.controlInput;
    // aimDir is only meaningful while the trigger is held, and a ship that has never aimed still
    // carries a zero vector — firing on that would shoot along an undefined bearing.
    if (input.fire && input.aimDir.lengthSq() > 0) {
        ship.fireWeapon(simDt, muzzleWorldPosition(ship, _muzzle), input.aimDir, input.target);
    } else {
        ship.stopFire();
    }
}
