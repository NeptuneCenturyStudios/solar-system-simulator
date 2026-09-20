import { loadObjModelTemplate, type IModelTemplate, type IObjModelSpec } from './obj-model-cache';

/**
 * The comet nucleus, OBJ plus MTL plus the four PBR maps that ship beside it. The MTL is
 * loaded (so `mtllib` resolves and any MTL-only model keeps working), then the maps override
 * it — this model's MTL carries material parameters only, no texture references of its own.
 *
 * Texture file names contain spaces; the browser percent-encodes them when the URL resolves.
 */
const COMET_NUCLEUS_SPEC: IObjModelSpec = {
    objUrl: './assets/models/comet-1/comet.obj',
    mtlUrl: './assets/models/comet-1/comet.mtl',
    maps: {
        baseColor: './assets/models/comet-1/textures/Rock_LowPoly BaseColor.jpg',
        metallic: './assets/models/comet-1/textures/Rock_LowPoly Metallic.jpg',
        roughness: './assets/models/comet-1/textures/Rock_LowPoly Roughness.jpg',
        normal: './assets/models/comet-1/textures/Rock_LowPoly Normal_DirectX.jpg',
    },
};

const COMET_NUCLEUS_SPEC2: IObjModelSpec = {
    objUrl: './assets/models/comet-2/comet-2.obj',
    mtlUrl: './assets/models/comet-2/comet-2.mtl',
    maps: {
        baseColor: './assets/models/comet-2/textures/ice_col.png',
        displacement: './assets/models/comet-2/ice_col_d.png',
        normal: './assets/models/comet-2/textures/base_nor.png',
        alphaMap: './assets/models/comet-2/textures/ice_col_a.png'
    },
};

/**
 * Shared comet nucleus template. Comets previously created a fresh OBJLoader + MTLLoader per
 * instance; with this model's ~11MB of textures that would decode a full copy for every
 * comet in a procedurally generated system. Every comet now clones this cached template —
 * see obj-model-cache.ts for the caching, MTL and material setup.
 */
export function loadCometNucleusModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(COMET_NUCLEUS_SPEC2);
}
