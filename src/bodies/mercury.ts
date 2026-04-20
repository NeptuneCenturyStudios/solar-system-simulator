import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { MERCURY_DIST, MERCURY_MASS, MERCURY_RADIUS, SUN_MASS } from '../utilities/consts.js';
import { BodyType, createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { CelestialBody } from './celestial-body.js';
import { IStateDependencies } from '../interfaces.js';

const mercuryTexture = loadSrgbTexture('./assets/textures/mercury.jpg');

export class Mercury extends CelestialBody {
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        const trajectory = calculateTrajectory(MERCURY_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: mercuryTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        super(
            dependencies,
            scene,
            MERCURY_RADIUS,
            0x8c7853,
            trajectory.pos,
            trajectory.vel,
            MERCURY_MASS,
            createUniqueId('mercury'),
            'Mercury',
            BodyType.Planet,
            0xaaaaaa,
            2000,
            false,
            { axis: new THREE.Vector3(0, 1, 0), speed: 0.15 },
            undefined,
            material
        );
    }
}
