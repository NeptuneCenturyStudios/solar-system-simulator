import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MoonTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';
import { ISpaceBackground } from '../interfaces';

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

export const moonTexture = loadSrgbTexture('./assets/textures/bodies/2k/moon.jpg');
export const ioTexture = loadSrgbTexture('./assets/textures/bodies/2k/io.jpg');
export const europaTexture = loadSrgbTexture('./assets/textures/bodies/2k/europa.jpg');
export const ganymedeTexture = loadSrgbTexture('./assets/textures/bodies/2k/ganymede.jpg');
export const callistoTexture = loadSrgbTexture('./assets/textures/bodies/2k/callisto.jpg');

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
        textures.push(loadSrgbTexture(`./assets/textures/bodies/2k/procedural/temperate-${i}.jpg`));
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
        textures.push(loadSrgbTexture(`./assets/textures/bodies/2k/procedural/volcanic-${i}.jpg`));
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
        textures.push(loadSrgbTexture(`./assets/textures/bodies/2k/procedural/ocean-${i}.jpg`));
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
        textures.push(loadSrgbTexture(`./assets/textures/bodies/2k/procedural/frozen-${i}.jpg`));
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
        textures.push(loadSrgbTexture(`./assets/textures/bodies/2k/procedural/desert-${i}.jpg`));
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
        textures.push(
            loadSrgbTexture(`./assets/textures/bodies/2k/procedural/terrestrial-${i}.jpg`)
        );
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
        textures.push(loadSrgbTexture(`./assets/textures/bodies/2k/procedural/gas-giant-${i}.png`));
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
        textures.push(loadSrgbTexture(`./assets/textures/bodies/2k/procedural/ice-giant-${i}.png`));
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
        textures.push(loadSrgbTexture(`./assets/textures/bodies/2k/procedural/clouds-${i}.jpg`));
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
// We load each volcanic JPG via fetch() + createImageBitmap() to guarantee
// we have pixel data available, independent of the Three.js texture pipeline.
// The emissive maps are cached by texture URL so they're built once per JPG.

/** Cache mapping volcanic JPG URL -> generated emissive texture. */
const emissiveMapCache = new Map<string, THREE.CanvasTexture>();

/** URLs for the 5 volcanic JPGs — mirrors the path pattern in getVolcanicTextures(). */
const VOLCANIC_URLS: string[] = [];
for (let i = 1; i <= PROCEDURAL_VOLCANIC_TEXTURES; i++) {
    VOLCANIC_URLS.push(`./assets/textures/bodies/2k/procedural/volcanic-${i}.jpg`);
}

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
 * Generate an emissive CanvasTexture from raw RGBA pixel data.
 */
function buildEmissiveFromPixels(
    pixels: Uint8ClampedArray,
    width: number,
    height: number
): THREE.CanvasTexture {
    const outPixels = new Uint8ClampedArray(pixels.length);

    for (let i = 0; i < pixels.length; i += 4) {
        const result = lavaEmissiveForPixel(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
        if (result) {
            outPixels[i] = result.er;
            outPixels[i + 1] = result.eg;
            outPixels[i + 2] = result.eb;
        } else {
            outPixels[i] = 0;
            outPixels[i + 1] = 0;
            outPixels[i + 2] = 0;
        }
        outPixels[i + 3] = 255;
    }

    const imgData = new ImageData(outPixels, width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 16;
    tex.needsUpdate = true;
    return tex;
}

/**
 * Asynchronously pre-build all volcanic emissive maps at module init time.
 * Each JPG is fetched, decoded to an ImageBitmap, then scanned pixel-by-pixel
 * to produce the emissive map. Once cached, getVolcanicEmissiveMap() returns
 * the texture instantly.
 */
async function prebuildAllVolcanicEmissiveMaps(): Promise<void> {
    for (const url of VOLCANIC_URLS) {
        // Already cached (e.g. from a synchronous build)?
        if (emissiveMapCache.has(url)) continue;

        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);
            const w = bitmap.width;
            const h = bitmap.height;

            const readCanvas = document.createElement('canvas');
            readCanvas.width = w;
            readCanvas.height = h;
            const readCtx = readCanvas.getContext('2d')!;
            readCtx.drawImage(bitmap, 0, 0);
            const imgData = readCtx.getImageData(0, 0, w, h);

            const emissiveTex = buildEmissiveFromPixels(
                imgData.data as unknown as Uint8ClampedArray,
                w,
                h
            );

            // Does a placeholder already exist for this URL?
            const existing = emissiveMapCache.get(url);
            if (existing) {
                // Mutate the placeholder canvas in-place so existing materials
                // referencing it automatically pick up the new glow.
                const existingImg = existing.image;
                if (existingImg instanceof HTMLCanvasElement) {
                    existingImg.width = w;
                    existingImg.height = h;
                    const ctx = existingImg.getContext('2d')!;
                    ctx.drawImage(emissiveTex.image, 0, 0);
                    existing.needsUpdate = true;
                    continue;
                }
            }

            emissiveMapCache.set(url, emissiveTex);
        } catch (err) {
            console.warn(`[volcanic emissive] Failed to load ${url}:`, err);
        }
    }
}
// Kick off async pre-build immediately (doesn't block module init)
prebuildAllVolcanicEmissiveMaps();

/**
 * Given a URL path to a volcanic JPG (matching the pattern
 * used in the volcanicTextures array), returns an emissive map
 * where red lava pixels glow and rock is black.
 *
 * - If the map has already been built (by the async pre-build or a prior
 *   call), it is returned instantly.
 * - If not, a mutable canvas placeholder is returned. The placeholder's
 *   content is filled with emissive data in-place once the image loads,
 *   so the glow appears automatically on any material that already
 *   references the placeholder texture.
 *
 * @param jpgUrl - The asset URL of the volcanic JPG.
 * @returns An emissive texture suitable for MeshStandardMaterial.emissiveMap.
 */
export function getVolcanicEmissiveMap(jpgUrl: string): THREE.Texture {
    // Already built and cached?
    const cached = emissiveMapCache.get(jpgUrl);
    if (cached) return cached;

    // Create a mutable placeholder that will be filled in-place when
    // the image finishes loading (either via the onload handler below
    // or the async prebuildAllVolcanicEmissiveMaps).
    const placeholderCanvas = document.createElement('canvas');
    placeholderCanvas.width = 2048;
    placeholderCanvas.height = 1024;
    const placeholder = new THREE.CanvasTexture(placeholderCanvas);
    placeholder.wrapS = THREE.RepeatWrapping;
    placeholder.wrapT = THREE.ClampToEdgeWrapping;
    placeholder.needsUpdate = true;

    // Cache the placeholder so all callers share the same texture object.
    // When the image loads, we mutate its canvas in-place.
    emissiveMapCache.set(jpgUrl, placeholder);

    // Kick off an async load via Image element.
    const img = new Image();
    img.onload = () => {
        if (!img.complete || img.naturalWidth === 0) return;

        const w = img.naturalWidth;
        const h = img.naturalHeight;

        // Build the emissive data from the now-loaded image
        const readCanvas = document.createElement('canvas');
        readCanvas.width = w;
        readCanvas.height = h;
        const readCtx = readCanvas.getContext('2d')!;
        readCtx.drawImage(img, 0, 0, w, h);
        const imgData = readCtx.getImageData(0, 0, w, h);
        const outPixels = new Uint8ClampedArray(imgData.data.length);

        for (let i = 0; i < imgData.data.length; i += 4) {
            const r = imgData.data[i]!;
            const g = imgData.data[i + 1]!;
            const b = imgData.data[i + 2]!;
            const result = lavaEmissiveForPixel(r, g, b);
            if (result) {
                outPixels[i] = result.er;
                outPixels[i + 1] = result.eg;
                outPixels[i + 2] = result.eb;
            } else {
                outPixels[i] = 0;
                outPixels[i + 1] = 0;
                outPixels[i + 2] = 0;
            }
            outPixels[i + 3] = 255;
        }

        const outImgData = new ImageData(outPixels, w, h);

        // Mutate the placeholder canvas in-place.
        placeholderCanvas.width = w;
        placeholderCanvas.height = h;
        const ctx = placeholderCanvas.getContext('2d')!;
        ctx.putImageData(outImgData, 0, 0);
        placeholder.needsUpdate = true;

        // Also build the proper texture and cache it for future direct access.
        const finalTex = buildEmissiveFromPixels(outPixels, w, h);
        emissiveMapCache.set(jpgUrl, finalTex);
    };
    img.onerror = () => {
        console.warn(`[volcanic emissive] Failed to decode image: ${jpgUrl}`);
    };
    img.src = jpgUrl;

    return placeholder;
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
