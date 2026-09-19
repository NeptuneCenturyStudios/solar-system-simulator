import * as THREE from 'three';

import { CelestialBody } from './celestial-body';
import { ICelestialBodyCreationOptions, IDeathOptions, IStateDependencies } from '../interfaces.js';
import { BodyTypeEnum } from './body-enums';
import { applyModelFit, type IModelFit } from './model-fit';
import type { IAsteroidModelTemplate } from './asteroid-model-cache';

/**
 * The per-variant configuration an asteroid subclass hands to {@link AsteroidBase}.
 *
 * Everything that distinguishes one asteroid variant from another lives here: which cached
 * OBJ template it clones, and the trail colour it uses when the caller does not pick one.
 * Adding a variant therefore means a loader in asteroid-model-cache.ts plus an entry in
 * asteroid-variants.ts - never another copy of the construction machinery.
 */
export interface IAsteroidModelConfig {
    /**
     * Resolves the process-lifetime cached model template this variant clones per instance.
     * Provided by asteroid-model-cache.ts.
     */
    loadTemplate: () => Promise<IAsteroidModelTemplate>;
    /**
     * Trail colour for this variant, used when the caller passes no `trailColor`. Lets a
     * 300-rock band read as a mixed field with per-variant trail tints while still allowing
     * a scenario to force a single colour when legibility demands it.
     */
    trailColor: number;
}

/**
 * Shared implementation for every asteroid variant.
 *
 * Asteroids render a loaded OBJ instead of the base sphere, so they all share one
 * construction path: an invisible placeholder mesh is handed to CelestialBody, the OBJ is
 * loaded from a cached template, and each instance clones that template - clone() shares the
 * template's geometry/material/texture GPU resources and only forks the lightweight
 * transform, so a 300-strong belt costs one set of textures rather than 300.
 */
export abstract class AsteroidBase extends CelestialBody {
    /** Loaded OBJ model, re-fitted whenever the radius changes. Null until the load resolves. */
    private modelGroup: THREE.Object3D | null = null;
    /** Measurement of the unscaled model, cached at load time. */
    private modelFit: IModelFit | null = null;

    /**
     * Represents an asteroid in the simulation, inheriting from CelestialBody.
     * The variant-specific model and trail colour come from `config`.
     */
    constructor(
        deps: IStateDependencies,
        scene: THREE.Scene,
        options: ICelestialBodyCreationOptions,
        config: IAsteroidModelConfig
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
                // Caller-supplied colour wins; otherwise the variant's own tint.
                trailColor: options.trailColor ?? config.trailColor,
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
        config
            .loadTemplate()
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
                console.warn('Asteroid OBJ load failed - using placeholder mesh', e);
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
     * The asteroid's own mesh is a tiny invisible proxy for the loaded OBJ - turning it
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
     * asteroid instance - see asteroid-model-cache.ts. Body.die() disposes every mesh under
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
