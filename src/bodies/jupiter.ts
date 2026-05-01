import * as THREE from 'three';

import { CelestialBody } from './celestial-body.js';
import { calculateTrajectory } from '../physics/physics.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import { SUN_MASS, JUPITER_DIST, JUPITER_MASS, JUPITER_RADIUS } from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

export class Jupiter extends CelestialBody {
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        jupiterTexture: THREE.Texture
    ) {
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
            trajectory.pos,
            trajectory.vel,
            JUPITER_MASS,
            createUniqueId('jupiter'),
            'Jupiter',
            BodyTypeEnum.GasGiant,
            0xffcc88,
            5000,
            false,
            { axis: new THREE.Vector3(0, 1, 0), speed: 0.55 },
            undefined,
            material
        );
    }
}
