import * as THREE from 'three';
import { TEXT_SPRITE_Z } from '../../utilities/consts';

/**
 * Screen anchor for sprites that sit at a fixed place in the viewport (FPS counter,
 * stats block, hint line, warp bar) rather than tracking a body in world space.
 *
 * `offsetX` / `offsetY` are raw pixel deltas from the anchor point in UI space, where
 * +X is right and +Y is up — matching the orthographic UI camera set up in index.ts.
 */
export type HudAnchorCorner =
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'center'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';

export interface HudAnchor {
    corner: HudAnchorCorner;
    offsetX: number;
    offsetY: number;
}

/** Paints the sprite's canvas. Receives the current canvas dimensions so painters stay size-agnostic. */
export type HudPainter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

export interface HudSpriteOptions {
    renderOrder?: number;
}

/**
 * Shared plumbing for every sprite in the orthographic UI overlay: the `THREE.Sprite`,
 * its `SpriteMaterial`, membership in the overlay scene, and screen-space placement.
 *
 * Subclasses decide where the material's map comes from — {@link HudSprite} owns a private
 * canvas and texture, {@link SharedTextureSprite} points at a texture owned by someone else.
 */
abstract class HudSpriteBase {
    readonly sprite: THREE.Sprite;

    protected readonly material: THREE.SpriteMaterial;
    private readonly uiScene: THREE.Scene;
    private anchor: HudAnchor | null = null;

    protected constructor(
        uiScene: THREE.Scene,
        map: THREE.Texture | null,
        options: HudSpriteOptions
    ) {
        this.uiScene = uiScene;

        this.material = new THREE.SpriteMaterial({
            map,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        this.sprite = new THREE.Sprite(this.material);
        this.sprite.visible = false;
        if (options.renderOrder !== undefined) this.sprite.renderOrder = options.renderOrder;
        this.uiScene.add(this.sprite);
    }

    get visible(): boolean {
        return this.sprite.visible;
    }

    set visible(value: boolean) {
        this.sprite.visible = value;
    }

    /** Rotation of the sprite in radians, used by the off-screen edge chevrons. */
    set rotation(radians: number) {
        this.material.rotation = radians;
    }

    set opacity(value: number) {
        this.material.opacity = value;
    }

    setScale(width: number, height: number): void {
        this.sprite.scale.set(width, height, 1);
    }

    /** Position the sprite in UI pixel space (origin at screen centre, +Y up). */
    setScreenPos(uiX: number, uiY: number): void {
        this.sprite.position.set(uiX, uiY, TEXT_SPRITE_Z);
    }

    /**
     * Pin this sprite to a viewport corner. `layout` then recomputes its position, so the
     * offsets live in one place instead of being repeated in the window resize handler.
     */
    setAnchor(anchor: HudAnchor | null): void {
        this.anchor = anchor;
        if (anchor) this.layout(window.innerWidth, window.innerHeight);
    }

    /** Recompute the anchored position for a viewport of `width` × `height`. No-op when unanchored. */
    layout(width: number, height: number): void {
        const a = this.anchor;
        if (!a) return;

        const halfW = width / 2;
        const halfH = height / 2;

        let baseX = 0;
        let baseY = 0;
        switch (a.corner) {
            case 'top-left':
                baseX = -halfW;
                baseY = halfH;
                break;
            case 'top-center':
                baseY = halfH;
                break;
            case 'top-right':
                baseX = halfW;
                baseY = halfH;
                break;
            case 'center':
                break;
            case 'bottom-left':
                baseX = -halfW;
                baseY = -halfH;
                break;
            case 'bottom-center':
                baseY = -halfH;
                break;
            case 'bottom-right':
                baseX = halfW;
                baseY = -halfH;
                break;
        }

        this.sprite.position.set(baseX + a.offsetX, baseY + a.offsetY, TEXT_SPRITE_Z);
    }

    /** Remove from the overlay scene and release this sprite's own GPU resources. */
    dispose(): void {
        this.uiScene.remove(this.sprite);
        this.material.dispose();
        this.disposeOwnedResources();
    }

    /** Hook for subclasses that own a texture. */
    protected disposeOwnedResources(): void {}
}

/**
 * A canvas-backed sprite in the UI overlay.
 *
 * This type exists to make the two expensive mistakes impossible. Previously every
 * indicator built a fresh `HTMLCanvasElement` and a fresh `THREE.CanvasTexture` per
 * update, assigned it to `material.map` and set `material.needsUpdate = true` — which
 * churns canvases through the GC and makes three.js recompute the material's program
 * cache key (potentially recompiling the shader) on every frame.
 *
 * Here the canvas, the texture and the material are created once and kept for the
 * sprite's lifetime:
 *
 * - `material.map` is assigned exactly once, in the constructor, and never reassigned.
 * - `material.needsUpdate` is never set.
 * - `setCanvasSize` resizes the existing canvas and calls `texture.dispose()`, which frees
 *   only the GPU-side allocation; the next render re-uploads at the new dimensions through
 *   `texImage2D`. The `THREE.Texture` instance itself survives, so `material.map` identity
 *   is stable.
 * - `draw` short-circuits when the content key is unchanged, so a panel whose text has not
 *   moved costs nothing per frame.
 */
export class HudSprite extends HudSpriteBase {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly texture: THREE.CanvasTexture;

    /** Content key of the last painted frame. `null` forces the next `draw` to repaint. */
    private lastKey: string | null = null;

    constructor(uiScene: THREE.Scene, options: HudSpriteOptions = {}) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        super(uiScene, texture, options);

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.texture = texture;
    }

    get canvasWidth(): number {
        return this.canvas.width;
    }

    get canvasHeight(): number {
        return this.canvas.height;
    }

    /**
     * Resize the backing canvas. No-op when the dimensions already match, so callers can
     * invoke this unconditionally each frame. A real resize invalidates the content key,
     * because assigning `canvas.width` clears the canvas.
     */
    setCanvasSize(width: number, height: number): void {
        if (this.canvas.width === width && this.canvas.height === height) return;

        // Clear the old area before resizing so no stale pixels survive into the new buffer.
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.width = width;
        this.canvas.height = height;

        // Frees the GPU texture only. The next render re-uploads at the new size.
        this.texture.dispose();
        this.invalidate();
    }

    /**
     * Repaint the canvas, but only when `key` differs from the last painted key.
     *
     * The painter receives a canvas that has NOT been cleared; painters that need a clean
     * surface call `clearRect` themselves, which matches the behaviour of the code this
     * replaces (panel painters fill their whole area unconditionally).
     *
     * @returns true when a repaint actually happened.
     */
    draw(key: string, paint: HudPainter): boolean {
        if (key === this.lastKey) return false;
        this.lastKey = key;
        paint(this.ctx, this.canvas.width, this.canvas.height);
        this.texture.needsUpdate = true;
        return true;
    }

    /** Force the next `draw` to repaint regardless of its key. */
    invalidate(): void {
        this.lastKey = null;
    }

    protected override disposeOwnedResources(): void {
        this.texture.dispose();
    }
}

/**
 * A sprite whose texture is owned elsewhere and shared across many instances — the pattern
 * `ThreatIndicator` already used for its chevrons and rings, where the artwork is static and
 * only `scale`, `opacity` and `rotation` change per frame.
 *
 * Disposing one releases its material but deliberately leaves the shared texture alone.
 */
export class SharedTextureSprite extends HudSpriteBase {
    constructor(uiScene: THREE.Scene, texture: THREE.Texture, options: HudSpriteOptions = {}) {
        super(uiScene, texture, options);
    }
}
