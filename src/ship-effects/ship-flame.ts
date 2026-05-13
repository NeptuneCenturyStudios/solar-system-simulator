import * as THREE from 'three';
import { performanceSettings, SCALE_FACTOR } from '../utilities/consts.js';
import { IShipEffect } from './ship-effect-base';

const SF = SCALE_FACTOR / SCALE_FACTOR;

/** Maximum number of live particles in the pool. */
const MAX_PARTICLES = 1200;
/** Half-angle of the exhaust cone in radians. */
const EXHAUST_SPREAD = 0.22;
/** Minimum particles emitted per frame while thrusting. */
const EMIT_MIN = 8;
/** Maximum particles emitted per frame. */
const EMIT_MAX = 256;
/** Base particle lifetime in seconds. Actual lifetime is randomised ±30% around this. */
const LIFETIME_BASE = 128 * SF;
/** Speed (u/s) at which exhaust particles travel in world space.
 *  plumeLength ≈ EXHAUST_DRIFT_SPEED × LIFETIME_BASE; keep this a few ship-lengths
 *  (ship radius ≈ 0.6 u, so targeting ~3 u plume). */
const EXHAUST_DRIFT_SPEED = 4 * SF;
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
    // Float64Array for px/py/pz: absolute world coords at large distances lose
    // float32 precision, causing particle drift to vanish in integration.
    private readonly px: Float64Array;
    private readonly py: Float64Array;
    private readonly pz: Float64Array;
    private readonly vx: Float32Array;
    private readonly vy: Float32Array;
    private readonly vz: Float32Array;
    private readonly life: Float32Array;
    private readonly lifeIncrement: Float32Array;

    // ── GPU upload buffers (compacted live-particle data) ─────────────────────
    private readonly gpuPos: Float32Array;
    private readonly gpuColorInner: Float32Array;
    private readonly gpuColorOuter: Float32Array;

    private readonly innerGeo: THREE.BufferGeometry;
    private readonly outerGeo: THREE.BufferGeometry;
    private readonly innerMat: THREE.PointsMaterial;
    private readonly outerMat: THREE.PointsMaterial;

    readonly glowInner: THREE.Points;
    readonly glowOuter: THREE.Points;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        this.px = new Float64Array(MAX_PARTICLES);
        this.py = new Float64Array(MAX_PARTICLES);
        this.pz = new Float64Array(MAX_PARTICLES);
        this.vx = new Float32Array(MAX_PARTICLES);
        this.vy = new Float32Array(MAX_PARTICLES);
        this.vz = new Float32Array(MAX_PARTICLES);
        this.life = new Float32Array(MAX_PARTICLES).fill(DEAD);
        this.lifeIncrement = new Float32Array(MAX_PARTICLES);

        this.gpuPos = new Float32Array(MAX_PARTICLES * 3);
        this.gpuColorInner = new Float32Array(MAX_PARTICLES * 3);
        this.gpuColorOuter = new Float32Array(MAX_PARTICLES * 3);

        // ── Shared radial-gradient flame texture ─────────────────────────────
        const tc = document.createElement('canvas');
        const GS = 128;
        tc.width = GS;
        tc.height = GS;
        const ctx = tc.getContext('2d')!;
        const grad = ctx.createRadialGradient(GS / 2, GS / 2, 0, GS / 2, GS / 2, GS / 2);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.8)');
        grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.3)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GS, GS);
        const flameTex = new THREE.CanvasTexture(tc);

        // ── Inner glow (tight, hot core) ─────────────────────────────────────
        this.innerGeo = new THREE.BufferGeometry();
        this.innerGeo.setAttribute('position', new THREE.BufferAttribute(this.gpuPos, 3));
        this.innerGeo.setAttribute('color', new THREE.BufferAttribute(this.gpuColorInner, 3));
        this.innerGeo.setDrawRange(0, 0);

        this.innerMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: 0.08 * SF,
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
        this.outerGeo.setAttribute('color', new THREE.BufferAttribute(this.gpuColorOuter, 3));
        this.outerGeo.setDrawRange(0, 0);

        this.outerMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: 0.22 * SF,
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
        cameraPos: THREE.Vector3
    ): void {

        // Check if particles are enabled
        if (!performanceSettings.particleEffectsEnabled){
            this.hide();
            return;
        }

        const absDt = Math.abs(dt);
        // speedFactor for brightness: 0 at rest, 1 at maxSpeed
        const speedFactor = THREE.MathUtils.clamp(
            Math.abs(speed) / Math.max(maxSpeed * 0.25, 1),
            0,
            1
        );

        // ── 1. Age live particles (sim-time based, comet pattern) ─────────────
        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (this.life[i] < 0) continue;
            this.life[i] += this.lifeIncrement[i] * absDt * 32;
            if (this.life[i] >= 1.0) {
                this.life[i] = DEAD;
            }
        }

        // ── 2. Move live particles (velocity integration) ─────────────────────
        if (absDt > 0) {
            for (let i = 0; i < MAX_PARTICLES; i++) {
                if (this.life[i] < 0) continue;
                this.px[i] += this.vx[i] * absDt * 32;
                this.py[i] += this.vy[i] * absDt * 32;
                this.pz[i] += this.vz[i] * absDt * 32;
            }
        }

        // ── 3. Emit new particles ─────────────────────────────────────────────
        if (thrusting) {
            // Build a tangent basis perpendicular to exhaustDir for cone spread
            const upRef =
                Math.abs(exhaustDir.y) < 0.9
                    ? new THREE.Vector3(0, 1, 0)
                    : new THREE.Vector3(1, 0, 0);
            const perp1 = new THREE.Vector3().crossVectors(exhaustDir, upRef).normalize();
            const perp2 = new THREE.Vector3().crossVectors(exhaustDir, perp1);

            // Emit count scales with speed; no longer driven by travel distance so spawn
            // positions always come from the nozzle regardless of ship movement direction.
            const nEmit = Math.min(
                EMIT_MAX,
                Math.max(EMIT_MIN, Math.round(EMIT_MIN + (EMIT_MAX - EMIT_MIN) * speedFactor))
            );

            // Scale particle lifetime so pool stays under 50% full at any emit rate.
            const adjustedLifetime = Math.min(
                LIFETIME_BASE,
                (MAX_PARTICLES * 0.5) / (Math.max(nEmit, 1) * 60)
            );

            let emitted = 0;
            for (let i = 0; i < MAX_PARTICLES && emitted < nEmit; i++) {
                if (this.life[i] >= 0) continue; // slot in use

                // Random cone scatter within EXHAUST_SPREAD
                const phi = Math.random() * Math.PI * 2;
                const theta = Math.random() * EXHAUST_SPREAD;
                const cosT = Math.cos(theta);
                const sinT = Math.sin(theta);
                const dx =
                    exhaustDir.x * cosT +
                    (perp1.x * Math.cos(phi) + perp2.x * Math.sin(phi)) * sinT;
                const dy =
                    exhaustDir.y * cosT +
                    (perp1.y * Math.cos(phi) + perp2.y * Math.sin(phi)) * sinT;
                const dz =
                    exhaustDir.z * cosT +
                    (perp1.z * Math.cos(phi) + perp2.z * Math.sin(phi)) * sinT;

                // Particle velocity: exhaust direction × drift speed (absolute world space).
                // Particles always eject opposite the ship's facing direction regardless of
                // the ship's actual movement vector.
                const radialBoost = 1.0 + (Math.random() - 0.5) * 0.15;
                const speed = EXHAUST_DRIFT_SPEED * radialBoost;
                // Particle velocity = ship velocity + exhaust drift in the ejection direction.
                // Adding ship velocity keeps ejected particles tracking near the ship's world
                // position so ghost trails don't drift away and create a gap. The exhaust
                // component makes particles drift backward at EXHAUST_DRIFT_SPEED in the
                // ship's reference frame, which is the visible plume.
                this.vx[i] = shipVelocity.x + dx * speed;
                this.vy[i] = shipVelocity.y + dy * speed;
                this.vz[i] = shipVelocity.z + dz * speed;

                // Spread spawn positions randomly along the exhaust axis over the full
                // plume length. Pre-age each particle proportionally so the plume has
                // uniform density on every frame instead of emitting discrete clumps.
                const plumeLength = EXHAUST_DRIFT_SPEED * adjustedLifetime;
                const depthFrac = Math.random();
                const depth = depthFrac * plumeLength;
                this.px[i] = nozzle.x + exhaustDir.x * depth;
                this.py[i] = nozzle.y + exhaustDir.y * depth;
                this.pz[i] = nozzle.z + exhaustDir.z * depth;

                // lifeIncrement = 1/adjustedLifetime, ±30% randomisation like the comet.
                this.lifeIncrement[i] = (1 / adjustedLifetime) * (0.7 + Math.random() * 0.6);
                // Pre-age to match spawn depth so deeper particles die sooner.
                this.life[i] = depthFrac;
                emitted++;
            }
        }

        // ── 4. Compact live particles into GPU buffers (camera-relative) ─────────
        // Flame meshes are positioned at cameraPos; vertices are stored relative to
        // cameraPos so float32 values are small and precise regardless of distance.
        this.glowInner.position.copy(cameraPos);
        this.glowOuter.position.copy(cameraPos);
        const cpx = cameraPos.x,
            cpy = cameraPos.y,
            cpz = cameraPos.z;
        let n = 0;
        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (this.life[i] < 0) continue;
            const t = this.life[i]; // 0 = birth, 1 = death
            const alive = 1 - t;

            this.gpuPos[n * 3] = this.px[i] - cpx;
            this.gpuPos[n * 3 + 1] = this.py[i] - cpy;
            this.gpuPos[n * 3 + 2] = this.pz[i] - cpz;

            // Inner core: white-hot at birth → yellow → orange → dim red at death
            const hot = alive * speedFactor;
            this.gpuColorInner[n * 3] = hot; // R: full
            this.gpuColorInner[n * 3 + 1] = hot * (0.6 + 0.4 * alive); // G: high when young (white/yellow), low when old (red)
            this.gpuColorInner[n * 3 + 2] = hot * 0.15 * alive; // B: slight white tint only at birth

            // Outer glow: orange halo, fades faster than inner
            const warm = alive * alive * speedFactor;
            this.gpuColorOuter[n * 3] = warm;
            this.gpuColorOuter[n * 3 + 1] = warm * 0.35;
            this.gpuColorOuter[n * 3 + 2] = 0;

            n++;
        }

        this.innerGeo.attributes.position.needsUpdate = true;
        this.innerGeo.attributes.color.needsUpdate = true;
        this.outerGeo.attributes.position.needsUpdate = true;
        this.outerGeo.attributes.color.needsUpdate = true;
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
