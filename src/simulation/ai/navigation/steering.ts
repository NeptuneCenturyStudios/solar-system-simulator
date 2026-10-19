import * as THREE from 'three';
import { AI_STEER_FULL_DEFLECTION_ANGLE } from '../../../utilities/consts';
import type { Spaceship } from '../../../bodies/ships/spaceship';

// Scratch — reused every call to keep the per-frame allocation count at zero.
const _local = new THREE.Vector3();
const _invFrame = new THREE.Quaternion();

/**
 * Put the stick over toward a world-space heading.
 *
 * The heading is expressed in the ship's own control frame and the yaw/pitch error turned
 * into stick deflection, so the turn is rate-limited and smoothed by the ship's handling
 * exactly as a human pilot's would be.
 *
 * Sign convention: ships are +Z forward / +Y up, which puts the pilot's right at -X.
 * applySteering() computes yawDelta = -steerX * turnRate and pitchDelta = +steerY * turnRate
 * and post-multiplies both onto the control frame, so both errors are negated here to steer
 * *toward* the heading rather than away from it.
 *
 * Shared by every ship AI — the follow and combat controllers and the autopilot all steer
 * through this one function.
 *
 * @param ship The ship whose `controlInput` is written.
 * @param heading Unit direction to turn toward, in world space.
 */
export function steerToward(ship: Spaceship, heading: THREE.Vector3): void {
    const input = ship.controlInput;

    _invFrame.copy(ship.controlFrameQuat).invert();
    _local.copy(heading).applyQuaternion(_invFrame);

    const yawErr = Math.atan2(_local.x, _local.z);
    const pitchErr = Math.atan2(_local.y, Math.hypot(_local.x, _local.z));

    input.steerX = THREE.MathUtils.clamp(-yawErr / AI_STEER_FULL_DEFLECTION_ANGLE, -1, 1);
    input.steerY = THREE.MathUtils.clamp(-pitchErr / AI_STEER_FULL_DEFLECTION_ANGLE, -1, 1);

    // These controllers don't roll — banking is applied visually by applySteering().
    input.rollLeft = false;
    input.rollRight = false;
}
