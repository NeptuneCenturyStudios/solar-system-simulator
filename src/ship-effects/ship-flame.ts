import * as THREE from 'three';
import { SCALE_FACTOR } from '../utilities/consts.js';
import { IShipEffect } from './ship-effect-base.js';

/** Maximum number of live particles in the pool. */
const MAX_PARTICLES = 1200;
/** Maximum world-unit spawn segment — caps the filled length at high timeScale. */
const MAX_TRAIL_LENGTH = 35 * SCALE_FACTOR;
/** Half-angle of the exhaust cone in radians. Tighter than before for a cleaner plume. */
const EXHAUST_SPREAD = 0.4;
/** Minimum particles emitted per frame while thrusting. */
const EMIT_MIN = 8;
/** Maximum particles emitted per frame. */
const EMIT_MAX = 120;
/** Target particles per world-unit of the (capped) spawn segment. */
const EMIT_DENSITY = 4.0;
/** Base particle lifetime in seconds. Actual lifetime is randomised ±30% around this. */
const LIFETIME_BASE = 0.5;
/** Speed (u/s) at which particles drift backward *in the ship's reference frame*.
 *  At any ship speed the inter-particle gap per frame = EXHAUST_DRIFT_SPEED × dt
 *  (≈ 0.8 units at 60 fps), well under one particle radius — no visible gaps. */
const EXHAUST_DRIFT_SPEED = 50 * SCALE_FACTOR;
/** Sentinel: negative life means the slot is unused. */
const DEAD = -1;

/**
 * Renders a glowing engine-exhaust trail modelled after the comet tail system.
 *
 * Architecture:
 *  - Particles are emitted from the nozzle each frame while thrusting.
 *  - Each particle has a real world-space velocity: exhaustDir × exhaustSpeed.
 *    exhaustSpeed = clamp(|shipSpeed|, EXHAUST_SPEED_MIN, maxSpeed).
 *    Ship velocity is NOT added — particles fly at exhaustSpeed in the exhaust
 *    direction in absolute world space (Option A).
 *  - Lifetime is sim-time-based (like the comet): life advances by lifeIncrement×dt,
 *    randomised ±30% per particle so they don't all die at once.
 *  - Colours: hot white→orange inner core, warm orange outer glow (additive).
 */
export class ShipFlame implements IShipEffect {
    private readonly scene: THREE.Scene;

    // ── Particle pool (parallel arrays, indexed by slot) ─────────────────────
    // px/py/pz: world-space birth position.
    // vx/vy/vz: world-space velocity (u/s) — integrated each frame.
    // life:          sim-time ratio 0→1 (DEAD = unused).
    // lifeIncrement: how fast life advances per second (= 1/lifetime).
    private readonly px: Float32Array;
    private readonly py: Float32Array;
    private readonly pz: Float32Array;
    private readonly vx: Float32Array;
    private readonly vy: Float32Array;
    private readonly vz: Float32Array;
    private readonly life:          Float32Array;
    private readonly lifeIncrement: Float32Array;

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

        this.px           = new Float32Array(MAX_PARTICLES);
        this.py           = new Float32Array(MAX_PARTICLES);
        this.pz           = new Float32Array(MAX_PARTICLES);
        this.vx           = new Float32Array(MAX_PARTICLES);
        this.vy           = new Float32Array(MAX_PARTICLES);
        this.vz           = new Float32Array(MAX_PARTICLES);
        this.life          = new Float32Array(MAX_PARTICLES).fill(DEAD);
        this.lifeIncrement = new Float32Array(MAX_PARTICLES);

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
            size: 0.35 * SCALE_FACTOR,
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
            size: 1.6 * SCALE_FACTOR,
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
    init(): void {
        this.life.fill(DEAD);
        this.prevNozzle = null;
        this.innerGeo.setDrawRange(0, 0);
        this.outerGeo.setDrawRange(0, 0);
        this.glowInner.visible = false;
        this.glowOuter.visible = false;
    }

    /**
     * Update per frame (call once per render frame, NOT per physics substep).
     *
     * Particle velocity model (Option A — absolute world space):
     *   particleVel = exhaustDir × exhaustSpeed
     *   exhaustSpeed = clamp(|speed|, EXHAUST_SPEED_MIN, maxSpeed)
     * Ship velocity is NOT added. Particles fly backward at exhaustSpeed in
     * world space regardless of what the ship is doing.
     *
     * Lifetime follows the comet pattern: life advances by lifeIncrement × dt,
     * randomised ±30% per particle so no batch deaths.
     *
     * @param nozzle       World-space nozzle position this frame.
     * @param speed        Current ship speed — drives exhaust speed and brightness.
     * @param maxSpeed     Active speed ceiling (normal or boost) — brightness reference.
     * @param thrusting    True while any thrust key (W/S/Shift) is held.
     * @param shipVelocity  World-space ship velocity — added to each particle so they
     *                      drift backward in the ship frame at EXHAUST_DRIFT_SPEED, not
     *                      at full ship speed (avoids gaps at boost).
     * @param exhaustDir   Normalized world-space exhaust direction (ship's −forward).
     * @param dt           Frame delta-time in seconds.
     */
    update(
        nozzle: THREE.Vector3,
        speed: number,
        maxSpeed: number,
        thrusting: boolean,
        shipVelocity: THREE.Vector3,
        exhaustDir: THREE.Vector3,
        dt: number,
    ): void {
        const absDt = Math.abs(dt);
        // speedFactor for brightness: 0 at rest, 1 at maxSpeed
        const speedFactor = THREE.MathUtils.clamp(Math.abs(speed) / Math.max(maxSpeed * 0.25, 1), 0, 1);

        // ── 1. Age live particles (sim-time based, comet pattern) ─────────────
        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (this.life[i] < 0) continue;
            this.life[i] += this.lifeIncrement[i] * absDt;
            if (this.life[i] >= 1.0) {
                this.life[i] = DEAD;
            }
        }

        // ── 2. Move live particles (velocity integration) ─────────────────────
        if (absDt > 0) {
            for (let i = 0; i < MAX_PARTICLES; i++) {
                if (this.life[i] < 0) continue;
                this.px[i] += this.vx[i] * absDt;
                this.py[i] += this.vy[i] * absDt;
                this.pz[i] += this.vz[i] * absDt;
            }
        }

        // ── 3. Emit new particles ─────────────────────────────────────────────
        const prev = this.prevNozzle;
        if (thrusting) {
            // Build a tangent basis perpendicular to exhaustDir for cone spread
            const upRef = Math.abs(exhaustDir.y) < 0.9
                ? new THREE.Vector3(0, 1, 0)
                : new THREE.Vector3(1, 0, 0);
            const perp1 = new THREE.Vector3().crossVectors(exhaustDir, upRef).normalize();
            const perp2 = new THREE.Vector3().crossVectors(exhaustDir, perp1);

            const travel = prev ? prev.distanceTo(nozzle) : 0;
            const cappedTravel = Math.min(travel, MAX_TRAIL_LENGTH);
            const nEmit = Math.min(EMIT_MAX, Math.max(EMIT_MIN,
                Math.round(cappedTravel * EMIT_DENSITY)));

            // Scale particle lifetime so pool stays under 50% full at any emit rate.
            // At 60 fps: pool_used = nEmit × lifetime × 60 ≤ MAX_PARTICLES × 0.5
            //   → lifetime ≤ (MAX_PARTICLES × 0.5) / (nEmit × 60)
            // At low speed (nEmit≈13): limit≈0.77 s → clamped to LIFETIME_BASE=0.5 s.
            // At boost  (nEmit=120): limit≈0.083 s → short-lived so pool never fills.
            const adjustedLifetime = Math.min(
                LIFETIME_BASE,
                (MAX_PARTICLES * 0.5) / (Math.max(nEmit, 1) * 60)
            );

            // Capped start position (at most MAX_TRAIL_LENGTH back from nozzle)
            let startX = nozzle.x, startY = nozzle.y, startZ = nozzle.z;
            if (prev && travel > 0) {
                const cap = cappedTravel / travel;
                startX = nozzle.x + (prev.x - nozzle.x) * cap;
                startY = nozzle.y + (prev.y - nozzle.y) * cap;
                startZ = nozzle.z + (prev.z - nozzle.z) * cap;
            }

            let emitted = 0;
            for (let i = 0; i < MAX_PARTICLES && emitted < nEmit; i++) {
                if (this.life[i] >= 0) continue; // slot in use

                // Spread spawn positions evenly along the (capped) trail segment
                const frac   = (emitted + 0.5) / nEmit;
                this.px[i] = startX + (nozzle.x - startX) * frac;
                this.py[i] = startY + (nozzle.y - startY) * frac;
                this.pz[i] = startZ + (nozzle.z - startZ) * frac;

                // Random cone scatter within EXHAUST_SPREAD
                const phi   = Math.random() * Math.PI * 2;
                const theta = Math.random() * EXHAUST_SPREAD;
                const cosT  = Math.cos(theta);
                const sinT  = Math.sin(theta);
                const dx = exhaustDir.x * cosT + (perp1.x * Math.cos(phi) + perp2.x * Math.sin(phi)) * sinT;
                const dy = exhaustDir.y * cosT + (perp1.y * Math.cos(phi) + perp2.y * Math.sin(phi)) * sinT;
                const dz = exhaustDir.z * cosT + (perp1.z * Math.cos(phi) + perp2.z * Math.sin(phi)) * sinT;

                // Particle velocity = ship velocity + small backward drift in ship frame.
                // Gap per frame = EXHAUST_DRIFT_SPEED × dt ≈ 0.8 u @ 60 fps — no visible gaps
                // even at 10× boost speed where the old exhaustSpeed approach left 64-unit gaps.
                const radialBoost = 1.0 + (Math.random() - 0.5) * 0.15;
                this.vx[i] = shipVelocity.x + dx * EXHAUST_DRIFT_SPEED * radialBoost;
                this.vy[i] = shipVelocity.y + dy * EXHAUST_DRIFT_SPEED * radialBoost;
                this.vz[i] = shipVelocity.z + dz * EXHAUST_DRIFT_SPEED * radialBoost;

                this.life[i]          = 0;
                // lifeIncrement = 1/adjustedLifetime, ±30% randomisation like the comet.
                // adjustedLifetime shrinks at high emit rates to prevent pool exhaustion.
                this.lifeIncrement[i] = (1 / adjustedLifetime) * (0.7 + Math.random() * 0.6);
                emitted++;
            }
        }
        // Always update prevNozzle so the first frame of a new thrust burst has a valid prev.
        this.prevNozzle = nozzle.clone();

        // ── 4. Compact live particles into GPU buffers ────────────────────────
        let n = 0;
        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (this.life[i] < 0) continue;
            const t     = this.life[i];       // 0 = birth, 1 = death
            const alive = 1 - t;

            this.gpuPos[n * 3]     = this.px[i];
            this.gpuPos[n * 3 + 1] = this.py[i];
            this.gpuPos[n * 3 + 2] = this.pz[i];

            // Inner: hot white at birth → orange/red at death
            const hot = alive * alive * speedFactor;
            this.gpuColorInner[n * 3]     = hot;
            this.gpuColorInner[n * 3 + 1] = hot * 0.4;
            this.gpuColorInner[n * 3 + 2] = hot * 0.1;

            // Outer: warm orange glow, softer fade
            const warm = alive * speedFactor;
            this.gpuColorOuter[n * 3]     = warm * 0.8;
            this.gpuColorOuter[n * 3 + 1] = warm * 0.3;
            this.gpuColorOuter[n * 3 + 2] = 0;

            n++;
        }

        this.innerGeo.attributes.position.needsUpdate = true;
        this.innerGeo.attributes.color.needsUpdate    = true;
        this.outerGeo.attributes.position.needsUpdate = true;
        this.outerGeo.attributes.color.needsUpdate    = true;
        this.innerGeo.setDrawRange(0, n);
        this.outerGeo.setDrawRange(0, n);

        // Scale global opacity with speed so the trail dims at low speed
        this.innerMat.opacity = 0.5 + 0.5 * speedFactor;
        this.outerMat.opacity = 0.3 + 0.5 * speedFactor;

        const showing = n > 0;
        this.glowInner.visible = showing;
        this.glowOuter.visible = showing;
    }

    /** Kill all particles and hide immediately. Called on flight exit or ship destruction. */
    hide(): void {
        this.life.fill(DEAD);
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
