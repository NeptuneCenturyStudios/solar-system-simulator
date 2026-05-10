import * as THREE from 'three';

import {
    G,
    SUN_MASS,
    COMET_PERIHELION_DIST,
    COMET_APHELION_DIST,
    COMET_RADIUS,
    COMET_MASS,
} from '../utilities/consts.js';

import { Comet } from './comet';
import { IStateDependencies } from '../interfaces.js';

/**
 * Represents Halley's Comet in the simulation, with a realistic elliptical orbit and physical properties.
 * Inherits from Comet and sets up Halley-specific trajectory and material.
 */
export class Halley extends Comet {
    /**
     * Constructs a new Halley object with its unique elliptical orbit and properties.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Halley belongs.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        // Halley-like elliptical orbit
        const perihelion = COMET_PERIHELION_DIST; // Just outside Mars (scaled)
        const aphelion = COMET_APHELION_DIST; // Scaled
        const semiMajorAxis = (perihelion + aphelion) / 2;

        // Start at aphelion (farthest point)
        const distance = aphelion;
        const inclination = Math.PI / 6; // 30 degrees inclination

        // Position at aphelion
        const x = distance * Math.cos(Math.PI / 4);
        const y = distance * Math.sin(inclination) * 0.5;
        const z = distance * Math.sin(Math.PI / 4);

        // Velocity perpendicular to position vector (for elliptical orbit)
        // Using vis-viva equation: v = sqrt(G*M*(2/r - 1/a))
        const speed = Math.sqrt(G * SUN_MASS * (2 / distance - 1 / semiMajorAxis));

        // Velocity perpendicular to radius, inclined
        const velX = -speed * Math.sin(Math.PI / 4) * Math.cos(inclination);
        const velY = speed * Math.sin(inclination) * 0.3;
        const velZ = speed * Math.cos(Math.PI / 4) * Math.cos(inclination);

        const material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.6,
        });

        super(
            dependencies,
            scene,
            {
                pos: new THREE.Vector3(x, y, z),
                vel: new THREE.Vector3(velX, velY, velZ),
                mass: COMET_MASS,
                id: 'halley',
                name: 'Halley',
                radius: COMET_RADIUS,
                rotation: { tilt: 0, speed: 0.05 },
                trailColor: 0xaaaaaa,
                maxTrail: 2000,
            },
            material
        );
    }
}
