import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';

/**
 * Encapsulates the radial-gradient sprite glow that surrounds a star.
 *
 * Features:
 *  - Soft sine-wave scale pulse (amplitude tunable via constructor; 0 = static)
 *  - `setColor()` — rebuilds the canvas texture + material when the star's colour changes
 *  - `setRadius()` — resizes the sprite without recreating it
 *  - `setPosition()` — must be called before `update()` each frame so the sprite
 *    follows the star's mesh position
 *  - `setVisible()` — forwards to sprite visibility (used by birth/death transitions)
 */
export class StarGlow implements IEffect {
    dependencies: IStateDependencies;
    active: boolean = true;

    private scene: THREE.Scene;
    private _sprite: THREE.Sprite | null = null;
    private _radius: number;
    private _colorHex: number;
    private _position: THREE.Vector3;
    private _visualTime: number = 0;

    /**
     * Controls how much the glow scale pulses.
     * The pulse offset is ±(pulseAmplitude * radius).
     * 0 = no pulse, 0.4 = default star shimmer.
     */
    private _pulseAmplitude: number;
    private _scaleMultiplier: number;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        radius: number,
        colorHex: number,
        position: THREE.Vector3,
        pulseAmplitude = 0.4,
        scaleMultiplier = 4.6
    ) {
        this.dependencies = dependencies;
        this.scene = scene;
        this._radius = radius;
        this._colorHex = colorHex;
        this._position = position.clone();
        this._pulseAmplitude = pulseAmplitude;
        this._scaleMultiplier = scaleMultiplier;

        this._buildSprite();
    }

    // ─── internal ──────────────────────────────────────────────────────────────

    private _buildSprite(): void {
        // Dispose previous sprite if one exists (used by setColor)
        if (this._sprite) {
            this._sprite.material?.map?.dispose();
            this._sprite.material?.dispose();
            this.scene.remove(this._sprite);
            this._sprite = null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, 128, 128);

        const c = new THREE.Color(this._colorHex);
        const r = Math.round(c.r * 255);
        const g = Math.round(c.g * 255);
        const b = Math.round(c.b * 255);

        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0,   'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, 0.85)`);
        grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.22)`);
        grad.addColorStop(1,   'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;

        const mat = new THREE.SpriteMaterial({
            map:         tex,
            color:       this._colorHex,
            transparent: true,
            blending:    THREE.AdditiveBlending,
            opacity:     0.85,
            depthWrite:  false,
            depthTest:   true,
        });

        this._sprite = new THREE.Sprite(mat);
        this._sprite.scale.setScalar(this._radius * this._scaleMultiplier);
        this._sprite.position.copy(this._position);
        this.scene.add(this._sprite);
    }

    // ─── IEffect ───────────────────────────────────────────────────────────────

    update(dt: number): void {
        if (!this.active || !this._sprite) return;

        this._visualTime += dt;

        const baseScale = this._radius * this._scaleMultiplier;
        const pulse     = this._pulseAmplitude > 0
            ? Math.sin(this._visualTime * 0.0015 * 60) * (this._radius * this._pulseAmplitude)
            : 0;

        this._sprite.scale.setScalar(baseScale + pulse);
        this._sprite.position.copy(this._position);
    }

    dispose(): void {
        this.active = false;
        if (this._sprite) {
            this.scene.remove(this._sprite);
            this._sprite.material?.map?.dispose();
            this._sprite.material?.dispose();
            this._sprite = null;
        }
    }

    // ─── public API ────────────────────────────────────────────────────────────

    /** Call each frame before `update()` to track the owning body's position. */
    setPosition(pos: THREE.Vector3): void {
        this._position.copy(pos);
    }

    setRadius(radius: number): void {
        this._radius = radius;
        if (this._sprite) {
            this._sprite.scale.setScalar(radius * this._scaleMultiplier);
        }
    }

    /**
     * Replaces the glow's canvas texture with one rendered in the new colour.
     * Preserves the current sprite's world position and visibility.
     */
    setColor(colorHex: number): void {
        this._colorHex = colorHex;
        const prevPosition = this._sprite?.position.clone() ?? this._position.clone();
        const prevVisible  = this._sprite?.visible ?? true;
        this._buildSprite();
        if (this._sprite) {
            this._sprite.position.copy(prevPosition);
            this._sprite.visible = prevVisible;
        }
    }

    setVisible(visible: boolean): void {
        if (this._sprite) {
            this._sprite.visible = visible;
        }
    }

    /** Exposes the underlying sprite for legacy code that needs direct access. */
    get sprite(): THREE.Sprite | null {
        return this._sprite;
    }
}
