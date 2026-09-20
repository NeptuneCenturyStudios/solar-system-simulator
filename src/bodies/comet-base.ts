import * as THREE from 'three';

import { Comet } from './comet';
import { ICometCreationOptions, IDeathOptions, IStateDependencies } from '../interfaces.js';
import { applyModelFit, type IModelFit } from './model-fit';
import type { IModelTemplate } from './obj-model-cache';

/**
 * The per-variant configuration a comet subclass hands to {@link CometBase}.
 *
 * Mirrors the asteroid side: a comet subclass supplies the cached nucleus template it
 * clones and the motion-trail colour it uses when the caller does not pick one. The tail's
 * own colour stays caller-owned (procedural palette, Halley's default, the Add-Comet
 * picker), since it is a separate, user-editable property rather than a model trait.
 */
export interface ICometModelConfig {
    /**
     * Resolves the process-lifetime cached nucleus template this comet clones per instance.
     * Provided by comet-model-cache.ts.
     */
    loadTemplate: () => Promise<IModelTemplate>;
    /** Motion-trail colour used when the caller passes no `trailColor`. */
    trailColor: number;
}

/**
 * Shared implementation for comets that render a loaded OBJ nucleus.
 *
 * {@link Comet} owns the tail; this class owns the nucleus model. It mirrors AsteroidBase:
 * an invisible placeholder mesh is handed to the base, the OBJ is loaded from a cached
 * template, and each instance clones that template — clone() shares the template's
 * geometry/material/texture GPU resources and only forks the lightweight transform, so a
 * system full of comets costs one set of textures rather than one set each.
 */
export abstract class CometBase extends Comet {
    /** Loaded OBJ model, re-fitted whenever the radius changes. Null until the load resolves. */
    private modelGroup: THREE.Object3D | null = null;
    /** Measurement of the unscaled model, cached at load time. */
    private modelFit: IModelFit | null = null;

    /**
     * Constructs a comet whose nucleus comes from `config`.
     */
    constructor(
        deps: IStateDependencies,
        scene: THREE.Scene,
        options: ICometCreationOptions,
        config: ICometModelConfig
    ) {
        // Geometry factory returns a placeholder geometry until OBJ loads
        const geometryFactory = () => new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const placeholderMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const placeholderMesh = new THREE.Mesh(geometryFactory(), placeholderMaterial);

        super(deps, scene, {
            // Everything the caller passed flows through; only the placeholder mesh and the
            // variant's default trail colour are injected over it.
            ...options,
            mesh: placeholderMesh,
            trailColor: options.trailColor ?? config.trailColor,
        });

        // Model + PBR textures are loaded once and cached for the process lifetime; every
        // comet clones the shared template instead of re-downloading/decoding textures.
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
                console.warn('Comet nucleus OBJ load failed - using placeholder mesh', e);
            });
    }

    /**
     * The comet's own mesh is a tiny invisible proxy for the loaded OBJ — turning it into a
     * full-size sphere would add an invisible click/pick target around the nucleus.
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
     * The nucleus model's geometry/materials/textures are shared (via clone()) across every
     * comet instance — see obj-model-cache.ts. Body.die() disposes every mesh under this.mesh,
     * which would destroy those shared GPU resources for every other comet still on screen.
     * Detach the clone first so only this comet's own (unshared) placeholder geometry and the
     * tail are disposed.
     */
    override die(deathOptions?: IDeathOptions): void {
        if (this.modelGroup) {
            this.mesh.remove(this.modelGroup);
        }
        super.die(deathOptions);
    }
}
