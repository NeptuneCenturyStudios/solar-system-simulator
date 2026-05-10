import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { BodyTypeEnum } from '../utilities/utilities.js';
import { IStateDependencies } from '../interfaces.js';

export interface IAsteroidOptions {
    pos: THREE.Vector3 | number[];
    vel: THREE.Vector3 | number[];
    radius?: number;
    color?: number;
    mass?: number;
    id?: string | null;
    name?: string | null;
    trailColor?: number;
    maxTrail?: number;
    roughness?: number;
    metalness?: number;
}

/**
 * Creates a random polyhedron geometry by distorting an icosahedron.
 * Used to give asteroids a more natural, irregular shape.
 * @param radius The base radius of the polyhedron.
 * @returns A THREE.BufferGeometry representing the distorted polyhedron.
 */
function createRandomPolyhedron(radius: number): THREE.BufferGeometry {
    const geometry = new THREE.IcosahedronGeometry(radius, 0);
    const positions = geometry.attributes.position.array;

    for (let i = 0; i < positions.length; i += 3) {
        const distortionFactor = 0.3 + Math.random() * 0.4;
        positions[i] *= distortionFactor;
        positions[i + 1] *= distortionFactor;
        positions[i + 2] *= distortionFactor;
    }

    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Represents an asteroid in the simulation, inheriting from CelestialBody.
 * Randomizes shape, color, and physical properties if not provided.
 */
export class Asteroid extends CelestialBody {
    constructor(
        deps: IStateDependencies,
        scene: THREE.Scene,
        {
            radius = 0.5 + Math.random() * 2,
            color = 0x666666 + Math.random() * 0x444444,
            pos,
            vel,
            mass = 0.01 + Math.random() * 0.08,
            id = null,
            name = null,
            trailColor = 0x888888,
            maxTrail = 1500,
            roughness = 0.9,
            metalness = 0.1,
        }: IAsteroidOptions
    ) {
        if (!pos || !vel) {
            throw new Error('Asteroid requires { pos, vel }');
        }

        const posVec = Array.isArray(pos) ? new THREE.Vector3(pos[0], pos[1], pos[2]) : pos;
        const velVec = Array.isArray(vel) ? new THREE.Vector3(vel[0], vel[1], vel[2]) : vel;

        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: roughness,
            metalness: metalness,
        });

        console.log(
            `Creating asteroid with radius ${radius.toFixed(2)}, mass ${mass.toFixed(3)}, color #${Math.floor(color).toString(16)}`
        );

        super(
            deps,
            scene,
            radius,
            color,
            posVec,
            velVec,
            mass,
            id ?? `asteroid-${Math.random().toString(36).slice(2)}`,
            name ?? 'Asteroid',
            BodyTypeEnum.Asteroid,
            trailColor,
            maxTrail,
            false,
            {
                tilt: 0,
                speed: 0,
            },
            (r) => createRandomPolyhedron(r),
            material
        );

        // Override the axis and speed for a more random tumbling motion
        this.rotationAxis = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize();
        this.rotationSpeed = 0.6 + Math.random() * 1.2;
    }
}
