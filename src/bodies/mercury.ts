import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { MERCURY_AXIS, MERCURY_DIST, MERCURY_MASS, MERCURY_RADIUS, MERCURY_ROT_SPEED, SUN_MASS } from '../utilities/consts.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { CelestialBody } from './celestial-body';
import { IStateDependencies } from '../interfaces.js';

const mercuryTexture = loadSrgbTexture('./assets/textures/mercury.jpg');

/**
 * Represents the planet Mercury in the simulation, including its texture and orbital properties.
 * Sets up Mercury's trajectory, material, and physical parameters.
 */
export class Mercury extends CelestialBody {
    /**
     * Constructs a new Mercury object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Mercury belongs.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        const trajectory = calculateTrajectory(dependencies.getG(), MERCURY_DIST, SUN_MASS);

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
            BodyTypeEnum.Planet,
            0xaaaaaa,
            2000,
            false,
            {
                tilt: MERCURY_AXIS,
                speed: MERCURY_ROT_SPEED,
            },
            undefined,
            material
        );
    }
}
