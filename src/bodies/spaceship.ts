import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { Body } from './body';
import { BodyTypeEnum } from '../utilities/utilities.js';
import { SCALE_FACTOR } from '../utilities/consts.js';
import { IShipEffect } from '../ship-effects/ship-effect-base.js';
import { ShipFlame } from '../ship-effects/ship-flame.js';
//import { ShipFlame } from '../ship-effects/ship-flame.js';

const SF = SCALE_FACTOR / SCALE_FACTOR;

/**
 * Player-controllable spaceship body.
 * Ship local axes: +Z = forward, +Y = up, +X = right.
 * Geometry is assembled from merged primitives scaled by SCALE_FACTOR.
 * Extends Body so gravity applies automatically when added to simulationState.bodies.
 */
export class Spaceship extends Body {
    /** Local-space offset for 1st-person cockpit camera. */
    cockpitOffset: THREE.Vector3;
    /** Local-space offset for 3rd-person chase camera. */
    thirdPersonOffset: THREE.Vector3;
    /** Local-space offset to the engine nozzle (used for the trail origin). */
    thrusterOffset: THREE.Vector3;
    /** Glowing engine exhaust trail rendered as a connected line in world space. */
    trail: IShipEffect;

    /**
     * Constructs a new Spaceship object with camera offsets and placeholder geometry.
     * @param dependencies External dependencies for the spaceship.
     * @param scene The THREE.Scene to which the spaceship belongs.
     * @param position The initial position of the spaceship.
     * @param velocity The initial velocity of the spaceship.
     * @param id Unique identifier for the spaceship.
     */
    constructor(
        dependencies: object,
        scene: THREE.Scene,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        id: string
    ) {
        // Invisible placeholder mesh — replaced by the loaded OBJ group once ready.
        const placeholderGeometry = new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const placeholderMaterial = new THREE.MeshBasicMaterial({ visible: false });

        const radius = 0.01 * SF; // Approximate half-wingspan for collision purposes

        // ── Base class ────────────────────────────────────────────────────────
        super(
            dependencies,
            scene,
            /* mass — tiny so it barely perturbs celestial orbits */ 0.001,
            radius,
            position,
            velocity,
            placeholderGeometry,
            placeholderMaterial,
            id,
            'Spaceship',
            BodyTypeEnum.SpaceShip
        );

        // Initial camera offsets (approximate; updated precisely after OBJ loads).
        this.cockpitOffset = new THREE.Vector3(0, 0.3 * SF, 0.52 * SF);
        this.thrusterOffset = new THREE.Vector3(0, -0.1 * SF, -0.9 * SF);
        this.thirdPersonOffset = new THREE.Vector3(0, 0.4 * SF, -2.2 * SF);

        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        // Engine exhaust trail (Line-based, no gaps at any speed)
        this.trail = new ShipFlame(scene);

        // Keep default label (shows in bodies table) but hide it during flight
        if (this.label) this.label.visible = false;
        if (this.labelLine) this.labelLine.visible = false;

        // ── Async OBJ + MTL load ──────────────────────────────────────────────
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('./assets/models/');
        mtlLoader
            .loadAsync('spaceship.mtl')
            .then((materials) => {
                materials.preload();
                const objLoader = new OBJLoader();
                objLoader.setMaterials(materials);
                return objLoader.loadAsync('./assets/models/spaceship.obj');
            })
            .then((group) => {
                // Compute bounding box of the unscaled model (group at world origin, no parent).
                const bbox = new THREE.Box3().setFromObject(group);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const longestDim = Math.max(size.x, size.y, size.z);
                const scale = (0.6 * SF) / longestDim;
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
                const localBbox = new THREE.Box3().setFromObject(group);

                // Enable shadows on every sub-mesh.
                group.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.castShadow = true;
                    }
                });

                this.mesh.add(group);

                // Update camera/thruster offsets from the local bbox.
                this.cockpitOffset.set(0, localBbox.max.y * 0.5, localBbox.max.z * 0.75);
                this.thrusterOffset.set(0, localBbox.min.y * 0.3, localBbox.min.z);
            })
            .catch((e) => {
                console.warn('Spaceship OBJ/MTL load failed — using placeholder mesh', e);
            });
    }
}
