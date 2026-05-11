import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { createUniqueId } from '../utilities/utilities.js';
import {
    SUN_MASS,
    URANUS_AXIS,
    URANUS_DIST,
    URANUS_MASS,
    URANUS_RADIUS,
    URANUS_ROT_SPEED,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';
import { PlanetTypeEnum } from '../utilities/body-params';
import { Planet } from './planet';

/**
 * Represents the planet Uranus in the simulation, including its texture and orbital properties.
 * Sets up Uranus's trajectory, material, and physical parameters.
 */
export class Uranus extends Planet {
    /**
     * Constructs a new Uranus object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Uranus belongs.
     * @param uranusTexture The texture to use for rendering Uranus.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        uranusTexture: THREE.Texture
    ) {
        const trajectory = calculateTrajectory(dependencies.getG(), URANUS_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: uranusTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        super(
            dependencies,
            scene,
            {
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
                rotation: { tilt: URANUS_AXIS, speed: URANUS_ROT_SPEED },
            },
            material
        );
    }
}
