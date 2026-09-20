import { loadObjModelTemplate, type IModelTemplate, type IObjModelSpec } from './obj-model-cache';

/**
 * The standard grey rock: OBJ plus its four PBR maps (it ships a metallic map; the red
 * variant does not).
 */
const ASTEROID_ROCK_SPEC: IObjModelSpec = {
    objUrl: './assets/models/asteroid-1/source/LPP.obj',
    maps: {
        baseColor: './assets/models/asteroid-1/textures/LPP_1001_BaseColor.png',
        metallic: './assets/models/asteroid-1/textures/LPP_1001_Metallic.png',
        roughness: './assets/models/asteroid-1/textures/LPP_1001_Roughness.png',
        normal: './assets/models/asteroid-1/textures/LPP_1001_Normal.png',
    },
};

/** The red rock: same pipeline, its own OBJ and three maps. */
const ASTEROID_RED_SPEC: IObjModelSpec = {
    objUrl: './assets/models/asteroid-red/source/Asteroit.obj',
    maps: {
        baseColor: './assets/models/asteroid-red/textures/LPP_1001_BaseColor.png',
        roughness: './assets/models/asteroid-red/textures/LPP_1001_Roughness.png',
        normal: './assets/models/asteroid-red/textures/LPP_1001_Normal.png',
    },
};

/** The molten asteroid: same pipeline, its own OBJ and maps. */
const ASTEROID_MOLTEN_SPEC: IObjModelSpec = {
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
const ASTEROID_MINERAL_SPEC: IObjModelSpec = {
    objUrl: './assets/models/asteroid-3/source/A2.obj',
    maps: {
        baseColor: './assets/models/asteroid-3/textures/Albedo.jpg',
        normal: './assets/models/asteroid-3/textures/Normal.jpg',
        emissive: './assets/models/asteroid-3/textures/Emission.jpg',
        metallic: './assets/models/asteroid-3/textures/Metalness.jpg',
        displacement: './assets/models/asteroid-3/textures/Displacement.jpg'
    },
};

/** The mineralized asteroid: same pipeline, its own OBJ and maps. */
const ASTEROID_VARIENT_5_SPEC: IObjModelSpec = {
    objUrl: './assets/models/asteroid-5/source/MET02.obj',
    maps: {
        baseColor: './assets/models/asteroid-5/textures/MET02_sphereSG2_BaseColor.1001.png',
        normal: './assets/models/asteroid-5/textures/MET02_sphereSG2_Normal.1001.png',
        metallic: './assets/models/asteroid-5/textures/MET02_sphereSG2_Metallic.1001.png',
        roughness: './assets/models/asteroid-5/textures/MET02_sphereSG2_Roughness.1001.png',
    }
};

/** The mineralized asteroid: same pipeline, its own OBJ and maps. */
const ASTEROID_VESTA_SPEC: IObjModelSpec = {
    objUrl: './assets/models/asteroid-vesta/source/Vesta_1_100.obj',
    mtlUrl: './assets/models/asteroid-vesta/source/Vesta_1_100.mtl',
    maps: {
        baseColor: './assets/models/asteroid-vesta/textures/vesta_diff.jpg_1.png',
        normal: './assets/models/asteroid-vesta/textures/vesta_n.png_0.png',
    }
};



/**
 * Shared asteroid template. Asteroid used to create its own OBJLoader + TextureLoader (and
 * download/decode ~57MB across 4 PNGs) per instance, so a belt of a few hundred asteroids
 * could redundantly load tens of gigabytes of duplicate texture data. Every instance now
 * clones this cached template — see obj-model-cache.ts for the caching and material setup.
 */
export function loadAsteroidModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(ASTEROID_ROCK_SPEC);
}

/** Shared template for the red asteroid variant. */
export function loadAsteroid2ModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(ASTEROID_MOLTEN_SPEC);
}

/** Shared template for the red asteroid variant. */
export function loadAsteroidRedModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(ASTEROID_RED_SPEC);
}

/** Shared template for the red asteroid variant. */
export function loadAsteroidMineralModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(ASTEROID_MINERAL_SPEC);
}

/** Shared template for the asteroid variant. */
export function loadAsteroidVarient5ModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(ASTEROID_VARIENT_5_SPEC);
}

/** Shared template for the vesta asteroid. */
export function loadAsteroidVestaModelTemplate(): Promise<IModelTemplate> {
    return loadObjModelTemplate(ASTEROID_VESTA_SPEC);
}
