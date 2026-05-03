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

// Custom/random textures for custom solid planets and moons
export const fictionalTextures: THREE.Texture[] = [
    loadSrgbTexture('./assets/textures/fictional_1.jpg'),
    loadSrgbTexture('./assets/textures/fictional_2.jpg'),
    loadSrgbTexture('./assets/textures/fictional_3.jpg'),
    loadSrgbTexture('./assets/textures/fictional_4.jpg'),
];
