import * as THREE from 'three';
import { CelestialBody } from './celestial-body';
import { calculateTrajectory } from '../physics/physics.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import { CERES_AXIS, CERES_DISTANCE, CERES_MASS, CERES_RADIUS, CERES_ROT_SPEED, SUN_MASS } from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

/**
 * Represents the dwarf planet Ceres in the simulation.
 * Sets up its trajectory, material, and physical properties.
 */
export class Ceres extends CelestialBody {
    /**
     * Constructs a new Ceres object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Ceres belongs.
     * @param ceresTexture The texture to use for rendering Ceres.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, ceresTexture: THREE.Texture) {
        const trajectory = calculateTrajectory(dependencies.getG(), CERES_DISTANCE, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: ceresTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.9,
            metalness: 0.1,
        });

        super(
            dependencies,
            scene,
            CERES_RADIUS,
            0xffffff,
            trajectory.pos,
            trajectory.vel,
            CERES_MASS,
            createUniqueId('ceres'),
            'Ceres',
            BodyTypeEnum.DwarfPlanet,
            0xcccccc,
            2000,
            false,
            { tilt: CERES_AXIS, speed: CERES_ROT_SPEED },
            undefined,
            material
        );
    }
}
