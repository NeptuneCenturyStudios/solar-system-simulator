import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { calculateTrajectory } from '../physics/physics.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import { NEPTUNE_DIST, NEPTUNE_MASS, SUN_MASS, NEPTUNE_RADIUS } from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

/**
 * Represents the planet Neptune in the simulation, including its texture and orbital properties.
 * Sets up Neptune's trajectory, material, and physical parameters.
 */
export class Neptune extends CelestialBody {
    /**
     * Constructs a new Neptune object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Neptune belongs.
     * @param neptuneTexture The texture to use for rendering Neptune.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        neptuneTexture: THREE.Texture
    ) {
        const trajectory = calculateTrajectory(NEPTUNE_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: neptuneTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        super(
            dependencies,
            scene,
            NEPTUNE_RADIUS,
            0x4169e1,
            trajectory.pos,
            trajectory.vel,
            NEPTUNE_MASS,
            createUniqueId('neptune'),
            'Neptune',
            BodyTypeEnum.IceGiant,
            0x6688ff,
            18000,
            false,
            { axis: new THREE.Vector3(0, 1, 0), speed: 0.4 },
            undefined,
            material
        );
    }
}
