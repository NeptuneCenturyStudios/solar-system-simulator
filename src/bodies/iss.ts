import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { SCALE_FACTOR, ISS_RADIUS } from '../utilities/consts.js';
import { ICelestialBodyCreationOptions, ITidalLockOptions } from './celestial-body';
import { IStateDependencies } from '../interfaces';
import { Satellite } from './satellite.js';

const SF = SCALE_FACTOR / SCALE_FACTOR;

export interface ISatelliteCreationOptions extends ICelestialBodyCreationOptions {
    angle: number;
    yVariation: number;
    distance: number;
    tidalLock: ITidalLockOptions;
}

/**
 * ISS
 */
export class ISS extends Satellite {
    /**
     * Constructs a new Spaceship object with camera offsets and placeholder geometry.
     * @param dependencies External dependencies for the spaceship.
     * @param scene The THREE.Scene to which the spaceship belongs.
     * @param position The initial position of the spaceship.
     * @param velocity The initial velocity of the spaceship.
     * @param id Unique identifier for the spaceship.
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
        super(
            dependencies,
            scene,
            options,
        );

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
                const scale = (ISS_RADIUS * SF) / longestDim;
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

                this.mesh.add(group);
            })
            .catch((e) => {
                console.warn('Spaceship OBJ/MTL load failed — using placeholder mesh', e);
            });
    }
}
