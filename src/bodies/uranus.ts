import * as THREE from 'three';

import { CelestialBody } from './celestial-body.js';
import { calculateTrajectory } from '../physics/physics.js';
import { BodyType, createUniqueId } from '../utilities/utilities.js';
import { SUN_MASS, URANUS_DIST, URANUS_MASS, URANUS_RADIUS } from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

export class Uranus extends CelestialBody {
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, uranusTexture: THREE.Texture) {
        const trajectory = calculateTrajectory(URANUS_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: uranusTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        super(
            dependencies,
            scene,
            URANUS_RADIUS,
            0x4fd0e0,
            trajectory.pos,
            trajectory.vel,
            URANUS_MASS,
            createUniqueId('uranus'),
            'Uranus',
            BodyType.IceGiant,
            0x88ddff,
            15000,
            false,
            { axis: new THREE.Vector3(0.99, 0.12, 0), speed: 0.42 },
            undefined,
            material
        );
    }
}
