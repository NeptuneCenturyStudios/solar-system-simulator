import * as THREE from 'three';

import { calculateTrajectory } from '../physics/physics.js';
import { createUniqueId } from '../utilities/utilities.js';
import {
    CERES_AXIS,
    CERES_AZIMUTH,
    CERES_DISTANCE,
    CERES_MASS,
    CERES_ORBITAL_PERIOD_REAL,
    CERES_RADIUS,
    SUN_MASS,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

import { DwarfPlanet } from './dwarf-planet';
import { PlanetTypeEnum } from './body-enums.js';
import { loadSrgbTexture } from '../drawing/textures.js';

/**
 * Represents the dwarf planet Ceres in the simulation.
 * Sets up its trajectory, material, and physical properties.
 */
export class Ceres extends DwarfPlanet {
    /**
     * Constructs a new Ceres object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Ceres belongs.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        angleRad: number = 0
    ) {
        const gEff = dependencies.getG();
        const timeScale =
            CERES_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(CERES_DISTANCE, gEff, SUN_MASS);
        const rotSpeed = ((2 * Math.PI) / (9.074 * 3600)) * timeScale;
        const trajectory = calculateTrajectory(gEff, CERES_DISTANCE, SUN_MASS, angleRad);
        const texture = loadSrgbTexture('./assets/textures/bodies/2k/ceres.jpg');
        const geometry = new THREE.SphereGeometry(CERES_RADIUS, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            map: texture,
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
            rotation: { tilt: CERES_AXIS, speed: rotSpeed, azimuth: CERES_AZIMUTH },
            mesh: mesh,
        });
    }
}
