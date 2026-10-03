import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MoonTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';
import { ISpaceBackground } from '../interfaces';
import { getBodyTexture, getDerivedCanvasTexture } from './texture-registry';

export const moonTexture = getBodyTexture('moon.jpg');
export const ioTexture = getBodyTexture('io.jpg');
export const europaTexture = getBodyTexture('europa.jpg');
export const ganymedeTexture = getBodyTexture('ganymede.jpg');
export const callistoTexture = getBodyTexture('callisto.jpg');

const SPACE_TEXTURE_COUNT = 13;
const PROCEDURAL_TEMPORATE_TEXTURES = 5;
const PROCEDURAL_VOLCANIC_TEXTURES = 5;
const PROCEDURAL_OCEAN_TEXTURES = 5;
const PROCEDURAL_FROZEN_TEXTURES = 5;
const PROCEDURAL_DESERT_TEXTURES = 5;
const PROCEDURAL_TERRESTRIAL_TEXTURES = 9;
const PROCEDURAL_GAS_GIANT_TEXTURES = 5;
const PROCEDURAL_ICE_GIANT_TEXTURES = 5;
const PROCEDURAL_CLOUD_TEXTURES = 2;

/**
 * Generates an array of THREE.Texture objects representing the available temperate planet textures for procedural generation.
 * @returns An array of THREE.Texture objects.
 */
function getTemperateTextures(): THREE.Texture[] {
    const textures: THREE.Texture[] = [];
    for (let i = 1; i <= PROCEDURAL_TEMPORATE_TEXTURES; i++) {
        textures.push(getBodyTexture(`procedural/temperate-${i}.jpg`));
    }
    return textures;
}

/**
 * An array of THREE.Texture objects representing the available temperate planet textures for procedural generation.
 */
export const temperateTextures = getTemperateTextures();

/**
 * Generates an array of THREE.Texture objects representing the available volcanic planet textures for procedural generation.
 * @returns An array of THREE.Texture objects.
 */
function getVolcanicTextures(): THREE.Texture[] {
    const textures: THREE.Texture[] = [];
    for (let i = 1; i <= PROCEDURAL_VOLCANIC_TEXTURES; i++) {
        textures.push(getBodyTexture(`procedural/volcanic-${i}.jpg`));
    }
    return textures;
}

/**
 * An array of THREE.Texture objects representing the available volcanic planet textures for procedural generation.
 */
export const volcanicTextures = getVolcanicTextures();

/**
 * Gets the list of ocean textures for procedural generation.
 * @returns An array of THREE.Texture objects.
 */
function getOceanTextures(): THREE.Texture[] {
    const textures: THREE.Texture[] = [];
    for (let i = 1; i <= PROCEDURAL_OCEAN_TEXTURES; i++) {
        textures.push(getBodyTexture(`procedural/ocean-${i}.jpg`));
    }
    return textures;
}

/**
 * An array of THREE.Texture objects representing the available ocean planet textures for procedural generation.
 */
export const oceanTextures = getOceanTextures();

/**
 * Gets the list of frozen textures for procedural generation.
 * @returns An array of THREE.Texture objects.
 */
function getFrozenTextures(): THREE.Texture[] {
    const textures: THREE.Texture[] = [];
    for (let i = 1; i <= PROCEDURAL_FROZEN_TEXTURES; i++) {
        textures.push(getBodyTexture(`procedural/frozen-${i}.jpg`));
    }
    return textures;
}

/**
 * An array of THREE.Texture objects representing the available frozen planet textures for procedural generation.
 */
export const frozenTextures = getFrozenTextures();

/**
 * Gets the list of desert textures for procedural generation.
 * @returns An array of THREE.Texture objects.
 */
function getDesertTextures(): THREE.Texture[] {
    const textures: THREE.Texture[] = [];
    for (let i = 1; i <= PROCEDURAL_DESERT_TEXTURES; i++) {
        textures.push(getBodyTexture(`procedural/desert-${i}.jpg`));
    }
    return textures;
}

/**
 * An array of THREE.Texture objects representing the available desert planet textures for procedural generation.
 */
export const desertTextures = getDesertTextures();

/**
 * Gets the list of terrestrial textures for procedural generation.
 * @returns An array of THREE.Texture objects.
 */
function getTerrestrialTextures(): THREE.Texture[] {
    const textures: THREE.Texture[] = [];
    for (let i = 1; i <= PROCEDURAL_TERRESTRIAL_TEXTURES; i++) {
        textures.push(getBodyTexture(`procedural/terrestrial-${i}.jpg`));
    }
    return textures;
}

/**
 * An array of THREE.Texture objects representing the available terrestrial planet textures for procedural generation.
 */
export const terrestrialTextures = getTerrestrialTextures();

/**
 * Gets the list of terrestrial textures for procedural generation.
 * @returns An array of THREE.Texture objects.
 */
function getGasGiantTextures(): THREE.Texture[] {
    const textures: THREE.Texture[] = [];
    for (let i = 1; i <= PROCEDURAL_GAS_GIANT_TEXTURES; i++) {
        textures.push(getBodyTexture(`procedural/gas-giant-${i}.png`));
    }
    return textures;
}

/**
 * An array of THREE.Texture objects representing the available gas giant planet textures for procedural generation.
 */
export const gasGiantTextures = getGasGiantTextures();

/**
 * Gets the list of ice giant textures for procedural generation.
 * @return An array of THREE.Texture objects.
 */
function getIceGiantTextures(): THREE.Texture[] {
    const textures: THREE.Texture[] = [];
    for (let i = 1; i <= PROCEDURAL_ICE_GIANT_TEXTURES; i++) {
        textures.push(getBodyTexture(`procedural/ice-giant-${i}.png`));
    }
    return textures;
}

/**
 * An array of THREE.Texture objects representing the available ice giant planet textures for procedural generation.
 */
export const iceGiantTextures = getIceGiantTextures();

/**
 * Get the list of space background textures.
 * @returns An array of ISpaceBackground objects representing the available space textures.
 */
function getSpaceTextures(): ISpaceBackground[] {
    const textures: ISpaceBackground[] = [];
    for (let skydomeIndex = 1; skydomeIndex <= SPACE_TEXTURE_COUNT; skydomeIndex++) {
        textures.push({
            name: `Space ${skydomeIndex}`,
            filename: `./assets/textures/skydome/space-${skydomeIndex}.jpg`,
        });
    }
    return textures;
}

/**
 * An array of ISpaceBackground objects representing the available space textures.
 */
export const spaceTextures: ISpaceBackground[] = getSpaceTextures();

/**
 * Gets the list of cloud textures for procedural generation.
 * @returns An array of THREE.Texture objects.
 */
function getCloudTextures(): THREE.Texture[] {
    const textures: THREE.Texture[] = [];
    for (let i = 1; i <= PROCEDURAL_CLOUD_TEXTURES; i++) {
        textures.push(getBodyTexture(`procedural/clouds-${i}.jpg`));
    }
    return textures;
}

/**
 * An array of THREE.Texture objects representing the available cloud textures for procedural generation.
 */
export const cloudTextures = getCloudTextures();

// =============================================================================
// Volcanic lava emissive map extraction
// =============================================================================
// The emissive map (lava glows, rock is black) is derived pixel-by-pixel from a
// volcanic JPG. It is built and kept up to date through the texture registry, so
// it reloads in place when the graphics texture quality changes.

/**
 * Given a pixel's RGBA values (each 0-255), determines whether it's lava
 * and returns an emissive RGB color, or null for rock (black emission).
 */
function lavaEmissiveForPixel(
    r: number,
    g: number,
    b: number
): { er: number; eg: number; eb: number } | null {
    // Lava = red channel is notably brighter than green/blue.
    // The volcanic JPGs have very dark rock (near-black maroon) and
    // vivid red-orange lava patches.
    const redness = r - Math.max(g, b);
    if (r > 40 && redness > 8) {
        const t = Math.min(1, redness / 200);
        return {
            er: Math.round(80 + (255 - 80) * t),
            eg: Math.round(2 + (200 - 2) * t),
            eb: Math.round(0 + (40 - 0) * t),
        };
    }
    return null;
}

/**
 * Paints `canvas` with the emissive map derived from `image`: lava pixels glow
 * red-orange, everything else is black. Called by the texture registry on first
 * build and again whenever the source's quality tier changes.
 */
function buildVolcanicEmissive(image: HTMLImageElement, canvas: HTMLCanvasElement): void {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width === 0 || height === 0) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0, width, height);
    const source = ctx.getImageData(0, 0, width, height).data;

    const outPixels = new Uint8ClampedArray(source.length);
    for (let i = 0; i < source.length; i += 4) {
        const result = lavaEmissiveForPixel(source[i]!, source[i + 1]!, source[i + 2]!);
        if (result) {
            outPixels[i] = result.er;
            outPixels[i + 1] = result.eg;
            outPixels[i + 2] = result.eb;
        }
        // RGB stays 0 (from the array's initial fill) for rock; alpha is always opaque.
        outPixels[i + 3] = 255;
    }

    ctx.putImageData(new ImageData(outPixels, width, height), 0, 0);
}

/**
 * Returns the emissive map for a volcanic JPG: lava pixels glow red-orange and
 * rock is black. Suitable for `MeshStandardMaterial.emissiveMap`. The texture is
 * owned by the texture registry, so it survives — and reloads in place — when
 * the graphics texture quality changes.
 *
 * @param relativePath Volcanic JPG path relative to a tier folder, e.g.
 *   `procedural/volcanic-1.jpg`.
 */
export function getVolcanicEmissiveMap(relativePath: string): THREE.Texture {
    return getDerivedCanvasTexture({
        key: relativePath,
        sourcePath: relativePath,
        build: buildVolcanicEmissive,
        configure: (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.generateMipmaps = false;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.anisotropy = 16;
        },
    });
}

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

let currentSpaceTexture: THREE.Texture | null = null;

/**
 * Loads the default space texture and sets it as the scene's background.
 * @returns A promise that resolves once the texture is loaded and applied.
 */
export async function loadSpaceTexture(scene: THREE.Scene, textureFilename: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // Load texture in another thread
        setTimeout(() => {
            // If the filename ends with .hdr, use the HDRLoader instead of TextureLoader
            if (textureFilename.toLowerCase().endsWith('.hdr')) {
                const hdrLoader = new HDRLoader();
                hdrLoader.load(
                    textureFilename,
                    (texture) => {
                        setSpaceTexture(scene, texture, true);
                        resolve();
                    },
                    undefined,
                    (err) => reject(err)
                );
            } else {
                const textureLoader = new THREE.TextureLoader();
                textureLoader.load(
                    textureFilename,
                    (texture) => {
                        setSpaceTexture(scene, texture);
                        resolve();
                    },
                    undefined,
                    (err) => reject(err)
                );
            }
        }, 0);
    });
}

/**
 * Shows or hides the space background in the scene.
 * @param scene The Three.js scene.
 * @param visible Whether the space background should be visible.
 */
export function showSpaceBackground(scene: THREE.Scene, visible: boolean): void {
    scene.background = visible ? currentSpaceTexture : null;
}

/**
 * Sets the skydome background texture.
 * @param texture The new texture to be applied to the skydome background.
 */
function setSpaceTexture(scene: THREE.Scene, texture: THREE.Texture, isHDR: boolean = false): void {
    // Dispose the old texture if it exists
    if (scene.background) {
        (scene.background as THREE.Texture).dispose();
    }

    // Set the scene's background to the provided texture
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = isHDR ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
    scene.background = texture;

    currentSpaceTexture = texture;
}
