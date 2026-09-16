import * as THREE from 'three';
import { Comet } from './comet';
import { ICometCreationOptions, IStateDependencies } from '../interfaces.js';
import { MTLLoader, OBJLoader } from 'three/examples/jsm/Addons.js';
import { applyModelFit, measureModelFit, type IModelFit } from './model-fit';

/**
 * Represents a generic comet in the simulation, with a realistic elliptical orbit and physical properties.
 * Inherits from Comet and sets up comet-specific trajectory and material.
 */
export class GenericComet extends Comet {
    /** Loaded OBJ model, re-fitted whenever the radius changes. Null until the load resolves. */
    private modelGroup: THREE.Object3D | null = null;
    /** Measurement of the unscaled model, cached at load time. */
    private modelFit: IModelFit | null = null;

    /**
     * Constructs a new GenericComet object with its unique elliptical orbit and properties.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which the comet belongs.
     * @param options Creation options for the comet.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: ICometCreationOptions
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
            tailColor: options.tailColor,
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
                console.warn('asteroid1 OBJ/MTL load failed — using placeholder mesh', e);
            });
    }

    /**
     * The comet's own mesh is a tiny invisible proxy for the loaded OBJ — turning it
     * into a full-size sphere would add an invisible click/pick target around the nucleus.
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
