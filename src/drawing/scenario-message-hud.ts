import * as THREE from 'three';

import {
    SCENARIO_MESSAGE_FADE_IN_SECONDS,
    SCENARIO_MESSAGE_FADE_OUT_SECONDS,
    SCENARIO_MESSAGE_HOLD_SECONDS,
    TEXT_SPRITE_Z,
} from '../utilities/consts';

/** Peak opacity the banner reaches at full brightness. */
const PEAK_OPACITY = 1.0;

/**
 * Draw order for the banner sprite inside the UI scene. Below the screen flash's
 * render order (1000) so a flash still draws over it, but above ordinary HUD sprites
 * (default renderOrder 0).
 */
const SCENARIO_MESSAGE_RENDER_ORDER = 900;

/** Fixed pixel size of the banner sprite, regardless of window size. */
const BANNER_WIDTH = 900;
const BANNER_HEIGHT = 160;

/** Vertical offset from the top of the screen, in pixels. */
const TOP_OFFSET = 140;

/** Font size used when a message doesn't specify one — matches the original "Wave N" banner. */
const DEFAULT_FONT_SIZE_PX = 64;
/** Never shrink text past this, even to fit — below this it stops being readable. */
const MIN_FONT_SIZE_PX = 20;
/** Horizontal margin kept clear on each side so text never touches the banner's edge. */
const TEXT_HORIZONTAL_PADDING_PX = 40;

export interface ScenarioMessageOptions {
    /** Sim-time seconds to fade in. Defaults to SCENARIO_MESSAGE_FADE_IN_SECONDS. */
    fadeInSecs?: number;
    /** Sim-time seconds to hold at full brightness. Defaults to SCENARIO_MESSAGE_HOLD_SECONDS. */
    holdSecs?: number;
    /** Sim-time seconds to fade out. Defaults to SCENARIO_MESSAGE_FADE_OUT_SECONDS. */
    fadeOutSecs?: number;
    /** Font size in pixels. Defaults to DEFAULT_FONT_SIZE_PX. Shrunk further if it still overflows. */
    fontSizePx?: number;
}

/**
 * Draw `text` onto a canvas sized for the banner sprite, bold with a glow. Starts at
 * `fontSizePx` and shrinks (down to MIN_FONT_SIZE_PX) until the text fits within the banner
 * width, so a longer message never clips instead of relying on the caller to size it exactly.
 */
function createBannerTexture(text: string, fontSizePx: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = BANNER_WIDTH;
    canvas.height = BANNER_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxTextWidth = canvas.width - TEXT_HORIZONTAL_PADDING_PX * 2;
    let size = fontSizePx;
    ctx.font = `bold ${size}px monospace`;
    const measuredWidth = ctx.measureText(text).width;
    if (measuredWidth > maxTextWidth) {
        size = Math.max(MIN_FONT_SIZE_PX, Math.floor(size * (maxTextWidth / measuredWidth)));
        ctx.font = `bold ${size}px monospace`;
    }

    ctx.shadowColor = 'rgba(0, 255, 204, 0.85)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#eafffa';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

/**
 * A short text banner rendered as a canvas-texture sprite in the UI overlay scene, used
 * to flash a message (e.g. "Wave 1 / 10") that fades in, holds, and fades out. Advanced by
 * `update()` from the animation loop in simulation time, so it scales with the time-warp
 * setting and freezes while the simulation is paused — the same convention as
 * `ScreenFlashEffect`.
 */
export class ScenarioMessageHud {
    /** The sprite. Added to the scene once; visibility is toggled instead of re-adding. */
    readonly sprite: THREE.Sprite;

    /** True while the banner is mid-fade; false once it has fully faded out. */
    active = false;

    private readonly material: THREE.SpriteMaterial;

    /** Simulation-time seconds elapsed since the current trigger. */
    private elapsed = 0;
    private holdSeconds = 0;
    private fadeInSeconds = 0;
    private fadeOutSeconds = 0;
    /** Opacity the fade-in starts from, so re-triggering mid-fade blends smoothly. */
    private startOpacity = 0;

    constructor(scene: THREE.Scene) {
        this.material = new THREE.SpriteMaterial({
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
        });

        this.sprite = new THREE.Sprite(this.material);
        this.sprite.renderOrder = SCENARIO_MESSAGE_RENDER_ORDER;
        this.sprite.visible = false;
        scene.add(this.sprite);

        this.resize(window.innerWidth, window.innerHeight);
    }

    /** Reposition the banner to top-center. Called on construction and on window resize. */
    resize(_width: number, height: number): void {
        this.sprite.scale.set(BANNER_WIDTH, BANNER_HEIGHT, 1);
        this.sprite.position.set(0, height / 2 - TOP_OFFSET, TEXT_SPRITE_Z);
    }

    /**
     * Show `text` as a fading banner. Re-triggering while already active blends smoothly
     * from the current opacity instead of snapping.
     */
    trigger(text: string, options?: ScenarioMessageOptions): void {
        this.material.map?.dispose();
        this.material.map = createBannerTexture(text, options?.fontSizePx ?? DEFAULT_FONT_SIZE_PX);
        this.material.needsUpdate = true;

        this.startOpacity = this.material.opacity;
        this.elapsed = 0;
        this.fadeInSeconds = Math.max(0, options?.fadeInSecs ?? SCENARIO_MESSAGE_FADE_IN_SECONDS);
        this.holdSeconds = Math.max(0, options?.holdSecs ?? SCENARIO_MESSAGE_HOLD_SECONDS);
        this.fadeOutSeconds = Math.max(
            0,
            options?.fadeOutSecs ?? SCENARIO_MESSAGE_FADE_OUT_SECONDS
        );
        this.active = true;
        this.sprite.visible = true;
        // With no fade-in, jump straight to full brightness on this frame instead of
        // waiting one frame at the previous opacity.
        this.material.opacity = this.fadeInSeconds <= 0 ? PEAK_OPACITY : this.startOpacity;
    }

    /**
     * Advance the fade by `dt` seconds of simulation time. A `dt` of 0 (the simulation is
     * paused) leaves the banner exactly where it is, so it appears frozen mid-fade.
     */
    update(dt: number): void {
        if (!this.active) return;

        this.elapsed += dt;

        const fadeInEnd = this.fadeInSeconds;
        const holdEnd = fadeInEnd + this.holdSeconds;
        const fadeOutEnd = holdEnd + this.fadeOutSeconds;

        if (this.elapsed < fadeInEnd) {
            const t = this.elapsed / this.fadeInSeconds;
            this.material.opacity = this.startOpacity + (PEAK_OPACITY - this.startOpacity) * t;
        } else if (this.elapsed < holdEnd) {
            this.material.opacity = PEAK_OPACITY;
        } else if (this.elapsed < fadeOutEnd) {
            const t = (this.elapsed - holdEnd) / this.fadeOutSeconds;
            this.material.opacity = PEAK_OPACITY * (1 - t);
        } else {
            this.material.opacity = 0;
            this.active = false;
            this.sprite.visible = false;
        }
    }

    /** Remove the sprite and release its GPU resources. */
    dispose(): void {
        this.sprite.removeFromParent();
        this.material.map?.dispose();
        this.material.dispose();
    }
}

// ── Module-level registry ─────────────────────────────────────────────────────
// A scenario (which must stay free of any Vue/DOM-UI import) triggers the banner here
// rather than depending on the UI layer directly. A single instance is registered once
// at the composition root (index.ts) and triggered from anywhere via
// `triggerScenarioMessage`, mirroring the pattern used by screen-flash.ts and
// scenario-outcome.ts.
let scenarioMessageHud: ScenarioMessageHud | null = null;
let warnedMissingRegistration = false;

/** Register (or clear) the single banner instance used by `triggerScenarioMessage`. */
export function registerScenarioMessageHud(hud: ScenarioMessageHud | null): void {
    scenarioMessageHud = hud;
}

/**
 * Show a short scenario message (e.g. "Wave 1 / 10") that fades in, holds, and fades out.
 * Silently dropped when no HUD is registered, so a scenario can never throw because the
 * UI is not wired.
 */
export function triggerScenarioMessage(text: string, options?: ScenarioMessageOptions): void {
    if (!scenarioMessageHud) {
        if (!warnedMissingRegistration) {
            console.warn('triggerScenarioMessage called before registerScenarioMessageHud.');
            warnedMissingRegistration = true;
        }
        return;
    }
    scenarioMessageHud.trigger(text, options);
}
