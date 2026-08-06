import * as THREE from 'three';
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
    /** World-space half-width of the beam glow. */
    beamWidth: number;
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
    beamWidth: SPACESHIP_RADIUS * 8,
    damage: 1000,
    damageInterval: 0.2,
    fireSound: playWeaponFire,
};

/**
 * Continuous laser weapon.  While the trigger is held, `tryFire` refreshes the
 * beam origin/direction every frame; `stopFire` cuts the beam.  The beam is
 * rendered camera-relative (origin clamped to the muzzle) and ray-sphere tests
 * against bodies each frame, dispatching `'weapon:hit'` on a throttled tick so
 * the existing impact-sound / shockwave / damage pipeline is reused.
 */
export class LaserWeapon extends Weapon {
    private readonly config: ILaserWeaponConfig;

    /** True while the trigger is held (beam active). */
    private active = false;
    /** True if the beam was active on the previous update (edge detection). */
    private prevBeamVisible = false;
    /** World-space muzzle position for the current frame. */
    private origin = new THREE.Vector3();
    /** Normalised world-space aim direction for the current frame. */
    private direction = new THREE.Vector3(0, 0, 1);
    /** Ship velocity — the beam trail drifts with the ship (Galilean feel). */
    private shipVelocity = new THREE.Vector3();
    /** Seconds until the next permitted damage tick. */
    private hitCooldown = 0;
    /** World-space beam tip (impact point or max-range end). */
    private tip = new THREE.Vector3();

    // ── Rendering (all positioned at the camera; vertices are camera-relative) ──
    private corePositions: Float32Array; // 2 vertices [muzzle, tip]
    private coreGeometry: THREE.BufferGeometry;
    private coreMaterial: THREE.LineBasicMaterial;
    private coreLine: THREE.Line;

    private glowPositions: Float32Array; // 4 vertices: two offset lines [±width]
    private glowGeometry: THREE.BufferGeometry;
    private glowMaterial: THREE.LineBasicMaterial;
    private glowLines: THREE.LineSegments;

    private tipPositions: Float32Array; // 1 point at beam tip
    private tipGeometry: THREE.BufferGeometry;
    private tipMaterial: THREE.PointsMaterial;
    private tipPoint: THREE.Points;

    constructor(scene: THREE.Scene, config: Partial<ILaserWeaponConfig> = {}) {
        super(scene);
        this.config = { ...DEFAULT_LASER_CONFIG, ...config };

        // ── Core line (bright centre of the beam) ───────────────────────────
        this.corePositions = new Float32Array(6).fill(0);
        this.coreGeometry = new THREE.BufferGeometry();
        this.coreGeometry.setAttribute('position', new THREE.BufferAttribute(this.corePositions, 3));
        this.coreGeometry.setDrawRange(0, 0);
        this.coreMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.coreLine = new THREE.Line(this.coreGeometry, this.coreMaterial);
        this.coreLine.frustumCulled = false;
        this.coreLine.renderOrder = 2;
        this.coreLine.visible = false;
        scene.add(this.coreLine);

        // ── Glow lines (two offset lines giving the beam apparent width) ────
        this.glowPositions = new Float32Array(12).fill(0); // 2 lines × 2 vertices × 3
        this.glowGeometry = new THREE.BufferGeometry();
        this.glowGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.glowPositions, 3)
        );
        this.glowGeometry.setDrawRange(0, 0);
        this.glowMaterial = new THREE.LineBasicMaterial({
            color: this.config.beamColor,
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.glowLines = new THREE.LineSegments(this.glowGeometry, this.glowMaterial);
        this.glowLines.frustumCulled = false;
        this.glowLines.renderOrder = 2;
        this.glowLines.visible = false;
        scene.add(this.glowLines);

        // ── Tip glow point ──────────────────────────────────────────────────
        this.tipPositions = new Float32Array(3).fill(0);
        this.tipGeometry = new THREE.BufferGeometry();
        this.tipGeometry.setAttribute('position', new THREE.BufferAttribute(this.tipPositions, 3));
        this.tipGeometry.setDrawRange(0, 0);
        this.tipMaterial = new THREE.PointsMaterial({
            color: this.config.beamColor,
            size: SPACESHIP_RADIUS * 1800,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.tipMaterial.onBeforeCompile = (shader) => {
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
        this.tipPoint = new THREE.Points(this.tipGeometry, this.tipMaterial);
        this.tipPoint.frustumCulled = false;
        this.tipPoint.renderOrder = 2;
        this.tipPoint.visible = false;
        scene.add(this.tipPoint);
    }

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
        _simDt: number,
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

        // ── Ray-sphere hit test along the beam ───────────────────────────
        const maxT = this.config.maxRange;
        let hitT = maxT;
        let hitBody: Body | null = null;

        for (const body of bodies) {
            if (body === excludeBody) continue;
            if (!body.mesh || body._isDisposed) continue;

            const ocX = body.mesh.position.x - this.origin.x;
            const ocY = body.mesh.position.y - this.origin.y;
            const ocZ = body.mesh.position.z - this.origin.z;
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
            .copy(this.origin)
            .addScaledVector(this.direction, hitT)
            .addScaledVector(this.shipVelocity, _simDt);

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

        // ── Camera-relative GPU upload ────────────────────────────────────
        const cpx = cameraPosition.x;
        const cpy = cameraPosition.y;
        const cpz = cameraPosition.z;

        // Muzzle (relative to camera)
        this.corePositions[0] = this.origin.x - cpx;
        this.corePositions[1] = this.origin.y - cpy;
        this.corePositions[2] = this.origin.z - cpz;
        // Tip (relative to camera)
        this.corePositions[3] = this.tip.x - cpx;
        this.corePositions[4] = this.tip.y - cpy;
        this.corePositions[5] = this.tip.z - cpz;
        this.coreGeometry.attributes.position.needsUpdate = true;
        this.coreGeometry.setDrawRange(0, 2);

        // Glow lines: offset the beam along a screen-perpendicular axis so the
        // beam has apparent width in world units at any camera angle.
        const camDir = new THREE.Vector3().subVectors(this.origin, cameraPosition);
        const offsetAxis = new THREE.Vector3().crossVectors(this.direction, camDir);
        const axisLen = offsetAxis.length();
        if (axisLen < 1e-10) {
            offsetAxis.set(0, 1, 0).cross(this.direction);
        } else {
            offsetAxis.divideScalar(axisLen);
        }
        const w = this.config.beamWidth;

        const ox = offsetAxis.x * w;
        const oy = offsetAxis.y * w;
        const oz = offsetAxis.z * w;

        const m0x = this.origin.x - cpx;
        const m0y = this.origin.y - cpy;
        const m0z = this.origin.z - cpz;
        const t0x = this.tip.x - cpx;
        const t0y = this.tip.y - cpy;
        const t0z = this.tip.z - cpz;

        // Line 1: muzzle−offset → tip−offset
        this.glowPositions[0] = m0x + ox;
        this.glowPositions[1] = m0y + oy;
        this.glowPositions[2] = m0z + oz;
        this.glowPositions[3] = t0x + ox;
        this.glowPositions[4] = t0y + oy;
        this.glowPositions[5] = t0z + oz;
        // Line 2: muzzle+offset → tip+offset
        this.glowPositions[6] = m0x - ox;
        this.glowPositions[7] = m0y - oy;
        this.glowPositions[8] = m0z - oz;
        this.glowPositions[9] = t0x - ox;
        this.glowPositions[10] = t0y - oy;
        this.glowPositions[11] = t0z - oz;
        this.glowGeometry.attributes.position.needsUpdate = true;
        this.glowGeometry.setDrawRange(0, 4);

        // Tip glow point
        this.tipPositions[0] = t0x;
        this.tipPositions[1] = t0y;
        this.tipPositions[2] = t0z;
        this.tipGeometry.attributes.position.needsUpdate = true;
        this.tipGeometry.setDrawRange(0, 1);

        // Place all objects at the camera so the relative positions render correctly.
        this.coreLine.position.copy(cameraPosition);
        this.glowLines.position.copy(cameraPosition);
        this.tipPoint.position.copy(cameraPosition);

        if (!this.prevBeamVisible) {
            this.setBeamVisible(true);
            this.prevBeamVisible = true;
        }
    }

    private setBeamVisible(visible: boolean): void {
        this.coreLine.visible = visible;
        this.glowLines.visible = visible;
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
        this.scene.remove(this.coreLine);
        this.scene.remove(this.glowLines);
        this.scene.remove(this.tipPoint);
        this.coreGeometry.dispose();
        this.coreMaterial.dispose();
        this.glowGeometry.dispose();
        this.glowMaterial.dispose();
        this.tipGeometry.dispose();
        this.tipMaterial.dispose();
    }
}
