import * as THREE from 'three';
import { Body } from '../bodies/body.js';
import { settingsStore } from '../settings/settings-store.js';
import { DIST_SCALE } from '../utilities/consts.js';

/**
 * Renders a backward-streaming plasma trail that engulfs an asteroid/comet while it's
 * inside a planet's atmosphere — a smaller, always-on relative of the ship exhaust
 * effect (`src/ship-effects/ship-flame.ts`), oriented by the body's own velocity
 * instead of a nozzle/exhaust direction fed in from outside.
 *
 * The effect keeps a live reference to `body` and reads its `mesh.position`/`velocity`
 * fresh every frame, so it tracks a moving body without needing to be re-parented or
 * fed transform data externally (same pattern as `src/effects/solar-flare.ts`).
 *
 * Particles spawn from the body's leading surface point (in the direction of travel)
 * and drift backward relative to the body's motion, producing a meteor-style plasma
 * trail. Float64 world-space positions avoid float32 precision loss far from the
 * origin; the Points objects are rendered camera-relative like ShipFlame.
 */
export class EntryFlameEffect {
    private readonly scene: THREE.Scene;
    private readonly body: Body;
    /** The planet this flame is currently attributed to — exposed so the per-frame
     *  containment check (checkAtmosphericEntry) only disposes this effect when *this*
     *  specific planet's atmosphere is exited, not whenever the body doesn't happen to be
     *  inside some other, unrelated atmosphere-bearing planet it's compared against. */
    readonly planet: Body;

    private readonly px: Float64Array;
    private readonly py: Float64Array;
    private readonly pz: Float64Array;
    private readonly vx: Float32Array;
    private readonly vy: Float32Array;
    private readonly vz: Float32Array;
    private readonly life: Float32Array;
    private readonly lifeIncrement: Float32Array;

    private readonly gpuPos: Float32Array;
    private readonly gpuColorInner: Float32Array;
    private readonly gpuColorOuter: Float32Array;

    private readonly innerGeo: THREE.BufferGeometry;
    private readonly outerGeo: THREE.BufferGeometry;
    private readonly innerMat: THREE.PointsMaterial;
    private readonly outerMat: THREE.PointsMaterial;

    private readonly glowInner: THREE.Points;
    private readonly glowOuter: THREE.Points;

    private readonly LIFETIME_BASE: number;
    private readonly DRIFT_SPEED: number;

    /** Fractional particle count carried over between frames so low-dt frames (e.g. at
     *  low timewarp) still accumulate toward an emission instead of always rounding to 0. */
    private emitAccumulator = 0;

    private readonly MAX_PARTICLES = 160;
    /** Half-angle (radians) of the surface patch particles spawn from, measured from the
     *  direction of travel. > PI/2 so the flame wraps past the equator and reads as
     *  "engulfing" the body rather than a narrow directional jet. */
    private readonly SPREAD = 1.9;
    private readonly EMIT_PER_SECOND = 260;
    private readonly DEAD = -1;

    /**
     * Relative-speed thresholds that drive the flame's intensity, given directly in km/s
     * and converted to the engine's scaled velocity units via DIST_SCALE — the same
     * convention used everywhere else a speed constant is declared (e.g.
     * ASTEROID_DEFENSE_APPROACH_SPEED, ship FLIGHT_MAX_SPEED). `body.velocity` is already
     * expressed in km/s ÷ DIST_SCALE, so a desired km/s threshold must be divided by
     * DIST_SCALE too — comparing it to the raw km/s number would be off by a factor of
     * DIST_SCALE (100).
     *
     * Below MIN_SPEED_FOR_EFFECT the flame is fully suppressed (0 intensity); at/above
     * FULL_INTENSITY_SPEED it's fully lit (1); it ramps smoothly in between. Both are tuned
     * for ship flight speeds (normal cruise ~75 km/s, boost a large fraction of light
     * speed) rather than the asteroid-defense scenario's ~1200 km/s scripted impacts —
     * those sail straight past FULL_INTENSITY_SPEED and stay fully lit no matter where
     * this is tuned, since intensity clamps at 1 once past it.
     */
    private readonly MIN_SPEED_FOR_EFFECT = 10 / DIST_SCALE; // ~10 km/s — flame starts appearing
    private readonly FULL_INTENSITY_SPEED = 150 / DIST_SCALE; // ~150 km/s — fully ablaze

    constructor(scene: THREE.Scene, body: Body, planet: Body) {
        this.scene = scene;
        this.body = body;
        this.planet = planet;

        const radius = body.radius;
        this.LIFETIME_BASE = 96 * radius;
        this.DRIFT_SPEED = 14 * radius;

        this.px = new Float64Array(this.MAX_PARTICLES);
        this.py = new Float64Array(this.MAX_PARTICLES);
        this.pz = new Float64Array(this.MAX_PARTICLES);
        this.vx = new Float32Array(this.MAX_PARTICLES);
        this.vy = new Float32Array(this.MAX_PARTICLES);
        this.vz = new Float32Array(this.MAX_PARTICLES);
        this.life = new Float32Array(this.MAX_PARTICLES).fill(this.DEAD);
        this.lifeIncrement = new Float32Array(this.MAX_PARTICLES);

        this.gpuPos = new Float32Array(this.MAX_PARTICLES * 3);
        this.gpuColorInner = new Float32Array(this.MAX_PARTICLES * 3);
        this.gpuColorOuter = new Float32Array(this.MAX_PARTICLES * 3);

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

        this.innerGeo = new THREE.BufferGeometry();
        this.innerGeo.setAttribute('position', new THREE.BufferAttribute(this.gpuPos, 3));
        this.innerGeo.setAttribute('color', new THREE.BufferAttribute(this.gpuColorInner, 3));
        this.innerGeo.setDrawRange(0, 0);

        this.innerMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: radius * 1.4,
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
        this.glowInner.renderOrder = 2;
        scene.add(this.glowInner);

        this.outerGeo = new THREE.BufferGeometry();
        this.outerGeo.setAttribute('position', new THREE.BufferAttribute(this.gpuPos, 3));
        this.outerGeo.setAttribute('color', new THREE.BufferAttribute(this.gpuColorOuter, 3));
        this.outerGeo.setDrawRange(0, 0);

        this.outerMat = new THREE.PointsMaterial({
            vertexColors: true,
            size: radius * 2,
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
        this.glowOuter.renderOrder = 2;
        scene.add(this.glowOuter);
    }

    /**
     * Update per frame (call once per render frame, not per physics substep).
     * @param dt Frame delta-time in seconds.
     * @param cameraPos World-space camera position, used to render particles camera-relative.
     */
    update(dt: number, cameraPos: THREE.Vector3): void {
        if (!settingsStore.settings.particleEffectsEnabled) {
            this.glowInner.visible = false;
            this.glowOuter.visible = false;
            return;
        }

        const absDt = Math.abs(dt);

        // ── 1. Age live particles ──────────────────────────────────────────
        for (let i = 0; i < this.MAX_PARTICLES; i++) {
            if (this.life[i] < 0) continue;
            this.life[i] += this.lifeIncrement[i] * absDt * 32;
            if (this.life[i] >= 1.0) this.life[i] = this.DEAD;
        }

        // ── 2. Move live particles ─────────────────────────────────────────
        if (absDt > 0) {
            for (let i = 0; i < this.MAX_PARTICLES; i++) {
                if (this.life[i] < 0) continue;
                this.px[i] += this.vx[i] * absDt * 32;
                this.py[i] += this.vy[i] * absDt * 32;
                this.pz[i] += this.vz[i] * absDt * 32;
            }
        }

        // Amplify with closing/relative speed against the planet (not heliocentric speed —
        // a ship co-moving with its planet has near-zero speed relative to it even though
        // its absolute velocity is large). Ramps smoothly from dark at MIN_SPEED_FOR_EFFECT
        // to full brightness/density at FULL_INTENSITY_SPEED.
        const relativeSpeed = this.body.velocity.distanceTo(this.planet.velocity);
        const intensity = THREE.MathUtils.smoothstep(
            relativeSpeed,
            this.MIN_SPEED_FOR_EFFECT,
            this.FULL_INTENSITY_SPEED
        );

        // ── 3. Emit new particles from the leading surface point ──────────
        const bodyPos = this.body.mesh.position;
        const bodyVel = this.body.velocity;
        const speed = bodyVel.length();
        const dir =
            speed > 1e-6 ? bodyVel.clone().multiplyScalar(1 / speed) : new THREE.Vector3(0, 0, 1);

        const upRef =
            Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const perp1 = new THREE.Vector3().crossVectors(dir, upRef).normalize();
        const perp2 = new THREE.Vector3().crossVectors(dir, perp1);

        // Accumulate fractional emission count across frames — at low timewarp/dt the
        // per-frame rate can be well under 1, and rounding it per-frame would always
        // truncate to 0, silently suppressing the effect entirely below some dt threshold.
        this.emitAccumulator += this.EMIT_PER_SECOND * intensity * absDt;
        const nEmit = Math.floor(this.emitAccumulator);
        this.emitAccumulator -= nEmit;
        const adjustedLifetime = Math.min(
            this.LIFETIME_BASE,
            (this.MAX_PARTICLES * 0.5) / Math.max(this.EMIT_PER_SECOND, 1)
        );

        let emitted = 0;
        for (let i = 0; i < this.MAX_PARTICLES && emitted < nEmit; i++) {
            if (this.life[i] >= 0) continue;

            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * this.SPREAD;
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);
            const sx = dir.x * cosT + (perp1.x * Math.cos(phi) + perp2.x * Math.sin(phi)) * sinT;
            const sy = dir.y * cosT + (perp1.y * Math.cos(phi) + perp2.y * Math.sin(phi)) * sinT;
            const sz = dir.z * cosT + (perp1.z * Math.cos(phi) + perp2.z * Math.sin(phi)) * sinT;

            this.px[i] = bodyPos.x + sx * this.body.radius;
            this.py[i] = bodyPos.y + sy * this.body.radius;
            this.pz[i] = bodyPos.z + sz * this.body.radius;

            // Trail backward relative to the body's own motion.
            const drift = this.DRIFT_SPEED * (0.85 + Math.random() * 0.3);
            this.vx[i] = bodyVel.x - dir.x * drift;
            this.vy[i] = bodyVel.y - dir.y * drift;
            this.vz[i] = bodyVel.z - dir.z * drift;

            this.lifeIncrement[i] = (1 / adjustedLifetime) * (0.7 + Math.random() * 0.6);
            this.life[i] = 0;
            emitted++;
        }

        // ── 4. Compact live particles into GPU buffers (camera-relative) ──
        this.glowInner.position.copy(cameraPos);
        this.glowOuter.position.copy(cameraPos);
        const cpx = cameraPos.x,
            cpy = cameraPos.y,
            cpz = cameraPos.z;
        let n = 0;
        for (let i = 0; i < this.MAX_PARTICLES; i++) {
            if (this.life[i] < 0) continue;
            const t = this.life[i];
            const alive = 1 - t;

            this.gpuPos[n * 3] = this.px[i] - cpx;
            this.gpuPos[n * 3 + 1] = this.py[i] - cpy;
            this.gpuPos[n * 3 + 2] = this.pz[i] - cpz;

            // Inner core: white-hot at birth → yellow → orange → dim red at death.
            this.gpuColorInner[n * 3] = alive; // R: full
            this.gpuColorInner[n * 3 + 1] = alive * (0.55 + 0.45 * alive); // G: high when young, low when old
            this.gpuColorInner[n * 3 + 2] = alive * 0.2 * alive; // B: slight white tint only at birth

            // Outer glow: warm orange halo, fades faster than the core.
            const warm = alive * alive;
            this.gpuColorOuter[n * 3] = warm;
            this.gpuColorOuter[n * 3 + 1] = warm * 0.3;
            this.gpuColorOuter[n * 3 + 2] = 0;

            n++;
        }

        this.innerGeo.attributes.position.needsUpdate = true;
        this.innerGeo.attributes.color.needsUpdate = true;
        this.outerGeo.attributes.position.needsUpdate = true;
        this.outerGeo.attributes.color.needsUpdate = true;
        this.innerGeo.setDrawRange(0, n);
        this.outerGeo.setDrawRange(0, n);

        // Fade existing particles immediately as speed drops, on top of the emission-rate
        // throttling above — the two together give a smooth brighten/dim as speed changes
        // rather than an abrupt on/off switch.
        this.innerMat.opacity = intensity;
        this.outerMat.opacity = intensity;

        const showing = n > 0 && intensity > 0;
        this.glowInner.visible = showing;
        this.glowOuter.visible = showing;
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
