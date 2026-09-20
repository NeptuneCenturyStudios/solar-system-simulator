import * as THREE from 'three';
import { MTLLoader, OBJLoader } from 'three/examples/jsm/Addons.js';
import { measureModelFit, type IModelFit } from './model-fit';

/**
 * A model loaded once per process and shared by every body that uses it.
 *
 * `template` stays at identity transform and is never added to a scene or mutated — each
 * body clones it instead. clone() shares the underlying geometry/material/texture GPU
 * resources and only forks the lightweight transform/userData, so a belt of a few hundred
 * bodies costs one set of textures rather than one set per body.
 */
export interface IModelTemplate {
    template: THREE.Group;
    fit: IModelFit;
}

/**
 * PBR textures applied to every mesh of a loaded model. Each is optional: a model whose
 * materials come entirely from its MTL (or its OBJ's own vertex colours) simply omits them
 * and keeps whatever the loader produced.
 */
export interface IModelTextureMaps {
    /** Albedo / diffuse map. Treated as sRGB. */
    baseColor?: string;
    /** Metalness map. Treated as linear. */
    metallic?: string;
    /** Roughness map. Treated as linear. */
    roughness?: string;
    /** Normal map, passed through at its default (non-colour) interpretation. */
    normal?: string;
    /** Emissive map, Treated as sRGB */
    emissive?: string;
    /** AO map */
    ao?: string;
    /** Displacement map */
    displacement?: string;
    bump?: string;
    alphaMap?: string;
}

/**
 * Everything needed to load one OBJ model.
 *
 * One spec per model file: templates are cached by `objUrl`, so two specs pointing at the
 * same OBJ resolve to the first one loaded.
 */
export interface IObjModelSpec {
    /** URL of the `.obj` to load. */
    objUrl: string;
    /** URL of the matching `.mtl`, when the model ships one. */
    mtlUrl?: string;
    /** Explicit PBR textures, applied over whatever the MTL produced. */
    maps?: IModelTextureMaps;
    /** Metalness when `maps` is applied. Defaults to {@link DEFAULT_METALNESS}. */
    metalness?: number;
    /** Roughness when `maps` is applied. Defaults to {@link DEFAULT_ROUGHNESS}. */
    roughness?: number;
}

/** Rocky bodies read as rough dielectrics; matches the original asteroid materials. */
const DEFAULT_METALNESS = 0.01;
const DEFAULT_ROUGHNESS = 1.0;

/** One in-flight or resolved promise per OBJ URL, so each model is fetched and decoded once. */
const templateCache = new Map<string, Promise<IModelTemplate>>();

/**
 * Loads an OBJ model (optionally with its MTL and explicit PBR textures) exactly once per
 * process and caches the result. Bodies clone the returned template instead of re-loading,
 * which is what keeps a populated asteroid belt or comet field from downloading and
 * decoding the same textures hundreds of times over.
 *
 * The returned template is measured while still detached from any parent, so callers can
 * fit it to their own radius with `applyModelFit` — and re-fit it later on radius changes.
 */
export function loadObjModelTemplate(spec: IObjModelSpec): Promise<IModelTemplate> {
    const cached = templateCache.get(spec.objUrl);
    if (cached) return cached;

    const pending = loadUncachedTemplate(spec);
    templateCache.set(spec.objUrl, pending);
    return pending;
}

async function loadUncachedTemplate(spec: IObjModelSpec): Promise<IModelTemplate> {
    const objLoader = new OBJLoader();

    if (spec.mtlUrl) {
        const materials = await loadMaterials(spec.mtlUrl);
        // Materials only — the OBJ is still fetched separately below.
        materials.preload();
        objLoader.setMaterials(materials);
    }

    const group = await objLoader.loadAsync(spec.objUrl);

    if (spec.maps) {
        applyTextureMaps(
            group,
            spec.maps,
            spec.metalness ?? DEFAULT_METALNESS,
            spec.roughness ?? DEFAULT_ROUGHNESS
        );
    }

    // Measure once, while still at identity transform and detached from any parent.
    const fit = measureModelFit(group);

    return { template: group, fit };
}

/**
 * Loads an MTL through the standard loader, splitting the URL into the directory MTLLoader
 * wants as its path and the file name it resolves against that path. The MTL's own texture
 * references (`map_*`) resolve against the same directory.
 */
async function loadMaterials(mtlUrl: string): Promise<MTLLoader.MaterialCreator> {
    const { directory, fileName } = splitUrl(mtlUrl);
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath(directory);
    mtlLoader.setResourcePath(directory);
    return mtlLoader.loadAsync(fileName);
}

/** Splits a URL into its directory (trailing slash kept) and its file name. */
function splitUrl(url: string): { directory: string; fileName: string } {
    const lastSlash = url.lastIndexOf('/');
    if (lastSlash < 0) return { directory: '', fileName: url };
    return { directory: url.slice(0, lastSlash + 1), fileName: url.slice(lastSlash + 1) };
}

/**
 * Replaces every mesh material in the model with a single shared MeshStandardMaterial
 * carrying the supplied maps. Colour spaces are set per map type: albedo is sRGB, while
 * metalness and roughness maps are linear data and must not be gamma-decoded.
 */
function applyTextureMaps(
    group: THREE.Group,
    maps: IModelTextureMaps,
    metalness: number,
    roughness: number
): void {
    const textureLoader = new THREE.TextureLoader();

    const baseColorMap = maps.baseColor ? textureLoader.load(maps.baseColor) : undefined;
    const metallicMap = maps.metallic ? textureLoader.load(maps.metallic) : undefined;
    const roughnessMap = maps.roughness ? textureLoader.load(maps.roughness) : undefined;
    const normalMap = maps.normal ? textureLoader.load(maps.normal) : undefined;
    const emissiveMap = maps.emissive ? textureLoader.load(maps.emissive) : undefined;
    const aoMap = maps.ao ? textureLoader.load(maps.ao) : undefined;
    const displacementMap = maps.displacement ? textureLoader.load(maps.displacement) : undefined;
    const bumpMap = maps.bump ? textureLoader.load(maps.bump) : undefined;
    const alphaMap = maps.alphaMap ? textureLoader.load(maps.alphaMap) : undefined;

    if (baseColorMap) baseColorMap.colorSpace = THREE.SRGBColorSpace;
    if (metallicMap) metallicMap.colorSpace = THREE.LinearSRGBColorSpace;
    if (roughnessMap) roughnessMap.colorSpace = THREE.LinearSRGBColorSpace;
    if (emissiveMap) emissiveMap.colorSpace = THREE.SRGBColorSpace;
    if (aoMap) aoMap.colorSpace = THREE.LinearSRGBColorSpace;

    group.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;

        (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
            map: baseColorMap,
            metalnessMap: metallicMap,
            roughnessMap: roughnessMap,
            emissiveMap: emissiveMap,
            displacementMap: displacementMap,
            displacementScale: displacementMap ? 0.05 : undefined,
            bumpMap: bumpMap,
            bumpScale: bumpMap ? 0.05 : undefined,
            alphaMap: alphaMap,
            aoMap: aoMap,
            normalMap,
            metalness,
            roughness,
            emissive: emissiveMap ? new THREE.Color(0xffffff) : undefined,
            emissiveIntensity: emissiveMap ? 1 : undefined,
        });
    });
}
