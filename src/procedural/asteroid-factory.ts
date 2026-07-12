import * as THREE from 'three';
import type { IStateDependencies } from '../interfaces';
import { Asteroid } from '../bodies/asteroid';

export type ProceduralAsteroidCreation = {
    id: string;
    name: string;
    pos: THREE.Vector3;
    vel: THREE.Vector3;

    radius: number;
    mass: number;
    rotationSpeed: number;
    rotationTilt: number;
    rotationAzimuth: number;
};

/**
 * Instantiates a scene-attached Asteroid from a procedural creation descriptor.
 *
 * Shared by both the procedural generation pipeline and the custom asteroid
 * creation flow so both paths use identical construction logic.
 */
export function createAsteroidBodyFromProceduralCreation(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    creation: ProceduralAsteroidCreation
): Asteroid {
    const { id, name, pos, vel, radius, mass, rotationSpeed, rotationTilt, rotationAzimuth } = creation;

    return new Asteroid(dependencies, scene, {
        id,
        name,
        pos,
        vel,
        radius,
        mass,
        rotation: { tilt: rotationTilt, speed: rotationSpeed, azimuth: rotationAzimuth },
    });
}
