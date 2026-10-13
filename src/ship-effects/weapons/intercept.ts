import * as THREE from 'three';

/** Below this the intercept quadratic's leading coefficient is treated as zero. */
export const INTERCEPT_EPSILON = 1e-12;

// Scratch vectors — reused every call to keep the per-frame allocation count at zero.
const _r = new THREE.Vector3();
const _w = new THREE.Vector3();

/**
 * Time of flight to an intercept, or a negative number when no shot exists.
 *
 * Solved in the shooter's frame. A bolt leaves with world velocity `dir * S + shipVelocity`
 * (Galilean — see BoltWeapon.tryFire), so working relative to the shooter cancels its own
 * velocity out of the problem entirely and leaves the standard quadratic:
 *
 *     | r + w·t | = S·t        with r the offset to the target and w its relative velocity
 *     (|w|² − S²)·t² + 2(r·w)·t + |r|² = 0
 *
 * The relative form is not a refinement here — both ships share a large orbital velocity, and
 * solving in world coordinates would put the lead point hundreds of metres out.
 *
 * @param r Offset from muzzle to target.
 * @param w Target velocity relative to the shooter.
 * @param s Projectile muzzle speed. Infinity for a hitscan weapon (e.g. the laser), which
 *   collapses the solve to "aim where the target is now".
 */
export function interceptTime(r: THREE.Vector3, w: THREE.Vector3, s: number): number {
    if (!Number.isFinite(s)) return 0; // hitscan — no lead needed

    const a = w.lengthSq() - s * s;
    const b = 2 * r.dot(w);
    const c = r.lengthSq();

    // Target closing at exactly projectile speed: the quadratic degenerates to a line.
    if (Math.abs(a) < INTERCEPT_EPSILON) {
        return b < 0 ? -c / b : -1;
    }

    const disc = b * b - 4 * a * c;
    // Only reachable when the target outruns the projectile (|w| > S), which a boosting ship
    // can do. There is genuinely no intercept.
    if (disc < 0) return -1;

    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    // Soonest arrival that is actually in the future.
    const lo = Math.min(t1, t2);
    const hi = Math.max(t1, t2);
    if (lo > 0) return lo;
    if (hi > 0) return hi;
    return -1;
}

/**
 * Unit aim direction from `muzzle` to the target's intercept point, in the shooter's frame —
 * the same lead CombatShipAI fires along, so the player's target assist and an AI pilot
 * agree on where a moving target will be.
 *
 * Falls back to the target's current position when no intercept exists (the target outruns
 * the projectile), so the caller always gets a usable bearing.
 *
 * @param muzzle World position the shot leaves from.
 * @param targetPos Target's current world position.
 * @param targetVel Target's world velocity.
 * @param shooterVel Shooter's world velocity — inherited by the projectile.
 * @param muzzleSpeed Projectile muzzle speed (Infinity for hitscan).
 * @param out Receives the unit direction. May alias none of the inputs.
 * @returns `out`.
 */
export function leadAimDirection(
    muzzle: THREE.Vector3,
    targetPos: THREE.Vector3,
    targetVel: THREE.Vector3,
    shooterVel: THREE.Vector3,
    muzzleSpeed: number,
    out: THREE.Vector3
): THREE.Vector3 {
    _r.subVectors(targetPos, muzzle);
    _w.subVectors(targetVel, shooterVel);
    const t = interceptTime(_r, _w, muzzleSpeed);
    return out.copy(_r).addScaledVector(_w, Math.max(t, 0)).normalize();
}
