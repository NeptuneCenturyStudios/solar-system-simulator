import * as THREE from 'three';
import { Body } from '../../bodies/body';
import { IDamageEffectiveness } from '../../interfaces';
import { IWeaponOwner, Weapon, muzzleWorldPosition } from './weapon';

/** Scratch vectors — reused every call to keep the per-frame allocation count at zero. */
const _convergence = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * One selectable entry in a ship's loadout: a set of weapons that fire together on a single
 * trigger pull. A pair of wing turrets is one group of two lasers; a nose launcher is a group of
 * one. The pilot (and the combat AI) cycles between groups, never between the members of one.
 *
 * Every member fires on its own, from its own mount, with its own heat, cooldown and hits, so a
 * group of n identical weapons deals n times the damage of one. Members are expected to be the
 * same weapon type: the group's name, muzzle speed, range and effectiveness are read off the
 * first one.
 *
 * Only the first member makes a sound, so a group fires with one voice instead of n stacked
 * copies of the same clip.
 */
export class WeaponGroup {
    /** The mounts in this group, in loadout order. Never empty. */
    readonly weapons: readonly Weapon[];

    constructor(weapons: Weapon[]) {
        if (weapons.length === 0) throw new Error('WeaponGroup needs at least one weapon');
        this.weapons = weapons;
        for (let i = 1; i < weapons.length; i++) weapons[i].soundEnabled = false;
    }

    /** The member the group's shared stats are read from. */
    private get lead(): Weapon {
        return this.weapons[0];
    }

    /** Number of mounts that fire together. */
    get size(): number {
        return this.weapons.length;
    }

    /** HUD name: the weapon's name, with the mount count when there is more than one. */
    get displayName(): string {
        const name = this.lead.displayName;
        return this.weapons.length > 1 ? `${name} ×${this.weapons.length}` : name;
    }

    /** See Weapon.muzzleSpeed. */
    get muzzleSpeed(): number {
        return this.lead.muzzleSpeed;
    }

    /** See Weapon.damageEffectiveness. */
    get damageEffectiveness(): Readonly<IDamageEffectiveness> {
        return this.lead.damageEffectiveness;
    }

    /** See Weapon.effectiveRange. */
    get effectiveRange(): number {
        return this.lead.effectiveRange;
    }

    /** See Weapon.damageFalloffAt. */
    damageFalloffAt(distance: number): number {
        return this.lead.damageFalloffAt(distance);
    }

    /** Hottest member's thermal load — the one that will lock out first. */
    get thermalLoad(): number {
        let heat = 0;
        for (const weapon of this.weapons) heat = Math.max(heat, weapon.thermalLoad);
        return heat;
    }

    /** True only once every member is locked out; until then the group can still fire. */
    get isOverheated(): boolean {
        return this.weapons.every((weapon) => weapon.isOverheated);
    }

    /**
     * Pull the trigger on every member. Each fires from its own muzzle toward the convergence
     * point `aimDistance` along `aimDir` from the owner's nose muzzle, so splayed mounts (wing
     * turrets) cross on whatever the pilot is aiming at.
     *
     * @param dt Sim-time seconds this frame (drives cooldown and heat).
     * @param aimDir World-space unit aim direction from the owner's nose muzzle.
     * @param aimDistance Distance along `aimDir` to converge at; Infinity fires every mount
     *   parallel to `aimDir`.
     * @param target Locked target for homing weapons; ignored by unguided ones.
     */
    fire(
        dt: number,
        owner: IWeaponOwner,
        aimDir: THREE.Vector3,
        aimDistance: number,
        target: Body | null
    ): void {
        const converge = Number.isFinite(aimDistance) && aimDistance > 0;
        if (converge) {
            muzzleWorldPosition(owner, _convergence).addScaledVector(aimDir, aimDistance);
        }

        for (const weapon of this.weapons) {
            muzzleWorldPosition(owner, _origin, weapon);
            _dir.copy(aimDir);
            if (converge) {
                _dir.subVectors(_convergence, _origin);
                // A convergence point at or behind this mount (target closer than the mount's
                // offset) would turn the shot sideways or backwards — fire straight instead.
                if (_dir.dot(aimDir) > 0) _dir.normalize();
                else _dir.copy(aimDir);
            }
            weapon.tryFire(dt, _origin, _dir, owner.velocity, target);
        }
    }

    /** Release the trigger on every member. */
    stopFire(): void {
        for (const weapon of this.weapons) weapon.stopFire();
    }
}
