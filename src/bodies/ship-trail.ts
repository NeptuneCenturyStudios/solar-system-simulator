import * as THREE from 'three';
import { SCALE_FACTOR } from '../utilities/consts.js';

/** Maximum number of live particles in the pool. */
const MAX_PARTICLES = 500;
/** Particle lifetime in render frames. Frame-count-based so it is completely dt-independent. */
const PARTICLE_LIFETIME_FRAMES = 6;
/** Max world-unit drift each particle can travel from its birth position over its lifetime.
 *  Each particle gets a randomised fraction (0.3–1.0) so the plume has depth variation. */
const MAX_REACH = 5.0 * SCALE_FACTOR;
/** Maximum world-unit spawn segment. Set to the distance the ship travels in one frame at
 *  full boost speed and timeScale=1 (2000 u/s × 0.016 s ≈ 32 u). This ensures:
 *  - timeScale=1 at 2000 u/s: 32-unit gap is fully covered → continuous streak.
 *  - High timeScale: segment capped to 35 u near the nozzle → compact flame blob. */
const MAX_TRAIL_LENGTH = 35 * SCALE_FACTOR;
/** Half-angle of the exhaust cone in radians. */
const EXHAUST_SPREAD = 0.65;
/** Minimum particles emitted per frame while thrusting. */
const EMIT_MIN = 8;
/** Maximum particles emitted per frame. */
const EMIT_MAX = 80;
/** Target particles per world-unit of the (capped) spawn segment. */
const EMIT_DENSITY = 2.5;
/** Sentinel: negative age means the slot is unused. */
const DEAD = -1;

/**
 * Renders a glowing engine-exhaust trail as a physics-accurate particle ejector.
 *
 * Architecture:
 *  - Particles are emitted from the nozzle each frame while thrusting.
 *  - Each particle's initial world-space velocity = shipVelocity + exhaustDir * EXHAUST_SPEED
 *    plus a small random spread within an exhaust cone.
 *  - Particles move freely in world space after emission (no gravity).
 *  - Particles fade from hot white/orange at birth to cool cyan/transparent at death.
 *  - Because the flame always shoots in the nozzle's backward direction, turning 180°
 *    will never push the trail through the front of the ship.
 */
export class ShipTrail {
    private readonly scene: THREE.Scene;

    // ── Particle pool (parallel arrays, indexed by slot) ─────────────────────
    // px/py/pz: world-space birth position (fixed at spawn, never updated).
    // vx/vy/vz: total drift vector from birth to death (scattered exhaust dir * MAX_REACH).
    //           GPU position = birth + drift * t  (no per-frame integration needed).
    // age:      render-frame count since birth (incremented by 1 per frame, DEAD = unused).
    // lifetime: randomised frame count until death.
    private readonly px: Float32Array;
    private readonly py: Float32Array;
    private readonly pz: Float32Array;
    private readonly vx: Float32Array;
    private readonly vy: Float32Array;
    private readonly vz: Float32Array;
    private readonly age:      Float32Array;
    private readonly lifetime: Float32Array;

    // ── GPU upload buffers (compacted live-particle data) ─────────────────────
    private readonly gpuPos:        Float32Array;
    private readonly gpuColorInner: Float32Array;
    private readonly gpuColorOuter: Float32Array;

    private readonly innerGeo: THREE.BufferGeometry;
    private readonly outerGeo: THREE.BufferGeometry;
    private readonly innerMat: THREE.PointsMaterial;
    private readonly outerMat: THREE.PointsMaterial;

    readonly glowInner: THREE.Points;
    readonly glowOuter: THREE.Points;

    /** Nozzle world-position from the previous frame — interpolate spawn positions against this. */
    private prevNozzle: THREE.Vector3 | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        this.px       = new Float32Array(MAX_PARTICLES);
        this.py       = new Float32Array(MAX_PARTICLES);
        this.pz       = new Float32Array(MAX_PARTICLES);
        this.vx       = new Float32Array(MAX_PARTICLES);
        this.vy       = new Float32Array(MAX_PARTICLES);
        this.vz       = new Float32Array(MAX_PARTICLES);
        this.age      = new Float32Array(MAX_PARTICLES).fill(DEAD);
        this.lifetime = new Float32Array(MAX_PARTICLES);

        this.gpuPos        = new Float32Array(MAX_PARTICLES * 3);
        this.gpuColorInner = new Float32Array(MAX_PARTICLES * 3);
        this.gpuColorOuter = new Float32Array(MAX_PARTICLES * 3);

        // ── Shared radial-gradient flame texture ─────────────────────────────
        const tc = document.createElement('canvas');
        const GS = 128;
        tc.width = GS; tc.height = GS;
        const ctx = tc.getContext('2d')!;
        const grad = ctx.createRadialGradient(GS / 2, GS / 2, 0, GS / 2, GS / 2, GS / 2);
        grad.addColorStop(0,    'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.12, 'rgba(255, 220, 120, 1.0)');
        grad.addColorStop(0.35, 'rgba(80,  200, 255, 0.7)');
        grad.addColorStop(0.65, 'rgba(20,   80, 255, 0.2)');
        grad.addColorStop(1,    'rgba(0,    10, 180, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GS, GS);
        const flameTex = new THREE.CanvasTexture(tc);

        // ── Inner glow (tight, hot core) ─────────────────────────────────────
        this.innerGeo = new THREE.BufferGeometry();
        this.innerGeo.setAttribute('position', new THREE.BufferAttribute(this.gpuPos, 3));
        this.innerGeo.setAttribute('color',    new THREE.BufferAttribute(this.gpuColorInner, 3));
        this.innerGeo.setDrawRange(0, 0);

        this.innerMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: 0.28 * SCALE_FACTOR,
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
        this.outerGeo.setAttribute('position', new THREE.BufferAttribute(this.gpuPos, 3));
        this.outerGeo.setAttribute('color',    new THREE.BufferAttribute(this.gpuColorOuter, 3));
        this.outerGeo.setDrawRange(0, 0);

        this.outerMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: 1.1 * SCALE_FACTOR,
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

    /** Kill all particles and hide the trail. Call when entering flight mode. */
    init(_pos: THREE.Vector3): void {
        this.age.fill(DEAD);
        this.prevNozzle = null;
        this.innerGeo.setDrawRange(0, 0);
        this.outerGeo.setDrawRange(0, 0);
        this.glowInner.visible = false;
        this.glowOuter.visible = false;
    }

    /**
     * Update per frame (call once per render frame, NOT per physics substep).
     *
     * @param nozzle       World-space nozzle position this frame.
     * @param speed        Current ship speed — drives particle brightness.
     * @param maxSpeed     Normal (non-boost) max speed — brightness reference.
     * @param thrusting    True while any thrust key (W/S/Shift) is held.
     * @param _shipVelocity Unused — kept for API compatibility.
     * @param exhaustDir   Normalized world-space exhaust direction (ship's −forward).
     * @param _dt          Unused — aging is frame-count-based, not sim-time-based.
     */
    update(
        nozzle: THREE.Vector3,
        speed: number,
        maxSpeed: number,
        thrusting: boolean,
        _shipVelocity: THREE.Vector3,
        exhaustDir: THREE.Vector3,
        _dt: number,
    ): void {
        const speedFactor = THREE.MathUtils.clamp(Math.abs(speed) / Math.max(maxSpeed * 0.25, 1), 0, 1);

        // ── 1. Age live particles (frame-count, completely dt-independent) ─────
        // Incrementing by 1 per render frame means particles always live for
        // PARTICLE_LIFETIME_FRAMES frames regardless of the sim time scale.
        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (this.age[i] < 0) continue;
            this.age[i] += 1;
            if (this.age[i] >= this.lifetime[i]) {
                this.age[i] = DEAD;
            }
        }

        // ── 2. Emit new particles ─────────────────────────────────────────────
        const prev = this.prevNozzle;
        if (thrusting) {
            // Build a tangent basis perpendicular to exhaustDir for cone spread
            const up = Math.abs(exhaustDir.y) < 0.9
                ? new THREE.Vector3(0, 1, 0)
                : new THREE.Vector3(1, 0, 0);
            const perp1 = new THREE.Vector3().crossVectors(exhaustDir, up).normalize();
            const perp2 = new THREE.Vector3().crossVectors(exhaustDir, perp1);

            const travel = prev ? prev.distanceTo(nozzle) : 0;
            // Cap the spawn segment to MAX_TRAIL_LENGTH.
            // - At timeScale=1, 2000 u/s: displacement≈32 u < 35 u cap → fully filled.
            // - At high timeScale: only 35 u near the nozzle is populated → compact flame.
            // Without this cap, high-timeScale frames scatter sparse dots across thousands of units.
            const cappedTravel = Math.min(travel, MAX_TRAIL_LENGTH);
            const nEmit = Math.min(EMIT_MAX, Math.max(EMIT_MIN,
                Math.round(cappedTravel * EMIT_DENSITY)));

            // Compute the capped start position (at most MAX_TRAIL_LENGTH back from nozzle)
            let startX = nozzle.x, startY = nozzle.y, startZ = nozzle.z;
            if (prev && travel > 0) {
                const cap = cappedTravel / travel;
                startX = nozzle.x + (prev.x - nozzle.x) * cap;
                startY = nozzle.y + (prev.y - nozzle.y) * cap;
                startZ = nozzle.z + (prev.z - nozzle.z) * cap;
            }

            let emitted = 0;
            for (let i = 0; i < MAX_PARTICLES && emitted < nEmit; i++) {
                if (this.age[i] >= 0) continue; // slot in use

                // Spread spawn positions evenly along the (capped) trail segment
                const frac   = (emitted + 0.5) / nEmit;
                const spawnX = startX + (nozzle.x - startX) * frac;
                const spawnY = startY + (nozzle.y - startY) * frac;
                const spawnZ = startZ + (nozzle.z - startZ) * frac;

                // Random cone scatter within EXHAUST_SPREAD
                const phi   = Math.random() * Math.PI * 2;
                const theta = Math.random() * EXHAUST_SPREAD;
                const cosT  = Math.cos(theta);
                const sinT  = Math.sin(theta);
                const dx = exhaustDir.x * cosT + (perp1.x * Math.cos(phi) + perp2.x * Math.sin(phi)) * sinT;
                const dy = exhaustDir.y * cosT + (perp1.y * Math.cos(phi) + perp2.y * Math.sin(phi)) * sinT;
                const dz = exhaustDir.z * cosT + (perp1.z * Math.cos(phi) + perp2.z * Math.sin(phi)) * sinT;

                // px/py/pz = fixed world-space birth position.
                // vx/vy/vz = total drift vector (direction * MAX_REACH).
                // GPU position = birthPos + drift * t — no per-frame integration needed.
                this.px[i] = spawnX;
                this.py[i] = spawnY;
                this.pz[i] = spawnZ;
                // Randomise reach so particles don't all die at the same radius —
                // produces depth in the plume rather than a uniform sphere.
                const reach = MAX_REACH * (0.3 + Math.random() * 0.7);
                this.vx[i] = dx * reach;
                this.vy[i] = dy * reach;
                this.vz[i] = dz * reach;

                this.age[i]      = 0;
                this.lifetime[i] = PARTICLE_LIFETIME_FRAMES * (0.4 + Math.random() * 0.9);
                emitted++;
            }
        }
        // Always update prevNozzle (even when not thrusting) so the first frame
        // of a new thrust burst has a valid prev position.
        this.prevNozzle = nozzle.clone();

        // ── 3. Compact live particles into GPU buffers ────────────────────────
        let n = 0;
        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (this.age[i] < 0) continue;
            const t     = this.age[i] / this.lifetime[i]; // 0 = birth, 1 = death
            const alive = 1 - t;

            // Drift from birth position toward birth + drift vector over lifetime
            this.gpuPos[n * 3]     = this.px[i] + this.vx[i] * t;
            this.gpuPos[n * 3 + 1] = this.py[i] + this.vy[i] * t;
            this.gpuPos[n * 3 + 2] = this.pz[i] + this.vz[i] * t;

            // Inner: hot white/orange at birth → fades out quickly
            const hot = alive * alive * speedFactor;
            this.gpuColorInner[n * 3]     = hot;
            this.gpuColorInner[n * 3 + 1] = hot * 0.65;
            this.gpuColorInner[n * 3 + 2] = hot * 0.25;

            // Outer: cyan halo, softer fade
            const cool = alive * speedFactor * 0.45;
            this.gpuColorOuter[n * 3]     = cool * 0.1;
            this.gpuColorOuter[n * 3 + 1] = cool * 0.7;
            this.gpuColorOuter[n * 3 + 2] = cool;

            n++;
        }

        this.innerGeo.attributes.position.needsUpdate = true;
        this.innerGeo.attributes.color.needsUpdate    = true;
        this.outerGeo.attributes.position.needsUpdate = true;
        this.outerGeo.attributes.color.needsUpdate    = true;
        this.innerGeo.setDrawRange(0, n);
        this.outerGeo.setDrawRange(0, n);

        const showing = n > 0;
        this.glowInner.visible = showing;
        this.glowOuter.visible = showing;
    }

    /** Kill all particles and hide immediately. Called on flight exit or ship destruction. */
    hide(): void {
        this.age.fill(DEAD);
        this.prevNozzle = null;
        this.innerGeo.setDrawRange(0, 0);
        this.outerGeo.setDrawRange(0, 0);
        this.glowInner.visible = false;
        this.glowOuter.visible = false;
    }

    /** Remove from scene and free GPU resources. */
    dispose(): void {
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
