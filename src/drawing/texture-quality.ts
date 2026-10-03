/**
 * Chooses which download tier a body texture should be loaded from.
 *
 * Every body texture exists at 2k; some also have 4k and/or 8k variants (see the
 * `assets/textures/bodies/{2k,4k,8k}` folders). Which 4k/8k files exist is
 * published by the build-time manifest in `vite-plugin-texture-manifest.ts`, so
 * this module can pick the best available asset synchronously — no probing.
 *
 * The High tier is a desktop-only feature: 8k/4k assets are far too large to
 * push over the wire for a browser session, so `effectiveTextureQuality()`
 * silently downgrades to Low unless the app is running inside Electron
 * (`window.desktop` is set by `electron/preload.ts`).
 */

import { eightKTextures, fourKTextures } from 'virtual:texture-quality-manifest';

import type { TextureQuality } from '../settings/settings-store';
import { settingsStore } from '../settings/settings-store';

/** Quality tiers, best first. `2k` is the always-present floor. */
export const TEXTURE_TIERS = ['8k', '4k', '2k'] as const;
export type TextureTier = (typeof TEXTURE_TIERS)[number];

/** Body-texture root, relative to the app's base URL. */
const BODIES_TEXTURE_ROOT = './assets/textures/bodies';

/** Membership sets for the two high-resolution tiers, built once from the manifest. */
const EIGHT_K_TEXTURES = new Set(eightKTextures);
const FOUR_K_TEXTURES = new Set(fourKTextures);

/** True when the running platform can use the High quality tier (the desktop app). */
export function isHighQualityTextureAvailable(): boolean {
    return window.desktop !== undefined;
}

/**
 * The quality actually in force. High is only honoured on desktop — a browser
 * asks for Low regardless of what the persisted setting says.
 */
export function effectiveTextureQuality(): TextureQuality {
    return isHighQualityTextureAvailable() ? settingsStore.settings.textureQuality : 'low';
}

/**
 * Best available tier for a body texture.
 * @param relativePath Path relative to a tier folder, e.g. `earth_day.jpg` or
 *   `procedural/terrestrial-7.jpg`.
 * @param quality Quality to resolve for; defaults to the effective setting.
 */
export function resolveBodyTextureTier(
    relativePath: string,
    quality: TextureQuality = effectiveTextureQuality()
): TextureTier {
    if (quality === 'high') {
        if (EIGHT_K_TEXTURES.has(relativePath)) return '8k';
        if (FOUR_K_TEXTURES.has(relativePath)) return '4k';
    }
    return '2k';
}

/**
 * Full URL of the best available asset for a body texture at the given quality.
 * Falls back to the 2k asset whenever no higher-resolution variant exists.
 */
export function resolveBodyTexturePath(relativePath: string, quality?: TextureQuality): string {
    const tier = resolveBodyTextureTier(relativePath, quality);
    return `${BODIES_TEXTURE_ROOT}/${tier}/${relativePath}`;
}
