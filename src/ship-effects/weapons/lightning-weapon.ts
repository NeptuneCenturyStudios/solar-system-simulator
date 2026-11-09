import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { Body } from '../../bodies/body';
import { SoundEffect, playLoopSoundEffectAt } from '../../utilities/audio.js';
import { C, DIST_SCALE } from '../../utilities/consts.js';
import { BeamWeaponBase, IBeamWeaponConfig } from './beam-weapon-base';
import { LIGHTNING_SEGMENTS, LightningShape } from './lightning-path';

/**
 * An alien energy arc: a straight, hitscan beam like the laser, drawn instead as a procedural
 * bolt of lightning that zig-zags in three dimensions around its own axis, with a different
 * shape on every shot.
 *
 * The bolt grows out of the muzzle rather than appearing at full length, at
 * {@link ILightningWeaponConfig.propagationSpeed} — by default a small fraction of light speed.
 * That is still far too fast to see across a dogfight at 1×; the point is that at the slowest
 * time scale (1/128) a 10 km shot takes about a wall-clock second to reach out, so the arc can
 * actually be watched growing.
 *
 * Damage never follows the zig-zag. The hitscan runs along the straight axis between muzzle and
 * tip exactly as the laser's does, so where the bolt is *drawn* and where it *hits* can never
 * disagree in a way the player has to think about.
 */

/** Runs of light speed the bolt's leading edge covers per sim-second. */
const LIGHTNING_PROPAGATION_DIVISOR = 250;

/** Sim-seconds the bolt takes to reach its full range. Sets `maxRange`, see below. */
const LIGHTNING_MAX_FLIGHT_TIME = 3;

/**
 * Peak sideways displacement, as a fraction of the bolt's current drawn length. This is the width
 * knob and it means what it says: 0.02 puts the bolt's wandering edge at most 2 % of its length
 * off the axis. Lower is tighter — 0.01 reads as a taut arc, 0.04 as a loose scribble.
 */
const LIGHTNING_WOBBLE_FRACTION = 0.02;

/**
 * Hard ceiling on the sideways displacement (5 km), so a bolt reaching its full multi-thousand-km
 * range stays a bolt rather than a scribble. This is a sanity cap; the fraction above is the
 * control that matters at combat ranges.
 */
const LIGHTNING_WOBBLE_MAX = 5 / DIST_SCALE;

/** Shape re-rolls per sim-second while the trigger is held. */
const LIGHTNING_CRACKLE_HZ = 20;

const LIGHTNING_FLICKER_FREQ_A = 11.3; // rad/s — incommensurate with B for non-repeating shimmer
const LIGHTNING_FLICKER_FREQ_B = 23.7;
const LIGHTNING_FLICKER_OPACITY_AMP = 0.22;
const LIGHTNING_FLICKER_WIDTH_AMP = 0.18;
const LIGHTNING_OPTIMAL_RANGE_KM = 30_000;

/**
 * Per-instance tuning for LightningWeapon. Ships may pass a partial config to override the class
 * defaults; any omitted field keeps the class default.
 *
 * `maxRange` is the one field ships should normally leave alone: when omitted it is derived from
 * `propagationSpeed × maxFlightTime`, so changing the bolt's speed automatically keeps its
 * flight time sane. (At light speed a fixed distance-based range would take thousands of
 * sim-seconds to grow into.)
 */
export interface ILightningWeaponConfig extends Omit<IBeamWeaponConfig, 'maxRange'> {
    /** Maximum bolt reach. Derived from `propagationSpeed × maxFlightTime` when omitted. */
    maxRange?: number;
    /** Screen-pixel width of the white-hot core line. */
    coreWidth: number;
    /** Screen-pixel width of the coloured halo line. */
    haloWidth: number;
    /** Speed the leading edge advances at while firing, world units/s. */
    propagationSpeed: number;
    /** Sim-seconds the leading edge takes to reach full range. Ignored when `maxRange` is set. */
    maxFlightTime: number;
    /**
     * Peak sideways displacement per axis, as a fraction of the bolt's current drawn length. This
     * is the width knob: lower is a tighter, straighter bolt. The whole displacement field is
     * normalised to this bound, so the number stays meaningful however the octave weights in
     * `lightning-path.ts` are changed.
     */
    wobbleFraction: number;
    /** Hard ceiling on that displacement, world units. Only binds on very long bolts. */
    wobbleMax: number;
    /**
     * Points sampled along the bolt. This is the resolution knob: more points resolve finer
     * structure, and cost one extra line segment each per frame.
     */
    segments: number;
    /** Shape re-rolls per sim-second while the trigger is held. 0 freezes the bolt solid. */
    crackleHz: number;
}

/** Fully resolved config — `maxRange` always present. */
interface IResolvedLightningConfig extends ILightningWeaponConfig {
    maxRange: number;
}

/**
 * Alien lightning weapon. Rendered as a shared-vertex jagged polyline drawn twice: a narrow
 * white-hot core and a wider coloured halo, both camera-relative so nothing snaps at planetary
 * distances.
 */
export class LightningWeapon extends BeamWeaponBase {
    private readonly config: IResolvedLightningConfig;

    /** The procedural shape. Re-seeded per shot, re-crackled on a sim-time accumulator. */
    private readonly shape: LightningShape;

    /** True between a trigger pull and its release, for rising-edge detection. */
    private triggerHeld = false;

    /** Sim-seconds accumulated toward the next crackle re-roll. */
    private crackleAccum = 0;

    /** Accumulates simDt while the bolt is live; drives brightness/width shimmer. */
    private flickerTime = 0;

    // ── Rendering ────────────────────────────────────────────────────────────
    /** Vertex buffer, written in place every frame — never reallocated. */
    private readonly vertexData: Float32Array;
    /** One geometry shared by the core and halo: the two draw the same vertices. */
    private readonly pathGeo: LineSegmentsGeometry;
    /** Cached so the per-frame `needsUpdate` flip doesn't do an attribute lookup. */
    private readonly instanceStartAttr: THREE.InterleavedBufferAttribute;
    private readonly coreMat: LineMaterial;
    private readonly haloMat: LineMaterial;
    private readonly coreArc: LineSegments2;
    private readonly haloArc: LineSegments2;

    // Glow points at the muzzle and the tip.
    private readonly muzzlePositions = new Float32Array(3).fill(0);
    private readonly muzzleGeometry: THREE.BufferGeometry;
    private readonly muzzleMaterial: THREE.PointsMaterial;
    private readonly muzzlePoint: THREE.Points;

    private readonly tipPositions = new Float32Array(3).fill(0);
    private readonly tipGeometry: THREE.BufferGeometry;
    private readonly tipMaterial: THREE.PointsMaterial;
    private readonly tipPoint: THREE.Points;

    constructor(
        scene: THREE.Scene,
        shipRadius: number,
        config: Partial<ILightningWeaponConfig> = {}
    ) {
        /** Class-level defaults — a ship wanting different behaviour passes a partial config. */
        const DEFAULT_LIGHTNING_CONFIG: ILightningWeaponConfig = {
            beamColor: 0x30ff60,
            coreWidth: 1,
            haloWidth: 5,
            damage: 2,
            optimalRange: LIGHTNING_OPTIMAL_RANGE_KM / DIST_SCALE,
            shieldEffectiveness: 1.75,
            hullEffectiveness: 0.25,
            damageInterval: 0.2,
            heatPerSecond: 0.25,
            coolPerSecond: 0.75,
            propagationSpeed: C / LIGHTNING_PROPAGATION_DIVISOR,
            maxFlightTime: LIGHTNING_MAX_FLIGHT_TIME,
            wobbleFraction: LIGHTNING_WOBBLE_FRACTION,
            wobbleMax: LIGHTNING_WOBBLE_MAX,
            segments: LIGHTNING_SEGMENTS,
            crackleHz: LIGHTNING_CRACKLE_HZ,
            loopSound: (position) => playLoopSoundEffectAt(SoundEffect.LaserBeam, position),
        };

        const merged: ILightningWeaponConfig = { ...DEFAULT_LIGHTNING_CONFIG, ...config };
        // Range is sized in flight time, not distance: the bolt's leading edge must actually
        // finish travelling before the trigger is released, whatever speed it was given.
        const resolved: IResolvedLightningConfig = {
            ...merged,
            maxRange: merged.maxRange ?? merged.propagationSpeed * merged.maxFlightTime,
        };
        super(scene, resolved);
        this.config = resolved;

        // Built here rather than as a field initializer, which would run before `this.config`
        // exists and so could not read the per-ship point count.
        this.shape = new LightningShape(this.config.segments);

        this.weaponSound = {
            loop:
                this.config.loopSound ??
                ((position) => playLoopSoundEffectAt(SoundEffect.LaserBeam, position)),
        };

        // ── Shared jagged polyline ────────────────────────────────────────
        this.vertexData = new Float32Array(this.shape.positionCount);
        this.pathGeo = new LineSegmentsGeometry();
        // Sized once here; every later frame writes into the same buffer.
        this.pathGeo.setPositions(this.vertexData);
        this.pathGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
        this.instanceStartAttr = this.pathGeo.getAttribute(
            'instanceStart'
        ) as THREE.InterleavedBufferAttribute;

        // ── Core arc: narrow white-hot line ──────────────────────────────
        this.coreMat = new LineMaterial({
            color: 0xffffff,
            linewidth: this.config.coreWidth,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.coreMat.resolution.set(window.innerWidth, window.innerHeight);
        this.coreArc = new LineSegments2(this.pathGeo, this.coreMat);
        this.coreArc.frustumCulled = false;
        this.coreArc.renderOrder = 2;
        this.coreArc.visible = false;
        scene.add(this.coreArc);

        // ── Halo arc: wide coloured glow around the core ──────────────────
        this.haloMat = new LineMaterial({
            color: this.config.beamColor,
            linewidth: this.config.haloWidth,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.haloMat.resolution.set(window.innerWidth, window.innerHeight);
        this.haloArc = new LineSegments2(this.pathGeo, this.haloMat);
        this.haloArc.frustumCulled = false;
        this.haloArc.renderOrder = 2;
        this.haloArc.visible = false;
        scene.add(this.haloArc);

        // ── Muzzle glow point ─────────────────────────────────────────────
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

        // ── Tip glow point (impact flash at the far end) ──────────────────
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
        return 'Arc Lance';
    }

    /** A fraction of light speed — see LIGHTNING_PROPAGATION_DIVISOR. */
    protected override get propagationSpeed(): number {
        return this.config.propagationSpeed;
    }

    // ── Firing ───────────────────────────────────────────────────────────────

    override tryFire(
        dt: number,
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        shipVelocity: THREE.Vector3,
        target: Body | null
    ): void {
        const wasFiring = this.triggerHeld;
        this.triggerHeld = true;
        super.tryFire(dt, origin, direction, shipVelocity, target);

        // Rising edge: a fresh shot gets a fresh bolt. Every shot looks different, which is the
        // whole point of rolling the shape per fire rather than per weapon.
        if (!wasFiring) {
            this.shape.rerollMacro();
            this.crackleAccum = 0;
        }
    }

    override stopFire(): void {
        this.triggerHeld = false;
        super.stopFire();
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

    /**
     * Advance the shimmer and, at the configured rate, re-roll the bolt's fine detail.
     *
     * The crackle runs on an accumulator rather than a timer so it slows with the time scale and
     * freezes while paused. It deliberately resets the accumulator to zero instead of a `while`
     * loop shedding periods: at high time warp one frame is many sim-seconds, and a loop would
     * re-roll thousands of times for a shape that is only drawn once. One re-roll per frame is
     * all the frame rate can show anyway.
     */
    protected override onBeamTick(simDt: number): void {
        this.flickerTime += simDt;

        const hz = this.config.crackleHz;
        if (hz <= 0) return;

        this.crackleAccum += simDt;
        if (this.crackleAccum >= 1 / hz) {
            this.crackleAccum = 0;
            this.shape.rerollMicro();
        }
    }

    /** Draw the bolt: procedural vertices uploaded in place, then the two glow points. */
    protected override renderBeam(
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        length: number,
        cameraPosition: THREE.Vector3
    ): void {
        // ── Vertices ──────────────────────────────────────────────────────
        this.shape.build(
            this.vertexData,
            origin,
            direction,
            length,
            cameraPosition,
            this.config.wobbleFraction,
            this.config.wobbleMax
        );
        this.instanceStartAttr.data.needsUpdate = true;

        const shimmer =
            Math.sin(this.flickerTime * LIGHTNING_FLICKER_FREQ_A) * 0.6 +
            Math.sin(this.flickerTime * LIGHTNING_FLICKER_FREQ_B) * 0.4;
        const opacityMult = Math.max(0, Math.min(1, 1 + shimmer * LIGHTNING_FLICKER_OPACITY_AMP));
        const widthMult = 1 + shimmer * LIGHTNING_FLICKER_WIDTH_AMP;

        const cpx = cameraPosition.x;
        const cpy = cameraPosition.y;
        const cpz = cameraPosition.z;
        this.coreArc.position.set(cpx, cpy, cpz);
        this.haloArc.position.set(cpx, cpy, cpz);
        this.coreMat.resolution.set(window.innerWidth, window.innerHeight);
        this.haloMat.resolution.set(window.innerWidth, window.innerHeight);
        this.coreMat.opacity = opacityMult;
        this.haloMat.opacity = opacityMult;
        this.coreMat.linewidth = this.config.coreWidth * Math.max(0.1, widthMult);
        this.haloMat.linewidth = this.config.haloWidth * Math.max(0.1, widthMult);
        this.muzzleMaterial.opacity = Math.max(
            0,
            0.95 * (1 + shimmer * LIGHTNING_FLICKER_OPACITY_AMP)
        );
        this.tipMaterial.opacity = Math.max(0, 0.9 * (1 + shimmer * LIGHTNING_FLICKER_OPACITY_AMP));

        // ── Muzzle glow point ─────────────────────────────────────────────
        this.muzzlePositions[0] = origin.x - cpx;
        this.muzzlePositions[1] = origin.y - cpy;
        this.muzzlePositions[2] = origin.z - cpz;
        this.muzzleGeometry.setDrawRange(0, 1);
        this.muzzleGeometry.attributes.position.needsUpdate = true;
        this.muzzlePoint.position.set(cpx, cpy, cpz);

        // ── Tip glow point ────────────────────────────────────────────────
        this.tipPositions[0] = this.tip.x - cpx;
        this.tipPositions[1] = this.tip.y - cpy;
        this.tipPositions[2] = this.tip.z - cpz;
        this.tipGeometry.setDrawRange(0, 1);
        this.tipGeometry.attributes.position.needsUpdate = true;
        this.tipPoint.position.set(cpx, cpy, cpz);
    }

    protected override setBeamVisible(visible: boolean): void {
        this.coreArc.visible = visible;
        this.haloArc.visible = visible;
        this.muzzlePoint.visible = visible;
        this.tipPoint.visible = visible;
    }

    override reset(): void {
        this.triggerHeld = false;
        this.crackleAccum = 0;
        this.flickerTime = 0;
        super.reset();
    }

    override dispose(): void {
        super.dispose();
        this.scene.remove(this.coreArc);
        this.scene.remove(this.haloArc);
        this.scene.remove(this.muzzlePoint);
        this.scene.remove(this.tipPoint);
        this.pathGeo.dispose();
        this.coreMat.dispose();
        this.haloMat.dispose();
        this.muzzleGeometry.dispose();
        this.muzzleMaterial.dispose();
        this.tipGeometry.dispose();
        this.tipMaterial.dispose();
    }
}
