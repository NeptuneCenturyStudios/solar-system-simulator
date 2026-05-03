import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { calculateTrajectory } from '../physics/physics.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import { SATURN_DIST, SATURN_MASS, SUN_MASS, SATURN_RADIUS } from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

/**
 * Represents the planet Saturn in the simulation, including its texture and orbital properties.
 * Sets up Saturn's trajectory, material, and physical parameters.
 */
export class Saturn extends CelestialBody {
    /**
     * Constructs a new Saturn object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Saturn belongs.
     * @param saturnTexture The texture to use for rendering Saturn.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        saturnTexture: THREE.Texture
    ) {
        const trajectory = calculateTrajectory(SATURN_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: saturnTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        super(
            dependencies,
            scene,
            SATURN_RADIUS,
            0xe6cc80,
            trajectory.pos,
            trajectory.vel,
            SATURN_MASS,
            createUniqueId('saturn'),
            'Saturn',
            BodyTypeEnum.GasGiant,
            0xffeebb,
            12000,
            true,
            { axis: new THREE.Vector3(0, 1, 0), speed: 0.5 },
            undefined,
            material
        );
    }
}
