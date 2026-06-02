import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();

/**
 * Loads a texture from the given URL and sets it to sRGB color space for accurate color rendering.
 * @param url - The URL of the texture image.
 * @returns The loaded texture with sRGB color space.
 */
export function loadSrgbTexture(url: string): THREE.Texture {
    const tex = textureLoader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

export const moonTexture = loadSrgbTexture('./assets/textures/moon.jpg');

// Custom/random textures for custom solid planets and moons (random pool).
// NOTE: Includes fictional_5.jpg which corresponds to the new "Volcanic" subtype.
export const fictionalTextures: THREE.Texture[] = [
    loadSrgbTexture('./assets/textures/fictional_1.jpg'),
    loadSrgbTexture('./assets/textures/fictional_2.jpg'),
    loadSrgbTexture('./assets/textures/fictional_3.jpg'),
    loadSrgbTexture('./assets/textures/fictional_4.jpg'),
    loadSrgbTexture('./assets/textures/fictional_5.jpg'),
    loadSrgbTexture('./assets/textures/fictional_6.jpg'),
    loadSrgbTexture('./assets/textures/fictional_7.jpg'),
    loadSrgbTexture('./assets/textures/fictional_8.jpg'),
];

// Deterministic texture for the new "Volcanic" planet subtype.
export const fictionalVolcanicTexture = loadSrgbTexture('./assets/textures/fictional_5.jpg');

// Deterministic textures for additional custom solid planet subtypes.
export const fictionalFrozenTexture = loadSrgbTexture('./assets/textures/fictional_6.jpg');
export const fictionalOceanTexture = loadSrgbTexture('./assets/textures/fictional_7.jpg');
export const fictionalDesertTexture = loadSrgbTexture('./assets/textures/fictional_8.jpg');
export const fictionalTemperateTexture = loadSrgbTexture('./assets/textures/earth_day.jpg');

// Custom/random textures for custom gas giants
// (kept here because these are not part of the fictional solid pool)
export const fictionalGasTextures: THREE.Texture[] = [
    loadSrgbTexture('./assets/textures/fictional_gas_1.jpg'),
    loadSrgbTexture('./assets/textures/fictional_gas_2.jpg'),
];

// Custom/random textures for custom ice giants
export const fictionalIceTextures: THREE.Texture[] = [
    loadSrgbTexture('./assets/textures/fictional_ice_1.jpg'),
    loadSrgbTexture('./assets/textures/fictional_ice_2.jpg'),
];

// Custom/random atmosphere textures (used for custom mode planets/moons when "Has Atmosphere" is checked)
export const fictionalAtmosphereTextures: THREE.Texture[] = [
    loadSrgbTexture('./assets/textures/fictional_atmosphere_1.jpg'),
    loadSrgbTexture('./assets/textures/fictional_atmosphere_2.jpg'),
];
