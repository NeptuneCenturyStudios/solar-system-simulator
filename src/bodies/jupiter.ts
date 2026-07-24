import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { createUniqueId } from '../utilities/utilities.js';
import {
    SUN_MASS,
    JUPITER_DIST,
    JUPITER_MASS,
    JUPITER_RADIUS,
    JUPITER_AXIS,
    JUPITER_AZIMUTH,
    JUPITER_ORBITAL_PERIOD_REAL,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet';
import { PlanetTypeEnum } from './body-enums.js';
import { loadSrgbTexture } from '../drawing/textures.js';

/**
 * Represents the planet Jupiter in the simulation, including its texture and orbital properties.
 * Sets up Jupiter's trajectory, material, and physical parameters.
 */
export class Jupiter extends Planet {
    /**
     * Constructs a new Jupiter object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Jupiter belongs.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        angleRad: number = 0
    ) {
        const gEff = dependencies.getG();
        const timeScale =
            JUPITER_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(JUPITER_DIST, gEff, SUN_MASS);
        const rotSpeed = ((2 * Math.PI) / (9.925 * 3600)) * timeScale;
        const trajectory = calculateTrajectory(gEff, JUPITER_DIST, SUN_MASS, angleRad);
        const TEXTURE_PATH = './assets/textures/bodies/2k/jupiter.jpg';
        const texture = loadSrgbTexture(TEXTURE_PATH);
        const geometry = new THREE.SphereGeometry(JUPITER_RADIUS, 64, 64);
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.85,
        });
        const mesh = new THREE.Mesh(geometry, material);

        super(dependencies, scene, {
            id: createUniqueId('jupiter'),
            name: 'Jupiter',
            mass: JUPITER_MASS,
            radius: JUPITER_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            bodySubtype: PlanetTypeEnum.GasGiant,
            trailColor: 0xffcc88,
            maxTrail: 5000,
            hasRings: false,
            rotation: { tilt: JUPITER_AXIS, speed: rotSpeed, azimuth: JUPITER_AZIMUTH },
            mesh: mesh,
            atmosphere: {
                radius: JUPITER_RADIUS * 1.07,
                tint: 0xffcc88,
            },
        });

        // Register texture path for quality-based reloading
        this.setTexturePath('map', TEXTURE_PATH);
    }
}
