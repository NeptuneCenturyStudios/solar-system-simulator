import * as THREE from 'three';
import { Body } from '../../bodies/body';
import { playWeaponFire } from '../../utilities/audio.js';
import { SPACESHIP_RADIUS } from '../../utilities/consts.js';
import { IWeaponOwner, Weapon } from './weapon';

/**
 * Per-instance tuning for BoltWeapon.  Ships may pass a partial config to
 * override the class defaults; any omitted field keeps the class default.
 */
export interface IBoltWeaponConfig {
    /** Speed added on top of ship velocity (units/s). */
    baseSpeed: number;
    /** Seconds before a bolt fizzles. */
    particleLifetime: number;
    /** World-space length of each bolt line segment. */
    boltLength: number;
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
    /** Called once per bolt fired. Defaults to playWeaponFire(). */
    fireSound?: () => void;
}

/** Class-level defaults — a ship wanting different behaviour passes a partial IBoltWeaponConfig. */
const DEFAULT_BOLT_CONFIG: IBoltWeaponConfig = {
    baseSpeed: 100,//C * 0.2, // fast bolts relative to top speeds
    particleLifetime: 4.0,
    boltLength: SPACESHIP_RADIUS * 40,
    boltColor: 0x00eeff,
    boltHeadSize: SPACESHIP_RADIUS * 2400,
    fireRate: 10.56,
    maxProjectiles: 800,
    damage: 1,
    fireSound: playWeaponFire,
};

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
    /**
     * Normalised velocity direction — pre-computed once so we can cheaply
     * place the bolt tail exactly boltLength behind the head.
     */
    velDir: THREE.Vector3;
    /** Seconds until fizzle. */
    timeRemaining: number;
}

/**
 * Bolt weapon system — rapid-fire energy bolts rendered as camera-relative
 * line segments with a glowing head point.
 *
 * Each bolt is a short line: tail (behind) → head (front).
 * The tail is clamped to the muzzle position for the first few frames so the
 * bolt always visually originates from the ship hull.
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
    /** Flat float32 buffer: 2 vertices × 3 coords per projectile [tail, head]. */
    private positions: Float32Array;
    private geometry: THREE.BufferGeometry;
    private material: THREE.LineBasicMaterial;
    private lines: THREE.LineSegments;
    /** Glowing point at each bolt head — same camera-relative origin as `lines`. */
    private headPositions: Float32Array;
    private headGeometry: THREE.BufferGeometry;
    private headMaterial: THREE.PointsMaterial;
    private headPoints: THREE.Points;
    private fireCooldown = 0;

    constructor(scene: THREE.Scene, config: Partial<IBoltWeaponConfig> = {}) {
        super(scene);
        this.config = { ...DEFAULT_BOLT_CONFIG, ...config };
        this.maxProjectiles = this.config.maxProjectiles;

        // 2 vertices per bolt (tail + head), 3 floats each.
        this.positions = new Float32Array(this.maxProjectiles * 2 * 3).fill(0);
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setDrawRange(0, 0);

        this.material = new THREE.LineBasicMaterial({
            color: this.config.boltColor,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.lines = new THREE.LineSegments(this.geometry, this.material);
        this.lines.frustumCulled = false;
        this.lines.renderOrder = 2;
        this.lines.visible = false;
        scene.add(this.lines);

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
        this.fireCooldown -= dt;
        if (this.fireCooldown > 0) return;
        this.fireCooldown = 1.0 / this.config.fireRate;

        if (this.projectiles.length >= this.maxProjectiles) return;

        // Speed is base + ship speed (Galilean relativity)
        const velocity = direction
            .clone()
            .multiplyScalar(this.config.baseSpeed)
            .add(shipVelocity);

        (this.config.fireSound ?? playWeaponFire)();
        this.projectiles.push({
            position: origin.clone(),
            velocity,
            velDir: velocity.clone().normalize(),
            timeRemaining: this.config.particleLifetime,
        });
    }

    /**
     * Advance all bolts, expire old ones, check sphere collisions, and upload
     * camera-relative positions to the GPU buffer.
     *
     * @param wallDt         Wall-clock delta time (seconds) — used for lifetime so bolt
     *                       flight duration is consistent regardless of FPS.
     * @param simDt          Total physics simulation advance this frame (seconds) — used
     *                       for position so bolts stay in sync with the ship's physics
     *                       movement (dtTotal = BASE_FRAME_DT × TIME_SCALE × tScale).
     * @param bodies         All active simulation bodies for collision testing.
     * @param cameraPosition World-space camera position for camera-relative rendering.
     * @param owner          Ship firing this weapon — skipped in collision checks.
     */
    update(
        wallDt: number,
        simDt: number,
        bodies: Body[],
        cameraPosition: THREE.Vector3,
        owner: IWeaponOwner
    ): void {
        const toRemove = new Set<number>();

        for (let i = 0; i < this.projectiles.length; i++) {
            const p = this.projectiles[i];
            p.timeRemaining -= wallDt;

            if (p.timeRemaining <= 0) {
                toRemove.add(i);
                continue;
            }

            p.position.addScaledVector(p.velocity, simDt);

            // Sphere–sphere hit test.
            for (const body of bodies) {
                if (body === owner) continue;
                if (!body.mesh || body._isDisposed) continue;
                if (p.position.distanceTo(body.mesh.position) <= body.radius) {
                    window.dispatchEvent(
                        new CustomEvent('weapon:hit', {
                            detail: {
                                body,
                                position: p.position.clone(),
                                damage: this.config.damage,
                            },
                        })
                    );
                    toRemove.add(i);
                    break;
                }
            }
        }

        // Remove dead / hit bolts in reverse order to preserve indices.
        if (toRemove.size > 0) {
            for (const idx of [...toRemove].sort((a, b) => b - a)) {
                this.projectiles.splice(idx, 1);
            }
        }

        // ── Camera-relative GPU upload ────────────────────────────────────────
        // The LineSegments object is placed at cameraPosition; all vertex
        // positions are written relative to cameraPosition so float32 values
        // stay small and precise at any distance from the world origin.
        const count = this.projectiles.length;
        const cpx = cameraPosition.x;
        const cpy = cameraPosition.y;
        const cpz = cameraPosition.z;

        for (let i = 0; i < count; i++) {
            const p = this.projectiles[i];

            // Fixed-length bolt: tail always sits exactly boltLength behind the head.
            const tailX = p.position.x - p.velDir.x * this.config.boltLength;
            const tailY = p.position.y - p.velDir.y * this.config.boltLength;
            const tailZ = p.position.z - p.velDir.z * this.config.boltLength;

            const base = i * 6;
            // Tail vertex (relative to camera)
            this.positions[base] = tailX - cpx;
            this.positions[base + 1] = tailY - cpy;
            this.positions[base + 2] = tailZ - cpz;
            // Head vertex (relative to camera)
            this.positions[base + 3] = p.position.x - cpx;
            this.positions[base + 4] = p.position.y - cpy;
            this.positions[base + 5] = p.position.z - cpz;
        }

        this.geometry.attributes.position.needsUpdate = true;
        // Each segment needs 2 vertices in the draw call.
        this.geometry.setDrawRange(0, count * 2);

        // ── Head points (same camera-relative origin) ────────────────────────
        for (let i = 0; i < count; i++) {
            const p = this.projectiles[i];
            this.headPositions[i * 3] = p.position.x - cpx;
            this.headPositions[i * 3 + 1] = p.position.y - cpy;
            this.headPositions[i * 3 + 2] = p.position.z - cpz;
        }
        this.headGeometry.attributes.position.needsUpdate = true;
        this.headGeometry.setDrawRange(0, count);

        // Place both objects at the camera so relative positions render correctly.
        this.lines.position.copy(cameraPosition);
        this.headPoints.position.copy(cameraPosition);
        this.lines.visible = count > 0;
        this.headPoints.visible = count > 0;
    }

    /** Clear all live bolts and reset cooldown (called on flight exit). */
    reset(): void {
        this.projectiles = [];
        this.geometry.setDrawRange(0, 0);
        this.headGeometry.setDrawRange(0, 0);
        this.lines.visible = false;
        this.headPoints.visible = false;
        this.fireCooldown = 0;
    }

    dispose(): void {
        this.scene.remove(this.lines);
        this.scene.remove(this.headPoints);
        this.geometry.dispose();
        this.material.dispose();
        this.headGeometry.dispose();
        this.headMaterial.dispose();
        this.projectiles = [];
    }
}
