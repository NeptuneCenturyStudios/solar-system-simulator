import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { SCALE_FACTOR } from '../utilities/consts.js';

/** Maximum number of recorded path positions kept in the ring buffer. */
const MAX_HISTORY = 300;
/** Maximum line segments = MAX_HISTORY - 1. */
const MAX_SEGMENTS = MAX_HISTORY - 1;
/** How long (sim-seconds) each recorded point persists before expiring from the tail. */
const TRAIL_LIFETIME = 2.5;
/** Minimum world-unit gap between consecutive recorded nozzle positions. */
const MIN_DIST = 0.5 * SCALE_FACTOR;

/**
 * Architecture:
 *  - A ring buffer stores the nozzle world-position and sim-timestamp for each
 *    recorded point. Points are added when the ship moves > MIN_DIST since the
 *    last recorded point. Points expire after TRAIL_LIFETIME sim-seconds.
 *  - Two Line2 (fat-line) objects share pre-allocated GPU buffers:
 *      coreLine  — narrow bright white centre line
 *      glowLine  — wide soft cyan-blue halo
 *  - Per-vertex colour fades from bright cyan at the ship's nozzle (newest point)
 *    to black at the tail (oldest point), scaled by speedFactor so the trail dims
 *    while coasting.
 *  - Recording is suppressed during warp (caller passes recording=false).
 *
 * Performance:
 *  - Geometry buffers are allocated ONCE in the constructor (MAX_SEGMENTS × 6 floats
 *    per buffer in paired segment format). Each frame only writes into the existing
 *    arrays and marks them needsUpdate — no new Float32Array or WebGL buffer objects
 *    are ever created in the hot path. This prevents the GPU-buffer leak that occurs
 *    when setPositions()/setColors() are called every frame.
 *  - `instanceCount` is set each frame to the number of live segments so Three.js
 *    only draws the filled portion of the pre-allocated buffer.
 */
export class ShipTrail {
    private readonly scene: THREE.Scene;

    // ── Path ring buffer ──────────────────────────────────────────────────────
    private readonly pts: THREE.Vector3[] = [];
    private readonly ptTimes: number[] = [];
    private simTime = 0;

    // ── Line2 geometry (two overlapping lines for core + glow) ───────────────
    private readonly coreGeo: LineGeometry;
    private readonly coreMat: LineMaterial;
    readonly coreLine: Line2;

    private readonly glowGeo: LineGeometry;
    private readonly glowMat: LineMaterial;
    readonly glowLine: Line2;

    // ── Pre-allocated GPU buffers (never reallocated after construction) ──────
    // Each buffer holds MAX_SEGMENTS segment pairs in the format:
    //   [startX, startY, startZ, endX, endY, endZ,  startX, startY, ...]
    // Positions are shared between coreLine and glowLine via the same IB; colours differ.
    private readonly _posArr: Float32Array;
    private readonly _colCoreArr: Float32Array;
    private readonly _colGlowArr: Float32Array;
    private readonly _posIBCore: THREE.InterleavedBuffer;
    private readonly _posIBGlow: THREE.InterleavedBuffer;
    private readonly _colCoreIB: THREE.InterleavedBuffer;
    private readonly _colGlowIB: THREE.InterleavedBuffer;

    private readonly _onResize: () => void;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        // ── Pre-allocate working buffers ──────────────────────────────────────
        // Two separate InstancedInterleavedBuffer objects share the SAME underlying
        // Float32Array for positions — updating _posArr updates both cheaply.
        this._posArr = new Float32Array(MAX_SEGMENTS * 6);
        this._colCoreArr = new Float32Array(MAX_SEGMENTS * 6);
        this._colGlowArr = new Float32Array(MAX_SEGMENTS * 6);

        this._posIBCore = new THREE.InstancedInterleavedBuffer(this._posArr, 6, 1);
        this._posIBGlow = new THREE.InstancedInterleavedBuffer(this._posArr, 6, 1);
        this._colCoreIB = new THREE.InstancedInterleavedBuffer(this._colCoreArr, 6, 1);
        this._colGlowIB = new THREE.InstancedInterleavedBuffer(this._colGlowArr, 6, 1);

        // ── Core line (narrow, near-white) ────────────────────────────────────
        // Attributes are set directly so setPositions/setColors are never called,
        // avoiding the allocation + computeBoundingBox path they trigger.
        this.coreGeo = new LineGeometry();
        this.coreGeo.setAttribute(
            'instanceStart',
            new THREE.InterleavedBufferAttribute(
                this._posIBCore,
                3,
                0
            ) as unknown as THREE.BufferAttribute
        );
        this.coreGeo.setAttribute(
            'instanceEnd',
            new THREE.InterleavedBufferAttribute(
                this._posIBCore,
                3,
                3
            ) as unknown as THREE.BufferAttribute
        );
        this.coreGeo.setAttribute(
            'instanceColorStart',
            new THREE.InterleavedBufferAttribute(
                this._colCoreIB,
                3,
                0
            ) as unknown as THREE.BufferAttribute
        );
        this.coreGeo.setAttribute(
            'instanceColorEnd',
            new THREE.InterleavedBufferAttribute(
                this._colCoreIB,
                3,
                3
            ) as unknown as THREE.BufferAttribute
        );
        this.coreGeo.instanceCount = 0;

        this.coreMat = new LineMaterial({
            vertexColors: true,
            linewidth: 3, // pixels
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.coreMat.resolution.set(window.innerWidth, window.innerHeight);

        this.coreLine = new Line2(this.coreGeo, this.coreMat);
        this.coreLine.frustumCulled = false;
        this.coreLine.renderOrder = 1;
        this.coreLine.visible = false;
        scene.add(this.coreLine);

        // ── Glow line (wide, soft cyan-blue) ─────────────────────────────────
        this.glowGeo = new LineGeometry();
        this.glowGeo.setAttribute(
            'instanceStart',
            new THREE.InterleavedBufferAttribute(
                this._posIBGlow,
                3,
                0
            ) as unknown as THREE.BufferAttribute
        );
        this.glowGeo.setAttribute(
            'instanceEnd',
            new THREE.InterleavedBufferAttribute(
                this._posIBGlow,
                3,
                3
            ) as unknown as THREE.BufferAttribute
        );
        this.glowGeo.setAttribute(
            'instanceColorStart',
            new THREE.InterleavedBufferAttribute(
                this._colGlowIB,
                3,
                0
            ) as unknown as THREE.BufferAttribute
        );
        this.glowGeo.setAttribute(
            'instanceColorEnd',
            new THREE.InterleavedBufferAttribute(
                this._colGlowIB,
                3,
                3
            ) as unknown as THREE.BufferAttribute
        );
        this.glowGeo.instanceCount = 0;

        this.glowMat = new LineMaterial({
            vertexColors: true,
            linewidth: 12, // pixels
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.glowMat.resolution.set(window.innerWidth, window.innerHeight);

        this.glowLine = new Line2(this.glowGeo, this.glowMat);
        this.glowLine.frustumCulled = false;
        this.glowLine.renderOrder = 1;
        this.glowLine.visible = false;
        scene.add(this.glowLine);

        // ── Keep LineMaterial resolution in sync with the canvas ─────────────
        this._onResize = () => {
            this.coreMat.resolution.set(window.innerWidth, window.innerHeight);
            this.glowMat.resolution.set(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', this._onResize);
    }

    /** Clear the path buffer and hide the trail. Call when entering flight mode. */
    init(): void {
        this.pts.length = 0;
        this.ptTimes.length = 0;
        this.simTime = 0;
        this.coreGeo.instanceCount = 0;
        this.glowGeo.instanceCount = 0;
        this.coreLine.visible = false;
        this.glowLine.visible = false;
    }

    /**
     * Update per frame (call once per render frame, NOT per physics substep).
     *
     * @param nozzle      World-space nozzle position this frame.
     * @param speed       Current ship speed — drives brightness via speedFactor.
     * @param maxSpeed    Active speed ceiling (normal or boost) — brightness reference.
     * @param recording   True to append new positions this frame; false during warp.
     * @param _shipVelocity  Unused — kept for call-site compatibility.
     * @param _exhaustDir    Unused — kept for call-site compatibility.
     * @param dt          Frame delta-time in seconds.
     */
    update(
        nozzle: THREE.Vector3,
        speed: number,
        maxSpeed: number,
        recording: boolean,
        _shipVelocity: THREE.Vector3,
        _exhaustDir: THREE.Vector3,
        dt: number
    ): void {
        const absDt = Math.abs(dt);
        this.simTime += absDt;

        // speedFactor: 0 at rest → 1 at ≥20% of current speed ceiling
        const speedFactor = THREE.MathUtils.clamp(
            Math.abs(speed) / Math.max(maxSpeed * 0.2, 1),
            0,
            1
        );

        // ── 1. Expire old tail points ─────────────────────────────────────────
        while (this.pts.length > 0 && this.simTime - this.ptTimes[0] > TRAIL_LIFETIME) {
            this.pts.shift();
            this.ptTimes.shift();
        }

        // ── 2. Record new nozzle position ─────────────────────────────────────
        if (recording) {
            const last = this.pts.length > 0 ? this.pts[this.pts.length - 1] : null;
            if (!last || nozzle.distanceTo(last) > MIN_DIST) {
                if (this.pts.length >= MAX_HISTORY) {
                    this.pts.shift();
                    this.ptTimes.shift();
                }
                this.pts.push(nozzle.clone());
                this.ptTimes.push(this.simTime);
            }
        }

        const n = this.pts.length;
        const segs = n - 1;

        if (n < 2) {
            this.coreGeo.instanceCount = 0;
            this.glowGeo.instanceCount = 0;
            this.coreLine.visible = false;
            this.glowLine.visible = false;
            return;
        }

        // ── 3. Write segment data into pre-allocated buffers (zero heap alloc) ─
        const posArr = this._posArr;
        const colCoreArr = this._colCoreArr;
        const colGlowArr = this._colGlowArr;

        for (let i = 0; i < segs; i++) {
            const p0 = this.pts[i];
            const p1 = this.pts[i + 1];

            // Segment start position
            posArr[i * 6 + 0] = p0.x;
            posArr[i * 6 + 1] = p0.y;
            posArr[i * 6 + 2] = p0.z;
            // Segment end position
            posArr[i * 6 + 3] = p1.x;
            posArr[i * 6 + 4] = p1.y;
            posArr[i * 6 + 5] = p1.z;

            // Fade: age=0 (newest) → t=1 full brightness; age=LIFETIME → t=0 black
            const age0 = this.simTime - this.ptTimes[i];
            const age1 = this.simTime - this.ptTimes[i + 1];
            const t0 = Math.max(0, 1 - age0 / TRAIL_LIFETIME);
            const t1 = Math.max(0, 1 - age1 / TRAIL_LIFETIME);
            const f0 = t0 * t0 * speedFactor;
            const f1 = t1 * t1 * speedFactor;

            // Core: bright white/pale-blue
            colCoreArr[i * 6 + 0] = f0 * 0.85;
            colCoreArr[i * 6 + 1] = f0 * 0.95;
            colCoreArr[i * 6 + 2] = f0;
            colCoreArr[i * 6 + 3] = f1 * 0.85;
            colCoreArr[i * 6 + 4] = f1 * 0.95;
            colCoreArr[i * 6 + 5] = f1;

            // Glow: soft cyan-blue
            colGlowArr[i * 6 + 0] = f0 * 0.1;
            colGlowArr[i * 6 + 1] = f0 * 0.7;
            colGlowArr[i * 6 + 2] = f0;
            colGlowArr[i * 6 + 3] = f1 * 0.1;
            colGlowArr[i * 6 + 4] = f1 * 0.7;
            colGlowArr[i * 6 + 5] = f1;
        }

        // ── 4. Signal GPU re-upload (buffer data changed, no new allocations) ─
        this._posIBCore.needsUpdate = true;
        this._posIBGlow.needsUpdate = true;
        this._colCoreIB.needsUpdate = true;
        this._colGlowIB.needsUpdate = true;

        // ── 5. Set rendered segment count and show lines ──────────────────────
        this.coreGeo.instanceCount = segs;
        this.glowGeo.instanceCount = segs;
        this.coreLine.visible = true;
        this.glowLine.visible = true;
    }

    /** Clear the path buffer and hide immediately. Called on flight exit or ship destruction. */
    hide(): void {
        this.pts.length = 0;
        this.ptTimes.length = 0;
        this.simTime = 0;
        this.coreGeo.instanceCount = 0;
        this.glowGeo.instanceCount = 0;
        this.coreLine.visible = false;
        this.glowLine.visible = false;
    }

    /** Remove from scene and free GPU resources. */
    dispose(): void {
        window.removeEventListener('resize', this._onResize);

        this.scene.remove(this.coreLine);
        this.coreGeo.dispose();
        this.coreMat.dispose();

        this.scene.remove(this.glowLine);
        this.glowGeo.dispose();
        this.glowMat.dispose();
    }
}
