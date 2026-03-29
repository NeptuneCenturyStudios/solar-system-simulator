import * as THREE from 'three';

import { CelestialBody } from './celestial-body.js';
import { calculateTrajectory } from '../physics/physics.js';
import { BodyType, createUniqueId } from '../utilities/utilities.js';
import { SUN_MASS, JUPITER_DIST, JUPITER_MASS, JUPITER_RADIUS } from '../utilities/consts.js';

export class Jupiter extends CelestialBody {
    constructor(dependencies, scene, jupiterTexture) {
        const trajectory = calculateTrajectory(JUPITER_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: jupiterTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.85,
        });

        super(
            dependencies,
            scene,
            JUPITER_RADIUS,
            0xffaa33,
            trajectory.pos.toArray(),
            trajectory.vel.toArray(),
            JUPITER_MASS, // Mass
            createUniqueId('jupiter'),
            'Jupiter',
            BodyType.GasGiant,
            0xffcc88,
            5000,
            false,
            false,        
            { axis: [0, 1, 0], speed: 0.55 },
            null,
            material
        );
    }
}
