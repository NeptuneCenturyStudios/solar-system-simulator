import type { AuroraDetailMode, CloudQuality, ShadowQuality } from './settings-store';

/**
 * One-click bundles of the GPU-heavy graphics settings. A preset is not stored: choosing one
 * writes its values into the individual settings, and the Options panel shows whichever preset
 * the current values match ('custom' when they match none). So changing any single setting
 * afterwards simply shows Custom, and nothing can fall out of sync.
 *
 * Left out on purpose:
 * - Texture quality: it is about download size and memory, not frame rate, and High only exists
 *   in the desktop build.
 * - Render distance and frame-rate limit: preferences rather than quality levels.
 * - Tone mapping and exposure: a matter of taste, and free at any quality level.
 */
export type GraphicsPreset = 'low' | 'medium' | 'high';

/** What the Options panel shows: a preset, or 'custom' when the settings match none. */
export type GraphicsPresetSelection = GraphicsPreset | 'custom';

export interface IGraphicsPresetValues {
    renderScale: number;
    cloudQuality: CloudQuality;
    shadowQuality: ShadowQuality;
    sunRaysEnabled: boolean;
    lensflareEnabled: boolean;
    auroraEnabled: boolean;
    auroraDetail: AuroraDetailMode;
    particleEffectsEnabled: boolean;
    hdrEnabled: boolean;
}

/**
 * Medium is exactly the out-of-the-box defaults, so a fresh install (or anyone who never touched
 * these settings) shows Medium.
 */
export const GRAPHICS_PRESETS: Readonly<Record<GraphicsPreset, Readonly<IGraphicsPresetValues>>> = {
    // For integrated graphics: drops the screen-filling per-pixel effects (volumetric clouds,
    // shadows, sun rays, lens flare) and draws the scene at 75% resolution, about 56% of the
    // pixel work. Particles stay on: they are cheap and are combat feedback. HDR off halves the
    // capture's memory bandwidth (8-bit instead of half-float); highlights clip instead of
    // rolling off.
    low: {
        renderScale: 0.75,
        cloudQuality: 'low',
        shadowQuality: 'off',
        sunRaysEnabled: false,
        lensflareEnabled: false,
        auroraEnabled: true,
        auroraDetail: 'static',
        particleEffectsEnabled: true,
        hdrEnabled: false,
    },
    medium: {
        renderScale: 1,
        cloudQuality: 'medium',
        shadowQuality: 'low',
        sunRaysEnabled: true,
        lensflareEnabled: true,
        auroraEnabled: true,
        auroraDetail: 'dynamic',
        particleEffectsEnabled: true,
        hdrEnabled: true,
    },
    high: {
        renderScale: 1,
        cloudQuality: 'high',
        shadowQuality: 'high',
        sunRaysEnabled: true,
        lensflareEnabled: true,
        auroraEnabled: true,
        auroraDetail: 'dynamic',
        particleEffectsEnabled: true,
        hdrEnabled: true,
    },
};

const PRESET_ORDER: readonly GraphicsPreset[] = ['low', 'medium', 'high'];

/** The preset whose every value `current` matches, else 'custom'. */
export function matchGraphicsPreset(current: IGraphicsPresetValues): GraphicsPresetSelection {
    for (const preset of PRESET_ORDER) {
        const values = GRAPHICS_PRESETS[preset];
        const keys = Object.keys(values) as (keyof IGraphicsPresetValues)[];
        if (keys.every((key) => values[key] === current[key])) return preset;
    }
    return 'custom';
}
