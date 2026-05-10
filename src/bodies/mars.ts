import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { SUN_MASS, MARS_MASS, MARS_DIST, MARS_RADIUS, MARS_AXIS, MARS_ROT_SPEED } from '../utilities/consts.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { CelestialBody } from './celestial-body';
import { IStateDependencies } from '../interfaces.js';

const marsTexture = loadSrgbTexture('./assets/textures/mars.jpg');

/**
 * Represents the planet Mars in the simulation, including its texture and orbital properties.
 * Sets up Mars's trajectory, material, and physical parameters.
 */
export class Mars extends CelestialBody {
    /**
     * Constructs a new Mars object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Mars belongs.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        const trajectory = calculateTrajectory(dependencies.getG(), MARS_DIST, SUN_MASS);

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
            trajectory.pos,
            trajectory.vel,
            MARS_MASS,
            createUniqueId('mars'),
            'Mars',
            BodyTypeEnum.Planet,
            0xff8888,
            3000,
            false,
            {
                tilt: MARS_AXIS,
                speed: MARS_ROT_SPEED,
            },
            undefined,
            material
        );
    }
}
