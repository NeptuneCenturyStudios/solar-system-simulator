import { loadObjModelTemplate, type IModelTemplate, type IObjModelSpec } from './obj-model-cache';
import { loadGltfModelTemplate, type IGltfModelSpec } from './gltf-model-cache';

/**
 * The standard grey rock: OBJ and its own maps.
 */
const ASTEROID_VARIANT_1_SPEC: IObjModelSpec = {
    objUrl: './assets/models/asteroid-1/source/LPP.obj',
    maps: {
        baseColor: './assets/models/asteroid-1/textures/LPP_1001_BaseColor.png',
        metallic: './assets/models/asteroid-1/textures/LPP_1001_Metallic.png',
        roughness: './assets/models/asteroid-1/textures/LPP_1001_Roughness.png',
        normal: './assets/models/asteroid-1/textures/LPP_1001_Normal.png',
    },
};

/** The molten asteroid: same pipeline, its own OBJ and maps. */
const ASTEROID_VARIANT_2_SPEC: IObjModelSpec = {
    objUrl: './assets/models/asteroid-2/source/Meteor_mp.obj',
    maps: {
        baseColor: './assets/models/asteroid-2/textures/meteor_Base_Color.png',
        roughness: './assets/models/asteroid-2/textures/meteor_Roughness.png',
        normal: './assets/models/asteroid-2/textures/meteor_Normal_OpenGL.png',
        emissive: './assets/models/asteroid-2/textures/meteor_Emissive.png',
        ao: './assets/models/asteroid-2/textures/meteor_Mixed_AO.png',
    },
};

/** The mineralized asteroid: same pipeline, its own OBJ and maps. */
const ASTEROID_VARIANT_3_SPEC: IObjModelSpec = {
    objUrl: './assets/models/asteroid-3/source/A2.obj',
    maps: {
        baseColor: './assets/models/asteroid-3/textures/Albedo.jpg',
        normal: './assets/models/asteroid-3/textures/Normal.jpg',
        emissive: './assets/models/asteroid-3/textures/Emission.jpg',
        metallic: './assets/models/asteroid-3/textures/Metalness.jpg',
        displacement: './assets/models/asteroid-3/textures/Displacement.jpg'
    },
};

/** The red rock: same pipeline, its own OBJ and maps. */
const ASTEROID_VARIANT_4_SPEC: IObjModelSpec = {
    objUrl: './assets/models/asteroid-4/source/Asteroit.obj',
    maps: {
        baseColor: './assets/models/asteroid-4/textures/LPP_1001_BaseColor.png',
        roughness: './assets/models/asteroid-4/textures/LPP_1001_Roughness.png',
        normal: './assets/models/asteroid-4/textures/LPP_1001_Normal.png',
    }
};

/** A rocky asteroid: same pipeline, its own OBJ and maps. */
const ASTEROID_VARIANT_5_SPEC: IObjModelSpec = {
    objUrl: './assets/models/asteroid-5/source/MET02.obj',
    maps: {
        baseColor: './assets/models/asteroid-5/textures/MET02_sphereSG2_BaseColor.1001.png',
        normal: './assets/models/asteroid-5/textures/MET02_sphereSG2_Normal.1001.png',
        metallic: './assets/models/asteroid-5/textures/MET02_sphereSG2_Metallic.1001.png',
        roughness: './assets/models/asteroid-5/textures/MET02_sphereSG2_Roughness.1001.png',
    }
};

/** Vesta: GLB with embedded PBR materials/textures — no separate maps needed. */
const ASTEROID_VESTA_SPEC: IGltfModelSpec = {
    glbUrl: './assets/models/asteroid-vesta/source/Vesta_1_100.glb',
};



/**
 * Shared asteroid template. Asteroid used to create its own OBJLoader + TextureLoader (and
 * download/decode ~57MB across 4 PNGs) per instance, so a belt of a few hundred asteroids
 * could redundantly load tens of gigabytes of duplicate texture data. Every instance now
 * clones this cached template — see obj-model-cache.ts for the caching and material setup.
 */
export function loadAsteroidVariant1ModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(ASTEROID_VARIANT_1_SPEC);
}

/** Shared template for the molten asteroid variant. */
export function loadAsteroidVariant2ModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(ASTEROID_VARIANT_2_SPEC);
}

/** Shared template for the mineralized asteroid variant. */
export function loadAsteroidVariant3ModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(ASTEROID_VARIANT_3_SPEC);
}

/** Shared template for the red asteroid variant. */
export function loadAsteroidVariant4ModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(ASTEROID_VARIANT_4_SPEC);
}

/** Shared template for the rocky asteroid variant. */
export function loadAsteroidVariant5ModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(ASTEROID_VARIANT_5_SPEC);
}

/** Shared template for the vesta asteroid. */
export function loadAsteroidVestaModelTemplate(): Promise<IModelTemplate> {
    return loadGltfModelTemplate(ASTEROID_VESTA_SPEC);
}
