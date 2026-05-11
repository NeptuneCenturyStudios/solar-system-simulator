import * as THREE from 'three';

import { calculateTrajectory } from '../physics/physics.js';
import { createUniqueId } from '../utilities/utilities.js';
import {
    CERES_AXIS,
    CERES_DISTANCE,
    CERES_MASS,
    CERES_RADIUS,
    CERES_ROT_SPEED,
    SUN_MASS,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

import { DwarfPlanet } from './dwarf-planet';
import { PlanetTypeEnum } from '../utilities/body-params.js';

/**
 * Represents the dwarf planet Ceres in the simulation.
 * Sets up its trajectory, material, and physical properties.
 */
export class Ceres extends DwarfPlanet {
    /**
     * Constructs a new Ceres object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Ceres belongs.
     * @param ceresTexture The texture to use for rendering Ceres.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, ceresTexture: THREE.Texture) {
        const trajectory = calculateTrajectory(dependencies.getG(), CERES_DISTANCE, SUN_MASS);
        const geometry = new THREE.SphereGeometry(CERES_RADIUS, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            map: ceresTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.9,
            metalness: 0.1,
        });
        const mesh = new THREE.Mesh(geometry, material);

        super(dependencies, scene, {
            id: createUniqueId('ceres'),
            name: 'Ceres',
            mass: CERES_MASS,
            radius: CERES_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            bodySubtype: PlanetTypeEnum.Terrestrial,
            trailColor: 0xcccccc,
            maxTrail: 2000,
            hasRings: false,
            rotation: { tilt: CERES_AXIS, speed: CERES_ROT_SPEED },
            mesh: mesh,
        });
    }
}
