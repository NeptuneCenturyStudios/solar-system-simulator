import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { measureModelFit, type IModelFit } from './model-fit';

export interface IAsteroidModelTemplate {
    /** Unscaled template group at identity transform. Never added to a scene or mutated —
     *  each Asteroid instance clones it (clone() shares the underlying geometry/material/
     *  texture GPU resources and only forks the lightweight transform/userData). */
    template: THREE.Group;
    fit: IModelFit;
}

let _templatePromise: Promise<IAsteroidModelTemplate> | null = null;

/**
 * Loads the shared asteroid OBJ model and its PBR textures exactly once per process and
 * caches the result. Asteroid previously created a new OBJLoader + TextureLoader (and
 * downloaded/decoded ~57MB across 4 PNGs) independently for every instance, which meant a
 * belt of a few hundred asteroids could redundantly load tens of gigabytes of duplicate
 * texture data. Every instance now clones this cached template instead.
 */
export function loadAsteroidModelTemplate(): Promise<IAsteroidModelTemplate> {
    if (_templatePromise) return _templatePromise;

    const objLoader = new OBJLoader();
    _templatePromise = objLoader
        .loadAsync('./assets/models/asteroid-1/source/LPP.obj')
        .then((group) => {
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

            // Apply the shared PBR material to every sub-mesh of the template. Instances
            // that clone this group all reference the same Material/Texture instances.
            group.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;

                    mesh.material = new THREE.MeshStandardMaterial({
                        map: baseColor,
                        metalnessMap: metallic,
                        roughnessMap: roughness,
                        normalMap: normal,
                        metalness: 0.01,
                        roughness: 1.0,
                    });

                    const mat = mesh.material as THREE.MeshStandardMaterial;

                    // Correct color spaces
                    mat.map!.colorSpace = THREE.SRGBColorSpace;
                    mat.metalnessMap!.colorSpace = THREE.LinearSRGBColorSpace;
                    mat.roughnessMap!.colorSpace = THREE.LinearSRGBColorSpace;
                }
            });

            // Measure once, while still at identity transform and detached from any parent.
            const fit = measureModelFit(group);

            return { template: group, fit };
        });

    return _templatePromise;
}
