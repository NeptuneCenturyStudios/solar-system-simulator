import * as THREE from 'three';
import type { IStateDependencies } from '../interfaces';
import { GenericComet } from '../bodies/generic-comet';

export type ProceduralCometCreation = {
    id: string;
    name: string;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    radius: number;
    mass: number;
    rotationSpeed: number;
    rotationTilt: number;
    rotationAzimuth: number;
    tailColor: number;
};

/**
 * Instantiates a scene-attached GenericComet from a procedural creation descriptor.
 */
export function createCometBodyFromProceduralCreation(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    creation: ProceduralCometCreation
): GenericComet {
    const {
        id,
        name,
        pos,
        vel,
        radius,
        mass,
        rotationSpeed,
        rotationTilt,
        rotationAzimuth,
        tailColor,
    } = creation;

    return new GenericComet(dependencies, scene, {
        id,
        name,
        pos,
        vel,
        radius,
        mass,
        rotation: { tilt: rotationTilt, speed: rotationSpeed, azimuth: rotationAzimuth },
        tailColor,
    });
}
