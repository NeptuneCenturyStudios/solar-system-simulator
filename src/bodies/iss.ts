import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { ISS_RADIUS } from '../utilities/consts.js';
import { ISatelliteCreationOptions, IStateDependencies } from '../interfaces';
import { Satellite } from './satellite.js';

/**
 * ISS
 */
export class ISS extends Satellite {
    /**
     * Constructs a new ISS object with camera offsets and placeholder geometry.
     * @param dependencies External dependencies for the ISS.
     * @param scene The THREE.Scene to which the ISS belongs.
     * @param options Creation options for the ISS.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: ISatelliteCreationOptions
    ) {
        // Invisible placeholder mesh — replaced by the loaded OBJ group once ready.
        const placeholderGeometry = new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const placeholderMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const placeholderMesh = new THREE.Mesh(placeholderGeometry, placeholderMaterial);

        options.mesh = placeholderMesh;
        
        // ── Base class ────────────────────────────────────────────────────────
        super(dependencies, scene, options);

        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        // ── Async OBJ + MTL load ──────────────────────────────────────────────
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('./assets/models/');
        mtlLoader
            .loadAsync('InternationalSpaceStation.mtl')
            .then((materials) => {
                materials.preload();
                const objLoader = new OBJLoader();
                objLoader.setMaterials(materials);
                return objLoader.loadAsync('./assets/models/InternationalSpaceStation.obj');
            })
            .then((group) => {
                // Compute bounding box of the unscaled model (group at world origin, no parent).
                const bbox = new THREE.Box3().setFromObject(group);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const longestDim = Math.max(size.x, size.y, size.z);
                const scale = ISS_RADIUS / longestDim;
                group.scale.setScalar(scale);

                // Re-compute bbox after scaling to find the center.
                group.updateMatrixWorld(true);
                const scaledBbox = new THREE.Box3().setFromObject(group);
                const center = new THREE.Vector3();
                scaledBbox.getCenter(center);
                group.position.sub(center);

                // Compute LOCAL bbox now — before adding to this.mesh — so world space
                // equals mesh-local space and the values are valid as local offsets.
                group.updateMatrixWorld(true);

                // Enable shadows on every sub-mesh.
                group.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.castShadow = true;
                    }
                });

                // Orient ISS so its long axis points north/south (Z axis)
                //group.rotation.y = Math.PI / 2; // Adjust as needed based on your model
                group.rotation.x = Math.PI / 2; // Adjust as needed based on your model
                group.rotation.z = Math.PI; // Adjust as needed based on your model

                this.mesh.add(group);
            })
            .catch((e) => {
                console.warn('ISS OBJ/MTL load failed — using placeholder mesh', e);
            });
    }
}
