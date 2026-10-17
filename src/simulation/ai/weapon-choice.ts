import * as THREE from 'three';
import {
    AI_SHIELD_DOWN_FRACTION,
    AI_SHIELD_UP_FRACTION,
    AI_WEAPON_HEAT_PENALTY,
} from '../../utilities/consts';
import type { Spaceship } from '../../bodies/ships/spaceship';
import type { Weapon } from '../../ship-effects/weapons/weapon';

/**
 * How much the target's shield should count when scoring weapons: 1 while it is up, 0 once it
 * is down, blending smoothly in between (see AI_SHIELD_DOWN_FRACTION / AI_SHIELD_UP_FRACTION).
 * A ship with no shield capacity is all hull.
 */
export function shieldWeight(target: Spaceship): number {
    const fraction = target.maxShieldPoints > 0 ? target.shieldPoints / target.maxShieldPoints : 0;
    return THREE.MathUtils.smoothstep(fraction, AI_SHIELD_DOWN_FRACTION, AI_SHIELD_UP_FRACTION);
}

/**
 * How good a choice `weapon` is against a target at `range`, given how much its shield counts
 * (`shieldW`, from {@link shieldWeight}). 0 when the weapon can't fire or can't reach.
 *
 * Scored on effectiveness against the layer being hit — not raw damage per second — so the
 * pick follows each weapon's role: the laser strips shields, missiles crack hulls, bolts are
 * the all-rounder. Then scaled by range falloff, and discounted by heat so a hot mount gives
 * way to a cool one before it locks out.
 *
 * @param range Hull-to-hull distance, sim units.
 */
export function weaponScore(weapon: Weapon, range: number, shieldW: number): number {
    if (weapon.isOverheated || range > weapon.effectiveRange) return 0;
    const eff = weapon.damageEffectiveness;
    const layer = THREE.MathUtils.lerp(eff.hull, eff.shield, shieldW);
    const heat = 1 - AI_WEAPON_HEAT_PENALTY * weapon.thermalLoad;
    return Math.max(0, layer * weapon.damageFalloffAt(range) * heat);
}
