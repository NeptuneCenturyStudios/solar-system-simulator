import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';

/**
 * Tight, bright, temperature-tinted glow ring drawn directly around a star's silhouette, on top
 * of the existing Corona (particle halo) and StarGlow (softer, larger bloom) effects.
 *
 * The sprite is only slightly larger than the star itself, so almost its entire visible band
 * sits just outside the star's own disc: transparent through the disc (so it never washes out
 * the surface texture), then a dense, nearly opaque ring of colour, fading out only in the last
 * stretch before the sprite's outer edge.
 */
export class GlowDisk implements IEffect {
    dependencies: IStateDependencies;
    active: boolean = true;

    private scene: THREE.Scene;
    private _sprite: THREE.Sprite | null = null;
    private _radius: number;
    private _colorHex: number;
    private _position: THREE.Vector3;
    private _visualTime: number = 0;

    /** The pulse offset is ±(pulseAmplitude * radius). 0 = no pulse. */
    private _pulseAmplitude: number;
    private _scaleMultiplier: number;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        radius: number,
        colorHex: number,
        position: THREE.Vector3,
        pulseAmplitude = 0.05,
        scaleMultiplier = 2.4
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
        if (this._sprite) {
            this._sprite.material?.map?.dispose();
            this._sprite.material?.dispose();
            this.scene.remove(this._sprite);
            this._sprite = null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, 256, 256);

        const c = new THREE.Color(this._colorHex);
        const r = Math.round(c.r * 255);
        const g = Math.round(c.g * 255);
        const b = Math.round(c.b * 255);

        // A THREE.Sprite's `scale` is its full width, not its radius, so a sprite scaled to
        // `radius * scaleMultiplier` has a half-width of `radius * scaleMultiplier / 2`. The
        // star's own disc therefore occupies the innermost `radius / halfWidth` = 2/scaleMultiplier
        // of this gradient (~0.83 at the default 2.4x). That inner region must stay fully
        // transparent so this sprite only ever adds a ring around the star, never a wash over
        // its surface. The remaining band (edge..1) is where the visible ring lives: it ramps up
        // to a hot white highlight right at the star's limb, holds at near-full opacity through
        // most of the band, and only fades out in the last stretch before the sprite's outer edge.
        const edge = Math.min(0.95, 2 / this._scaleMultiplier);
        const bandWidth = 1 - edge;

        const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        grad.addColorStop(edge, `rgba(${r}, ${g}, ${b}, 0)`);
        grad.addColorStop(edge + bandWidth * 0.15, 'rgba(255, 241, 180, 0.95)');
        grad.addColorStop(edge + bandWidth * 0.7, `rgba(${r}, ${g}, ${b}, 0.9)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;

        const mat = new THREE.SpriteMaterial({
            map: tex,
            color: 0xffffff,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 1.0,
            depthWrite: false,
            depthTest: true,
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
        const pulse =
            this._pulseAmplitude > 0
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

    setPosition(pos: THREE.Vector3): void {
        this._position.copy(pos);
    }

    setRadius(radius: number): void {
        this._radius = radius;
        if (this._sprite) {
            this._sprite.scale.setScalar(radius * this._scaleMultiplier);
        }
    }

    /** Rebuilds the canvas texture in the new colour, preserving position/visibility. */
    setColor(colorHex: number): void {
        this._colorHex = colorHex;
        const prevPosition = this._sprite?.position.clone() ?? this._position.clone();
        const prevVisible = this._sprite?.visible ?? true;
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

    get sprite(): THREE.Sprite | null {
        return this._sprite;
    }
}
