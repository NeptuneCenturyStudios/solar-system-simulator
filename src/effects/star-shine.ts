import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';
import {
    STAR_SHINE_ANGULAR_SIZE,
    STAR_SHINE_FADE_RADIUS_MULT,
    STAR_SHINE_FULL_VIS_DIST,
    STAR_SHINE_PULSE_AMPLITUDE,
    STAR_SHINE_PULSE_OPACITY_AMPLITUDE,
    STAR_SHINE_PULSE_RATE,
} from '../utilities/consts';

/** Canvas texture size (px) — 256 keeps the rays crisp yet cheap. */
const TEXTURE_SIZE = 256;
/** Max opacity of the cross before distance fade is applied. */
const MAX_OPACITY = 0.95;

/**
 * StarShine — the diffraction-cross ("telescope spikes") effect that makes a
 * star visible from great distances.
 *
 * The cross is a billboarded sprite whose world span is proportional to the
 * camera distance each frame (`span = distance × STAR_SHINE_ANGULAR_SIZE`),
 * i.e. it has a constant apparent size on screen no matter how far away the
 * star is — it never shrinks to nothing when zooming out. Opacity is driven
 * by camera distance:
 *   - at/behind STAR_SHINE_FULL_VIS_DIST  → fully visible
 *   - closer than STAR_SHINE_FULL_VIS_DIST → linear fade-out
 *   - closer than radius × STAR_SHINE_FADE_RADIUS_MULT → invisible
 *
 * The texture is a sharp cross: a small bright core with 4 thin bright
 * cardinal spikes (plus 4 faint diagonal spikes), like the classic
 * reflector-telescope diffraction pattern — no big glow blob.
 *
 * Call `setPosition()` before `update()` each frame so the cross follows the
 * star; `setColor()` re-renders the texture when the star's temperature
 * changes. `setRadius()` tracks the star's radius for the near-fade boundary.
 */
export class StarShine implements IEffect {
    dependencies: IStateDependencies;
    active: boolean = true;

    private scene: THREE.Scene;
    private _sprite: THREE.Sprite | null = null;
    private _radius: number;
    private _colorHex: number;
    private _position: THREE.Vector3;
    /** Accumulated visual time (s) driving the breathing pulse. */
    private _visualTime: number = 0;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        radius: number,
        colorHex: number,
        position: THREE.Vector3
    ) {
        this.dependencies = dependencies;
        this.scene = scene;
        this._radius = radius;
        this._colorHex = colorHex;
        this._position = position.clone();

        this._buildSprite();
    }

    // ─── internal ─────────────────────────────────────────────────────────────

    private _buildSprite(): void {
        // Dispose previous sprite if one exists (used by setColor)
        if (this._sprite) {
            this._sprite.material?.map?.dispose();
            this._sprite.material?.dispose();
            this.scene.remove(this._sprite);
            this._sprite = null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = TEXTURE_SIZE;
        canvas.height = TEXTURE_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

        const c = new THREE.Color(this._colorHex);
        const r = Math.round(c.r * 255);
        const g = Math.round(c.g * 255);
        const b = Math.round(c.b * 255);

        const cx = TEXTURE_SIZE / 2;
        const cy = TEXTURE_SIZE / 2;

        // Small bright core — just a pinpoint, no glow blob.
        const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, TEXTURE_SIZE * 0.05);
        core.addColorStop(0, 'rgba(255, 255, 255, 1)');
        core.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.95)`);
        core.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = core;
        ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

        // Sharp spikes — 4 bright cardinal + 4 faint diagonal (telescope cross).
        const spikes = [
            { angle: 0, width: 0.012, length: 0.46, alpha: 0.95 },
            { angle: Math.PI / 2, width: 0.012, length: 0.46, alpha: 0.95 },
            { angle: Math.PI, width: 0.012, length: 0.46, alpha: 0.95 },
            { angle: (3 * Math.PI) / 2, width: 0.012, length: 0.46, alpha: 0.95 },
            { angle: Math.PI / 4, width: 0.014, length: 0.3, alpha: 0.4 },
            { angle: (3 * Math.PI) / 4, width: 0.014, length: 0.3, alpha: 0.4 },
            { angle: (5 * Math.PI) / 4, width: 0.014, length: 0.3, alpha: 0.4 },
            { angle: (7 * Math.PI) / 4, width: 0.014, length: 0.3, alpha: 0.4 },
        ] as const;

        for (const spike of spikes) {
            const halfLen = TEXTURE_SIZE * spike.length;
            const halfWidth = TEXTURE_SIZE * spike.width;

            const dir = new THREE.Vector2(Math.cos(spike.angle), Math.sin(spike.angle));
            const perp = new THREE.Vector2(-dir.y, dir.x);

            const base = new THREE.Vector2(cx, cy).addScaledVector(dir, TEXTURE_SIZE * 0.045);
            const tip = new THREE.Vector2(cx, cy).addScaledVector(dir, halfLen);

            // Tapered quad: narrowest just outside the core, bulging slightly at
            // the midpoint, then tapering to a point at the tip (lens-like spike).
            const mid = base.clone().lerp(tip, 0.55);
            const widthAtBase = halfWidth * 0.7;
            const widthAtMid = halfWidth * 1.3;
            const widthAtTip = halfWidth * 0.12;

            const pathPoints = [
                base.clone().addScaledVector(perp, widthAtBase),
                mid.clone().addScaledVector(perp, widthAtMid),
                tip.clone().addScaledVector(perp, widthAtTip),
                tip,
                tip.clone().addScaledVector(perp, -widthAtTip),
                mid.clone().addScaledVector(perp, -widthAtMid),
                base.clone().addScaledVector(perp, -widthAtBase),
            ];

            // Fill with a linear gradient along the spike: bright at the core,
            // fading to transparent at the tip.
            const grad = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
            grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${spike.alpha})`);
            grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${spike.alpha * 0.7})`);
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
            for (let i = 1; i < pathPoints.length; i++) {
                ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
            }
            ctx.closePath();
            ctx.fill();

            // Bright thin spine along the centre of the cardinal spikes for a
            // crisp "beam" look.
            if (spike.alpha >= 0.9) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${spike.alpha * 0.85})`;
                ctx.lineWidth = Math.max(1, TEXTURE_SIZE * spike.width * 0.35);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(base.x, base.y);
                ctx.lineTo(tip.x, tip.y);
                ctx.stroke();
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;

        const mat = new THREE.SpriteMaterial({
            map: tex,
            color: 0xffffff,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 0,
            depthWrite: false,
            depthTest: true,
        });

        this._sprite = new THREE.Sprite(mat);
        this._sprite.scale.set(1, 1, 1);
        this._sprite.position.copy(this._position);
        this._sprite.visible = false;
        this.scene.add(this._sprite);
    }

    // ─── IEffect ───────────────────────────────────────────────────────────────

    /**
     * Updates the sprite position, scale, distance fade, and breathing pulse
     * each rendered frame.
     * @param dt Total elapsed simulation time for this frame. Accumulated to
     *           drive the breathing pulse; the distance fade itself is purely
     *           camera-distance driven.
     * @param cameraPosition The world-space camera position.
     */
    update(dt: number, cameraPosition?: THREE.Vector3): void {
        if (!this.active || !this._sprite) return;
        if (!cameraPosition) return;

        this._sprite.position.copy(this._position);

        // Breathing pulse — slow "shimmer" like the star glow/corona: scale and
        // opacity swell together on one shared sine so it reads as pulsing.
        this._visualTime += Math.abs(dt);
        const breath =
            1 + STAR_SHINE_PULSE_AMPLITUDE * Math.sin(this._visualTime * STAR_SHINE_PULSE_RATE);

        // Constant apparent size: scale the sprite proportionally to the camera
        // distance so it reads the same on screen at any zoom level, then apply
        // the breathing swell on top.
        const dist = cameraPosition.distanceTo(this._position);
        const span = dist * STAR_SHINE_ANGULAR_SIZE * breath;
        this._sprite.scale.set(span, span, 1);

        // Distance fade: fully visible at/behind STAR_SHINE_FULL_VIS_DIST, gone at
        // radius × FADE_RADIUS_MULT. The near-fade boundary is capped below the
        // full-vis distance so the configured cutoff always wins the ramp for
        // large stars (otherwise radius × mult could exceed it and the effect
        // would never hit full visibility).
        const fadeRadius = Math.min(
            this._radius * STAR_SHINE_FADE_RADIUS_MULT,
            STAR_SHINE_FULL_VIS_DIST * 0.9
        );
        const fadeWindow = Math.max(STAR_SHINE_FULL_VIS_DIST - fadeRadius, 1);
        const distFade = THREE.MathUtils.clamp((dist - fadeRadius) / fadeWindow, 0, 1);

        // Opacity = distance fade × breathing fade (slightly subtler than scale).
        const opacityBreath =
            1 + STAR_SHINE_PULSE_OPACITY_AMPLITUDE * Math.sin(this._visualTime * STAR_SHINE_PULSE_RATE);
        const opacity = distFade * opacityBreath * MAX_OPACITY;

        this._sprite.material.opacity = opacity;
        this._sprite.visible = opacity > 0.003;
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

    /** Tracks the star's radius, used for the near-fade boundary. */
    setRadius(radius: number): void {
        this._radius = radius;
    }

    /**
     * Replaces the cross texture with one rendered in the new colour.
     * Preserves the current sprite's world position and visibility.
     */
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
            this._sprite.visible = visible && this._sprite.material.opacity > 0.003;
        }
    }

    /** Exposes the underlying sprite for callers that need direct access. */
    get sprite(): THREE.Sprite | null {
        return this._sprite;
    }
}
