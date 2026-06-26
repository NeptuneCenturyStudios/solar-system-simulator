import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import {
    MERCURY_AXIS,
    MERCURY_AZIMUTH,
    MERCURY_DIST,
    MERCURY_MASS,
    MERCURY_ORBITAL_PERIOD_REAL,
    MERCURY_RADIUS,
    SUN_MASS,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet.js';
import { PlanetTypeEnum } from './body-enums.js';

/**
 * Represents the planet Mercury in the simulation, including its texture and orbital properties.
 * Sets up Mercury's trajectory, material, and physical parameters.
 */
export class Mercury extends Planet {
    /**
     * Constructs a new Mercury object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Mercury belongs.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, angleRad: number = 0) {
        const gEff = dependencies.getG();
        const timeScale =
            MERCURY_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(MERCURY_DIST, gEff, SUN_MASS);
        const rotSpeed = ((2 * Math.PI) / (1407.5 * 3600)) * timeScale;
        const trajectory = calculateTrajectory(gEff, MERCURY_DIST, SUN_MASS, angleRad);

        const texture = loadSrgbTexture('./assets/textures/bodies/2k/mercury.jpg');
        const geometry = new THREE.SphereGeometry(MERCURY_RADIUS, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });
        const mesh = new THREE.Mesh(geometry, material);

        super(dependencies, scene, {
            id: createUniqueId('mercury'),
            name: 'Mercury',
            mass: MERCURY_MASS,
            radius: MERCURY_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            rotation: {
                tilt: MERCURY_AXIS,
                speed: rotSpeed,
                azimuth: MERCURY_AZIMUTH,
            },
            trailColor: 0xaaaaaa,
            maxTrail: 2000,
            bodySubtype: PlanetTypeEnum.Terrestrial,
            mesh: mesh,
        });
    }
}
