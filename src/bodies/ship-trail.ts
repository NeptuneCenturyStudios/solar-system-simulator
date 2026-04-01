import * as THREE from 'three';
import { SCALE_FACTOR } from '../utilities/consts.js';

const TRAIL_DEFAULT_LENGTH = 120;

/**
 * Renders a glowing engine-exhaust trail behind a spaceship.
 *
 * The structural backbone is a THREE.Line with vertex colours + additive
 * blending (no gaps at any speed).
 *
 * On top of that, two dense particle layers create a "propulsion flame":
 *   - glowInner  — small, hot white/orange dots (tight bright core)
 *   - glowOuter  — large, soft cyan/blue dots (broad halo bloom)
 *
 * Both share the same geometry (this.positions) so no copy is needed.
 * Per-vertex colours fade from hot/bright at the nozzle (index 0) to black at
 * the tail.  With additive blending, black = transparent — so the fade is free.
 */
export class ShipTrail {
    private scene: THREE.Scene;
    readonly length: number;

    // ── Line (structural backbone) ────────────────────────────────────────────
    private positions: Float32Array;
    private lineColors: Float32Array;
    private geo: THREE.BufferGeometry;
    readonly line: THREE.Line;

    // ── Flame particle layers ─────────────────────────────────────────────────
    // Both share this.geo (same positions), each with its own colour buffer.
    private innerColors: Float32Array;
    private outerColors: Float32Array;
    private innerGeo: THREE.BufferGeometry;
    private outerGeo: THREE.BufferGeometry;
    private innerMat: THREE.PointsMaterial;
    private outerMat: THREE.PointsMaterial;
    readonly glowInner: THREE.Points;
    readonly glowOuter: THREE.Points;

    constructor(scene: THREE.Scene, length = TRAIL_DEFAULT_LENGTH) {
        this.scene  = scene;
        this.length = length;

        this.positions  = new Float32Array(length * 3);
        this.lineColors = new Float32Array(length * 3);

        // ── Line ─────────────────────────────────────────────────────────────
        this.geo = new THREE.BufferGeometry();
        this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geo.setAttribute('color',    new THREE.BufferAttribute(this.lineColors, 3));

        this.line = new THREE.Line(
            this.geo,
            new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.6,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        this.line.frustumCulled = false;
        this.line.visible = false;
        scene.add(this.line);

        // ── Shared radial-gradient flame texture ─────────────────────────────
        // White hot core → orange/yellow → cyan → transparent edge
        const tc = document.createElement('canvas');
        tc.width = 128; tc.height = 128;
        const tCtx = tc.getContext('2d')!;
        const grad = tCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0,    'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.12, 'rgba(255, 220, 120, 1.0)');
        grad.addColorStop(0.35, 'rgba(80,  200, 255, 0.7)');
        grad.addColorStop(0.65, 'rgba(20,   80, 255, 0.2)');
        grad.addColorStop(1,    'rgba(0,    10, 180, 0.0)');
        tCtx.fillStyle = grad;
        tCtx.fillRect(0, 0, 128, 128);
        const flameTex = new THREE.CanvasTexture(tc);

        // ── Inner glow (tight, hot) ───────────────────────────────────────────
        this.innerColors = new Float32Array(length * 3);
        this.innerGeo    = new THREE.BufferGeometry();
        // Share the same positions Float32Array — no copy needed each frame
        this.innerGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.innerGeo.setAttribute('color',    new THREE.BufferAttribute(this.innerColors, 3));
        this.innerGeo.setDrawRange(0, 0);

        this.innerMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: 0.8 * SCALE_FACTOR,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
            map: flameTex,
            alphaTest: 0.001,
        });

        this.glowInner = new THREE.Points(this.innerGeo, this.innerMat);
        this.glowInner.frustumCulled = false;
        this.glowInner.visible = false;
        scene.add(this.glowInner);

        // ── Outer glow (broad, soft halo) ────────────────────────────────────
        this.outerColors = new Float32Array(length * 3);
        this.outerGeo    = new THREE.BufferGeometry();
        this.outerGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.outerGeo.setAttribute('color',    new THREE.BufferAttribute(this.outerColors, 3));
        this.outerGeo.setDrawRange(0, 0);

        this.outerMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: 4.0 * SCALE_FACTOR,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
            map: flameTex,
            alphaTest: 0.001,
        });

        this.glowOuter = new THREE.Points(this.outerGeo, this.outerMat);
        this.glowOuter.frustumCulled = false;
        this.glowOuter.visible = false;
        scene.add(this.glowOuter);
    }

    /**
     * Seed every position to `pos` so the trail starts collapsed at the nozzle.
     */
    init(pos: THREE.Vector3): void {
        for (let i = 0; i < this.length * 3; i += 3) {
            this.positions[i]     = pos.x;
            this.positions[i + 1] = pos.y;
            this.positions[i + 2] = pos.z;
        }
        this.geo.attributes.position.needsUpdate = true;
        this.innerGeo.attributes.position.needsUpdate = true;
        this.outerGeo.attributes.position.needsUpdate = true;
        this.line.visible      = false;
        this.glowInner.visible = false;
        this.glowOuter.visible = false;
        this.innerGeo.setDrawRange(0, 0);
        this.outerGeo.setDrawRange(0, 0);
    }

    /**
     * Insert a new nozzle position and recompute colours.
     *
     * @param nozzle   World-space nozzle position this frame.
     * @param speed    Current ship speed magnitude.
     * @param maxSpeed Normal (non-boost) max speed — used as brightness reference.
     */
    update(nozzle: THREE.Vector3, speed: number, maxSpeed: number): void {
        // Shift ring buffer: index 0 = newest, length-1 = oldest
        for (let i = this.length - 1; i > 0; i--) {
            this.positions[i * 3]     = this.positions[(i - 1) * 3];
            this.positions[i * 3 + 1] = this.positions[(i - 1) * 3 + 1];
            this.positions[i * 3 + 2] = this.positions[(i - 1) * 3 + 2];
        }
        this.positions[0] = nozzle.x;
        this.positions[1] = nozzle.y;
        this.positions[2] = nozzle.z;

        // Reaches full brightness at 25% of maxSpeed
        const speedFactor = THREE.MathUtils.clamp(Math.abs(speed) / (maxSpeed * 0.25), 0, 1);

        for (let i = 0; i < this.length; i++) {
            // Sharp fade: quadratic falloff makes the "flame" short and hot
            const t = Math.pow(1 - i / this.length, 2.0) * speedFactor;

            // Line: blue-cyan fade (unchanged look)
            this.lineColors[i * 3]     = t * 0.5;
            this.lineColors[i * 3 + 1] = t * 0.9;
            this.lineColors[i * 3 + 2] = t;

            // Inner: white/orange-hot at nozzle, dims toward tail
            this.innerColors[i * 3]     = t * 1.0;
            this.innerColors[i * 3 + 1] = t * 0.75;
            this.innerColors[i * 3 + 2] = t * 0.35;

            // Outer: cyan halo, softer fade
            const tOuter = Math.pow(1 - i / this.length, 1.5) * speedFactor * 0.55;
            this.outerColors[i * 3]     = tOuter * 0.1;
            this.outerColors[i * 3 + 1] = tOuter * 0.7;
            this.outerColors[i * 3 + 2] = tOuter * 1.0;
        }

        // Since innerGeo and outerGeo share this.positions, one needsUpdate flag
        // covers all three geometries for position data.
        this.geo.attributes.position.needsUpdate      = true;
        this.geo.attributes.color.needsUpdate         = true;
        this.innerGeo.attributes.position.needsUpdate = true;
        this.innerGeo.attributes.color.needsUpdate    = true;
        this.outerGeo.attributes.position.needsUpdate = true;
        this.outerGeo.attributes.color.needsUpdate    = true;

        this.innerGeo.setDrawRange(0, this.length);
        this.outerGeo.setDrawRange(0, this.length);

        const showing = speedFactor > 0.02;
        this.line.visible      = true;
        this.glowInner.visible = showing;
        this.glowOuter.visible = showing;
    }

    /** Hide the trail and collapse positions so it starts clean on re-show. */
    hide(): void {
        this.line.visible      = false;
        this.glowInner.visible = false;
        this.glowOuter.visible = false;
        this.positions.fill(0);
        this.geo.attributes.position.needsUpdate      = true;
        this.innerGeo.attributes.position.needsUpdate = true;
        this.outerGeo.attributes.position.needsUpdate = true;
        this.innerGeo.setDrawRange(0, 0);
        this.outerGeo.setDrawRange(0, 0);
    }

    /** Remove from scene and free GPU resources. Call when the ship is destroyed. */
    dispose(): void {
        this.scene.remove(this.line);
        this.geo.dispose();
        (this.line.material as THREE.Material).dispose();

        this.scene.remove(this.glowInner);
        this.innerGeo.dispose();
        this.innerMat.map?.dispose();
        this.innerMat.dispose();

        this.scene.remove(this.glowOuter);
        this.outerGeo.dispose();
        this.outerMat.map?.dispose();
        this.outerMat.dispose();
    }
}
