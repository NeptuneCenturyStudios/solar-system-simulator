import * as THREE from 'three';
import { Comet } from './comet';
import { IOrbitalBodyCreationOptions, IStateDependencies } from '../interfaces.js';
import { MTLLoader, OBJLoader } from 'three/examples/jsm/Addons.js';

/**
 * Represents a generic comet in the simulation, with a realistic elliptical orbit and physical properties.
 * Inherits from Comet and sets up comet-specific trajectory and material.
 */
export class GenericComet extends Comet {
    /**
     * Constructs a new GenericComet object with its unique elliptical orbit and properties.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which the comet belongs.
     * @param options Creation options for the comet.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: IOrbitalBodyCreationOptions
    ) {
        // Geometry factory returns a placeholder geometry until OBJ loads
        const geometryFactory = () => new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const placeholderMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const placeholderMesh = new THREE.Mesh(geometryFactory(), placeholderMaterial);

        super(dependencies, scene, {
            pos: options.pos,
            vel: options.vel,
            mass: options.mass,
            id: options.id,
            name: options.name,
            radius: options.radius,
            rotation: options.rotation,
            trailColor: options.trailColor,
            maxTrail: options.maxTrail,
            mesh: placeholderMesh,
        });

        // Async OBJ + MTL load for Comet model
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('./assets/models/');
        mtlLoader
            .loadAsync('asteroid1.mtl')
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

                this.mesh.add(group);
            })
            .catch((e) => {
                console.warn('asteroid1 OBJ/MTL load failed — using placeholder mesh', e);
            });
    }
}
