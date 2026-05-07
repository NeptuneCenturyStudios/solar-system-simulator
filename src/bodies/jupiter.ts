import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { calculateRotation, calculateTrajectory } from '../physics/physics.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import {
    SUN_MASS,
    JUPITER_DIST,
    JUPITER_MASS,
    JUPITER_RADIUS,
    JUPITER_AXIS,
    JUPITER_ROT_SPEED,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

/**
 * Represents the planet Jupiter in the simulation, including its texture and orbital properties.
 * Sets up Jupiter's trajectory, material, and physical parameters.
 */
export class Jupiter extends CelestialBody {
    /**
     * Constructs a new Jupiter object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Jupiter belongs.
     * @param jupiterTexture The texture to use for rendering Jupiter.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        jupiterTexture: THREE.Texture
    ) {
        const trajectory = calculateTrajectory(dependencies.getG(), JUPITER_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: jupiterTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.85,
        });

        const rotation = calculateRotation(JUPITER_AXIS, JUPITER_ROT_SPEED);

        super(
            dependencies,
            scene,
            JUPITER_RADIUS,
            0xffaa33,
            trajectory.pos,
            trajectory.vel,
            JUPITER_MASS,
            createUniqueId('jupiter'),
            'Jupiter',
            BodyTypeEnum.GasGiant,
            0xffcc88,
            5000,
            false,
            rotation,
            undefined,
            material
        );
    }
}
