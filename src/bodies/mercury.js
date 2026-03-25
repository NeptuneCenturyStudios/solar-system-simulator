import * as THREE from '../vendors/three.module.js';
import { calculateTrajectory } from '../physics/physics.js';
import { MERCURY_DIST, MERCURY_MASS, SUN_MASS } from '../utilities/consts.js';
import { BodyType } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { CelestialBody } from './celestial-body.js';

const mercuryTexture = loadSrgbTexture('./assets/textures/mercury.jpg');

export class Mercury extends CelestialBody {
    constructor(dependencies, scene) {
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
            3.06, // 0.383 × Earth
            0x8c7853,
            trajectory.pos.toArray(),
            trajectory.vel.toArray(),
            MERCURY_MASS,
            'camMercury',
            'Mercury',
            BodyType.Planet,
            0xaaaaaa,
            2000,
            false,
            false,
            false,
            { axis: [0, 1, 0], speed: 0.15 },
            null,
            material
        );
    }
}
