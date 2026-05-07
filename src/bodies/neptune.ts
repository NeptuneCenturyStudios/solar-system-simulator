import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { calculateRotation, calculateTrajectory } from '../physics/physics.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import { NEPTUNE_DIST, NEPTUNE_MASS, SUN_MASS, NEPTUNE_RADIUS, NEPTUNE_AXIS, NEPTUNE_ROT_SPEED } from '../utilities/consts.js';
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
        const trajectory = calculateTrajectory(dependencies.getG(), NEPTUNE_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: neptuneTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        // Neptune has an axial tilt of about 28.3 degrees, which is similar to Earth's but with a much longer rotation period.
        const rotation = calculateRotation(NEPTUNE_AXIS, NEPTUNE_ROT_SPEED);

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
            rotation,
            undefined,
            material
        );
    }
}
