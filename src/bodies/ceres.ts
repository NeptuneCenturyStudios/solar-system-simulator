import * as THREE from 'three';
import { CelestialBody } from './celestial-body.js';
import { calculateTrajectory } from '../physics/physics.js';
import { BodyType, createUniqueId } from '../utilities/utilities.js';
import { CERES_DISTANCE, CERES_MASS, CERES_RADIUS, SUN_MASS } from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

export class Ceres extends CelestialBody {
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, ceresTexture: THREE.Texture) {
        const trajectory = calculateTrajectory(CERES_DISTANCE, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: ceresTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.9,
            metalness: 0.1,
        });

        super(
            dependencies,
            scene,
            CERES_RADIUS,
            0xffffff,
            trajectory.pos,
            trajectory.vel,
            CERES_MASS,
            createUniqueId('ceres'),
            'Ceres',
            BodyType.DwarfPlanet,
            0xcccccc,
            2000,
            false,
            { axis: new THREE.Vector3(0, 1, 0), speed: 0.08 },
            undefined,
            material
        );
    }
}
