import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { calculateRotation, calculateTrajectory } from '../physics/physics.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import {
    SATURN_DIST,
    SATURN_MASS,
    SUN_MASS,
    SATURN_RADIUS,
    SATURN_AXIS,
    SATURN_ROT_SPEED,
} from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

/**
 * Represents the planet Saturn in the simulation, including its texture and orbital properties.
 * Sets up Saturn's trajectory, material, and physical parameters.
 */
export class Saturn extends CelestialBody {
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

        const material = new THREE.MeshStandardMaterial({
            map: saturnTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        // Calculate Saturn's rotation based on its axial tilt and rotation speed.
        const rotation = calculateRotation(SATURN_AXIS, SATURN_ROT_SPEED);

        super(
            dependencies,
            scene,
            SATURN_RADIUS,
            0xe6cc80,
            trajectory.pos,
            trajectory.vel,
            SATURN_MASS,
            createUniqueId('saturn'),
            'Saturn',
            BodyTypeEnum.GasGiant,
            0xffeebb,
            12000,
            true,
            rotation,
            undefined,
            material
        );

        // Orient the mesh so its texture "north" matches Saturn's spin axis
        if (this.mesh) {
            const up = new THREE.Vector3(0, 1, 0);
            const tiltRad = (SATURN_AXIS * Math.PI) / 180;
            const spinAxis = new THREE.Vector3(0, Math.cos(tiltRad), Math.sin(tiltRad)); // YZ plane
            this.mesh.quaternion.setFromUnitVectors(up, spinAxis);
            // Fix: set rotationAxis to local Y for correct spinning
            this.rotationAxis = new THREE.Vector3(0, 1, 0);
        }
    }
}
