import * as THREE from 'three';
import { SCALE_FACTOR } from '../utilities/consts.js';

const TRAIL_DEFAULT_LENGTH = 120;
/** Maximum number of glow dots shown at full speed. */
const MAX_GLOW_DOTS = 24;

/**
 * Renders a glowing engine-exhaust trail behind a spaceship.
 *
 * Uses THREE.Line with vertex colours + additive blending so adjacent trail
 * points are always joined by line segments — no gaps appear at high speed,
 * unlike a Points-based approach where individual dots spread apart.
 *
 * The trail is owned by the Spaceship that creates it and is automatically
 * added to / removed from the scene through init / hide / dispose.
 */
export class ShipTrail {
    private scene: THREE.Scene;
    readonly length: number;
    private positions: Float32Array;
    private colors: Float32Array;
    private geo: THREE.BufferGeometry;
    /** The underlying THREE.Line added to the scene. Visible during active flight. */
    readonly line: THREE.Line;

    // Second pass: soft glowing dots sampled from the line history at a
    // speed-dependent density so the glow becomes denser at higher speed.
    private glowPositions: Float32Array;
    private glowGeo: THREE.BufferGeometry;
    private glowMat: THREE.PointsMaterial;
    readonly glow: THREE.Points;

    constructor(scene: THREE.Scene, length = TRAIL_DEFAULT_LENGTH) {
        this.scene = scene;
        this.length = length;
        this.positions = new Float32Array(length * 3);
        this.colors    = new Float32Array(length * 3);

        this.geo = new THREE.BufferGeometry();
        this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geo.setAttribute('color',    new THREE.BufferAttribute(this.colors, 3));

        this.line = new THREE.Line(
            this.geo,
            new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 1.0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        this.line.frustumCulled = false;
        this.line.visible = false;
        scene.add(this.line);

        // ── Glow dot layer ────────────────────────────────────────────────────
        // Build a soft radial-gradient canvas texture (white core → cyan → transparent edge)
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 64; glowCanvas.height = 64;
        const ctx = glowCanvas.getContext('2d')!;
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0,    'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.25, 'rgba(160, 220, 255, 0.9)');
        grad.addColorStop(0.6,  'rgba(60,  120, 255, 0.35)');
        grad.addColorStop(1,    'rgba(0,    20, 200, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);

        this.glowPositions = new Float32Array(length * 3);
        this.glowGeo = new THREE.BufferGeometry();
        this.glowGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(this.glowPositions, 3)
        );
        this.glowGeo.setDrawRange(0, 0);

        this.glowMat = new THREE.PointsMaterial({
            color: 0x88ccff,
            size: 1.4 * SCALE_FACTOR,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
            map: new THREE.CanvasTexture(glowCanvas),
            alphaTest: 0.001,
        });

        this.glow = new THREE.Points(this.glowGeo, this.glowMat);
        this.glow.frustumCulled = false;
        this.glow.visible = false;
        scene.add(this.glow);
    }

    /**
     * Seed every position in the buffer to `pos` so the trail starts fully
     * collapsed at the nozzle rather than stretching back toward world origin.
     */
    init(pos: THREE.Vector3): void {
        for (let i = 0; i < this.length * 3; i += 3) {
            this.positions[i]     = pos.x;
            this.positions[i + 1] = pos.y;
            this.positions[i + 2] = pos.z;
        }
        this.geo.attributes.position.needsUpdate = true;
        this.line.visible = false;
        this.glowGeo.setDrawRange(0, 0);
        this.glow.visible = false;
    }

    /**
     * Insert a new nozzle position at the front of the history buffer and
     * recompute vertex colours based on current speed.
     *
     * @param nozzle   World-space nozzle position this frame.
     * @param speed    Current ship speed magnitude, used to modulate brightness.
     * @param maxSpeed Normal (non-boost) max speed used as the brightness reference.
     */
    update(nozzle: THREE.Vector3, speed: number, maxSpeed: number): void {
        // Shift the ring buffer: index 0 = newest, length-1 = oldest
        for (let i = this.length - 1; i > 0; i--) {
            this.positions[i * 3]     = this.positions[(i - 1) * 3];
            this.positions[i * 3 + 1] = this.positions[(i - 1) * 3 + 1];
            this.positions[i * 3 + 2] = this.positions[(i - 1) * 3 + 2];
        }
        this.positions[0] = nozzle.x;
        this.positions[1] = nozzle.y;
        this.positions[2] = nozzle.z;

        // Brightness: dim at rest, reaches full glow at 25% of maxSpeed
        const speedFactor = THREE.MathUtils.clamp(Math.abs(speed) / (maxSpeed * 0.25), 0, 1);
        for (let i = 0; i < this.length; i++) {
            const t = Math.pow(1 - i / this.length, 1.5) * speedFactor;
            // Blue-cyan core: low R, high G, full B
            this.colors[i * 3]     = t * 0.5;
            this.colors[i * 3 + 1] = t * 0.9;
            this.colors[i * 3 + 2] = t;
        }

        this.geo.attributes.position.needsUpdate = true;
        this.geo.attributes.color.needsUpdate    = true;
        this.line.visible = true;

        // ── Glow dots: sample from the history buffer at a speed-dependent density ──
        // At low speed: very few dots (minimum 2).
        // At full speed: MAX_GLOW_DOTS dots evenly distributed along the history.
        const glowCount = Math.max(2, Math.round(speedFactor * MAX_GLOW_DOTS));
        const stride    = Math.max(1, Math.floor(this.length / glowCount));
        for (let i = 0; i < glowCount; i++) {
            const src = i * stride;
            this.glowPositions[i * 3]     = this.positions[src * 3];
            this.glowPositions[i * 3 + 1] = this.positions[src * 3 + 1];
            this.glowPositions[i * 3 + 2] = this.positions[src * 3 + 2];
        }
        this.glowGeo.setDrawRange(0, glowCount);
        this.glowGeo.attributes.position.needsUpdate = true;
        this.glow.visible = speedFactor > 0.05;
    }

    /** Hide the trail and zero all positions so it appears collapsed on re-show. */
    hide(): void {
        this.line.visible = false;
        this.positions.fill(0);
        this.geo.attributes.position.needsUpdate = true;
        this.glow.visible = false;
        this.glowGeo.setDrawRange(0, 0);
    }

    /** Remove from scene and free GPU resources. Call when the ship is destroyed. */
    dispose(): void {
        this.scene.remove(this.line);
        this.geo.dispose();
        (this.line.material as THREE.Material).dispose();
        this.scene.remove(this.glow);
        this.glowGeo.dispose();
        this.glowMat.map?.dispose();
        this.glowMat.dispose();
    }
}
