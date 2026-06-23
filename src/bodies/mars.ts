import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import {
    SUN_MASS,
    MARS_MASS,
    MARS_DIST,
    MARS_RADIUS,
    MARS_AXIS,
    MARS_AZIMUTH,
    MARS_ORBITAL_PERIOD_REAL,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet.js';
import { PlanetTypeEnum } from './body-enums.js';

const marsTexture = loadSrgbTexture('./assets/textures/mars.jpg');

/**
 * Represents the planet Mars in the simulation, including its texture and orbital properties.
 * Sets up Mars's trajectory, material, and physical parameters.
 */
export class Mars extends Planet {
    /**
     * Constructs a new Mars object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Mars belongs.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, angleRad: number = 0) {
        const gEff = dependencies.getG();
        const timeScale =
            MARS_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(MARS_DIST, gEff, SUN_MASS);
        const rotSpeed = ((2 * Math.PI) / (24.623 * 3600)) * timeScale;
        const trajectory = calculateTrajectory(gEff, MARS_DIST, SUN_MASS, angleRad);
        const geometry = new THREE.SphereGeometry(MARS_RADIUS, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            map: marsTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });
        const mesh = new THREE.Mesh(geometry, material);

        super(dependencies, scene, {
            id: createUniqueId('mars'),
            name: 'Mars',
            mass: MARS_MASS,
            radius: MARS_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            bodySubtype: PlanetTypeEnum.Terrestrial,
            trailColor: 0xff8888,
            maxTrail: 3000,
            hasRings: false,
            rotation: { tilt: MARS_AXIS, speed: rotSpeed, azimuth: MARS_AZIMUTH },
            mesh: mesh,
        });
    }
}
