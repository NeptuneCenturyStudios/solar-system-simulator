import * as THREE from '../vendors/three.module.js'

const textureLoader = new THREE.TextureLoader()

export function loadSrgbTexture(url) {
    
    const tex = textureLoader.load(url)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    
    return tex
}

export const moonTexture = loadSrgbTexture('./assets/textures/moon.jpg')

// Custom/random textures for custom solid planets and moons
export const fictionalTextures = [
    loadSrgbTexture('./assets/textures/fictional_1.jpg'),
    loadSrgbTexture('./assets/textures/fictional_2.jpg'),
    loadSrgbTexture('./assets/textures/fictional_3.jpg'),
    loadSrgbTexture('./assets/textures/fictional_4.jpg'),
]
