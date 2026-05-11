import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
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

export class Asteroid extends CelestialBody {
    /**
     * Represents an asteroid in the simulation, inheriting from CelestialBody.
     * Randomizes shape, color, and physical properties if not provided.
     */
    constructor(deps: IStateDependencies, scene: THREE.Scene, options: IAsteroidOptions) {
        const {
            radius = 0.5 + Math.random() * 2,
            color = 0x666666 + Math.random() * 0x444444,
            pos,
            vel,
            mass = 0.01 + Math.random() * 0.08,
            id = null,
            name = null,
            trailColor = 0x888888,
            maxTrail = 1500,
        } = options;

        if (!pos || !vel) {
            throw new Error('Asteroid requires { pos, vel }');
        }

        const posVec = Array.isArray(pos) ? new THREE.Vector3(pos[0], pos[1], pos[2]) : pos;
        const velVec = Array.isArray(vel) ? new THREE.Vector3(vel[0], vel[1], vel[2]) : vel;

        // Geometry factory returns a placeholder geometry until OBJ loads
        const geometryFactory = () => new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const placeholderMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const placeholderMesh = new THREE.Mesh(geometryFactory(), placeholderMaterial);

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
            { tilt: 0, speed: 0 },
            placeholderMesh
        );

        // Async OBJ + MTL load for Asteroid model
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('./assets/models/');
        mtlLoader
            .loadAsync('Asteroid.mtl')
            .then((materials) => {
                materials.preload();
                const objLoader = new OBJLoader();
                objLoader.setMaterials(materials);
                return objLoader.loadAsync('./assets/models/Asteroid.obj');
            })
            .then((group) => {
                // Compute bounding box of the unscaled model
                const bbox = new THREE.Box3().setFromObject(group);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const longestDim = Math.max(size.x, size.y, size.z);
                // Use this.radius to match the instance's radius
                const scale = this.radius / (longestDim * 0.5);
                group.scale.setScalar(scale);

                // Re-compute bbox after scaling to find the center
                group.updateMatrixWorld(true);
                const scaledBbox = new THREE.Box3().setFromObject(group);
                const center = new THREE.Vector3();
                scaledBbox.getCenter(center);
                group.position.sub(center);

                // Enable shadows on every sub-mesh
                group.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                this.mesh.add(group);
            })
            .catch((e) => {
                console.warn('Asteroid OBJ/MTL load failed — using placeholder mesh', e);
            });

        // Override the axis and speed for a more random tumbling motion
        const rotationAxis = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize();

        const rotationSpeed = 0.6 + Math.random() * 1.2;

        this.updateRotation(rotationAxis, rotationSpeed);
    }
}
