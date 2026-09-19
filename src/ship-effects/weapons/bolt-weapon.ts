import * as THREE from 'three';
import { Body } from '../../bodies/body';
import { SoundEffect, playSoundEffect } from '../../utilities/audio.js';
import { IWeaponOwner, IWeaponSound, Weapon } from './weapon';
import { DIST_SCALE, RADIUS_SCALE } from '../../utilities/consts';

/**
 * Per-instance tuning for BoltWeapon.  Ships may pass a partial config to
 * override the class defaults; any omitted field keeps the class default.
 */
export interface IBoltWeaponConfig {
    /** Speed added on top of ship velocity (units/s). */
    baseSpeed: number;
    /** Seconds before a bolt fizzles. */
    particleLifetime: number;
    /** Hex colour for bolts and the glow point. */
    boltColor: number;
    /** World-space size of the glowing head sprite (perspective-correct). */
    boltHeadSize: number;
    /** Maximum bolts fired per second. */
    fireRate: number;
    /** Maximum simultaneous in-flight bolts. */
    maxProjectiles: number;
    /** HP damage dealt on impact. */
    damage: number;
    /** Thermal load gained per second while the trigger is held (0..1 scale). */
    heatPerSecond: number;
    /** Thermal load lost per second while the trigger is released (0..1 scale). */
    coolPerSecond: number;
    /** Called once per bolt fired. Defaults to playSoundEffect(SoundEffect.WeaponFire). */
    fireSound?: () => void;
}

/**
 * One active bolt projectile.
 * All positions are stored as JS float64 THREE.Vector3 to avoid precision loss
 * at extreme simulation distances.  Camera-relative float32 values are computed
 * in update() only at render time.
 */
interface Projectile {
    /** Current head position in world space (float64). */
    position: THREE.Vector3;
    /** World-space velocity (aim direction × relativeSpeed + shipVelocity). */
    velocity: THREE.Vector3;
    /** Normalised world-space travel direction — cached once in tryFire() since
     *  velocity (and therefore direction) is constant for the bolt's lifetime. */
    direction: THREE.Vector3;
    /** World-space speed (velocity.length()) — cached once alongside direction. */
    speed: number;
    /** Seconds until fizzle. */
    timeRemaining: number;
}

/**
 * Bolt weapon system — rapid-fire energy bolts rendered as a camera-relative
 * glowing point per bolt (no tail: bolts move too fast for one to ever be seen).
 *
 * Camera-relative rendering keeps float32 GPU positions small and precise
 * regardless of the simulation distance from the world origin, matching the
 * technique used by ShipFlame.
 *
 * On body impact, dispatches `window` CustomEvent `'weapon:hit'` with:
 *   { body: Body, position: THREE.Vector3, damage: number }
 */
export class BoltWeapon extends Weapon {
    private readonly config: IBoltWeaponConfig;
    private projectiles: Projectile[] = [];
    private readonly maxProjectiles: number;
    /** Glowing point at each bolt head. */
    private headPositions: Float32Array;
    private headGeometry: THREE.BufferGeometry;
    private headMaterial: THREE.PointsMaterial;
    private headPoints: THREE.Points;
    private fireCooldown = 0;
    /** True while the trigger is held (drives thermal cooldown gating). */
    private active = false;

    constructor(scene: THREE.Scene, _shipRadius: number, config: Partial<IBoltWeaponConfig> = {}) {
        super(scene);

        /** Class-level defaults — a ship wanting different behaviour passes a partial IBoltWeaponConfig. */
        const DEFAULT_BOLT_CONFIG: IBoltWeaponConfig = {
            baseSpeed: 6000 / DIST_SCALE, // 8,000 km/s
            particleLifetime: 4.0,
            boltColor: 0x00eeff,
            boltHeadSize: 60 / RADIUS_SCALE,
            fireRate: 12,
            maxProjectiles: 800,
            damage: 1,
            heatPerSecond: 0.1,
            coolPerSecond: 0.8,
            fireSound: () => playSoundEffect(SoundEffect.WeaponFire),
        };

        this.config = { ...DEFAULT_BOLT_CONFIG, ...config };
        this.maxProjectiles = this.config.maxProjectiles;

        const weaponSound: IWeaponSound = {
            fire: this.config.fireSound ?? (() => playSoundEffect(SoundEffect.WeaponFire)),
        };
        this.weaponSound = weaponSound;

        // ── Glowing head points ───────────────────────────────────────────────
        this.headPositions = new Float32Array(this.maxProjectiles * 3).fill(0);
        this.headGeometry = new THREE.BufferGeometry();
        this.headGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.headPositions, 3)
        );
        this.headGeometry.setDrawRange(0, 0);

        this.headMaterial = new THREE.PointsMaterial({
            color: this.config.boltColor,
            size: this.config.boltHeadSize,
            sizeAttenuation: true, // world-unit size — shrinks naturally with distance
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        // Round, glowing point sprite via fragment shader injection.
        // Replaces the square default sprite with a soft radial falloff:
        //   - Outer ring  : fully transparent (circular clip)
        //   - Mid falloff : bolt colour fading out (glow halo)
        //   - Bright core : blends toward white for a hot-centre "plasma" look
        this.headMaterial.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
                'outgoingLight = diffuseColor.rgb;',
                `outgoingLight = diffuseColor.rgb;

                // Circular clip + radial glow
                float _d  = length(gl_PointCoord - vec2(0.5));
                if (_d > 0.5) discard;
                float _r    = _d * 2.0;                              // 0 = centre, 1 = edge
                float _glow = pow(1.0 - _r, 1.5);                   // smooth alpha falloff
                // Brighten core toward white for a hot-plasma look
                outgoingLight = mix(outgoingLight, vec3(1.0),
                                    pow(max(0.0, 1.0 - _r * 1.5), 2.5));
                diffuseColor.a *= _glow;`
            );
        };

        this.headPoints = new THREE.Points(this.headGeometry, this.headMaterial);
        this.headPoints.frustumCulled = false;
        this.headPoints.renderOrder = 2;
        this.headPoints.visible = false;
        scene.add(this.headPoints);
    }

    /** Bolts leave the muzzle at their configured base speed, before the ship's own velocity. */
    override get muzzleSpeed(): number {
        return this.config.baseSpeed;
    }

    /**
     * Attempt to fire a new bolt, respecting the rate-of-fire cooldown.
     * @param dt           Delta time this frame (seconds).
     * @param origin       World-space muzzle position.
     * @param direction    Normalised world-space fire direction.
     * @param shipVelocity Current ship velocity (added for Galilean relativity).
     */
    tryFire(
        dt: number,
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        shipVelocity: THREE.Vector3
    ): void {
        this.active = true;
        if (this.overheated) return;
        this.addHeat(this.config.heatPerSecond * dt);

        this.fireCooldown -= dt;
        if (this.fireCooldown > 0) return;
        this.fireCooldown = 1.0 / this.config.fireRate;

        if (this.projectiles.length >= this.maxProjectiles) return;

        // Speed is base + ship speed (Galilean relativity)
        const velocity = direction.clone().multiplyScalar(this.config.baseSpeed).add(shipVelocity);
        const speed = velocity.length();
        // normalize() safely yields (0,0,0) when speed is 0 — no NaN risk.
        const boltDirection = velocity.clone().normalize();

        this.beginSound();
        this.projectiles.push({
            position: origin.clone(),
            velocity,
            direction: boltDirection,
            speed,
            timeRemaining: this.config.particleLifetime,
        });
    }

    /** Release the trigger — stops the thermal cooldown gate. */
    stopFire(): void {
        this.active = false;
        super.stopFire();
    }

    /**
     * Advance all bolts, expire old ones, check sphere collisions, and upload
     * camera-relative positions to the GPU buffer.
     *
     * @param wallDt         Wall-clock delta time (seconds) — used for lifetime so bolt
     *                       flight duration is consistent regardless of FPS.
     * @param simDt          Total physics simulation advance this frame (seconds) — used
     *                       for position so bolts stay in sync with the ship's physics
     *                       movement (dtTotal = wallDt × TIME_SCALE × tScale).
     * @param bodies         All active simulation bodies for collision testing.
     * @param cameraPosition World-space camera position for camera-relative rendering.
     * @param owner          Ship firing this weapon — skipped in collision checks.
     * @param isPaused       True while the sim is paused — freezes lifetime/thermal
     *                       decay so bolts hold their position and don't fizzle out.
     */
    update(
        wallDt: number,
        simDt: number,
        bodies: Body[],
        cameraPosition: THREE.Vector3,
        owner: IWeaponOwner,
        isPaused: boolean
    ): void {
        if (!isPaused) {
            this.updateThermal(wallDt, this.active, this.config.coolPerSecond);
        }

        const toRemove = new Set<number>();

        for (let i = 0; i < this.projectiles.length; i++) {
            const p = this.projectiles[i];

            if (!isPaused) {
                p.timeRemaining -= wallDt;

                if (p.timeRemaining <= 0) {
                    toRemove.add(i);
                    continue;
                }
            }

            // ── Swept ray-sphere hit test along this frame's travel segment ──
            // A bolt moves ~1000s of world-units per frame vs. ship radii of
            // ~1e-4..1e-2 units, so a discrete end-of-frame point check would
            // tunnel through targets almost every frame (see laser-weapon.ts's
            // identical technique for the continuous beam). Origin is this
            // bolt's PRE-move position; maxT is the distance it travels this frame.
            const originX = p.position.x;
            const originY = p.position.y;
            const originZ = p.position.z;
            const dirX = p.direction.x;
            const dirY = p.direction.y;
            const dirZ = p.direction.z;
            const maxT = p.speed * simDt;

            let hitT = maxT;
            let hitBody: Body | null = null;

            for (const body of bodies) {
                if (body === owner) continue;
                if (!body.mesh || body._isDisposed) continue;

                const ocX = body.mesh.position.x - originX;
                const ocY = body.mesh.position.y - originY;
                const ocZ = body.mesh.position.z - originZ;
                const tca = ocX * dirX + ocY * dirY + ocZ * dirZ;

                // Squared distance from the target's centre to the ray itself (not to the
                // pre-move origin) — valid regardless of where tca falls relative to hitT.
                const d2 = ocX * ocX + ocY * ocY + ocZ * ocZ - tca * tca;
                const r = body.radius;
                if (d2 > r * r) continue; // ray never comes within r of the centre at any t

                // Entry/exit distances along the ray. For small radii (ships) tEntry ≈ tca,
                // so gating on tca alone (the old approach) was a harmless approximation —
                // but for radii comparable to or larger than a frame's travel distance
                // (planets, moons, most asteroids) tEntry can be well inside [0, hitT] while
                // tca itself is still far outside it, which silently skipped the body for
                // several frames until the bolt had already tunnelled past or into it.
                const thc = Math.sqrt(r * r - d2);
                const tExit = tca + thc;
                if (tExit < 0) continue; // sphere is entirely behind the ray origin

                // If the origin is already inside the sphere (tEntry < 0), the segment starts
                // inside the target — an immediate hit at t = 0 rather than a rejected one.
                const tEntry = tca - thc;
                const tHitCandidate = tEntry < 0 ? 0 : tEntry;

                if (tHitCandidate < hitT) {
                    hitT = tHitCandidate;
                    hitBody = body;
                }
            }

            if (hitBody) {
                p.position.set(originX + dirX * hitT, originY + dirY * hitT, originZ + dirZ * hitT);
                window.dispatchEvent(
                    new CustomEvent('weapon:hit', {
                        detail: {
                            body: hitBody,
                            position: p.position.clone(),
                            damage: this.config.damage,
                        },
                    })
                );
                toRemove.add(i);
            } else {
                p.position.addScaledVector(p.velocity, simDt);
            }
        }

        // Remove dead / hit bolts in reverse order to preserve indices.
        if (toRemove.size > 0) {
            for (const idx of [...toRemove].sort((a, b) => b - a)) {
                this.projectiles.splice(idx, 1);
            }
        }

        // ── Camera-relative GPU upload ────────────────────────────────────────
        // The Points object is placed at cameraPosition; all vertex positions
        // are written relative to cameraPosition so float32 values stay small
        // and precise at any distance from the world origin.
        const count = this.projectiles.length;
        const cpx = cameraPosition.x;
        const cpy = cameraPosition.y;
        const cpz = cameraPosition.z;

        // ── Head points ────────────────────────────────────────────────────
        for (let i = 0; i < count; i++) {
            const p = this.projectiles[i];
            this.headPositions[i * 3] = p.position.x - cpx;
            this.headPositions[i * 3 + 1] = p.position.y - cpy;
            this.headPositions[i * 3 + 2] = p.position.z - cpz;
        }
        this.headGeometry.attributes.position.needsUpdate = true;
        this.headGeometry.setDrawRange(0, count);

        // Place the object at the camera so relative positions render correctly.
        this.headPoints.position.copy(cameraPosition);
        this.headPoints.visible = count > 0;
    }

    /** Clear all live bolts and reset cooldown. Not called automatically on flight exit. */
    reset(): void {
        this.projectiles = [];
        this.headGeometry.setDrawRange(0, 0);
        this.headPoints.visible = false;
        this.fireCooldown = 0;
    }

    dispose(): void {
        this.scene.remove(this.headPoints);
        this.headGeometry.dispose();
        this.headMaterial.dispose();
        this.projectiles = [];
    }
}
