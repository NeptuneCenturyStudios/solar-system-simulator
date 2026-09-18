import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { ICelestialBodyCreationOptions, IDeathOptions, IStateDependencies } from '../interfaces.js';
import { BodyTypeEnum } from './body-enums';
import { applyModelFit, type IModelFit } from './model-fit';
import { loadAsteroidRedModelTemplate } from './asteroid-model-cache';

export class AsteroidRed extends CelestialBody {
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

        // Model + PBR textures are loaded once and cached for the process lifetime; every
        // instance clones the shared template instead of re-downloading/decoding textures.
        loadAsteroidRedModelTemplate()
            .then(({ template, fit }) => {
                // clone() shares the template's geometry/material/texture GPU resources and
                // only forks the lightweight transform, so this is cheap per instance.
                const group = template.clone();

                // Tag every loaded sub-mesh so click-picking resolves to this body.
                // The base Body tags only the placeholder mesh; without this the
                // raycaster hits an untagged OBJ child and selection silently fails.
                group.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.userData.parentBody = this;
                    }
                });

                this.modelGroup = group;
                this.modelFit = fit;
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

    /**
     * The OBJ model's geometry/materials/textures are shared (via clone()) across every
     * Asteroid instance — see asteroid-model-cache.ts. Body.die() disposes every mesh under
     * this.mesh, which would destroy those shared GPU resources for every other asteroid
     * still on screen. Detach the clone first so only this asteroid's own (unshared)
     * placeholder geometry/material gets disposed.
     */
    override die(deathOptions?: IDeathOptions): void {
        if (this.modelGroup) {
            this.mesh.remove(this.modelGroup);
        }
        super.die(deathOptions);
    }
}
