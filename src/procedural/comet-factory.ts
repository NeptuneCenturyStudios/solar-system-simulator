import * as THREE from 'three';
import type { IStateDependencies } from '../interfaces';
import { GenericComet } from '../bodies/generic-comet';
import type { IPlanetaryAttributes } from '../bodies/body-attributes';

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

    /** Index into the system's star array this comet orbits, or -1 for a P-type orbit. */
    hostStarIndex: number;

    /** Hidden/discoverable science data. */
    attributes: IPlanetaryAttributes;
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
        attributes,
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
        attributes,
    });
}
