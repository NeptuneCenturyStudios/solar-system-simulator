import * as THREE from 'three';
import type { IStateDependencies } from '../interfaces';
import { BlackHole } from '../bodies/black-hole';

export type ProceduralBlackHoleCreation = {
    id: string;
    name: string;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    mass: number;
    radius: number;
};

/**
 * Instantiates a scene-attached BlackHole from a procedural creation descriptor.
 */
export function createBlackHoleBodyFromProceduralCreation(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    creation: ProceduralBlackHoleCreation
): BlackHole {
    const { id, name, pos, mass, vel } = creation;
    return new BlackHole(dependencies, scene, { pos, vel, mass, id, name });
}
