import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { createUniqueId } from '../utilities/utilities.js';
import {
    PLUTO_DIST,
    PLUTO_MASS,
    SUN_MASS,
    PLUTO_RADIUS,
    PLUTO_AXIS,
    PLUTO_ROT_SPEED,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';
import { PlanetTypeEnum } from '../utilities/body-params';
import { DwarfPlanet } from './dwarf-planet';

/**
 * Represents the dwarf planet Pluto in the simulation, including its texture and orbital properties.
 * Sets up Pluto's trajectory, material, and physical parameters.
 */
export class Pluto extends DwarfPlanet {
    /**
     * Constructs a new Pluto object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Pluto belongs.
     * @param plutoTexture The texture to use for rendering Pluto.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, plutoTexture: THREE.Texture) {
        const trajectory = calculateTrajectory(dependencies.getG(), PLUTO_DIST, SUN_MASS);
        const geometry = new THREE.SphereGeometry(PLUTO_RADIUS, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            map: plutoTexture,
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
            rotation: { tilt: PLUTO_AXIS, speed: PLUTO_ROT_SPEED },
            mesh: mesh,
        });
    }
}
