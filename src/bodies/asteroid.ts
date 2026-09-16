import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { IOrbitalBodyCreationOptions, IStateDependencies } from '../interfaces.js';
import { BodyTypeEnum } from './body-enums';
import { applyModelFit, measureModelFit, type IModelFit } from './model-fit';

export class Asteroid extends CelestialBody {
    /** Loaded OBJ model, re-fitted whenever the radius changes. Null until the load resolves. */
    private modelGroup: THREE.Object3D | null = null;
    /** Measurement of the unscaled model, cached at load time. */
    private modelFit: IModelFit | null = null;

    /**
     * Represents an asteroid in the simulation, inheriting from CelestialBody.
     * Randomizes shape, color, and physical properties if not provided.
     */
    constructor(
        deps: IStateDependencies,
        scene: THREE.Scene,
        options: IOrbitalBodyCreationOptions
    ) {
        // Geometry factory returns a placeholder geometry until OBJ loads
        const geometryFactory = () => new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const placeholderMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const placeholderMesh = new THREE.Mesh(geometryFactory(), placeholderMaterial);

        super(
            deps,
            scene,
            {
                radius: options.radius,
                pos: options.pos,
                vel: options.vel,
                mass: options.mass,
                id: options.id ?? `asteroid-${Math.random().toString(36).slice(2)}`,
                name: options.name ?? 'Asteroid',
                trailColor: options.trailColor,
                hasRings: false,
                maxTrail: options.maxTrail,
                rotation: options.rotation,
                mesh: placeholderMesh,
            },
            BodyTypeEnum.Asteroid
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
                // Measure while still detached, then fit to the instance's current radius.
                // Keeping the measurement lets setRadius re-fit the model later.
                this.modelGroup = group;
                this.modelFit = measureModelFit(group);
                applyModelFit(group, this.modelFit, this.radius);

                // Tag every loaded sub-mesh so click-picking resolves to this body.
                // The base Body tags only the placeholder mesh; without this the
                // raycaster hits an untagged OBJ child and selection silently fails.
                group.traverse((child) => (child.userData.parentBody = this));

                this.mesh.add(group);
            })
            .catch((e) => {
                console.warn('Asteroid OBJ/MTL load failed — using placeholder mesh', e);
            });

        // When no explicit rotation was provided, randomize a tumbling axis and speed.
        if (!options.rotation) {
            const rotationAxis = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize();

            const rotationSpeed = 0.6 + Math.random() * 1.2;

            this.updateRotation(rotationAxis, rotationSpeed);
        }
    }

    /**
     * The asteroid's own mesh is a tiny invisible proxy for the loaded OBJ — turning it
     * into a full-size sphere would add an invisible click/pick target around the rock.
     */
    protected override rebuildMeshGeometry(): void {
        // Intentionally empty: the visible shape is the OBJ model, rescaled in setRadius.
    }

    override setRadius(newRadius: number) {
        super.setRadius(newRadius);

        // When the model hasn't loaded yet the loader reads this.radius on resolve,
        // so it picks up the new size on its own.
        if (this.modelGroup && this.modelFit) {
            applyModelFit(this.modelGroup, this.modelFit, newRadius);
        }
    }
}
