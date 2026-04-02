import * as THREE from 'three';
import { SCALE_FACTOR } from '../utilities/consts.js';

const TRAIL_RAW_LENGTH = 200;   // raw history capacity (ring buffer)
const SF = SCALE_FACTOR;

/** Number of uniformly-resampled display points drawn each frame.
 *  Constant regardless of speed — always looks dense. */
const N_DISPLAY = 128;

/** Maximum physical arc length of the visible flame (world units).
 *  Keeps the flame compact; speed only affects brightness/colour. */
const MAX_FLAME_LENGTH = 2 * SCALE_FACTOR;

/**
 * Renders a glowing engine-exhaust "propulsion flame" trail behind a spaceship.
 *
 * Architecture:
 *  - `rawPositions` ring buffer records the nozzle position every thrusting frame.
 *  - Each frame, the raw arc is walked up to MAX_FLAME_LENGTH, then uniformly
 *    resampled into exactly N_DISPLAY interpolated points (`displayPositions`).
 *  - Result: always N_DISPLAY tightly-packed particles regardless of speed,
 *    physically capped at MAX_FLAME_LENGTH world units.
 *  - Trail is only visible when `thrusting = true`; hidden immediately on release.
 *  - Two additive particle layers (inner hot core + outer cyan halo) share
 *    `displayPositions`; with additive blending, black vertex color = transparent.
 */
export class ShipTrail {
    private scene: THREE.Scene;
    readonly length: number;

    // ── Raw ring buffer (nozzle positions per thrusting frame) ────────────────
    private rawPositions: Float32Array;
    // Pre-allocated arc-distance scratch buffer (avoids GC per frame)
    private arcDists: Float32Array;
    private arcLen = 0; // how many arc entries are valid this frame

    // ── Display buffers (N_DISPLAY uniformly resampled points) ────────────────
    private displayPositions: Float32Array;
    private lineColors: Float32Array;
    private innerColors: Float32Array;
    private outerColors: Float32Array;

    private geo: THREE.BufferGeometry;
    private innerGeo: THREE.BufferGeometry;
    private outerGeo: THREE.BufferGeometry;
    private innerMat: THREE.PointsMaterial;
    private outerMat: THREE.PointsMaterial;

    readonly line: THREE.Line;
    readonly glowInner: THREE.Points;
    readonly glowOuter: THREE.Points;

    private wasThrusting = false;

    constructor(scene: THREE.Scene, length = TRAIL_RAW_LENGTH) {
        this.scene  = scene;
        this.length = length;

        this.rawPositions     = new Float32Array(length * 3);
        this.arcDists         = new Float32Array(length);
        this.displayPositions = new Float32Array(N_DISPLAY * 3);
        this.lineColors       = new Float32Array(N_DISPLAY * 3);
        this.innerColors      = new Float32Array(N_DISPLAY * 3);
        this.outerColors      = new Float32Array(N_DISPLAY * 3);

        // ── Line (structural backbone) ────────────────────────────────────────
        this.geo = new THREE.BufferGeometry();
        this.geo.setAttribute('position', new THREE.BufferAttribute(this.displayPositions, 3));
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
        const tc = document.createElement('canvas');
        const GRAD_SIZE = 128;
        tc.width = GRAD_SIZE; tc.height = GRAD_SIZE;
        const tCtx = tc.getContext('2d')!;
        const grad = tCtx.createRadialGradient(GRAD_SIZE / 2, GRAD_SIZE / 2, 0, GRAD_SIZE / 2, GRAD_SIZE / 2, GRAD_SIZE / 2);
        grad.addColorStop(0,    'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.12, 'rgba(255, 220, 120, 1.0)');
        grad.addColorStop(0.35, 'rgba(80,  200, 255, 0.7)');
        grad.addColorStop(0.65, 'rgba(20,   80, 255, 0.2)');
        grad.addColorStop(1,    'rgba(0,    10, 180, 0.0)');
        tCtx.fillStyle = grad;
        tCtx.fillRect(0, 0, GRAD_SIZE, GRAD_SIZE);
        const flameTex = new THREE.CanvasTexture(tc);

        // ── Inner glow (tight, hot) ───────────────────────────────────────────
        this.innerGeo = new THREE.BufferGeometry();
        this.innerGeo.setAttribute('position', new THREE.BufferAttribute(this.displayPositions, 3));
        this.innerGeo.setAttribute('color',    new THREE.BufferAttribute(this.innerColors, 3));
        this.innerGeo.setDrawRange(0, 0);

        this.innerMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: 0.05 * SF,
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
        this.outerGeo = new THREE.BufferGeometry();
        this.outerGeo.setAttribute('position', new THREE.BufferAttribute(this.displayPositions, 3));
        this.outerGeo.setAttribute('color',    new THREE.BufferAttribute(this.outerColors, 3));
        this.outerGeo.setDrawRange(0, 0);

        this.outerMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: 2.0 * SF,
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

    /** Seed the raw buffer to `pos` so the trail starts collapsed at the nozzle. */
    init(pos: THREE.Vector3): void {
        for (let i = 0; i < this.length * 3; i += 3) {
            this.rawPositions[i]     = pos.x;
            this.rawPositions[i + 1] = pos.y;
            this.rawPositions[i + 2] = pos.z;
        }
        this.line.visible      = false;
        this.glowInner.visible = false;
        this.glowOuter.visible = false;
        this.innerGeo.setDrawRange(0, 0);
        this.outerGeo.setDrawRange(0, 0);
        this.wasThrusting = false;
    }

    /**
     * Update per frame.
     *
     * @param nozzle    World-space nozzle position this frame.
     * @param speed     Current ship forward speed — drives brightness.
     * @param maxSpeed  Normal (non-boost) max speed — brightness reference.
     * @param thrusting True while any thrust key (W/S/Shift) is held. Trail
     *                  is hidden immediately when false.
     */
    update(nozzle: THREE.Vector3, speed: number, maxSpeed: number, thrusting: boolean): void {
        if (!thrusting) {
            this.line.visible      = false;
            this.glowInner.visible = false;
            this.glowOuter.visible = false;
            this.wasThrusting = false;
            return;
        }

        // Re-seed the ring buffer on thrust re-engagement so stale old-trajectory
        // positions don't bleed into the new flame.
        if (!this.wasThrusting) {
            for (let i = 0; i < this.length * 3; i += 3) {
                this.rawPositions[i]     = nozzle.x;
                this.rawPositions[i + 1] = nozzle.y;
                this.rawPositions[i + 2] = nozzle.z;
            }
        }
        this.wasThrusting = true;

        // ── Push nozzle into raw ring buffer (index 0 = newest) ──────────────
        for (let i = this.length - 1; i > 0; i--) {
            this.rawPositions[i * 3]     = this.rawPositions[(i - 1) * 3];
            this.rawPositions[i * 3 + 1] = this.rawPositions[(i - 1) * 3 + 1];
            this.rawPositions[i * 3 + 2] = this.rawPositions[(i - 1) * 3 + 2];
        }
        this.rawPositions[0] = nozzle.x;
        this.rawPositions[1] = nozzle.y;
        this.rawPositions[2] = nozzle.z;

        // ── Build arc-distance table up to MAX_FLAME_LENGTH ───────────────────
        // arcDists[i] = cumulative distance from rawPositions[0] to rawPositions[i].
        this.arcDists[0] = 0;
        let arcLen = 1;
        let totalDist = 0;
        for (let i = 1; i < this.length; i++) {
            const p3 = (i - 1) * 3, i3 = i * 3;
            const dx = this.rawPositions[i3]     - this.rawPositions[p3];
            const dy = this.rawPositions[i3 + 1] - this.rawPositions[p3 + 1];
            const dz = this.rawPositions[i3 + 2] - this.rawPositions[p3 + 2];
            totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (totalDist >= MAX_FLAME_LENGTH) {
                this.arcDists[i] = MAX_FLAME_LENGTH;
                arcLen = i + 1;
                break;
            }
            this.arcDists[i] = totalDist;
            arcLen = i + 1;
        }
        this.arcLen   = arcLen;
        const flameDist = this.arcDists[arcLen - 1]; // physical length of flame

        // ── Resample: N_DISPLAY uniformly-spaced points along the arc ─────────
        // This gives a consistently dense flame at any speed. At high speed the
        // raw samples are sparse (large per-frame steps) so we interpolate between
        // them to maintain visual density.
        const n = N_DISPLAY;
        for (let k = 0; k < n; k++) {
            const target = (k / (n - 1)) * flameDist;

            // Binary search for the segment [lo, hi] in the arc table
            let lo = 0, hi = arcLen - 1;
            while (hi - lo > 1) {
                const mid = (lo + hi) >> 1;
                if (this.arcDists[mid] <= target) lo = mid; else hi = mid;
            }

            // Lerp between rawPositions[lo] and rawPositions[hi]
            const segLen = this.arcDists[hi] - this.arcDists[lo];
            const frac   = segLen < 1e-9 ? 0 : (target - this.arcDists[lo]) / segLen;
            const lo3 = lo * 3, hi3 = hi * 3;
            this.displayPositions[k * 3]     = this.rawPositions[lo3]     + (this.rawPositions[hi3]     - this.rawPositions[lo3])     * frac;
            this.displayPositions[k * 3 + 1] = this.rawPositions[lo3 + 1] + (this.rawPositions[hi3 + 1] - this.rawPositions[lo3 + 1]) * frac;
            this.displayPositions[k * 3 + 2] = this.rawPositions[lo3 + 2] + (this.rawPositions[hi3 + 2] - this.rawPositions[lo3 + 2]) * frac;
        }

        // ── Write colours: fade hot→cool from nozzle to tail ─────────────────
        const speedFactor = THREE.MathUtils.clamp(Math.abs(speed) / (maxSpeed * 0.25), 0, 1);
        for (let k = 0; k < n; k++) {
            const norm   = k / (n - 1);
            const t      = Math.pow(1 - norm, 2.0) * speedFactor;

            // Line: blue-cyan
            this.lineColors[k * 3]     = t * 0.5;
            this.lineColors[k * 3 + 1] = t * 0.9;
            this.lineColors[k * 3 + 2] = t;

            // Inner: white/orange-hot at nozzle
            this.innerColors[k * 3]     = t;
            this.innerColors[k * 3 + 1] = t * 0.75;
            this.innerColors[k * 3 + 2] = t * 0.35;

            // Outer: cyan halo
            const tOuter = Math.pow(1 - norm, 1.5) * speedFactor * 0.55;
            this.outerColors[k * 3]     = tOuter * 0.1;
            this.outerColors[k * 3 + 1] = tOuter * 0.7;
            this.outerColors[k * 3 + 2] = tOuter;
        }

        this.geo.attributes.position.needsUpdate      = true;
        this.geo.attributes.color.needsUpdate         = true;
        this.innerGeo.attributes.position.needsUpdate = true;
        this.innerGeo.attributes.color.needsUpdate    = true;
        this.outerGeo.attributes.position.needsUpdate = true;
        this.outerGeo.attributes.color.needsUpdate    = true;

        this.geo.setDrawRange(0, n);
        this.innerGeo.setDrawRange(0, n);
        this.outerGeo.setDrawRange(0, n);

        const showing = speedFactor > 0.02;
        this.line.visible      = true;
        this.glowInner.visible = showing;
        this.glowOuter.visible = showing;
    }

    /** Hide trail immediately. Called on flight exit or ship destruction. */
    hide(): void {
        this.line.visible      = false;
        this.glowInner.visible = false;
        this.glowOuter.visible = false;
        this.innerGeo.setDrawRange(0, 0);
        this.outerGeo.setDrawRange(0, 0);
        this.wasThrusting = false;
    }

    /** Remove from scene and free GPU resources. */
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
