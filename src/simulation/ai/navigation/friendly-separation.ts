import * as THREE from 'three';
import type { Spaceship } from '../../../bodies/ships/spaceship';
import { areFriendly } from '../../teams';
import { simulationState } from '../../simulation';

/**
 * Light separation steering between teammates.
 *
 * Obstacle avoidance deliberately ignores spaceships (they are small, fast and everywhere), so
 * without this a team of AI ships converging on the same target would stack up nose to tail.
 * Each teammate inside SEPARATION_RADII × (combined radii) bends the heading away from it,
 * weighted by how deep inside that bubble it is. The result stays a unit heading; it is a
 * nudge, capped at MAX_WEIGHT, never a full turn.
 *
 * Unaligned ships (team null) are left untouched.
 */

/** Separation bubble, as a multiple of the two ships' combined radii. */
const SEPARATION_RADII = 6;
/** Largest share of the heading the separation term may take over. */
const MAX_WEIGHT = 0.6;

const _away = new THREE.Vector3();
const _push = new THREE.Vector3();

/**
 * Bend `heading` (unit vector, modified in place) away from nearby teammates.
 * @returns `heading`, for chaining.
 */
export function applyFriendlySeparation(ship: Spaceship, heading: THREE.Vector3): THREE.Vector3 {
    if (ship.team === null || !ship.mesh) return heading;
    _push.set(0, 0, 0);
    for (const other of simulationState.npcShips) {
        if (other === ship || other._isDisposed || !other.mesh || !areFriendly(ship, other)) {
            continue;
        }
        const bubble = (ship.radius + other.radius) * SEPARATION_RADII;
        _away.subVectors(ship.mesh.position, other.mesh.position);
        const d = _away.length();
        if (d >= bubble || d < 1e-12) continue;
        // 0 at the bubble edge → 1 in contact.
        _push.addScaledVector(_away, (1 - d / bubble) / d);
    }
    const strength = _push.length();
    if (strength < 1e-9) return heading;
    const weight = Math.min(MAX_WEIGHT, strength);
    _push.divideScalar(strength);
    heading.multiplyScalar(1 - weight).addScaledVector(_push, weight);
    if (heading.lengthSq() < 1e-12) return heading;
    return heading.normalize();
}
