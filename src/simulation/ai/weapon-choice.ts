import * as THREE from 'three';
import {
    AI_SHIELD_DOWN_FRACTION,
    AI_SHIELD_UP_FRACTION,
    AI_WEAPON_HEAT_PENALTY,
} from '../../utilities/consts';
import type { Body } from '../../bodies/body';
import type { Spaceship } from '../../bodies/ships/spaceship';
import type { WeaponGroup } from '../../ship-effects/weapons/weapon-group';

/** True for a body that carries a shield (a ship). Structural, to keep this module type-only. */
function isShielded(target: Body): target is Spaceship {
    return 'maxShieldPoints' in target;
}

/**
 * How much the target's shield should count when scoring weapons: 1 while it is up, 0 once it
 * is down, blending smoothly in between (see AI_SHIELD_DOWN_FRACTION / AI_SHIELD_UP_FRACTION).
 * A ship with no shield capacity — or a target that isn't a ship at all, such as a planet — is
 * all hull.
 */
export function shieldWeight(target: Body): number {
    if (!isShielded(target)) return 0;
    const fraction = target.maxShieldPoints > 0 ? target.shieldPoints / target.maxShieldPoints : 0;
    return THREE.MathUtils.smoothstep(fraction, AI_SHIELD_DOWN_FRACTION, AI_SHIELD_UP_FRACTION);
}

/**
 * How good a choice weapon `group` is against a target at `range`, given how much its shield
 * counts (`shieldW`, from {@link shieldWeight}). 0 when the group can't fire or can't reach.
 *
 * Scored on effectiveness against the layer being hit — not raw damage per second — so the
 * pick follows each weapon's role: the laser strips shields, missiles crack hulls, bolts are
 * the all-rounder. Then scaled by range falloff, and discounted by heat so a hot mount gives
 * way to a cool one before it locks out. Finally multiplied by the group's mount count, since
 * every mount fires and hits on its own: a pair of lasers does twice what one does.
 *
 * @param range Hull-to-hull distance, sim units.
 */
export function weaponScore(group: WeaponGroup, range: number, shieldW: number): number {
    if (group.isOverheated || range > group.effectiveRange) return 0;
    const eff = group.damageEffectiveness;
    const layer = THREE.MathUtils.lerp(eff.hull, eff.shield, shieldW);
    const heat = 1 - AI_WEAPON_HEAT_PENALTY * group.thermalLoad;
    return Math.max(0, layer * group.damageFalloffAt(range) * heat * group.size);
}
