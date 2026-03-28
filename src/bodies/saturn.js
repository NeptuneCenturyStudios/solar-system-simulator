import * as THREE from 'three';

import { CelestialBody } from './celestial-body.js';
import { calculateTrajectory } from '../physics/physics.js';
import { BodyType, createUniqueId } from '../utilities/utilities.js';
import { SATURN_DIST, SATURN_MASS, SUN_MASS, SATURN_RADIUS } from '../utilities/consts.js';

export class Saturn extends CelestialBody {
    constructor(dependencies, scene, saturnTexture) {
        const trajectory = calculateTrajectory(SATURN_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: saturnTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        super(
            dependencies,
            scene,
            SATURN_RADIUS,
            0xe6cc80,
            trajectory.pos.toArray(),
            trajectory.vel.toArray(),
            SATURN_MASS,
            createUniqueId('saturn'),
            'Saturn',
            BodyType.GasGiant,
            0xffeebb,
            12000,
            true,
            true,
            false,
            { axis: [0, 1, 0], speed: 0.5 },
            null,
            material
        );
    }
}
