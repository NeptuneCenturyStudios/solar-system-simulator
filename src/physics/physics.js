import * as THREE from '../vendors/three.module.js'
import { G } from '../utilities/consts.js'

/**
 * Calculate position and velocity for a circular orbit
 * @param {number} distance 
 * @param {number} parentMass 
 * @returns 
 */
export function calculateTrajectory(distance, parentMass) {
    const speed = Math.sqrt((G * parentMass) / distance)

    // Position Jupiter on the X axis
    const pos = new THREE.Vector3(distance, 0, 0)

    // Velocity must be on the Z axis (perpendicular to X) to start a circular orbit
    const vel = new THREE.Vector3(0, 0, speed)

    return { pos, vel }
}