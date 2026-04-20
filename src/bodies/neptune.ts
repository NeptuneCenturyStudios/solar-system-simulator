import * as THREE from 'three';

import { CelestialBody } from './celestial-body.js';
import { calculateTrajectory } from '../physics/physics.js';
import { BodyType, createUniqueId } from '../utilities/utilities.js';
import { NEPTUNE_DIST, NEPTUNE_MASS, SUN_MASS, NEPTUNE_RADIUS } from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

export class Neptune extends CelestialBody {
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, neptuneTexture: THREE.Texture) {
        const trajectory = calculateTrajectory(NEPTUNE_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: neptuneTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        super(
            dependencies,
            scene,
            NEPTUNE_RADIUS,
            0x4169e1,
            trajectory.pos,
            trajectory.vel,
            NEPTUNE_MASS,
            createUniqueId('neptune'),
            'Neptune',
            BodyType.IceGiant,
            0x6688ff,
            18000,
            false,
            { axis: new THREE.Vector3(0, 1, 0), speed: 0.4 },
            undefined,
            material
        );
    }
}
