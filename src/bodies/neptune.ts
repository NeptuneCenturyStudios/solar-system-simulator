import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { createUniqueId } from '../utilities/utilities.js';
import {
    NEPTUNE_DIST,
    NEPTUNE_MASS,
    SUN_MASS,
    NEPTUNE_RADIUS,
    NEPTUNE_AXIS,
    NEPTUNE_AZIMUTH,
    NEPTUNE_ORBITAL_PERIOD_REAL,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet';
import { PlanetTypeEnum } from './body-enums.js';
import { loadSrgbTexture } from '../drawing/textures.js';

/**
 * Represents the planet Neptune in the simulation, including its texture and orbital properties.
 * Sets up Neptune's trajectory, material, and physical parameters.
 */
export class Neptune extends Planet {
    /**
     * Constructs a new Neptune object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Neptune belongs.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        angleRad: number = 0
    ) {
        const gEff = dependencies.getG();
        const timeScale =
            NEPTUNE_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(NEPTUNE_DIST, gEff, SUN_MASS);
        const rotSpeed = ((2 * Math.PI) / (16.11 * 3600)) * timeScale;
        const trajectory = calculateTrajectory(gEff, NEPTUNE_DIST, SUN_MASS, angleRad);
        const TEXTURE_PATH = './assets/textures/bodies/2k/neptune.jpg';
        const texture = loadSrgbTexture(TEXTURE_PATH);
        const geometry = new THREE.SphereGeometry(NEPTUNE_RADIUS, 64, 64);
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
            id: createUniqueId('neptune'),
            name: 'Neptune',
            mass: NEPTUNE_MASS,
            radius: NEPTUNE_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            bodySubtype: PlanetTypeEnum.IceGiant,
            trailColor: 0x6688ff,
            maxTrail: 18000,
            hasRings: false,
            rotation: { tilt: NEPTUNE_AXIS, speed: rotSpeed, azimuth: NEPTUNE_AZIMUTH },
            mesh: mesh,
            atmosphere: {
                radius: NEPTUNE_RADIUS * 1.07,
                tint: 0x4488ff,
            },
        });

        // Register texture path for quality-based reloading
        this.setTexturePath('map', TEXTURE_PATH);
    }
}
