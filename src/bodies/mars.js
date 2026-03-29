import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { SUN_MASS, MARS_MASS, MARS_DIST, MARS_RADIUS } from '../utilities/consts.js';
import { BodyType, createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { CelestialBody } from './celestial-body.js';

const marsTexture = loadSrgbTexture('./assets/textures/mars.jpg');

export class Mars extends CelestialBody {
    constructor(dependencies, scene) {
        const trajectory = calculateTrajectory(MARS_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: marsTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        super(
            dependencies,
            scene,
            MARS_RADIUS,
            0xcd5c5c,
            trajectory.pos.toArray(),
            trajectory.vel.toArray(),
            MARS_MASS,
            createUniqueId('mars'),
            'Mars',
            BodyType.Planet,
            0xff8888,
            3000,
            false,
            { axis: [0, 1, 0], speed: 0.26 },
            null,
            material
        );
    }
}
