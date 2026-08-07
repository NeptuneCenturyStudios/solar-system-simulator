import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

/**
 * Creates the invisible placeholder container mesh that every Spaceship passes
 * to its Body base class.  The concrete ship subclass attaches its loaded OBJ
 * model to this container once the async load resolves.
 */
export function createShipContainerMesh(): THREE.Mesh {
    const placeholderGeometry = new THREE.BoxGeometry(0.001, 0.001, 0.001);
    const placeholderMaterial = new THREE.MeshBasicMaterial({ visible: false });
    return new THREE.Mesh(placeholderGeometry, placeholderMaterial);
}

/**
 * Asynchronously loads an OBJ/MTL pair, scales it to fit SPACESHIP_RADIUS,
 * centres it on the given container mesh, and marks meshes to draw after
 * effects.  Resolves with the model's bounding box in container-local space;
 * ship subclasses feed that into Spaceship.applyModelOffsets() to place the
 * cockpit/thruster/muzzle anchors.
 *
 * Ships are authored nose-first along +Z.  Models that don't follow that
 * convention pass a modelRotation (e.g. yaw) that is applied BEFORE scaling
 * and centring, so the returned bounding box — and therefore the
 * cockpit/thruster/muzzle anchors derived from it — reflects the corrected
 * orientation.
 *
 * @param container       The placeholder mesh the model group is attached to.
 * @param modelName       Base filename (without extension) of the OBJ/MTL model.
 * @param radius          The ship radius the model's longest dimension is scaled to fit.
 * @param modelRotation   Optional Euler correction for models not authored +Z-forward.
 */
export async function loadShipModelInto(
    container: THREE.Mesh,
    modelName: string,
    radius: number,
    modelRotation: THREE.Euler = new THREE.Euler()
): Promise<THREE.Box3> {
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath('./assets/models/');
    const materials = await mtlLoader.loadAsync(`${modelName}.mtl`);
    materials.preload();

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    const group = await objLoader.loadAsync(`./assets/models/${modelName}.obj`);

    // Apply any authored orientation correction before measuring/scaling so the
    // bbox stays aligned to the game's local axes (+Z = forward, +Y = up).
    group.rotation.copy(modelRotation);

    // Compute bounding box of the unscaled model (group at world origin, no parent).
    const bbox = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const longestDim = Math.max(size.x, size.y, size.z);
    const scale = radius / longestDim;
    group.scale.setScalar(scale);

    // Re-compute bbox after scaling to find the center.
    group.updateMatrixWorld(true);
    const scaledBbox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    scaledBbox.getCenter(center);
    group.position.sub(center);

    // Compute LOCAL bbox now — before adding to the container — so world space
    // equals mesh-local space and the values are valid as local offsets.
    group.updateMatrixWorld(true);
    const localBbox = new THREE.Box3().setFromObject(group);

    group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            child.renderOrder = 2; // draw after effects (renderOrder 1)
        }
    });

    container.add(group);
    return localBbox;
}
