import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { createUniqueId } from '../utilities/utilities.js';
import {
    SATURN_DIST,
    SATURN_MASS,
    SUN_MASS,
    SATURN_RADIUS,
    SATURN_AXIS,
    SATURN_AZIMUTH,
    SATURN_ORBITAL_PERIOD_REAL,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet';
import { PlanetTypeEnum } from './body-enums.js';
import { loadSrgbTexture } from '../drawing/textures.js';

/**
 * Represents the planet Saturn in the simulation, including its texture and orbital properties.
 * Sets up Saturn's trajectory, material, and physical parameters.
 */
export class Saturn extends Planet {
    /**
     * Constructs a new Saturn object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Saturn belongs.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        angleRad: number = 0
    ) {
        const gEff = dependencies.getG();
        const timeScale =
            SATURN_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(SATURN_DIST, gEff, SUN_MASS);
        const rotSpeed = ((2 * Math.PI) / (10.656 * 3600)) * timeScale;
        const trajectory = calculateTrajectory(gEff, SATURN_DIST, SUN_MASS, angleRad);
        const texture = loadSrgbTexture('./assets/textures/bodies/2k/saturn.jpg');
        const geometry = new THREE.SphereGeometry(SATURN_RADIUS, 64, 64);
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
            id: createUniqueId('saturn'),
            name: 'Saturn',
            mass: SATURN_MASS,
            radius: SATURN_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            bodySubtype: PlanetTypeEnum.GasGiant,
            trailColor: 0xffeebb,
            maxTrail: 12000,
            hasRings: true,
            rotation: { tilt: SATURN_AXIS, speed: rotSpeed, azimuth: SATURN_AZIMUTH },
            mesh: mesh,
        });
    }
}
