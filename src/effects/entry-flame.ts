import * as THREE from 'three';
import { Body } from '../bodies/body.js';
import { settingsStore } from '../settings/settings-store.js';
import {
    ATMOSPHERE_FULL_INTENSITY_SPEED,
    ATMOSPHERE_MIN_SPEED_FOR_EFFECT,
} from '../utilities/consts.js';

// ── Shape tuning ──────────────────────────────────────────────────────────
/** Flame length, as a multiple of the body radius. */
const CONE_LENGTH_FACTOR = 9;
/** Peak flame radius, as a multiple of the body radius (the widest ring, at the body centre). */
const CONE_RADIUS_FACTOR = 1.25;
/** Radius of the blunt ring at the very front (the leading edge), as a multiple of the body radius.
 *  Non-zero so the cone can wrap the sphere's steeply-curving front hemisphere without the body
 *  poking through it — a zero-radius nose apex can never stay outside a sphere near the tangent point. */
const CONE_NOSE_RADIUS_FACTOR = 0.45;
/** Lateral wander of the flame's tail, as a multiple of the body radius. */
const CONE_BEND_FACTOR = 0.9;
/** Travelling-wave ripple amplitude along the tail, as a multiple of the body radius. */
const CONE_RIPPLE_FACTOR = 0.12;
/** Number of vertices around the cone's circumference. */
const RADIAL_SEGMENTS = 28;
/** Number of rings along the cone's length. */
const LENGTH_SEGMENTS = 20;

// ── Animation tuning ──────────────────────────────────────────────────────
/** How fast the flame's tail wanders (rad/s). */
const BEND_WOBBLE_SPEED = 0.9;
/** How fast the ripple travels down the tail (rad/s). */
const RIPPLE_SPEED = 4.0;
/** Number of ripple wavelengths along the flame. */
const RIPPLE_WAVELENGTHS = 2.5;
/** How fast the fire sprite scrolls around the flame (uv units/second). */
const SPRITE_SCROLL_SPEED = 0.22;

// ── Lifecycle tuning ──────────────────────────────────────────────────────
/** Fade-in time (sim-seconds) from the moment the flame first appears. */
const FADE_IN_SECONDS = 1.0;
/** Fade-out time (sim-seconds) after the body leaves the atmosphere before the flame is gone. */
const FADE_OUT_SECONDS = 1.0;

// ── Intensity tuning ──────────────────────────────────────────────────────
// Relative-speed thresholds (ATMOSPHERE_MIN_SPEED_FOR_EFFECT / ATMOSPHERE_FULL_INTENSITY_SPEED,
// from utilities/consts.ts) drive the flame's intensity: below MIN it's fully suppressed
// (0 intensity), at/above FULL it's fully lit (1), ramping smoothly in between. They're shared
// with the atmospheric heat-damage gate in physics/atmospheric-drag.ts — a body too slow to
// show a visible flame here takes no heat damage there either. Both are tuned for ship flight
// speeds (normal cruise ~75 km/s, boost a large fraction of light speed) rather than the
// asteroid-defense scenario's ~1200 km/s scripted impacts — those sail straight past
// ATMOSPHERE_FULL_INTENSITY_SPEED and stay fully lit no matter where this is tuned, since
// intensity clamps at 1 once past it.

/** Flame length scale at zero intensity (1 at full intensity). */
const LENGTH_SCALE_MIN = 0.35;
/** Flame radius scale at zero intensity (1 at full intensity). */
const RADIUS_SCALE_MIN = 0.85;

/**
 * The flame's atmosphere brightness ramps with how deep the body is into the atmosphere shell,
 * measured as a fraction of the shell's thickness: 0 at the outer edge, 1 at the surface. It is
 * deliberately NOT the physical density — that falls off with a scale height of only a small
 * fraction of the shell (see physics/atmosphere-density.ts), so it stays indistinguishable from
 * zero until the last few kilometres and the flame would only appear just before impact.
 *
 * Linear from FLAME_DEPTH_START (invisible) to FLAME_DEPTH_FULL (full brightness). For Earth's
 * ~446 km shell that is ~335 km → ~90 km altitude, so the flame is faintly visible (~14%) at
 * 300 km. Scales automatically with each body's own atmosphere radius.
 */
const FLAME_DEPTH_START = 0.25;
const FLAME_DEPTH_FULL = 0.8;

/**
 * Surface pressure (bar) at or above which an atmosphere can light the flame to full
 * brightness; thinner atmospheres cap it proportionally (Mars at 0.006 bar reaches ~20%, a
 * µbar haze like Pluto's effectively none), so the "thin atmosphere is dimmer" intent survives.
 */
const FULL_BRIGHTNESS_SURFACE_PRESSURE_BAR = 0.03;

// ── Sprite ────────────────────────────────────────────────────────────────
const SPRITE_WIDTH = 256;
const SPRITE_HEIGHT = 256;

/** Vertical position of the sprite's hot base, as a fraction of the flame's length — the flame
 *  fades in over this short distance so the open front ring never shows a hard cut-off edge. */
const BASE_FADE_FRACTION = 0.02;

// Reusable scratch objects — the update loop runs every frame and must not allocate.
const _UP = new THREE.Vector3(0, 1, 0);
const _FLIP_AXIS = new THREE.Vector3(1, 0, 0);
const _TWO_PI = Math.PI * 2;

/**
 * Colour ramp for the fire sprite, from the hot base of the flame (v = 0) to its cool tip (v = 1).
 * Each stop is [position, r, g, b] with components in [0, 1].
 */
const FLAME_RAMP: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.0, 1.0, 0.97, 0.85], // white-hot
    [0.22, 1.0, 0.82, 0.35], // yellow
    [0.5, 1.0, 0.5, 0.1], // orange
    [0.78, 0.85, 0.2, 0.03], // deep orange-red
    [1.0, 0.4, 0.05, 0.01], // cooling red
];

/** Lerps the flame colour ramp at `v` ∈ [0, 1], returning [r, g, b] in [0, 1]. */
function flameColor(v: number): [number, number, number] {
    const clamped = v < 0 ? 0 : v > 1 ? 1 : v;
    let lower = FLAME_RAMP[0];
    for (let i = 1; i < FLAME_RAMP.length; i++) {
        const upper = FLAME_RAMP[i];
        if (clamped <= upper[0]) {
            const span = Math.max(upper[0] - lower[0], 1e-6);
            const k = (clamped - lower[0]) / span;
            return [
                lower[1] + (upper[1] - lower[1]) * k,
                lower[2] + (upper[2] - lower[2]) * k,
                lower[3] + (upper[3] - lower[3]) * k,
            ];
        }
        lower = upper;
    }
    const last = FLAME_RAMP[FLAME_RAMP.length - 1];
    return [last[1], last[2], last[3]];
}

/**
 * Horizontally tileable plasma-streak mask for the fire sprite. Every term is an integer multiple
 * of `u`, so the pattern wraps seamlessly where the cone's uv seam meets itself.
 */
function flameStreak(u: number, v: number): number {
    const s =
        0.62 +
        0.2 * Math.sin(_TWO_PI * 3 * u + v * 7.0) +
        0.12 * Math.sin(_TWO_PI * 7 * u - v * 13.0) +
        0.08 * Math.sin(_TWO_PI * 13 * u + v * 23.0);
    return s < 0 ? 0 : s > 1 ? 1 : s;
}

/**
 * Builds the flame's colour + alpha sprite: a hot core at the bottom fading to nothing at the top,
 * overlaid with tileable streaks. Sampled once across the cone's circumference and length.
 */
function buildFlameSprite(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = SPRITE_WIDTH;
    canvas.height = SPRITE_HEIGHT;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(SPRITE_WIDTH, SPRITE_HEIGHT);
    const data = image.data;

    for (let y = 0; y < SPRITE_HEIGHT; y++) {
        // flameV: 0 at the bottom of the sprite (the hot base / leading edge) → 1 at the top (tip).
        const flameV = 1 - y / (SPRITE_HEIGHT - 1);
        const color = flameColor(flameV);
        // Vertical falloff plus the short base fade that hides the open front ring's edge.
        const vertical =
            Math.pow(1 - flameV, 1.2) * THREE.MathUtils.smoothstep(flameV, 0, BASE_FADE_FRACTION);
        for (let x = 0; x < SPRITE_WIDTH; x++) {
            const u = x / SPRITE_WIDTH;
            const alpha = vertical * flameStreak(u, flameV);
            const i = (y * SPRITE_WIDTH + x) * 4;
            data[i] = color[0] * 255;
            data[i + 1] = color[1] * 255;
            data[i + 2] = color[2] * 255;
            data[i + 3] = Math.min(1, Math.max(0, alpha)) * 255;
        }
    }

    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    // Repeat horizontally (the seam is a real uv wrap) but clamp vertically so scrolling cannot
    // smear the gradient past the base or tip.
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
}

/**
 * Radius of the flame's cross-section at normalised length `t` ∈ [0, 1]. The profile bulges out to
 * `rMax` where the body's centre sits, then tapers to a point at the tail, so the cone hugs the
 * body's front hemisphere and streams away into a wake behind it.
 *
 * @param t      Normalised distance from the leading edge (0) to the flame tip (1).
 * @param bodyT  Normalised position of the body's centre along the flame.
 * @param rNose  Radius of the blunt ring at the leading edge.
 * @param rMax   Peak radius, at the body's centre.
 */
function radiusProfile(t: number, bodyT: number, rNose: number, rMax: number): number {
    if (t <= bodyT) {
        // Front half: blunt nose growing out to the widest ring at the body's centre. The sqrt
        // keeps pace with the sphere's own sqrt(2ry − y²) silhouette so the flame stays outside it.
        const k = bodyT > 0 ? t / bodyT : 1;
        return rNose + (rMax - rNose) * Math.sqrt(k);
    }
    // Rear half: taper from the widest ring to a point.
    const k = (t - bodyT) / Math.max(1 - bodyT, 1e-6);
    return rMax * Math.pow(1 - k, 0.9);
}

/**
 * Renders the atmospheric-entry flame as a single curved cone ("spindle plume") mesh that trails
 * behind a body moving through a planet's atmosphere.
 *
 * Replaces the earlier particle-spray implementation, which scattered points across a very wide
 * (~109° half-angle) cone and read as noise rather than a flame. This version is one cohesive
 * `THREE.Mesh`:
 *
 *  - The geometry is a swept cone built once in the constructor, with its blunt wide end at the
 *    body's leading edge and its tip tapering away behind it. The spine bends and ripples, rewritten
 *    every frame, so the flame visibly curves and shifts instead of sitting as a rigid triangle.
 *  - The mesh is re-oriented each frame so its axis follows the body's instantaneous velocity — the
 *    flame always streams directly behind the body's current direction of travel.
 *  - A procedurally generated fire sprite (hot core → orange → transparent, with plasma streaks)
 *    scrolls around the surface for a flickering, alive look.
 *  - Intensity is driven by the body's speed *relative to the planet* (not its heliocentric speed):
 *    the flame grows, brightens and stretches from MIN_SPEED_FOR_EFFECT up to FULL_INTENSITY_SPEED.
 *  - A second intensity factor comes from how deep the body is into the atmosphere and how thick
 *    that atmosphere is, so the flame fades in on the way down and is dimmer in a thin
 *    atmosphere — see `setAtmosphereDepth`, FLAME_DEPTH_START/FULL and
 *    FULL_BRIGHTNESS_SURFACE_PRESSURE_BAR.
 *  - The flame eases in when it first appears and dissolves out when the body leaves the
 *    atmosphere: `stop()` begins the fade-out, and `active` flips to false once it finishes, at
 *    which point the owner disposes the effect (see `checkAtmosphericEntry`).
 *
 * The effect keeps a live reference to `body` and reads `mesh.position`/`velocity` fresh every frame,
 * so it tracks a moving body without needing to be re-parented or fed transform data externally
 * (same pattern as `src/effects/solar-flare.ts`).
 */
export class EntryFlameEffect {
    private readonly scene: THREE.Scene;
    private readonly body: Body;
    /** The planet this flame is currently attributed to — exposed so the per-frame
     *  containment check (checkAtmosphericEntry) only disposes this effect when *this*
     *  specific planet's atmosphere is exited, not whenever the body doesn't happen to be
     *  inside some other, unrelated atmosphere-bearing planet it's compared against. */
    readonly planet: Body;

    private readonly geometry: THREE.BufferGeometry;
    private readonly material: THREE.MeshBasicMaterial;
    private readonly texture: THREE.CanvasTexture;
    private readonly mesh: THREE.Mesh;
    private readonly positionAttribute: THREE.BufferAttribute;

    /** Live vertex buffer, rewritten each frame by `_writeSpine`. */
    private readonly positions: Float32Array;
    /** Unit ring direction per radial vertex (the +X / +Z components of each ring vertex). */
    private readonly cosTheta: Float32Array;
    private readonly sinTheta: Float32Array;
    /** Local-space Y of each ring along the cone's length. */
    private readonly ringY: Float32Array;
    /** Cross-section radius of each ring (fixed; intensity scaling is applied via the mesh transform). */
    private readonly ringRadius: Float32Array;

    private readonly coneLength: number;
    private readonly bodyT: number;
    private readonly bendAmplitude: number;
    private readonly rippleAmplitude: number;

    /** Seconds of simulated time accumulated since construction, driving the spine animation. */
    private time = 0;

    /**
     * False once the flame has fully faded out and may be disposed. Mirrors the
     * `IPipelineFeedEffect` contract (`stopSpawning()` / `active`): the owner calls `stop()` when
     * the body leaves the atmosphere, keeps updating the effect each frame, and disposes it once
     * this reads false.
     */
    active = true;
    /** 0→1 fade envelope: ramps up from first appearing, then back down after `stop()`. */
    private envelope = 0;
    /** True once `stop()` has been called and the flame is dissolving. */
    private stopping = false;
    /** 0..1 atmosphere factor from the last `setAtmosphereDepth` call; multiplies intensity
     *  alongside speed. Defaults to 1 (full) so a flame not yet fed a depth still shows. */
    private densityFactor = 1;

    // Scratch objects reused every frame.
    private readonly _dir = new THREE.Vector3();
    private readonly _backward = new THREE.Vector3();
    private readonly _quat = new THREE.Quaternion();

    constructor(scene: THREE.Scene, body: Body, planet: Body) {
        this.scene = scene;
        this.body = body;
        this.planet = planet;

        const radius = body.radius;
        this.coneLength = CONE_LENGTH_FACTOR * radius;
        this.bodyT = radius / this.coneLength;
        this.bendAmplitude = CONE_BEND_FACTOR * radius;
        this.rippleAmplitude = CONE_RIPPLE_FACTOR * radius;

        const rMax = CONE_RADIUS_FACTOR * radius;
        const rNose = CONE_NOSE_RADIUS_FACTOR * radius;

        const ringCount = LENGTH_SEGMENTS + 1;
        // One extra vertex per ring duplicates the uv seam so the surface can wrap cleanly; with a
        // horizontally-tileable sprite and RepeatWrapping the duplicate samples the same texel.
        const ringVertices = RADIAL_SEGMENTS + 1;
        const vertexCount = ringCount * ringVertices;

        this.positions = new Float32Array(vertexCount * 3);
        const uvs = new Float32Array(vertexCount * 2);
        const indices = new Uint32Array(LENGTH_SEGMENTS * RADIAL_SEGMENTS * 6);

        this.cosTheta = new Float32Array(ringVertices);
        this.sinTheta = new Float32Array(ringVertices);
        for (let j = 0; j < ringVertices; j++) {
            const theta = (j / RADIAL_SEGMENTS) * _TWO_PI;
            this.cosTheta[j] = Math.cos(theta);
            this.sinTheta[j] = Math.sin(theta);
        }

        this.ringY = new Float32Array(ringCount);
        this.ringRadius = new Float32Array(ringCount);
        for (let i = 0; i < ringCount; i++) {
            const t = i / LENGTH_SEGMENTS;
            this.ringY[i] = t * this.coneLength;
            this.ringRadius[i] = radiusProfile(t, this.bodyT, rNose, rMax);
        }

        for (let i = 0; i < ringCount; i++) {
            const v = i / LENGTH_SEGMENTS;
            for (let j = 0; j < ringVertices; j++) {
                const vertex = i * ringVertices + j;
                uvs[vertex * 2] = j / RADIAL_SEGMENTS;
                uvs[vertex * 2 + 1] = v;
            }
        }

        let ptr = 0;
        for (let i = 0; i < LENGTH_SEGMENTS; i++) {
            for (let j = 0; j < RADIAL_SEGMENTS; j++) {
                const a = i * ringVertices + j;
                const b = a + 1;
                const c = a + ringVertices;
                const d = c + 1;
                indices[ptr++] = a;
                indices[ptr++] = c;
                indices[ptr++] = b;
                indices[ptr++] = b;
                indices[ptr++] = c;
                indices[ptr++] = d;
            }
        }

        this.geometry = new THREE.BufferGeometry();
        this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
        this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
        this.geometry.setAttribute('position', this.positionAttribute);
        this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        this.texture = buildFlameSprite();
        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 2;
        this.mesh.visible = false;
        scene.add(this.mesh);

        // Seed the vertex buffer so the very first rendered frame has valid geometry.
        this._writeSpine(0);
        this.positionAttribute.needsUpdate = true;
    }

    /**
     * Rewrites the cone's vertices for the current time: the tail wanders in a slow circle while a
     * travelling ripple runs down its length, giving the flame a curved, shifting silhouette.
     */
    private _writeSpine(time: number): void {
        const ringCount = this.ringY.length;
        const ringVertices = this.cosTheta.length;
        const positions = this.positions;

        const wobbleX = Math.sin(time * BEND_WOBBLE_SPEED);
        const wobbleZ = Math.cos(time * BEND_WOBBLE_SPEED * 0.61 + 1.1);

        for (let i = 0; i < ringCount; i++) {
            const t = i / (ringCount - 1);
            // Bend only the tail — the base ring stays pinned to the body's leading edge.
            const taper = Math.pow(t, 1.5);
            const ripple = Math.sin(t * _TWO_PI * RIPPLE_WAVELENGTHS - time * RIPPLE_SPEED);
            const bendX = this.bendAmplitude * wobbleX * taper + this.rippleAmplitude * ripple * t;
            const bendZ =
                this.bendAmplitude * wobbleZ * taper + this.rippleAmplitude * ripple * t * 0.6;

            const y = this.ringY[i];
            const r = this.ringRadius[i];
            const base = i * ringVertices;

            for (let j = 0; j < ringVertices; j++) {
                const index = (base + j) * 3;
                positions[index] = this.cosTheta[j] * r + bendX;
                positions[index + 1] = y;
                positions[index + 2] = this.sinTheta[j] * r + bendZ;
            }
        }
    }

    /**
     * Begins the fade-out. The flame keeps rendering (and dimming) until `active` flips to false,
     * at which point the owner should dispose it. Safe to call every frame.
     */
    stop(): void {
        this.stopping = true;
    }

    /**
     * Cancels a pending fade-out and fades the flame back in — called while the body is (still, or
     * once again) inside the atmosphere it spawned for. Safe to call every frame.
     */
    start(): void {
        this.stopping = false;
    }

    /**
     * Sets this frame's atmosphere brightness factor from how deep the body is into the shell.
     * Visual only — drag and heat damage (physics/atmospheric-drag.ts) keep consuming the
     * physical density.
     *
     * Called once per frame by `checkAtmosphericEntry`, which holds the strongly-typed
     * `CelestialBody` this effect's `planet: Body` field deliberately doesn't. Safe to call
     * every frame.
     *
     * @param depthFraction 0 at the atmosphere's outer edge, 1 at the surface.
     * @param surfacePressureBar The atmosphere's surface pressure.
     */
    setAtmosphereDepth(depthFraction: number, surfacePressureBar: number): void {
        const depthRamp = THREE.MathUtils.clamp(
            (depthFraction - FLAME_DEPTH_START) / (FLAME_DEPTH_FULL - FLAME_DEPTH_START),
            0,
            1
        );
        const pressureCap = THREE.MathUtils.clamp(
            surfacePressureBar / FULL_BRIGHTNESS_SURFACE_PRESSURE_BAR,
            0,
            1
        );
        this.densityFactor = depthRamp * pressureCap;
    }

    /**
     * Update per frame (call once per render frame, not per physics substep).
     * @param dt Frame delta-time in seconds.
     * @param _cameraPos World-space camera position (unused — the mesh is placed in world space).
     */
    update(dt: number, _cameraPos: THREE.Vector3): void {
        if (!settingsStore.settings.particleEffectsEnabled) {
            this.mesh.visible = false;
            return;
        }

        const absDt = Math.abs(dt);
        this.time += absDt;

        // ── Fade envelope ──────────────────────────────────────────────────────
        // Eases the flame in from nothing when it first appears, and dissolves it out once the
        // body leaves the atmosphere (stop()), rather than popping in or vanishing instantly.
        if (this.stopping) {
            this.envelope -= absDt / FADE_OUT_SECONDS;
        } else {
            this.envelope += absDt / FADE_IN_SECONDS;
        }
        this.envelope = Math.min(1, Math.max(0, this.envelope));

        if (this.stopping && this.envelope <= 0) {
            // Fully dissolved — flag inactive so the owner disposes this effect.
            this.active = false;
            this.mesh.visible = false;
            return;
        }

        // Amplify with closing/relative speed against the planet (not heliocentric speed —
        // a ship co-moving with its planet has near-zero speed relative to it even though
        // its absolute velocity is large). Ramps smoothly from dark at MIN_SPEED_FOR_EFFECT
        // to full brightness at FULL_INTENSITY_SPEED.
        const relativeSpeed = this.body.velocity.distanceTo(this.planet.velocity);
        const speedIntensity = THREE.MathUtils.smoothstep(
            relativeSpeed,
            ATMOSPHERE_MIN_SPEED_FOR_EFFECT,
            ATMOSPHERE_FULL_INTENSITY_SPEED
        );
        // The fade envelope and the density factor both multiply the speed intensity, so the
        // flame eases in/out, brightens/dims with entry speed, and is fainter in a thin
        // atmosphere than a thick one. densityFactor is a ramp over depth into the atmosphere
        // rather than the raw density ratio — see setAtmosphereDepth.
        const intensity = speedIntensity * this.densityFactor * this.envelope;

        if (intensity <= 0.001) {
            this.mesh.visible = false;
            return;
        }

        // Trail directly behind the body's instantaneous direction of travel.
        const speed = this.body.velocity.length();
        if (speed > 1e-6) {
            this._dir.copy(this.body.velocity).multiplyScalar(1 / speed);
        } else {
            this._dir.set(0, 0, 1);
        }
        this._backward.copy(this._dir).negate();

        // Orient the cone (local +Y) along -velocity. The antipode guard mirrors BlackHoleJetEffect:
        // setFromUnitVectors is undefined for exactly-opposite vectors.
        const alignment = this._backward.dot(_UP);
        if (alignment < -0.9999) {
            this._quat.setFromAxisAngle(_FLIP_AXIS, Math.PI);
        } else if (alignment < 0.9999) {
            this._quat.setFromUnitVectors(_UP, this._backward);
        } else {
            this._quat.identity();
        }

        // Anchor the blunt front ring at the body's leading edge so the flame wraps the front.
        this.mesh.position
            .copy(this.body.mesh.position)
            .addScaledVector(this._dir, this.body.radius);
        this.mesh.quaternion.copy(this._quat);

        // Grow the flame with intensity: longer and slightly fatter as it ramps up.
        const lengthScale = LENGTH_SCALE_MIN + (1 - LENGTH_SCALE_MIN) * intensity;
        const radiusScale = RADIUS_SCALE_MIN + (1 - RADIUS_SCALE_MIN) * intensity;
        this.mesh.scale.set(radiusScale, lengthScale, radiusScale);

        this._writeSpine(this.time);
        this.positionAttribute.needsUpdate = true;

        // Scroll the fire sprite around the flame for a flickering, shifting surface. Kept bounded
        // so the offset stays precise during long atmospheric passes.
        this.texture.offset.x += absDt * SPRITE_SCROLL_SPEED * (0.5 + intensity);
        this.texture.offset.x -= Math.floor(this.texture.offset.x);

        this.material.opacity = intensity;
        this.mesh.visible = true;
    }

    /** Remove from scene and free GPU resources. */
    dispose(): void {
        this.active = false;
        this.scene.remove(this.mesh);
        this.geometry.dispose();
        this.texture.dispose();
        this.material.dispose();
    }
}
