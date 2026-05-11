import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { createUniqueId } from '../utilities/utilities.js';
import {
    SATURN_DIST,
    SATURN_MASS,
    SUN_MASS,
    SATURN_RADIUS,
    SATURN_AXIS,
    SATURN_ROT_SPEED,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet';
import { PlanetTypeEnum } from '../utilities/body-params';

/**
 * Represents the planet Saturn in the simulation, including its texture and orbital properties.
 * Sets up Saturn's trajectory, material, and physical parameters.
 */
export class Saturn extends Planet {
    /**
     * Constructs a new Saturn object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Saturn belongs.
     * @param saturnTexture The texture to use for rendering Saturn.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        saturnTexture: THREE.Texture
    ) {
        const trajectory = calculateTrajectory(dependencies.getG(), SATURN_DIST, SUN_MASS);
        const geometry = new THREE.SphereGeometry(SATURN_RADIUS, 64, 64);
        const material = new THREE.MeshStandardMaterial({
            map: saturnTexture,
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
            rotation: { tilt: SATURN_AXIS, speed: SATURN_ROT_SPEED },
            mesh: mesh,
        });
    }
}
