import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import {
    SUN_MASS,
    VENUS_AXIS,
    VENUS_AZIMUTH,
    VENUS_DIST,
    VENUS_MASS,
    VENUS_ORBITAL_PERIOD_REAL,
    VENUS_RADIUS,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet.js';
import { PlanetTypeEnum } from './body-enums.js';

/**
 * Represents the planet Venus in the simulation, including its surface and cloud layer.
 * Sets up Venus's trajectory, material, and cloud rendering.
 */
export class Venus extends Planet {
    /**
     * Constructs a new Venus object with its unique properties, orbit, and cloud layer.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Venus belongs.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, angleRad: number = 0) {
        const gEff = dependencies.getG();
        const timeScale =
            VENUS_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(VENUS_DIST, gEff, SUN_MASS);
        const rotSpeed = ((-2 * Math.PI) / (5832.5 * 3600)) * timeScale; // retrograde
        const trajectory = calculateTrajectory(gEff, VENUS_DIST, SUN_MASS, angleRad);
        const VENUS_SURFACE_PATH = './assets/textures/bodies/2k/venus.jpg';
        const VENUS_ATMOSPHERE_PATH = './assets/textures/bodies/2k/venus_atmosphere.jpg';
        const venusTexture = loadSrgbTexture(VENUS_SURFACE_PATH);
        const geometry = new THREE.SphereGeometry(VENUS_RADIUS, 64, 64);
        const material = new THREE.MeshStandardMaterial({
            map: venusTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });
        const mesh = new THREE.Mesh(geometry, material);

        super(dependencies, scene, {
            id: createUniqueId('venus'),
            name: 'Venus',
            mass: VENUS_MASS,
            radius: VENUS_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            bodySubtype: PlanetTypeEnum.Terrestrial,
            trailColor: 0xffdd88,
            maxTrail: 3500,
            hasRings: false,
            rotation: { tilt: VENUS_AXIS, speed: rotSpeed, azimuth: VENUS_AZIMUTH },
            mesh: mesh,
            atmosphere: {
                radius: VENUS_RADIUS * 1.07,
                tint: 0xffdd88,
            },
        });

        // Register texture paths for quality-based reloading
        this.setTexturePath('map', VENUS_SURFACE_PATH);
        this.setTexturePath('cloudMap', VENUS_ATMOSPHERE_PATH);

        const venusAtmosphereTexture = loadSrgbTexture(VENUS_ATMOSPHERE_PATH);
        const cloudsMat = new THREE.MeshStandardMaterial({
            map: venusAtmosphereTexture,
            color: 0xffffff,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            roughness: 1.0,
            metalness: 0.0,
        });

        const cloudsGeo = new THREE.SphereGeometry(this.radius * 1.03, 64, 64);
        this.clouds = new THREE.Mesh(cloudsGeo, cloudsMat);
        this.clouds.renderOrder = 2;
        this.clouds.userData = { parentBody: this };
        this.mesh.add(this.clouds);

        this.cloudRotationSpeed = rotSpeed * 60; // Clouds rotate much faster than the surface
    }

    update(acc: THREE.Vector3, dt: number): void {
        super.update(acc, dt);
    }
}
