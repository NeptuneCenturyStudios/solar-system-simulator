import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { createUniqueId } from '../utilities/utilities.js';
import {
    SUN_MASS,
    URANUS_AXIS,
    URANUS_AZIMUTH,
    URANUS_DIST,
    URANUS_MASS,
    URANUS_RADIUS,
    URANUS_ORBITAL_PERIOD_REAL,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet';
import { PlanetTypeEnum } from './body-enums.js';
import { loadSrgbTexture } from '../drawing/textures.js';

/**
 * Represents the planet Uranus in the simulation, including its texture and orbital properties.
 * Sets up Uranus's trajectory, material, and physical parameters.
 */
export class Uranus extends Planet {
    /**
     * Constructs a new Uranus object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Uranus belongs.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        angleRad: number = 0
    ) {
        const gEff = dependencies.getG();
        const timeScale =
            URANUS_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(URANUS_DIST, gEff, SUN_MASS);
        const rotSpeed = ((-2 * Math.PI) / (17.24 * 3600)) * timeScale; // retrograde
        const trajectory = calculateTrajectory(gEff, URANUS_DIST, SUN_MASS, angleRad);
        const TEXTURE_PATH = './assets/textures/bodies/2k/uranus.jpg';
        const texture = loadSrgbTexture(TEXTURE_PATH);
        const geometry = new THREE.SphereGeometry(URANUS_RADIUS, 64, 64);
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
            id: createUniqueId('uranus'),
            name: 'Uranus',
            mass: URANUS_MASS,
            radius: URANUS_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            bodySubtype: PlanetTypeEnum.IceGiant,
            trailColor: 0x88ddff,
            maxTrail: 15000,
            hasRings: false,
            rotation: { tilt: URANUS_AXIS, speed: rotSpeed, azimuth: URANUS_AZIMUTH },
            mesh: mesh,
            atmosphere: {
                radius: URANUS_RADIUS * 1.07,
                tint: 0x88ddff,
            },
        });

        // Register texture path for quality-based reloading
        this.setTexturePath('map', TEXTURE_PATH);
    }
}
