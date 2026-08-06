import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Body } from '../../bodies/body';
import { playWeaponFire } from '../../utilities/audio.js';
import { C, SPACESHIP_RADIUS } from '../../utilities/consts.js';
import { Weapon } from './weapon';

/**
 * Per-instance tuning for LaserWeapon.  Ships may pass a partial config to
 * override the class defaults; any omitted field keeps the class default.
 */
export interface ILaserWeaponConfig {
    /** Maximum beam reach in world units. */
    maxRange: number;
    /** Beam colour (outer glow). */
    beamColor: number;
    /** Screen-pixel width of the white-hot core line. */
    coreWidth: number;
    /** Screen-pixel width of the coloured halo line. */
    haloWidth: number;
    /** HP damage dealt per damage tick while the beam touches a body. */
    damage: number;
    /** Minimum seconds between damage ticks on the same body. */
    damageInterval: number;
    /** Called when the beam is first activated. Defaults to playWeaponFire(). */
    fireSound?: () => void;
}

/** Class-level defaults — a ship wanting different behaviour passes a partial ILaserWeaponConfig. */
const DEFAULT_LASER_CONFIG: ILaserWeaponConfig = {
    maxRange: C * 1.0,
    beamColor: 0xff2244,
    coreWidth: 2,
    haloWidth: 8,
    damage: 1000,
    damageInterval: 0.2,
    fireSound: playWeaponFire,
};


/**
 * Continuous laser weapon.  While the trigger is held, `tryFire` refreshes the
 * beam origin/direction every frame; `stopFire` cuts the beam.
 *
 * Rendered as two camera-relative `Line2` objects (thick screen-pixel-width
 * lines): a narrow white core + a wider coloured halo.  Camera-relative
 * positioning avoids float32 precision collapse at interplanetary distances.
 */
export class LaserWeapon extends Weapon {
    private readonly config: ILaserWeaponConfig;

    /** True while the trigger is held (beam active). */
    private active = false;
    /** True if the beam was active on the previous update (edge detection). */
    private prevBeamVisible = false;
    /** World-space muzzle position captured at the last tryFire() (pre-physics). */
    private origin = new THREE.Vector3();
    /**
     * Current-frame world-space muzzle position (origin shifted by
     * shipVelocity * simDt so the beam stays glued to the nose after the
     * physics step moves the ship).
     */
    private curOrigin = new THREE.Vector3();
    /** Normalised world-space aim direction for the current frame. */
    private direction = new THREE.Vector3(0, 0, 1);
    /** Ship velocity — the beam trail drifts with the ship (Galilean feel). */
    private shipVelocity = new THREE.Vector3();
    /** Seconds until the next permitted damage tick. */
    private hitCooldown = 0;
    /** World-space beam tip (impact point or max-range end). */
    private tip = new THREE.Vector3();
    // ── Rendering ────────────────────────────────────────────────────────────
    private readonly coreLineGeo: LineGeometry;
    private readonly coreLineMat: LineMaterial;
    private readonly coreBeamLine: Line2;
    private readonly haloLineGeo: LineGeometry;
    private readonly haloLineMat: LineMaterial;
    private readonly haloBeamLine: Line2;

    // Glow points at the muzzle and the beam tip.
    private muzzlePositions = new Float32Array(3).fill(0);
    private muzzleGeometry: THREE.BufferGeometry;
    private muzzleMaterial: THREE.PointsMaterial;
    private muzzlePoint: THREE.Points;

    private tipPositions = new Float32Array(3).fill(0);
    private tipGeometry: THREE.BufferGeometry;
    private tipMaterial: THREE.PointsMaterial;
    private tipPoint: THREE.Points;

    constructor(scene: THREE.Scene, config: Partial<ILaserWeaponConfig> = {}) {
        super(scene);
        this.config = { ...DEFAULT_LASER_CONFIG, ...config };

        // ── Core beam: narrow white-hot Line2 ─────────────────────────────
        this.coreLineGeo = new LineGeometry();
        this.coreLineGeo.setPositions([0, 0, 0, 0, 0, 1]);
        this.coreLineMat = new LineMaterial({
            color: 0xffffff,
            linewidth: this.config.coreWidth,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.coreLineMat.resolution.set(window.innerWidth, window.innerHeight);
        this.coreBeamLine = new Line2(this.coreLineGeo, this.coreLineMat);
        this.coreBeamLine.frustumCulled = false;
        this.coreBeamLine.renderOrder = 2;
        this.coreBeamLine.visible = false;
        scene.add(this.coreBeamLine);

        // ── Halo beam: wide coloured glow around the core ──────────────────
        this.haloLineGeo = new LineGeometry();
        this.haloLineGeo.setPositions([0, 0, 0, 0, 0, 1]);
        this.haloLineMat = new LineMaterial({
            color: this.config.beamColor,
            linewidth: this.config.haloWidth,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.haloLineMat.resolution.set(window.innerWidth, window.innerHeight);
        this.haloBeamLine = new Line2(this.haloLineGeo, this.haloLineMat);
        this.haloBeamLine.frustumCulled = false;
        this.haloBeamLine.renderOrder = 2;
        this.haloBeamLine.visible = false;
        scene.add(this.haloBeamLine);

        // ── Muzzle glow point (beam seems to emerge from the hull) ────────
        this.muzzleGeometry = new THREE.BufferGeometry();
        this.muzzleGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.muzzlePositions, 3)
        );
        this.muzzleGeometry.setDrawRange(0, 0);
        this.muzzleMaterial = this.createGlowPointMaterial(SPACESHIP_RADIUS * 1100, 0.95);
        this.muzzlePoint = new THREE.Points(this.muzzleGeometry, this.muzzleMaterial);
        this.muzzlePoint.frustumCulled = false;
        this.muzzlePoint.renderOrder = 2;
        this.muzzlePoint.visible = false;
        scene.add(this.muzzlePoint);

        // ── Tip glow point (impact flash at the far end of the beam) ──────
        this.tipGeometry = new THREE.BufferGeometry();
        this.tipGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.tipPositions, 3)
        );
        this.tipGeometry.setDrawRange(0, 0);
        this.tipMaterial = this.createGlowPointMaterial(SPACESHIP_RADIUS * 1800, 0.9);
        this.tipPoint = new THREE.Points(this.tipGeometry, this.tipMaterial);
        this.tipPoint.frustumCulled = false;
        this.tipPoint.renderOrder = 2;
        this.tipPoint.visible = false;
        scene.add(this.tipPoint);
    }

    /** Build a round, soft-edged glow sprite that falls off radially. */
    private createGlowPointMaterial(size: number, opacity: number): THREE.PointsMaterial {
        const material = new THREE.PointsMaterial({
            color: this.config.beamColor,
            size,
            sizeAttenuation: true,
            transparent: true,
            opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        material.onBeforeCompile = (shader) => {
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
        return material;
    }

    // ── Firing ───────────────────────────────────────────────────────────────

    /**
     * Refresh the beam aim while the trigger is held.  Plays the fire sound on
     * the rising edge only.
     */
    tryFire(
        _dt: number,
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        shipVelocity: THREE.Vector3
    ): void {
        const wasActive = this.active;
        this.active = true;
        this.origin.copy(origin);
        this.direction.copy(direction).normalize();
        this.shipVelocity.copy(shipVelocity);

        if (!wasActive) {
            (this.config.fireSound ?? playWeaponFire)();
        }
    }

    /** Release the trigger — cuts the beam. */
    stopFire(): void {
        this.active = false;
    }

    /**
     * Advance the beam: cast a ray-sphere hit test, position the beam tip,
     * and dispatch throttled 'weapon:hit' events.  Renders camera-relative.
     */
    update(
        wallDt: number,
        simDt: number,
        bodies: Body[],
        cameraPosition: THREE.Vector3,
        excludeBody?: Body
    ): void {
        this.hitCooldown -= wallDt;

        if (!this.active) {
            // Hide the beam immediately when the trigger is released.
            if (this.prevBeamVisible) {
                this.setBeamVisible(false);
                this.prevBeamVisible = false;
            }
            return;
        }

        // The captured origin is pre-physics.  Physics moves the ship (and its
        // muzzle) by shipVelocity * simDt before this update runs, so shift the
        // origin forward by the same amount — this keeps the beam rooted on the
        // nose while the ship is moving.
        this.curOrigin
            .copy(this.origin)
            .addScaledVector(this.shipVelocity, simDt);

        // ── Ray-sphere hit test along the beam ───────────────────────────
        const maxT = this.config.maxRange;
        let hitT = maxT;
        let hitBody: Body | null = null;

        for (const body of bodies) {
            if (body === excludeBody) continue;
            if (!body.mesh || body._isDisposed) continue;

            const ocX = body.mesh.position.x - this.curOrigin.x;
            const ocY = body.mesh.position.y - this.curOrigin.y;
            const ocZ = body.mesh.position.z - this.curOrigin.z;
            const tca = ocX * this.direction.x + ocY * this.direction.y + ocZ * this.direction.z;
            if (tca < 0 || tca > hitT) continue;

            const d2 = ocX * ocX + ocY * ocY + ocZ * ocZ - tca * tca;
            const r = body.radius;
            if (d2 <= r * r) {
                const tHit = tca - Math.sqrt(r * r - d2);
                if (tHit >= 0 && tHit < hitT) {
                    hitT = tHit;
                    hitBody = body;
                }
            }
        }

        // ── Beam tip in world space (drifts with the ship between frames) ──
        this.tip
            .copy(this.curOrigin)
            .addScaledVector(this.direction, hitT);

        if (hitBody && this.hitCooldown <= 0) {
            this.hitCooldown = this.config.damageInterval;
            window.dispatchEvent(
                new CustomEvent('weapon:hit', {
                    detail: {
                        body: hitBody,
                        position: this.tip.clone(),
                        damage: this.config.damage,
                    },
                })
            );
        }

        // ── Beam lines (camera-relative Line2 — avoids float32 collapse at scale) ────
        const cpx = cameraPosition.x;
        const cpy = cameraPosition.y;
        const cpz = cameraPosition.z;
        const mRelX = this.curOrigin.x - cpx;
        const mRelY = this.curOrigin.y - cpy;
        const mRelZ = this.curOrigin.z - cpz;
        const tRelX = this.tip.x - cpx;
        const tRelY = this.tip.y - cpy;
        const tRelZ = this.tip.z - cpz;
        this.coreLineGeo.setPositions([mRelX, mRelY, mRelZ, tRelX, tRelY, tRelZ]);
        this.haloLineGeo.setPositions([mRelX, mRelY, mRelZ, tRelX, tRelY, tRelZ]);
        this.coreBeamLine.position.set(cpx, cpy, cpz);
        this.haloBeamLine.position.set(cpx, cpy, cpz);
        this.coreLineMat.resolution.set(window.innerWidth, window.innerHeight);
        this.haloLineMat.resolution.set(window.innerWidth, window.innerHeight);

        // ── Muzzle glow point ──────────────────────────────────────────────────────────────────
        this.muzzlePositions[0] = this.curOrigin.x - cpx;
        this.muzzlePositions[1] = this.curOrigin.y - cpy;
        this.muzzlePositions[2] = this.curOrigin.z - cpz;
        this.muzzleGeometry.attributes.position.needsUpdate = true;
        this.muzzleGeometry.setDrawRange(0, 1);
        this.muzzlePoint.position.set(cpx, cpy, cpz);

        // ── Tip glow point ────────────────────────────────────────────────
        this.tipPositions[0] = this.tip.x - cpx;
        this.tipPositions[1] = this.tip.y - cpy;
        this.tipPositions[2] = this.tip.z - cpz;
        this.tipGeometry.attributes.position.needsUpdate = true;
        this.tipGeometry.setDrawRange(0, 1);
        this.tipPoint.position.set(cpx, cpy, cpz);

        if (!this.prevBeamVisible) {
            this.setBeamVisible(true);
            this.prevBeamVisible = true;
        }
    }

    private setBeamVisible(visible: boolean): void {
        this.coreBeamLine.visible = visible;
        this.haloBeamLine.visible = visible;
        this.muzzlePoint.visible = visible;
        this.tipPoint.visible = visible;
    }

    /** Cut the beam and reset timers (called on flight exit). */
    reset(): void {
        this.active = false;
        this.prevBeamVisible = false;
        this.hitCooldown = 0;
        this.setBeamVisible(false);
    }

    dispose(): void {
        this.scene.remove(this.coreBeamLine);
        this.scene.remove(this.haloBeamLine);
        this.scene.remove(this.muzzlePoint);
        this.scene.remove(this.tipPoint);
        this.coreLineGeo.dispose();
        this.coreLineMat.dispose();
        this.haloLineGeo.dispose();
        this.haloLineMat.dispose();
        this.muzzleGeometry.dispose();
        this.muzzleMaterial.dispose();
        this.tipGeometry.dispose();
        this.tipMaterial.dispose();
    }
}
