import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { measureModelFit } from './model-fit';
import type { IModelTemplate } from './obj-model-cache';

/**
 * Everything needed to load one GLB/GLTF model.
 *
 * One spec per model file: templates are cached by `glbUrl`, so two specs pointing at the
 * same GLB resolve to the first one loaded.
 */
export interface IGltfModelSpec {
    /** URL of the `.glb`/`.gltf` to load. */
    glbUrl: string;
}

/** One in-flight or resolved promise per GLB URL, so each model is fetched and decoded once. */
const templateCache = new Map<string, Promise<IModelTemplate>>();

/**
 * Loads a GLB/GLTF model exactly once per process and caches the result. Bodies clone the
 * returned template instead of re-loading — same sharing strategy as `loadObjModelTemplate`.
 *
 * Unlike OBJ, a GLB carries its own PBR materials and textures, so no separate texture-map
 * wiring is needed here: `gltf.scene` arrives fully textured.
 *
 * The returned template is measured while still detached from any parent, so callers can
 * fit it to their own radius with `applyModelFit` — and re-fit it later on radius changes.
 */
export function loadGltfModelTemplate(spec: IGltfModelSpec): Promise<IModelTemplate> {
    const cached = templateCache.get(spec.glbUrl);
    if (cached) return cached;

    const pending = loadUncachedTemplate(spec);
    templateCache.set(spec.glbUrl, pending);
    return pending;
}

async function loadUncachedTemplate(spec: IGltfModelSpec): Promise<IModelTemplate> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(spec.glbUrl);
    const group = gltf.scene;

    // Measure once, while still at identity transform and detached from any parent.
    const fit = measureModelFit(group);

    return { template: group, fit };
}
