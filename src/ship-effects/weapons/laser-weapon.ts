import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { SoundEffect, playLoopSoundEffectAt } from '../../utilities/audio.js';
import { C, DIST_SCALE } from '../../utilities/consts.js';
import {
    BeamLineMaterial,
    DEFAULT_BEAM_LINE_CLAMPS,
    IBeamLineWidthConfig,
} from './beam-line-material';
import { BeamWeaponBase, IBeamWeaponConfig } from './beam-weapon-base';

const LASER_FLICKER_FREQ_A = 9.1; // rad/s — incommensurate with B for non-repeating shimmer
const LASER_FLICKER_FREQ_B = 17.3;
const LASER_FLICKER_OPACITY_AMP = 0.2; // ±20 % brightness swing
const LASER_FLICKER_WIDTH_AMP = 0.15; // ±15 % linewidth swing
const LASER_OPTIMAL_RANGE_KM = 30_000;

/**
 * Per-instance tuning for LaserWeapon.  Ships may pass a partial config to
 * override the class defaults; any omitted field keeps the class default.
 *
 * The reach/damage/heat half of this is {@link IBeamWeaponConfig} — shared with every other
 * continuous beam. Only the straight-line look (two world-width lines, see
 * {@link IBeamLineWidthConfig}) is the laser's own.
 */
export interface ILaserWeaponConfig extends IBeamWeaponConfig, IBeamLineWidthConfig {}

/**
 * Continuous laser weapon.  While the trigger is held, `tryFire` refreshes the
 * beam origin/direction every frame; `stopFire` cuts the beam.
 *
 * Rendered as two camera-relative `Line2` objects (thick screen-pixel-width
 * lines): a narrow white-hot core + a wider coloured halo.  Camera-relative
 * positioning avoids float32 precision collapse at interplanetary distances.
 *
 * Everything except the geometry — the hit test, damage ticks, heat build-up,
 * the loop sound and the pause rules — is {@link BeamWeaponBase}'s.
 */
export class LaserWeapon extends BeamWeaponBase {
    private readonly config: ILaserWeaponConfig;

    /** Accumulates simDt while beam is active; drives dual-sine brightness/width shimmer. */
    private _flickerTime = 0;

    // ── Rendering ────────────────────────────────────────────────────────────
    private readonly coreLineGeo: LineGeometry;
    private readonly coreLineMat: BeamLineMaterial;
    private readonly coreBeamLine: Line2;
    private readonly haloLineGeo: LineGeometry;
    private readonly haloLineMat: BeamLineMaterial;
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

    constructor(scene: THREE.Scene, shipRadius: number, config: Partial<ILaserWeaponConfig> = {}) {
        /** Class-level defaults — a ship wanting different behaviour passes a partial ILaserWeaponConfig. */
        const DEFAULT_LASER_CONFIG: ILaserWeaponConfig = {
            maxRange: C,
            beamColor: 0xff2244,
            coreWidth: 0.002 / DIST_SCALE,
            haloWidth: 0.008 / DIST_SCALE,
            ...DEFAULT_BEAM_LINE_CLAMPS,
            damage: 1,
            optimalRange: LASER_OPTIMAL_RANGE_KM / DIST_SCALE,
            shieldEffectiveness: 1.0,
            hullEffectiveness: 0.1,
            damageInterval: 0.2,
            heatPerSecond: 0.25,
            coolPerSecond: 0.75,
            loopSound: (position) => playLoopSoundEffectAt(SoundEffect.LaserBeam, position),
        };

        const merged: ILaserWeaponConfig = { ...DEFAULT_LASER_CONFIG, ...config };
        super(scene, merged);
        this.config = merged;

        this.weaponSound = {
            loop:
                this.config.loopSound ??
                ((position) => playLoopSoundEffectAt(SoundEffect.LaserBeam, position)),
        };

        // ── Core beam: narrow white-hot Line2 ─────────────────────────────
        this.coreLineGeo = new LineGeometry();
        this.coreLineGeo.setPositions([0, 0, 0, 0, 0, 1]);
        this.coreLineMat = new BeamLineMaterial({
            color: 0xffffff,
            worldWidth: this.config.coreWidth,
            minPixels: this.config.minCoreWidthPx,
            maxPixels: this.config.maxWidthPx,
            minFade: this.config.minFade,
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
        this.haloLineMat = new BeamLineMaterial({
            color: this.config.beamColor,
            worldWidth: this.config.haloWidth,
            minPixels: this.config.minHaloWidthPx,
            maxPixels: this.config.maxWidthPx,
            minFade: this.config.minFade,
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
        this.muzzleMaterial = this.createGlowPointMaterial(shipRadius * 4, 0.95);
        this.muzzlePoint = new THREE.Points(this.muzzleGeometry, this.muzzleMaterial);
        this.muzzlePoint.frustumCulled = false;
        this.muzzlePoint.renderOrder = 2;
        this.muzzlePoint.visible = false;
        scene.add(this.muzzlePoint);

        // ── Tip glow point (impact flash at the far end of the beam) ──────
        this.tipGeometry = new THREE.BufferGeometry();
        this.tipGeometry.setAttribute('position', new THREE.BufferAttribute(this.tipPositions, 3));
        this.tipGeometry.setDrawRange(0, 0);
        this.tipMaterial = this.createGlowPointMaterial(shipRadius * 2, 0.9);
        this.tipPoint = new THREE.Points(this.tipGeometry, this.tipMaterial);
        this.tipPoint.frustumCulled = false;
        this.tipPoint.renderOrder = 2;
        this.tipPoint.visible = false;
        scene.add(this.tipPoint);
    }

    /** Name shown on the flight HUD's weapon selector. */
    override get displayName(): string {
        return 'Laser';
    }

    /** Light: the leading edge crosses its whole range in a fraction of a sim-second. */
    protected override get propagationSpeed(): number {
        return C;
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

    /** Advance the dual-sine shimmer that makes the beam breathe. */
    protected override onBeamTick(simDt: number): void {
        this._flickerTime += simDt;
    }

    /**
     * Draw the beam as a white-hot core inside a coloured halo, both camera-relative so the
     * float32 precision of the vertex positions is as good at 1 AU as it is at 1 km.
     */
    protected override renderBeam(
        origin: THREE.Vector3,
        _direction: THREE.Vector3,
        length: number,
        cameraPosition: THREE.Vector3
    ): void {
        const _shimmer =
            Math.sin(this._flickerTime * LASER_FLICKER_FREQ_A) * 0.6 +
            Math.sin(this._flickerTime * LASER_FLICKER_FREQ_B) * 0.4;
        const _opacityMult = 1 + _shimmer * LASER_FLICKER_OPACITY_AMP;
        const _widthMult = 1 + _shimmer * LASER_FLICKER_WIDTH_AMP;

        // ── Beam lines (camera-relative Line2 — avoids float32 collapse at scale) ────
        const cpx = cameraPosition.x;
        const cpy = cameraPosition.y;
        const cpz = cameraPosition.z;
        const mRelX = origin.x - cpx;
        const mRelY = origin.y - cpy;
        const mRelZ = origin.z - cpz;
        const tRelX = origin.x + this.direction.x * length - cpx;
        const tRelY = origin.y + this.direction.y * length - cpy;
        const tRelZ = origin.z + this.direction.z * length - cpz;
        this.coreLineGeo.setPositions([mRelX, mRelY, mRelZ, tRelX, tRelY, tRelZ]);
        this.haloLineGeo.setPositions([mRelX, mRelY, mRelZ, tRelX, tRelY, tRelZ]);
        this.coreBeamLine.position.set(cpx, cpy, cpz);
        this.haloBeamLine.position.set(cpx, cpy, cpz);
        this.coreLineMat.resolution.set(window.innerWidth, window.innerHeight);
        this.haloLineMat.resolution.set(window.innerWidth, window.innerHeight);
        this.coreLineMat.opacity = Math.max(0, Math.min(1, _opacityMult));
        this.haloLineMat.opacity = Math.max(0, Math.min(1, _opacityMult));
        this.coreLineMat.worldWidth = this.config.coreWidth * Math.max(0.1, _widthMult);
        this.haloLineMat.worldWidth = this.config.haloWidth * Math.max(0.1, _widthMult);
        this.muzzleMaterial.opacity = Math.max(0, 0.95 * _opacityMult);
        this.tipMaterial.opacity = Math.max(0, 0.9 * _opacityMult);

        // ── Muzzle glow point ──────────────────────────────────────────────
        this.muzzlePositions[0] = mRelX;
        this.muzzlePositions[1] = mRelY;
        this.muzzlePositions[2] = mRelZ;
        this.muzzleGeometry.attributes.position.needsUpdate = true;
        this.muzzleGeometry.setDrawRange(0, 1);
        this.muzzlePoint.position.set(cpx, cpy, cpz);

        // ── Tip glow point ────────────────────────────────────────────────
        this.tipPositions[0] = tRelX;
        this.tipPositions[1] = tRelY;
        this.tipPositions[2] = tRelZ;
        this.tipGeometry.attributes.position.needsUpdate = true;
        this.tipGeometry.setDrawRange(0, 1);
        this.tipPoint.position.set(cpx, cpy, cpz);
    }

    protected override setBeamVisible(visible: boolean): void {
        this.coreBeamLine.visible = visible;
        this.haloBeamLine.visible = visible;
        this.muzzlePoint.visible = visible;
        this.tipPoint.visible = visible;
    }

    /** Cut the beam, stop the loop sound, and reset timers. Not called automatically on flight exit. */
    override reset(): void {
        this._flickerTime = 0;
        super.reset();
    }

    override dispose(): void {
        super.dispose();
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
