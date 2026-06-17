import * as THREE from 'three';

import {
    SUN_MASS,
    COMET_PERIHELION_DIST,
    COMET_APHELION_DIST,
    COMET_RADIUS,
    COMET_MASS,
} from '../utilities/consts.js';

import { Comet } from './comet';
import { IStateDependencies } from '../interfaces.js';
import { MTLLoader, OBJLoader } from 'three/examples/jsm/Addons.js';

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
        const gEff = dependencies.getG();
        const speed = Math.sqrt(gEff * SUN_MASS * (2 / distance - 1 / semiMajorAxis));

        // Velocity perpendicular to radius, inclined
        const velX = -speed * Math.sin(Math.PI / 4) * Math.cos(inclination);
        const velY = speed * Math.sin(inclination) * 0.3;
        const velZ = speed * Math.cos(Math.PI / 4) * Math.cos(inclination);

        // Geometry factory returns a placeholder geometry until OBJ loads
        const geometryFactory = () => new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const placeholderMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const placeholderMesh = new THREE.Mesh(geometryFactory(), placeholderMaterial);

        super(dependencies, scene, {
            pos: new THREE.Vector3(x, y, z),
            vel: new THREE.Vector3(velX, velY, velZ),
            mass: COMET_MASS,
            id: 'halley',
            name: 'Halley',
            radius: COMET_RADIUS,
            rotation: { tilt: 0, speed: 0.05 },
            trailColor: 0xaaaaaa,
            maxTrail: 2000,
            mesh: placeholderMesh,
        });

        // Async OBJ + MTL load for Comet model
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('./assets/models/');
        mtlLoader
            .loadAsync('Asteroid1.mtl')
            .then((materials) => {
                materials.preload();
                const objLoader = new OBJLoader();
                objLoader.setMaterials(materials);
                return objLoader.loadAsync('./assets/models/asteroid.obj');
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
                console.warn('asteroid1 OBJ/MTL load failed — using placeholder mesh', e);
            });
    }
}
