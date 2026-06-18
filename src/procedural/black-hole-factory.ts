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

    const bh = new BlackHole(
        dependencies,
        scene,
        pos,
        mass,
        id,
        name,
        { tilt: 0, speed: 0 },
        false // not spawned from supernova
    );

    bh.velocity.copy(vel);
    return bh;
}
