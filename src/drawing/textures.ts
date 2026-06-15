import * as THREE from 'three';
import { MoonTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';

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
// NOTE: Includes volcanic_temp.jpg which corresponds to the new "Volcanic" subtype.
export const fictionalTextures: THREE.Texture[] = [
    loadSrgbTexture('./assets/textures/fictional_1.jpg'),
    loadSrgbTexture('./assets/textures/fictional_2.jpg'),
    loadSrgbTexture('./assets/textures/fictional_3.jpg'),
    loadSrgbTexture('./assets/textures/fictional_4.jpg'),
    loadSrgbTexture('./assets/textures/volcanic_temp.jpg'),
];

// Deterministic texture for the new "Volcanic" planet subtype.
export const fictionalVolcanicTexture = loadSrgbTexture('./assets/textures/volcanic_temp.jpg');

// Deterministic textures for additional custom solid planet subtypes.
export const fictionalFrozenTexture = loadSrgbTexture('./assets/textures/frozen_temp.jpg');
export const fictionalOceanTexture = loadSrgbTexture('./assets/textures/ocean_temp.jpg');
export const fictionalDesertTexture = loadSrgbTexture('./assets/textures/desert_temp.jpg');
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

/**
 * Gets the appropriate roughness value for a planet based on its subtype, which can be used to create a more visually distinct appearance for different types of planets.
 * @param planetSubType - The subtype of the planet.
 * @returns The roughness value for the planet's texture.
 */
export function getRoughnessForPlanetTexture(planetSubType: PlanetTypeEnum): number {
    switch (planetSubType) {
        case PlanetTypeEnum.Volcanic:
            return 0.6; // Volcanic planets have a moderate roughness for a slightly rough appearance
        case PlanetTypeEnum.Ocean:
            return 0.4; // Ocean planets have a low roughness for a smoother, more reflective appearance    
        case PlanetTypeEnum.Frozen:
            return 0.5; // Frozen planets have a moderate roughness for a slightly rough, icy appearance
        case PlanetTypeEnum.Desert:
            return 0.95; // Desert planets have a high roughness for a very rough, matte appearance  
        case PlanetTypeEnum.Temperate:
            return 0.5; // Temperate planets have a moderate roughness for a balanced appearance
        case PlanetTypeEnum.Terrestrial:
            return 0.95; // Terrestrial/rocky bodies have a very rough, matte appearance (like the Moon, Pluto)
        default:
            return 0.65; // Default roughness for other subtypes
    }
}

/**
 * Gets the appropriate roughness value for a moon based on its subtype, which can be used to create a more visually distinct appearance for different types of moons.
 * @param moonType - The subtype of the moon.
 * @returns The roughness value for the moon's texture.
 */
export function getRoughnessForMoonTexture(moonType: MoonTypeEnum): number {
    switch (moonType) {
        case MoonTypeEnum.Volcanic:
            return 0.6; // Volcanic moons have a moderate roughness for a slightly rough appearance
        case MoonTypeEnum.Ocean:
            return 0.4; // Ocean moons have a low roughness for a smoother, more reflective appearance
        case MoonTypeEnum.Frozen:
            return 0.5; // Frozen moons have a moderate roughness for a slightly rough, icy appearance
        case MoonTypeEnum.Desert:
            return 0.95; // Desert moons have a high roughness for a very rough, matte appearance
        case MoonTypeEnum.Temperate:
            return 0.5; // Temperate moons have a moderate roughness for a balanced appearance
        case MoonTypeEnum.Terrestrial:
            return 0.95; // Terrestrial/rocky moons have a very rough, matte appearance (like Earth's Moon)
        default:
            return 0.65; // Default roughness for other moon types
    }
}

/**
 * Gets the appropriate metalness value for a planet based on its subtype, which can be used to create a more visually distinct appearance for different types of planets.
 * @param planetSubType - The subtype of the planet.
 * @returns The metalness value for the planet's texture.
 */
export function getMetalnessForPlanetTexture(planetSubType: PlanetTypeEnum): number {
    switch (planetSubType) {
        case PlanetTypeEnum.Volcanic:
            return 0.3; // Volcanic planets have a low metalness for a more subtle matte appearance
        case PlanetTypeEnum.Ocean:
            return 0.3; // Ocean planets have a low metalness for a more matte appearance
        case PlanetTypeEnum.Frozen:
            return 0.4; // Frozen planets have a moderate metalness for a slightly shiny, icy appearance
        case PlanetTypeEnum.Desert:
            return 0.2; // Desert planets have a low metalness for a dry, matte appearance
        case PlanetTypeEnum.Temperate:
            return 0.3; // Temperate planets have a low to moderate metalness for a balanced appearance
        case PlanetTypeEnum.Terrestrial:
            return 0.2; // Terrestrial/rocky planets have very low metalness for a dry, matte rock appearance
        default:
            return 0.25; // Default metalness for other subtypes
    }
}

/**
 * Gets the appropriate metalness value for a moon based on its subtype, which can be used to create a more visually distinct appearance for different types of moons.
 * @param moonType - The subtype of the moon.
 * @returns The metalness value for the moon's texture.
 */
export function getMetalnessForMoonTexture(moonType: MoonTypeEnum): number {
    switch (moonType) {
        case MoonTypeEnum.Volcanic:
            return 0.3; // Volcanic moons have a low metalness for a more subtle matte appearance
        case MoonTypeEnum.Ocean:
            return 0.3; // Ocean moons have a low metalness for a more matte appearance
        case MoonTypeEnum.Frozen:
            return 0.4; // Frozen moons have a moderate metalness for a slightly shiny, icy appearance
        case MoonTypeEnum.Desert:
            return 0.2; // Desert moons have a low metalness for a dry, matte appearance
        case MoonTypeEnum.Temperate:
            return 0.3; // Temperate moons have a low to moderate metalness for a balanced appearance
        case MoonTypeEnum.Terrestrial:
            return 0.2; // Terrestrial/rocky moons have very low metalness for a dry, matte rock appearance
        default:
            return 0.25; // Default metalness for other moon types
    }
}
