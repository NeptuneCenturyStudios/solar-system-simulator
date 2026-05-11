import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import {
    MERCURY_AXIS,
    MERCURY_DIST,
    MERCURY_MASS,
    MERCURY_RADIUS,
    MERCURY_ROT_SPEED,
    SUN_MASS,
} from '../utilities/consts.js';
import { createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet.js';
import { PlanetTypeEnum } from '../utilities/body-params.js';

const mercuryTexture = loadSrgbTexture('./assets/textures/mercury.jpg');

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
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        const trajectory = calculateTrajectory(dependencies.getG(), MERCURY_DIST, SUN_MASS);
        const geometry = new THREE.SphereGeometry(MERCURY_RADIUS, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            map: mercuryTexture,
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
                speed: MERCURY_ROT_SPEED,
            },
            trailColor: 0xaaaaaa,
            maxTrail: 2000,
            bodySubtype: PlanetTypeEnum.Terrestrial,
            mesh: mesh,
        });
    }
}
