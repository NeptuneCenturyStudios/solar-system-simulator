import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { createUniqueId } from '../utilities/utilities.js';
import {
    PLUTO_DIST,
    PLUTO_MASS,
    SUN_MASS,
    PLUTO_RADIUS,
    PLUTO_AXIS,
    PLUTO_AZIMUTH,
    PLUTO_ORBITAL_PERIOD_REAL,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';
import { DwarfPlanet } from './dwarf-planet';
import { PlanetTypeEnum } from './body-enums.js';
import { loadSrgbTexture } from '../drawing/textures.js';

/**
 * Represents the dwarf planet Pluto in the simulation, including its texture and orbital properties.
 * Sets up Pluto's trajectory, material, and physical parameters.
 */
export class Pluto extends DwarfPlanet {
    /**
     * Constructs a new Pluto object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Pluto belongs.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, angleRad: number = 0) {
        const gEff = dependencies.getG();
        const timeScale =
            PLUTO_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(PLUTO_DIST, gEff, SUN_MASS);
        const rotSpeed = ((-2 * Math.PI) / (153.3 * 3600)) * timeScale; // retrograde
        const trajectory = calculateTrajectory(gEff, PLUTO_DIST, SUN_MASS, angleRad);
        const texture = loadSrgbTexture('./assets/textures/bodies/2k/pluto.jpg');
        const geometry = new THREE.SphereGeometry(PLUTO_RADIUS, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.95,
        });
        const mesh = new THREE.Mesh(geometry, material);

        super(dependencies, scene, {
            id: createUniqueId('pluto'),
            name: 'Pluto',
            mass: PLUTO_MASS,
            radius: PLUTO_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            bodySubtype: PlanetTypeEnum.Terrestrial,
            trailColor: 0xddbb99,
            maxTrail: 20000,
            hasRings: false,
            rotation: { tilt: PLUTO_AXIS, speed: rotSpeed, azimuth: PLUTO_AZIMUTH },
            mesh: mesh,
        });
    }
}
