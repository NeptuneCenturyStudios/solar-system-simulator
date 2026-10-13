import * as THREE from 'three';
import { Body } from '../../bodies/body';
import { IDamageEffectiveness } from '../../interfaces';
import { SoundEffect, playSoundEffect } from '../../utilities/audio.js';
import {
    IBodyRayHit,
    IWeaponOwner,
    IWeaponSound,
    Weapon,
    muzzleWorldPosition,
    raycastBodies,
} from './weapon';
import { MissileSmoke } from './missile-smoke';
import { DIST_SCALE, RADIUS_SCALE } from '../../utilities/consts';

/**
 * Per-instance tuning for MissileWeapon.  Ships may pass a partial config to
 * override the class defaults; any omitted field keeps the class default.
 */
export interface IMissileWeaponConfig {
    /**
     * Top speed gained over the launch speed (units/s). A missile leaves the muzzle at the
     * ship's own forward speed and accelerates to launch speed + `speed` over `accelTime`.
     */
    speed: number;
    /**
     * Sim seconds to ramp from launch speed to top speed, on a smoothstep curve (gentle start,
     * hard middle, soft arrival). 0 launches at top speed instantly.
     */
    accelTime: number;
    /** Missiles launched per trigger pull. */
    salvoSize: number;
    /** Wall-clock seconds between successive launches within one salvo (ripple fire). */
    salvoInterval: number;
    /** Angular splay (radians) off the aim axis for missiles 2..N of a salvo; homing pulls them back in. */
    salvoSplay: number;
    /** Maximum guidance turn rate (radians per sim-second). */
    turnRate: number;
    /** Sim seconds before an unspent missile expires — fixes its range at speed × lifetime. */
    lifetime: number;
    /** HP damage dealt by each missile that hits. */
    damage: number;
    /** Damage multiplier against shields (1 = full damage). */
    shieldEffectiveness: number;
    /** Damage multiplier against hulls and unshielded bodies (1 = full damage). */
    hullEffectiveness: number;
    /** Thermal load added per salvo (0..1 scale). 1 overheats the launcher on every salvo. */
    heatPerSalvo: number;
    /** Thermal load lost per second while the trigger is released (0..1 scale). */
    coolPerSecond: number;
    /** Maximum simultaneous in-flight missiles. */
    maxMissiles: number;
    /** Nose-to-tail length of the missile mesh (world units). */
    missileLength: number;
    /** Hull colour of the missile mesh. */
    bodyColor: number;
    /** Colour of the exhaust glow at the tail. */
    exhaustColor: number;
    /** World-space size of the exhaust glow sprite (perspective-correct). */
    exhaustSize: number;
    /** Draw a smoke trail behind each missile. */
    smokeEnabled: boolean;
    /** Colour of cooled smoke (fresh smoke starts at `exhaustColor`). */
    smokeColor: number;
    /** Wall-clock seconds each smoke puff lives. */
    smokeLifetime: number;
    /** Smoke puffs emitted per wall-second per missile; they stretch to cover the distance between them. */
    smokeRate: number;
    /** Smoke puff width at emission (world units). */
    smokeSize: number;
    /** Width multiplier a smoke puff reaches by the end of its life. */
    smokeGrowth: number;
    /** Peak opacity of a smoke puff. */
    smokeOpacity: number;
    /** Called once per missile launched. Defaults to playSoundEffect(SoundEffect.WeaponFire). */
    fireSound?: () => void;
}

/**
 * One missile in flight.
 * Positions are float64 THREE.Vector3 to avoid precision loss at extreme
 * simulation distances; camera-relative float32 values are computed at render time.
 */
interface Missile {
    /** Current centre position in world space (float64). */
    position: THREE.Vector3;
    /** Normalised world-space heading — steered by guidance each frame. */
    direction: THREE.Vector3;
    /** Speed at launch — the firing ship's forward speed along the launch heading. */
    launchSpeed: number;
    /** Sim seconds since launch; drives the acceleration curve. */
    age: number;
    /** Target captured at launch, or null for an unguided (dumb-fired) missile. */
    target: Body | null;
    /** Sim seconds until expiry. */
    timeRemaining: number;
    /** Pooled mesh drawn for this missile. */
    object: THREE.Object3D;
    /** Where the last smoke emission ended; the next one fills the path from here. */
    smokeFrom: THREE.Vector3;
    /** Fractional smoke puffs owed — accrues at `smokeRate` per wall-second. */
    smokeCredit: number;
}

/** A not-yet-launched missile of a ripple-fired salvo. */
interface PendingLaunch {
    /** Wall-clock seconds until launch. */
    delay: number;
    /** World-space launch direction (aim axis with this missile's splay applied). */
    direction: THREE.Vector3;
    /** Target captured when the salvo was fired. */
    target: Body | null;
}

/** Most smoke puffs one missile emits in a single frame, bounding the cost of a long frame. */
const MAX_SMOKE_PER_FRAME = 16;

const _FORWARD = new THREE.Vector3(0, 0, 1);
const _muzzle = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _perp = new THREE.Vector3();

/** Any unit vector perpendicular to unit vector `v`. */
function perpendicularTo(v: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    // Cross with whichever world axis is least parallel to v.
    if (Math.abs(v.x) < 0.9) out.set(1, 0, 0);
    else out.set(0, 1, 0);
    return out.cross(v).normalize();
}

/**
 * Homing missile launcher.  On each trigger pull it fires a salvo of missiles from the
 * muzzle; each one homes on the target that was locked at the moment of firing — changing
 * the lock afterwards never redirects a missile already in flight.  With no lock, or once
 * its target is gone, a missile flies straight until it hits something or expires.
 *
 * Rendered camera-relative (as BoltWeapon does): a pooled placeholder mesh per missile
 * (cylinder + cone nose + four tail fins) under a root that sits at the camera, plus a
 * single glowing point per missile at the tail for the exhaust, plus a MissileSmoke trail.
 *
 * On body impact, dispatches `window` CustomEvent `'weapon:hit'` with:
 *   { body: Body, position: THREE.Vector3, damage: number, effectiveness: IDamageEffectiveness }
 */
export class MissileWeapon extends Weapon {
    private readonly config: IMissileWeaponConfig;
    /** Shield/hull damage multipliers sent with every hit — built once from config. */
    private readonly effectiveness: IDamageEffectiveness;
    private missiles: Missile[] = [];
    private pending: PendingLaunch[] = [];
    /** Hidden meshes available for new launches. */
    private freeObjects: THREE.Object3D[] = [];
    /** True while the trigger is held — salvos launch on the rising edge only. */
    private active = false;
    /** Scratch for the per-frame swept hit test. */
    private readonly hit: IBodyRayHit = { t: 0, body: null };

    // ── Rendering ────────────────────────────────────────────────────────────
    private readonly missileRoot: THREE.Group;
    private readonly geometries: THREE.BufferGeometry[] = [];
    private readonly bodyMaterial: THREE.MeshStandardMaterial;
    private readonly exhaustPositions: Float32Array;
    private readonly exhaustGeometry: THREE.BufferGeometry;
    private readonly exhaustMaterial: THREE.PointsMaterial;
    private readonly exhaustPoints: THREE.Points;
    private readonly smoke: MissileSmoke | null;

    constructor(
        scene: THREE.Scene,
        _shipRadius: number,
        config: Partial<IMissileWeaponConfig> = {}
    ) {
        super(scene);

        /** Class-level defaults — a ship wanting different behaviour passes a partial IMissileWeaponConfig. */
        const DEFAULT_MISSILE_CONFIG: IMissileWeaponConfig = {
            speed: 5000 / DIST_SCALE, // 2,500 km/s
            accelTime: 13,
            salvoSize: 1,
            salvoInterval: 0.15,
            salvoSplay: THREE.MathUtils.degToRad(6),
            turnRate: 3,
            lifetime: 30,
            damage: 15,
            shieldEffectiveness: 0.25,
            hullEffectiveness: 1.75,
            heatPerSalvo: 1,
            coolPerSecond: 0.2, // full cooldown in 5 s
            maxMissiles: 32,
            missileLength: 0.006 / RADIUS_SCALE, // 6 m
            bodyColor: 0xc8ccd0,
            exhaustColor: 0xffaa33,
            exhaustSize: 15 / 1000 / RADIUS_SCALE,
            smokeEnabled: true,
            smokeColor: 0x9a9590,
            smokeLifetime: 2.5,
            smokeRate: 40,
            smokeSize: 0.012 / RADIUS_SCALE, // 12 m
            smokeGrowth: 5,
            smokeOpacity: 0.55,
            fireSound: () => playSoundEffect(SoundEffect.MissileLaunch),
        };

        this.config = { ...DEFAULT_MISSILE_CONFIG, ...config };
        this.effectiveness = {
            shield: this.config.shieldEffectiveness,
            hull: this.config.hullEffectiveness,
        };

        const weaponSound: IWeaponSound = {
            fire: this.config.fireSound ?? (() => playSoundEffect(SoundEffect.WeaponFire)),
        };
        this.weaponSound = weaponSound;

        // ── Missile mesh pool ─────────────────────────────────────────────────
        this.bodyMaterial = new THREE.MeshStandardMaterial({
            color: this.config.bodyColor,
            metalness: 0.6,
            roughness: 0.4,
        });
        const template = this.buildMissileTemplate();

        this.missileRoot = new THREE.Group();
        this.missileRoot.frustumCulled = false;
        for (let i = 0; i < this.config.maxMissiles; i++) {
            const obj = template.clone(); // shares geometry + material
            obj.visible = false;
            this.missileRoot.add(obj);
            this.freeObjects.push(obj);
        }
        scene.add(this.missileRoot);

        // ── Exhaust glow points ───────────────────────────────────────────────
        this.exhaustPositions = new Float32Array(this.config.maxMissiles * 3).fill(0);
        this.exhaustGeometry = new THREE.BufferGeometry();
        this.exhaustGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.exhaustPositions, 3)
        );
        this.exhaustGeometry.setDrawRange(0, 0);

        this.exhaustMaterial = new THREE.PointsMaterial({
            color: this.config.exhaustColor,
            size: this.config.exhaustSize,
            sizeAttenuation: true,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        // Round radial glow with a white-hot core — same sprite shader as the bolt head.
        this.exhaustMaterial.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
                'outgoingLight = diffuseColor.rgb;',
                `outgoingLight = diffuseColor.rgb;
                float _d  = length(gl_PointCoord - vec2(0.5));
                if (_d > 0.5) discard;
                float _r    = _d * 2.0;
                float _glow = pow(1.0 - _r, 1.5);
                outgoingLight = mix(outgoingLight, vec3(1.0),
                                    pow(max(0.0, 1.0 - _r * 1.5), 2.5));
                diffuseColor.a *= _glow;`
            );
        };

        this.exhaustPoints = new THREE.Points(this.exhaustGeometry, this.exhaustMaterial);
        this.exhaustPoints.frustumCulled = false;
        this.exhaustPoints.renderOrder = 2;
        this.exhaustPoints.visible = false;
        scene.add(this.exhaustPoints);

        // ── Smoke trails ──────────────────────────────────────────────────────
        this.smoke = this.config.smokeEnabled
            ? new MissileSmoke(scene, {
                  capacity:
                      this.config.maxMissiles *
                      Math.ceil(this.config.smokeRate * this.config.smokeLifetime),
                  color: this.config.smokeColor,
                  hotColor: this.config.exhaustColor,
                  lifetime: this.config.smokeLifetime,
                  size: this.config.smokeSize,
                  growth: this.config.smokeGrowth,
                  opacity: this.config.smokeOpacity,
              })
            : null;
    }

    /**
     * Placeholder missile model, nose along +Z, built at unit length and scaled to
     * `missileLength`: a cylinder body, a cone nose and four tail fins.
     */
    private buildMissileTemplate(): THREE.Object3D {
        const BODY_RADIUS = 0.05;

        // Body: tail at z = -0.5, shoulder at z = +0.3.
        const bodyGeo = new THREE.CylinderGeometry(BODY_RADIUS, BODY_RADIUS, 0.8, 12);
        bodyGeo.rotateX(Math.PI / 2); // cylinder axis Y -> Z
        bodyGeo.translate(0, 0, -0.1);

        // Nose: shoulder at z = +0.3, tip at z = +0.5.
        const noseGeo = new THREE.ConeGeometry(BODY_RADIUS, 0.2, 12);
        noseGeo.rotateX(Math.PI / 2); // tip +Y -> +Z
        noseGeo.translate(0, 0, 0.4);

        const group = new THREE.Group();
        group.add(new THREE.Mesh(bodyGeo, this.bodyMaterial));
        group.add(new THREE.Mesh(noseGeo, this.bodyMaterial));
        this.geometries.push(bodyGeo, noseGeo);

        // Fins: thin plates at the tail, 90° apart around the body.
        const FIN_SPAN = 0.1;
        for (let i = 0; i < 4; i++) {
            const finGeo = new THREE.BoxGeometry(0.012, FIN_SPAN, 0.16);
            finGeo.translate(0, BODY_RADIUS + FIN_SPAN / 2, -0.4);
            finGeo.rotateZ((i * Math.PI) / 2);
            group.add(new THREE.Mesh(finGeo, this.bodyMaterial));
            this.geometries.push(finGeo);
        }

        group.scale.setScalar(this.config.missileLength);
        return group;
    }

    /** Top speed over the ship's own — used by AI lead solvers (homing corrects the rest). */
    override get muzzleSpeed(): number {
        return this.config.speed;
    }

    /** Name shown on the flight HUD's weapon selector. */
    override get displayName(): string {
        return 'Missiles';
    }

    /**
     * Missiles in flight outlive a destroyed owner until they hit or expire, and their smoke
     * until it fades. Unlaunched salvo missiles don't count: they need the owner's muzzle and
     * are dropped with it.
     */
    override get hasLiveProjectiles(): boolean {
        return this.missiles.length > 0 || (this.smoke?.hasLive ?? false);
    }

    /**
     * Visit the world-space (float64) position of every missile in flight, for HUD trackers.
     * The vector passed to `cb` is the missile's live position — read it, don't keep or mutate it.
     */
    forEachMissilePosition(cb: (worldPos: THREE.Vector3) => void): void {
        for (let i = 0; i < this.missiles.length; i++) cb(this.missiles[i].position);
    }

    /**
     * Launch a salvo on the trigger's rising edge. Missile 1 leaves immediately; the rest
     * ripple out every `salvoInterval` seconds, splayed around the aim axis.
     * @param target Locked target captured for the whole salvo, or null to dumb-fire.
     */
    tryFire(
        _dt: number,
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        shipVelocity: THREE.Vector3,
        target: Body | null
    ): void {
        const wasActive = this.active;
        this.active = true;
        if (wasActive || this.overheated) return;

        this.addHeat(this.config.heatPerSalvo);

        const aim = direction.clone().normalize();
        this.launch(origin, aim, shipVelocity, target);

        // Missiles 2..N: splay evenly around the aim axis.
        const extra = this.config.salvoSize - 1;
        if (extra <= 0) return;
        perpendicularTo(aim, _perp);
        for (let i = 0; i < extra; i++) {
            _axis.copy(_perp).applyAxisAngle(aim, (i / extra) * Math.PI * 2);
            this.pending.push({
                delay: (i + 1) * this.config.salvoInterval,
                direction: aim.clone().applyAxisAngle(_axis, this.config.salvoSplay),
                target,
            });
        }
    }

    /** Release the trigger — re-arms the rising edge and lets the launcher cool. */
    stopFire(): void {
        this.active = false;
        super.stopFire();
    }

    /** Spawn one missile at `origin`, heading `direction` (unit), starting at the ship's forward speed. */
    private launch(
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        shipVelocity: THREE.Vector3,
        target: Body | null
    ): void {
        const object = this.freeObjects.pop();
        if (!object) return; // pool exhausted

        // Start at the ship's own forward speed so a fast-moving ship can't overrun its missile,
        // then accelerate from there (see distanceTravelled). A ship flying backwards relative
        // to the aim launches from rest.
        const launchSpeed = Math.max(0, shipVelocity.dot(direction));

        this.beginSound();
        object.visible = true;
        this.missiles.push({
            position: origin.clone(),
            direction: direction.clone().normalize(),
            launchSpeed,
            age: 0,
            target,
            timeRemaining: this.config.lifetime,
            object,
            smokeFrom: origin.clone(),
            smokeCredit: 0,
        });
    }

    /**
     * Launch pending salvo missiles, steer, advance and hit-test every missile, and
     * upload camera-relative transforms.
     *
     * @param wallDt   Wall-clock delta (s) — salvo ripple and thermal.
     * @param simDt    Physics advance this frame (s) — movement, guidance and lifetime, so
     *                 missiles stay in step with the ships they chase under any time scale.
     * @param isPaused Freezes all wall-clock decay so missiles hold position while paused.
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

            // ── Ripple-fire the rest of the salvo from the owner's current muzzle ──
            for (let i = this.pending.length - 1; i >= 0; i--) {
                const p = this.pending[i];
                p.delay -= wallDt;
                if (p.delay > 0) continue;
                this.pending.splice(i, 1);
                if (owner._isDisposed || !owner.mesh) continue;
                this.launch(
                    muzzleWorldPosition(owner, _muzzle),
                    p.direction,
                    owner.velocity,
                    p.target
                );
            }
        }

        for (let i = this.missiles.length - 1; i >= 0; i--) {
            const m = this.missiles[i];

            // Sim time, not wall time: range stays fixed (speed × lifetime) at any time scale,
            // so a slowed-down sim shows the whole flight. simDt is 0 while paused.
            m.timeRemaining -= simDt;
            if (m.timeRemaining <= 0) {
                this.freeMissile(i);
                continue;
            }

            // Exact distance covered this frame along the acceleration curve, so the missile
            // follows the same path at any time scale (a coarse frame can span the whole ramp).
            const step =
                this.distanceTravelled(m, m.age + simDt) - this.distanceTravelled(m, m.age);
            m.age += simDt;
            const topSpeed = m.launchSpeed + this.config.speed;

            // ── Guidance ──────────────────────────────────────────────────────
            // A lost target (destroyed / despawned) leaves the missile flying straight.
            const target = m.target;
            if (target && (target._isDisposed || !target.mesh)) m.target = null;
            if (m.target && step > 0) {
                const tPos = m.target.mesh.position;
                const dist = m.position.distanceTo(tPos);

                if (dist - m.target.hitRadius <= step) {
                    // Terminal: this frame's travel reaches the target — aim dead centre so the
                    // swept test below can't skim past it at tens of km per frame.
                    _desired.subVectors(tPos, m.position);
                } else {
                    // Lead the target by its motion over the remaining flight time. Estimated at
                    // top speed: it under-leads during the boost, and the turn rate absorbs that.
                    const t = dist / topSpeed;
                    _aimPoint.copy(tPos).addScaledVector(m.target.velocity, t);
                    _desired.subVectors(_aimPoint, m.position);
                }

                if (_desired.lengthSq() > 0) {
                    _desired.normalize();
                    const angle = Math.acos(
                        THREE.MathUtils.clamp(m.direction.dot(_desired), -1, 1)
                    );
                    const maxTurn = this.config.turnRate * simDt;
                    if (angle <= maxTurn || dist - m.target.hitRadius <= step) {
                        m.direction.copy(_desired);
                    } else {
                        _axis.crossVectors(m.direction, _desired);
                        if (_axis.lengthSq() < 1e-12) perpendicularTo(m.direction, _axis);
                        m.direction.applyAxisAngle(_axis.normalize(), maxTurn).normalize();
                    }
                }
            }

            // ── Swept ray-sphere hit test along this frame's travel segment ──
            if (step > 0) {
                const { t: hitT, body: hitBody } = raycastBodies(
                    m.position,
                    m.direction,
                    step,
                    bodies,
                    owner,
                    this.hit
                );

                if (hitBody) {
                    m.position.addScaledVector(m.direction, hitT);
                    this.emitSmoke(m, wallDt, true);
                    window.dispatchEvent(
                        new CustomEvent('weapon:hit', {
                            detail: {
                                body: hitBody,
                                position: m.position.clone(),
                                damage: this.config.damage,
                                effectiveness: this.effectiveness,
                            },
                        })
                    );
                    this.freeMissile(i);
                    continue;
                }

                m.position.addScaledVector(m.direction, step);
                this.emitSmoke(m, wallDt, false);
            }
        }

        this.smoke?.update(wallDt, cameraPosition, isPaused);

        // ── Camera-relative render ────────────────────────────────────────────
        const count = this.missiles.length;
        const cpx = cameraPosition.x;
        const cpy = cameraPosition.y;
        const cpz = cameraPosition.z;
        const tailOffset = this.config.missileLength * 0.5;

        for (let i = 0; i < count; i++) {
            const m = this.missiles[i];
            m.object.position.set(m.position.x - cpx, m.position.y - cpy, m.position.z - cpz);
            m.object.quaternion.setFromUnitVectors(_FORWARD, m.direction);

            this.exhaustPositions[i * 3] = m.position.x - m.direction.x * tailOffset - cpx;
            this.exhaustPositions[i * 3 + 1] = m.position.y - m.direction.y * tailOffset - cpy;
            this.exhaustPositions[i * 3 + 2] = m.position.z - m.direction.z * tailOffset - cpz;
        }
        this.exhaustGeometry.attributes.position.needsUpdate = true;
        this.exhaustGeometry.setDrawRange(0, count);

        this.missileRoot.position.copy(cameraPosition);
        this.missileRoot.visible = count > 0;
        this.exhaustPoints.position.copy(cameraPosition);
        this.exhaustPoints.visible = count > 0;
    }

    /**
     * Distance `m` has covered `age` sim-seconds after launch. Speed follows
     *   v(age) = launchSpeed + speed · smoothstep(age / accelTime)
     * whose integral over the ramp is accelTime · (u³ − u⁴/2) with u = age / accelTime,
     * reaching accelTime / 2 at the end of the ramp; top speed holds from there.
     */
    private distanceTravelled(m: Missile, age: number): number {
        const T = this.config.accelTime;
        let boost: number;
        if (T <= 0) {
            boost = age;
        } else if (age >= T) {
            boost = T * 0.5 + (age - T);
        } else {
            const u = age / T;
            boost = T * (u * u * u - (u * u * u * u) / 2);
        }
        return m.launchSpeed * age + this.config.speed * boost;
    }

    /**
     * Lay smoke along the path `m` covered since its last emission. Puffs are owed at
     * `smokeRate` per wall-second; a frame owing less than one carries the path over to the
     * next. `force` emits at least one puff so the trail reaches an impact point.
     */
    private emitSmoke(m: Missile, wallDt: number, force: boolean): void {
        if (!this.smoke) return;
        m.smokeCredit += this.config.smokeRate * wallDt;
        const whole = Math.floor(m.smokeCredit);
        m.smokeCredit -= whole;
        const n = Math.min(Math.max(whole, force ? 1 : 0), MAX_SMOKE_PER_FRAME);
        if (n < 1) return;
        this.smoke.emit(m.smokeFrom, m.position, n, wallDt);
        m.smokeFrom.copy(m.position);
    }

    /** Remove missile `index` and return its mesh to the pool. */
    private freeMissile(index: number): void {
        const m = this.missiles[index];
        m.object.visible = false;
        this.freeObjects.push(m.object);
        this.missiles.splice(index, 1);
    }

    /** Clear all missiles, pending launches and thermal state. Not called automatically on flight exit. */
    reset(): void {
        for (let i = this.missiles.length - 1; i >= 0; i--) this.freeMissile(i);
        this.pending = [];
        this.active = false;
        this.exhaustGeometry.setDrawRange(0, 0);
        this.exhaustPoints.visible = false;
        this.missileRoot.visible = false;
        this.smoke?.reset();
        super.reset();
    }

    dispose(): void {
        super.dispose();
        this.scene.remove(this.missileRoot);
        this.scene.remove(this.exhaustPoints);
        for (const geo of this.geometries) geo.dispose();
        this.bodyMaterial.dispose();
        this.exhaustGeometry.dispose();
        this.exhaustMaterial.dispose();
        this.smoke?.dispose();
        this.missiles = [];
        this.pending = [];
        this.freeObjects = [];
    }
}
