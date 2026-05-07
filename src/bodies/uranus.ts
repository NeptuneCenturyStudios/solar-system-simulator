import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { calculateTrajectory } from '../physics/physics.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import { SUN_MASS, URANUS_DIST, URANUS_MASS, URANUS_RADIUS } from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

/**
 * Represents the planet Uranus in the simulation, including its texture and orbital properties.
 * Sets up Uranus's trajectory, material, and physical parameters.
 */
export class Uranus extends CelestialBody {
    /**
     * Constructs a new Uranus object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Uranus belongs.
     * @param uranusTexture The texture to use for rendering Uranus.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        uranusTexture: THREE.Texture
    ) {
        const trajectory = calculateTrajectory(dependencies.getG(), URANUS_DIST, SUN_MASS);

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
            BodyTypeEnum.IceGiant,
            0x88ddff,
            15000,
            false,
            { axis: new THREE.Vector3(0.99, 0.12, 0), speed: 0.42 },
            undefined,
            material
        );
    }
}
