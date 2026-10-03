/**
 * Central registry of every loadable body texture, and the machinery that lets
 * their asset quality change at runtime.
 *
 * Body textures are loaded once, at module-init time, and shared by whichever
 * materials reference them. Swapping quality therefore does not rebuild any
 * materials: the same `THREE.Texture` objects are kept for the life of the app,
 * and `reloadBodyTextures()` simply re-fetches each one's best available asset
 * for the new tier and mutates it in place (`image` + `needsUpdate`). Because
 * three.js re-uploads on `needsUpdate`, every material already holding that
 * texture picks up the new pixels on the next frame — no reload, no rebuild.
 *
 * Directly-loaded textures go through `getBodyTexture`. Textures *derived* from
 * a source image (the volcanic lava emissive map, computed pixel by pixel from
 * its JPG) go through `getDerivedCanvasTexture`, which rebuilds the same canvas
 * in place on reload for the same reason.
 */

import * as THREE from 'three';

import { resolveBodyTexturePath } from './texture-quality';

/** Colour-space treatment of a body texture. */
export type BodyTextureKind = 'srgb' | 'linear';

/** Rebuilds a derived texture's canvas from a freshly loaded source image. */
export type DerivedTextureBuild = (image: HTMLImageElement, canvas: HTMLCanvasElement) => void;

const imageLoader = new THREE.ImageLoader();

/** A directly-loaded body texture and the asset it is currently showing. */
interface ManagedTexture {
    texture: THREE.Texture;
    /** Path relative to a tier folder, e.g. `earth_day.jpg`. */
    relativePath: string;
    kind: BodyTextureKind;
    /** URL the texture is currently loaded from; compared to detect real changes. */
    resolvedUrl: string;
}

/** A texture derived from a source image (e.g. the volcanic emissive map). */
interface DerivedTexture {
    texture: THREE.CanvasTexture;
    canvas: HTMLCanvasElement;
    /** Body-relative path of the source image the canvas is derived from. */
    sourcePath: string;
    build: DerivedTextureBuild;
    resolvedUrl: string;
}

const managedTextures = new Map<string, ManagedTexture>();
const derivedTextures = new Map<string, DerivedTexture>();

/** Apply the colour space and wrap mode a body texture uses. */
function configureBodyTexture(texture: THREE.Texture, kind: BodyTextureKind): void {
    texture.colorSpace = kind === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
}

/**
 * Load `url` into `texture` and mark it for re-upload. Never rejects: a failed
 * load leaves the previous image in place and logs a warning.
 */
function loadImageInto(texture: THREE.Texture, url: string): Promise<void> {
    return new Promise((resolve) => {
        imageLoader.load(
            url,
            (image) => {
                // Free the old GPU storage before swapping the image. three.js allocates an
                // image texture with immutable texStorage2D and, on a later upload, only calls
                // texSubImage2D — which cannot change the allocated size. So replacing a 2k
                // image with an 8k one is rejected and the old image stays on screen unless the
                // texture is disposed first, letting three re-allocate at the new dimensions.
                texture.dispose();
                texture.image = image;
                texture.needsUpdate = true;
                resolve();
            },
            undefined,
            (error) => {
                console.warn(`[texture-registry] Failed to load texture: ${url}`, error);
                resolve();
            }
        );
    });
}

/** Load `url`, run `build` against the result, and flag the canvas for re-upload. */
function loadDerivedImage(
    texture: THREE.CanvasTexture,
    canvas: HTMLCanvasElement,
    url: string,
    build: DerivedTextureBuild
): Promise<void> {
    return new Promise((resolve) => {
        imageLoader.load(
            url,
            (image) => {
                // Same reasoning as loadImageInto: the rebuilt canvas may have a new size, so
                // the immutable GPU storage is freed and re-allocated at the new dimensions.
                texture.dispose();
                build(image, canvas);
                texture.needsUpdate = true;
                resolve();
            },
            undefined,
            (error) => {
                console.warn(`[texture-registry] Failed to load derived source: ${url}`, error);
                resolve();
            }
        );
    });
}

/**
 * The shared texture for a body texture path, created on first request.
 *
 * @param relativePath Path relative to a tier folder, e.g. `earth_day.jpg` or
 *   `procedural/terrestrial-7.jpg`.
 * @param kind `srgb` for colour maps (the default), `linear` for data maps.
 */
export function getBodyTexture(
    relativePath: string,
    kind: BodyTextureKind = 'srgb'
): THREE.Texture {
    const key = `${kind}:${relativePath}`;
    const existing = managedTextures.get(key);
    if (existing) return existing.texture;

    const texture = new THREE.Texture();
    configureBodyTexture(texture, kind);
    const url = resolveBodyTexturePath(relativePath);
    managedTextures.set(key, { texture, relativePath, kind, resolvedUrl: url });
    void loadImageInto(texture, url);
    return texture;
}

/**
 * The shared derived texture for a given source image, created on first request.
 *
 * @param params.key Unique cache key (the source path is a sensible choice).
 * @param params.sourcePath Body-relative path of the image the canvas is derived from.
 * @param params.build Paints the canvas from a freshly loaded source image. Called
 *   once on creation and again on every reload that changes the source's tier.
 * @param params.configure Optional per-texture setup (wrap mode, colour space, filters).
 */
export function getDerivedCanvasTexture(params: {
    key: string;
    sourcePath: string;
    build: DerivedTextureBuild;
    configure?: (texture: THREE.CanvasTexture) => void;
}): THREE.CanvasTexture {
    const existing = derivedTextures.get(params.key);
    if (existing) return existing.texture;

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const texture = new THREE.CanvasTexture(canvas);
    params.configure?.(texture);

    const url = resolveBodyTexturePath(params.sourcePath);
    derivedTextures.set(params.key, {
        texture,
        canvas,
        sourcePath: params.sourcePath,
        build: params.build,
        resolvedUrl: url,
    });
    void loadDerivedImage(texture, canvas, url, params.build);
    return texture;
}

/**
 * Re-fetch every registered texture from the best asset available for the
 * current quality. Textures whose resolved URL is unchanged are skipped, so this
 * is cheap to call even when nothing will move.
 *
 * @returns A promise that settles once every reload triggered by the call has
 *   finished loading (it never rejects).
 */
export async function reloadBodyTextures(): Promise<void> {
    const pending: Promise<void>[] = [];

    for (const entry of managedTextures.values()) {
        const url = resolveBodyTexturePath(entry.relativePath);
        if (url === entry.resolvedUrl) continue;
        entry.resolvedUrl = url;
        pending.push(loadImageInto(entry.texture, url));
    }

    for (const entry of derivedTextures.values()) {
        const url = resolveBodyTexturePath(entry.sourcePath);
        if (url === entry.resolvedUrl) continue;
        entry.resolvedUrl = url;
        pending.push(loadDerivedImage(entry.texture, entry.canvas, url, entry.build));
    }

    await Promise.all(pending);
}
