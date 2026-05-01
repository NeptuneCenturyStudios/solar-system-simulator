import * as THREE from 'three';
import { G } from '../utilities/consts';

/**
 * Represents the rotation of a body in 3D space
 */
export interface IRotation {
    axis: THREE.Vector3;
    speed: number;
}

/**
 * Calculate position and velocity for a circular orbit around a parent body
 * @param {number} distance The distance from the parent body at which the orbit is calculated
 * @param {number} parentMass The mass of the parent body around which the orbit is calculated
 * @returns An object containing the position and velocity vectors for the circular orbit
 */
export function calculateTrajectory(distance: number, parentMass: number) {
    const speed = Math.sqrt((G * parentMass) / distance);

    // Position body on the X axis
    const pos = new THREE.Vector3(distance, 0, 0);

    // Velocity must be on the Z axis (perpendicular to X) to start a circular orbit
    const vel = new THREE.Vector3(0, 0, speed);

    return { pos, vel };
}
