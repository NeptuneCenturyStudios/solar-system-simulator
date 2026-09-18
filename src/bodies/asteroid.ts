import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { ICelestialBodyCreationOptions, IStateDependencies } from '../interfaces.js';
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
        options: ICelestialBodyCreationOptions
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
                attributes: options.attributes,
                orbitParent: options.orbitParent,
                orbitBarycenterMass: options.orbitBarycenterMass,
            },
            BodyTypeEnum.Asteroid
        );

        // Async OBJ load for Asteroid model (no MTL — we apply PBR manually)
        const objLoader = new OBJLoader();
        objLoader
            .loadAsync('./assets/models/asteroid-1/source/LPP.obj')
            .then((group) => {
                // Load PBR textures
                const texLoader = new THREE.TextureLoader();
                const baseColor = texLoader.load(
                    './assets/models/asteroid-1/textures/LPP_1001_BaseColor.png'
                );
                const metallic = texLoader.load(
                    './assets/models/asteroid-1/textures/LPP_1001_Metallic.png'
                );
                const roughness = texLoader.load(
                    './assets/models/asteroid-1/textures/LPP_1001_Roughness.png'
                );
                const normal = texLoader.load(
                    './assets/models/asteroid-1/textures/LPP_1001_Normal.png'
                );

                // Apply PBR material to all meshes
                group.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        const mesh = child as THREE.Mesh;

                        mesh.material = new THREE.MeshStandardMaterial({
                            map: baseColor,
                            metalnessMap: metallic,
                            roughnessMap: roughness,
                            normalMap: normal,

                            metalness: 1.0,
                            roughness: 1.0,
                        });

                        const mat = mesh.material as THREE.MeshStandardMaterial;

                        // Correct color spaces
                        mat.map!.colorSpace = THREE.SRGBColorSpace;
                        mat.metalnessMap!.colorSpace = THREE.LinearSRGBColorSpace;
                        mat.roughnessMap!.colorSpace = THREE.LinearSRGBColorSpace;

                        // Raycasting tag
                        mesh.userData.parentBody = this;
                    }
                });

                // Measure & fit model
                this.modelGroup = group;
                this.modelFit = measureModelFit(group);
                applyModelFit(group, this.modelFit, this.radius);

                this.mesh.add(group);
            })
            .catch((e) => {
                console.warn('Asteroid OBJ load failed — using placeholder mesh', e);
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
