import * as THREE from 'three';
import { TEXT_SPRITE_Z } from '../utilities/consts';

/** Peak alpha the flash reaches at full brightness (matches the old DOM overlay). */
const PEAK_OPACITY = 0.8;

/**
 * Draw order for the flash quad inside the UI scene. All HUD sprites use the default
 * renderOrder (0), so a high value guarantees the flash draws over them.
 */
const SCREEN_FLASH_RENDER_ORDER = 1000;

/**
 * Full-screen white flash rendered as a screen-space quad in a Three.js scene (the UI
 * overlay scene), replacing the previous fixed `<div>` overlay. The fade is advanced by
 * `update()` from the animation loop in simulation time, so it scales with the time-warp
 * setting and freezes while the simulation is paused. Because it lives in the 3D pipeline,
 * it draws over the scene and HUD but not over the DOM UI panels (which sit above the canvas).
 */
export class ScreenFlashEffect {
    /** The quad mesh. Added to the scene once; visibility is toggled instead of re-adding. */
    readonly mesh: THREE.Mesh;

    /** True while the flash is mid-fade; false once it has fully faded out. */
    active = false;

    private readonly material: THREE.MeshBasicMaterial;

    /** Simulation-time seconds elapsed since the current trigger. */
    private elapsed = 0;
    private holdSeconds = 0;
    private fadeInSeconds = 0;
    private fadeOutSeconds = 0;
    /** Opacity the fade-in starts from, so re-triggering mid-flash blends smoothly. */
    private startOpacity = 0;

    constructor(scene: THREE.Scene) {
        this.material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
        });

        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
        this.mesh.position.set(0, 0, TEXT_SPRITE_Z);
        this.mesh.renderOrder = SCREEN_FLASH_RENDER_ORDER;
        this.mesh.frustumCulled = false;
        this.mesh.visible = false;
        scene.add(this.mesh);

        this.resize(window.innerWidth, window.innerHeight);
    }

    /** Scale the quad to cover the viewport. Called on construction and on window resize. */
    resize(width: number, height: number): void {
        this.mesh.scale.set(width, height, 1);
    }

    /**
     * Start (or restart) a flash.
     * @param holdMs      Milliseconds the flash stays at full brightness before fading.
     * @param fadeInSecs  Simulation-time seconds for the fade-in.
     * @param fadeOutSecs Simulation-time seconds for the fade-out.
     */
    trigger(holdMs = 50, fadeInSecs = 0.5, fadeOutSecs = 0.5): void {
        this.startOpacity = this.material.opacity;
        this.elapsed = 0;
        this.holdSeconds = Math.max(0, holdMs) / 1000;
        this.fadeInSeconds = Math.max(0, fadeInSecs);
        this.fadeOutSeconds = Math.max(0, fadeOutSecs);
        this.active = true;
        this.mesh.visible = true;
        // With no fade-in, jump straight to full brightness on this frame instead of
        // waiting one frame at the previous opacity.
        this.material.opacity = this.fadeInSeconds <= 0 ? PEAK_OPACITY : this.startOpacity;
    }

    /**
     * Advance the fade by `dt` seconds of simulation time. A `dt` of 0 (the simulation is
     * paused) leaves the flash exactly where it is, so it appears frozen mid-fade.
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
            this.mesh.visible = false;
        }
    }

    /** Remove the quad and release its GPU resources. */
    dispose(): void {
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}

// ── Module-level registry ─────────────────────────────────────────────────────
// The flash is a global screen effect (not owned by any single body), so a single
// instance is registered once at the composition root (index.ts) and triggered from
// anywhere via `triggerScreenFlash`, keeping every existing call site unchanged.
let screenFlashEffect: ScreenFlashEffect | null = null;
let warnedMissingRegistration = false;

/** Register (or clear) the single flash instance used by `triggerScreenFlash`. */
export function registerScreenFlash(effect: ScreenFlashEffect | null): void {
    screenFlashEffect = effect;
}

/**
 * Trigger a white screen flash.
 * @param holdMs      Milliseconds the flash stays at full brightness before fading. Default 50.
 * @param fadeInSecs  Simulation-time seconds for the fade-in. Default 0.5.
 * @param fadeOutSecs Simulation-time seconds for the fade-out. Default 0.5.
 */
export function triggerScreenFlash(holdMs = 50, fadeInSecs = 0.5, fadeOutSecs = 0.5): void {
    if (!screenFlashEffect) {
        if (!warnedMissingRegistration) {
            console.warn('triggerScreenFlash called before registerScreenFlash.');
            warnedMissingRegistration = true;
        }
        return;
    }
    screenFlashEffect.trigger(holdMs, fadeInSecs, fadeOutSecs);
}
