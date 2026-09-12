import * as THREE from 'three';
import type { IMagneticFieldOptions } from '../interfaces';
import { computeMagneticAxis } from '../procedural/magnetic-field';
import { SeededRandom } from '../utilities/prng';
import { settingsStore, type AuroraDetailMode } from '../settings/settings-store';

export type AuroraHandle = {
    dispose: () => void;
    /**
     * Advances the curtain drift, the brightness pulse and the per-band shader animation.
     * `dtTotal` is signed, so time reversal reverses the drift.
     */
    update: (dtTotal: number) => void;
    setVisible: (visible: boolean) => void;
    /** Rescales the whole effect after the host body's radius changes — no geometry rebuild. */
    setRadius: (radius: number) => void;
};

/** Segments around each auroral oval. 128 keeps the warped ring smooth at close range. */
const RING_SEGMENTS = 128;

/** How many times the curtain texture tiles around one full oval. */
const TEXTURE_REPEAT = 8;

/** Curtain texture dimensions. Wide and short — it tiles horizontally around the ring. */
const TEX_WIDTH = 512;
const TEX_HEIGHT = 128;

/** Base of the curtain sits just above the surface so it never z-fights with the planet mesh. */
const BASE_ALTITUDE = 1.005;

/**
 * Gauss range used to normalise field strength. Spans the real spread from a
 * Mercury-like whisper (0.003 G) to well past Jupiter (4.17 G).
 */
const MIN_GAUSS = 0.001;
const MAX_GAUSS = 10;

/** Auroral oval co-latitude, in degrees from the magnetic pole, at min and max field strength. */
const OVAL_COLATITUDE_WEAK = 30;
const OVAL_COLATITUDE_STRONG = 14;

/** Curtain height as a fraction of body radius, at min and max field strength. */
const CURTAIN_HEIGHT_WEAK = 0.025;
const CURTAIN_HEIGHT_STRONG = 0.075;

/** Base opacity at min and max field strength. */
const OPACITY_WEAK = 0.25;
const OPACITY_STRONG = 1.0;

/**
 * Ceiling on the per-frame animation step, in simulation seconds.
 *
 * Curtain drift and fold motion are visual flourishes rather than physics, so they should
 * run at a steady wall-clock pace. Without this they would scale with `dtTotal` and strobe
 * uncontrollably as soon as the user winds the time scale up.
 */
const MAX_ANIM_DELTA = 0.05;

/** Radians/sec at which an oval's fold harmonics travel around the ring. */
const WARP_DRIFT_MIN = 0.15;
const WARP_DRIFT_MAX = 0.5;

/** Radians/sec of the slow substorm breathing that expands and contracts the whole oval. */
const BREATH_RATE_MIN = 0.05;
const BREATH_RATE_MAX = 0.11;

/** Peak substorm expansion, as a fraction of the oval's base co-latitude. */
const BREATH_AMOUNT = 0.12;

/** The two concentric layers drawn per pole: co-latitude scale, opacity scale, and drift rate. */
const LAYERS = [
    { colatitudeMult: 1.0, opacityMult: 1.0, drift: 0.035 },
    { colatitudeMult: 1.14, opacityMult: 0.55, drift: -0.022 },
];

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Draws the fine ray detail of the aurora curtain: ragged vertical striations in white,
 * carried entirely in the alpha channel.
 *
 * This is deliberately *only* the high-frequency structure. The arc brightness modulation and
 * the altitude colour ramp used to be baked in here too, but both now live in the fragment
 * shader (`AURORA_FRAGMENT_CHUNK`) where they can vary per band and drift over time — which a
 * texture drawn once never could.
 */
function drawCurtainTexture(rng: SeededRandom): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = TEX_WIDTH;
    canvas.height = TEX_HEIGHT;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    // A continuous base sheet first, so the curtain reads as a veil rather than loose rays.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    // Striations, drawn additively so overlapping bands brighten rather than flatten.
    ctx.globalCompositeOperation = 'lighter';

    const drawBand = (x: number, width: number, alpha: number) => {
        // Any band crossing the right edge is drawn again on the left so the texture tiles.
        const origins = x + width > TEX_WIDTH ? [x, x - TEX_WIDTH] : [x];
        for (const originX of origins) {
            const bandGrad = ctx.createLinearGradient(originX, 0, originX + width, 0);
            bandGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            bandGrad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
            bandGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = bandGrad;
            ctx.fillRect(originX, 0, width, TEX_HEIGHT);
        }
    };

    // Fine bands give the curtain its rayed structure.
    for (let i = 0; i < 160; i++) {
        drawBand(rng.range(0, TEX_WIDTH), rng.range(1, 8), rng.range(0.04, 0.22));
    }

    // A second, wider and dimmer pass groups those rays into broader folds.
    for (let i = 0; i < 24; i++) {
        drawBand(rng.range(0, TEX_WIDTH), rng.range(20, 70), rng.range(0.03, 0.1));
    }

    ctx.globalCompositeOperation = 'source-over';

    return canvas;
}

/**
 * Coarse procedural curtains per texture tile.
 *
 * This sets how densely curtains are *seeded*, not how wide they are — each one is jittered
 * off its cell and typically overruns it, overlapping its neighbours.
 *
 * Must be an integer. The shader wraps ids modulo `TEXTURE_REPEAT * BANDS_PER_TILE` so the
 * two sides of the phi = 0 seam draw the same curtain; that wrap only lines up if a whole
 * number of cells fits in each tile.
 *
 * 20 per tile across 8 tiles is ~160 individually-varying curtains around the oval. That sits
 * deliberately far below the ~1280 fine rays the canvas texture carries, so the two frequencies
 * read as broad curtains made of finer rays rather than as one picket fence.
 */
const BANDS_PER_TILE = 20;

/**
 * How much taller the ribbon geometry is built than the average band reaches.
 *
 * Band heights are now clipped in the fragment shader, so without this headroom the mean
 * curtain would come out visibly shorter than it used to be. `BAND_HEIGHT_MEAN` is its
 * reciprocal, which keeps the typical silhouette matching the pre-shader look.
 *
 * Applied in both detail modes, so switching detail never pops the geometry.
 */
const BAND_HEIGHT_ENVELOPE = 1.3;
const BAND_HEIGHT_MEAN = 1 / BAND_HEIGHT_ENVELOPE;

/**
 * Scales each curtain's contribution to the accumulated envelope.
 *
 * Three overlapping curtains are summed per fragment, so without this the oval would come out
 * markedly brighter than the single-band version it replaced. Tuned so the mean alpha lands
 * back within a few percent of that version over the upper two thirds of the curtain, leaving
 * the base a little brighter — which reads as the diffuse glow a real oval has down there.
 */
const BAND_GAIN = 0.7;

/**
 * Per-ribbon shader uniforms.
 *
 * Owned by the ribbon and handed to `shader.uniforms`, rather than reaching back into a
 * captured `shader` reference to write them: Three.js shares compiled programs between
 * materials, so a captured reference can silently end up belonging to a different one. Same
 * arrangement `black-hole-jet.ts` uses.
 */
type AuroraUniforms = {
    /** Accumulated clamped, signed simulation time. Unreferenced in static mode. */
    uTime: { value: number };
    /** Decorrelates the band pattern between the four ribbons. */
    uSeed: { value: number };
};

/**
 * Uniform and helper declarations, injected ahead of `main()`.
 *
 * Kept separate from the body chunk because GLSL has no nested functions — these cannot be
 * spliced in at `map_fragment`, which sits inside `main()`.
 */
const AURORA_PARS_CHUNK = /* glsl */ `
    uniform float uTime;
    uniform float uSeed;

    // Cheap per-band hash. There is no GLSL noise anywhere in this codebase (noise-utils.ts is
    // CPU-side only), and nothing here needs gradient noise — one decorrelated value per
    // integer band id is enough.
    //
    // The salt selects which property is being drawn rather than being folded into the id, so
    // the id's contribution to the argument stays bounded however many properties are added.
    float auroraHash(float id, float salt) {
        return fract(sin(id * 12.9898 + salt * 4.1414 + uSeed) * 43758.5453123);
    }

    // Emission colour by altitude, following real auroral chemistry: atomic-oxygen red
    // (630 nm) high up, the oxygen green core (557.7 nm), and an ionised-nitrogen violet
    // fringe along the bottom edge. Same stops as the canvas gradient this replaces.
    //
    // Sampled at absolute altitude, not altitude within the band — which is both physically
    // right and the reason a short band reads green while a tall one flares red at the tip.
    vec3 auroraRamp(float h) {
        vec3 c = mix(vec3(0.47, 0.27, 0.86), vec3(0.59, 0.35, 1.00), smoothstep(0.00, 0.08, h));
        c = mix(c, vec3(0.24, 1.00, 0.55), smoothstep(0.08, 0.25, h));
        c = mix(c, vec3(0.47, 1.00, 0.75), smoothstep(0.25, 0.60, h));
        c = mix(c, vec3(1.00, 0.27, 0.47), smoothstep(0.60, 0.82, h));
        return c;
    }
`;

/**
 * Fragment body injected after `map_fragment`.
 *
 * `diffuseColor` arrives carrying the curtain texture's fine ray detail in its alpha (the map
 * is white, so its RGB is neutral) already multiplied by the material colour and opacity.
 * This chunk replaces the RGB with the altitude emission ramp and multiplies the alpha by the
 * per-band envelope and the arc modulation.
 *
 * `vMapUv` is the varying Three.js declares for a mapped material. It already carries the
 * texture's scroll offset, so the procedural bands travel with the rays they are shaped from
 * rather than sliding through them.
 */
const AURORA_FRAGMENT_CHUNK = /* glsl */ `
    // Every local here is aurora-prefixed: this block is spliced into the middle of
    // MeshBasicMaterial's main(), and the stock chunks that follow it declare locals of
    // their own that must not be shadowed or redeclared.

    // Altitude up the curtain: 0 at the base, 1 at the top of the ribbon.
    float auroraAlt = vMapUv.y;

    // ── Per-band envelope ────────────────────────────────────────────────────────────
    // Cells are a way of *seeding* curtains, not of bounding them. Each cell's curtain is
    // jittered off its cell centre and is usually wider than the cell itself, and every
    // fragment accumulates the three nearest cells — so curtains overlap their neighbours
    // and the cell grid leaves no trace. Clipping each band to its own cell instead put a
    // dark seam on every boundary, at perfectly regular spacing all the way round the oval.
    float auroraX = vMapUv.x * ${BANDS_PER_TILE}.0;
    float auroraCell = floor(auroraX);

    // A dim continuous veil beneath the curtains, so the gaps between them are not empty sky.
    // Deliberately constant in x: anything varying here would reintroduce structure of its own.
    float auroraVeil = 0.13 * (1.0 - smoothstep(0.18, 0.46, auroraAlt));

    // The veil seeds the hue accumulator as a neutral contributor, so bare sky between
    // curtains lands mid-ramp instead of dividing by zero.
    float auroraEnvelope = auroraVeil;
    float auroraHueSum = 0.5 * auroraVeil;
    float auroraHueWeight = auroraVeil;

    for (int auroraI = -1; auroraI <= 1; auroraI++) {
        float auroraN = auroraCell + float(auroraI);

        // Hashes wrap to one full circuit of the oval, so the two sides of the phi = 0 seam
        // (where the geometry's duplicated pair carries u = TEXTURE_REPEAT against u = 0)
        // draw the same curtain. The centre below is left unwrapped, so it stays put.
        float auroraId = mod(auroraN, ${(TEXTURE_REPEAT * BANDS_PER_TILE).toFixed(1)});

        float auroraHHeight = auroraHash(auroraId, 0.0);
        float auroraHBright = auroraHash(auroraId, 1.0);
        float auroraHWidth = auroraHash(auroraId, 2.0);
        float auroraHPhase = auroraHash(auroraId, 3.0);
        float auroraHHue = auroraHash(auroraId, 4.0);
        float auroraHJitter = auroraHash(auroraId, 5.0);
        float auroraHRate = auroraHash(auroraId, 6.0);

        // Spread around the mean so the average curtain still fills the ribbon it used to.
        float auroraHeight = ${BAND_HEIGHT_MEAN.toFixed(4)} * (0.55 + 0.9 * auroraHHeight);
        float auroraBright = 0.45 + 0.85 * auroraHBright;

        #ifdef AURORA_DYNAMIC
            // Two terms at incommensurate rates, so neighbouring bands drift out of step and
            // the pattern never settles into something visibly periodic.
            float auroraPhase = auroraHPhase * 6.2831853;
            float auroraRate = 0.18 + 0.42 * auroraHRate;
            auroraHeight *= 1.0
                + 0.38 * sin(uTime * auroraRate + auroraPhase)
                + 0.12 * sin(uTime * auroraRate * 2.7 + auroraPhase * 3.1);
            auroraBright *= 1.0 + 0.45 * sin(uTime * auroraRate * 1.6 + auroraPhase * 1.7);
        #endif

        auroraHeight = clamp(auroraHeight, 0.12, 1.0);
        auroraBright = max(auroraBright, 0.0);

        // Half-width in cell units, always past 0.5 so every curtain spills into its
        // neighbours — that overlap is what dissolves the grid.
        float auroraHalf = 0.55 + 0.75 * auroraHWidth;

        // The jitter spans a full cell. That matters more than it looks: at any smaller
        // amplitude the centres stay clustered around the cell midpoints, coverage sags at
        // the boundaries, and a regular dark seam survives the overlap. At 1.0 the centres
        // are uniform across the cell and the periodic dip measures a few tenths of a percent.
        float auroraCentre = auroraN + 0.5 + (auroraHJitter - 0.5);
        float auroraD = (auroraX - auroraCentre) / auroraHalf;

        // Squared so the shoulders meet zero with zero slope — a linear falloff would leave a
        // faint crease wherever one curtain's edge lands.
        float auroraProfile = max(0.0, 1.0 - auroraD * auroraD);
        auroraProfile *= auroraProfile;

        // Clip the curtain at its own height, with a fade proportional to that height so
        // short ones do not end in a hard line.
        float auroraFade = 0.18 * auroraHeight + 0.06;
        float auroraMask = 1.0 - smoothstep(auroraHeight - auroraFade, auroraHeight, auroraAlt);

        float auroraContrib = auroraProfile * auroraBright * auroraMask;
        auroraEnvelope += ${BAND_GAIN.toFixed(2)} * auroraContrib;
        auroraHueSum += auroraHHue * auroraContrib;
        auroraHueWeight += auroraContrib;
    }

    // ── Arc modulation ───────────────────────────────────────────────────────────────
    // Bright and dim arcs around the oval rather than an even glow. vMapUv.x spans whole
    // turns across the seam, so integer harmonics of it stay continuous there.
    float auroraArcU = vMapUv.x * 6.2831853;
    float auroraArcPhase = uSeed;
    #ifdef AURORA_DYNAMIC
        // Drifting, so the arcs migrate around the oval instead of sitting at fixed longitudes.
        auroraArcPhase += uTime * 0.07;
    #endif
    float auroraArc = 0.55
        + 0.3 * sin(auroraArcU + auroraArcPhase)
        + 0.15 * sin(3.0 * auroraArcU + auroraArcPhase * 2.3);
    auroraArc = clamp(auroraArc, 0.0, 1.0);

    // ── Colour ───────────────────────────────────────────────────────────────────────
    // Sampling the ramp slightly off per curtain spreads the hue between neighbours, so the
    // oval is not one uniform green. Weighting by each curtain's contribution means the hue
    // crossfades through the overlap rather than switching at a cell boundary.
    float auroraHueMix = auroraHueSum / max(auroraHueWeight, 0.0001);
    float auroraRampAlt = clamp(auroraAlt + (auroraHueMix - 0.5) * 0.12, 0.0, 1.0);
    vec3 auroraEmission = auroraRamp(auroraRampAlt);

    // Fade out at both extremes: the very top thins into vacuum, the base into the horizon.
    float auroraEdge = smoothstep(0.0, 0.06, auroraAlt) * (1.0 - smoothstep(0.9, 1.0, auroraAlt));

    diffuseColor.rgb *= auroraEmission;
    diffuseColor.a *= auroraEnvelope * auroraArc * auroraEdge;
`;

/** Attaches the band shader to a curtain material, driven by the caller-owned uniforms. */
function applyBandShader(mat: THREE.MeshBasicMaterial, uniforms: AuroraUniforms): void {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.uniforms.uSeed = uniforms.uSeed;
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', `${AURORA_PARS_CHUNK}\nvoid main() {`)
            .replace('#include <map_fragment>', `#include <map_fragment>\n${AURORA_FRAGMENT_CHUNK}`);
    };
}

/** One term of the harmonic sum that warps an oval away from a perfect circle. */
type Harmonic = {
    harmonic: number;
    amplitude: number;
    /** Advanced every frame by `drift`, which sends the fold travelling around the ring. */
    phase: number;
    /** Radians per simulation second, signed so different terms travel opposite ways. */
    drift: number;
};

/**
 * The animated state of one auroral oval.
 *
 * Vertex positions are a pure function of this, so each frame re-evaluates the ribbon in
 * place rather than rebuilding it — see `writeRibbonPositions`.
 */
type RibbonShape = {
    radius: number;
    baseRadius: number;
    colatitudeRad: number;
    curtainHeight: number;
    hemisphere: 1 | -1;
    warp: Harmonic[];
    heightWobble: Harmonic[];
    /** Drives the slow substorm breathing that expands and contracts the whole oval. */
    breathPhase: number;
    breathRate: number;
};

/** Draws the seeded harmonics that give one oval both its shape and its motion. */
function createRibbonShape(
    radius: number,
    colatitudeRad: number,
    curtainHeight: number,
    hemisphere: 1 | -1,
    rng: SeededRandom
): RibbonShape {
    // Integer harmonic numbers keep the wobble continuous across the phi = 0 seam. Drift
    // signs are mixed so the terms interfere rather than rotating the oval rigidly — that
    // interference is what makes the motion read as writhing instead of spinning.
    const harmonic = (n: number, minAmp: number, maxAmp: number): Harmonic => ({
        harmonic: n,
        amplitude: rng.range(minAmp, maxAmp),
        phase: rng.range(0, Math.PI * 2),
        drift: rng.range(WARP_DRIFT_MIN, WARP_DRIFT_MAX) * (rng.chance(0.5) ? 1 : -1),
    });

    return {
        radius,
        baseRadius: radius * BASE_ALTITUDE,
        colatitudeRad,
        curtainHeight,
        hemisphere,
        warp: [2, 3, 5].map((n) => harmonic(n, 0.04, 0.12)),
        heightWobble: [2, 4, 7].map((n) => harmonic(n, 0.1, 0.3)),
        breathPhase: rng.range(0, Math.PI * 2),
        breathRate: rng.range(BREATH_RATE_MIN, BREATH_RATE_MAX),
    };
}

/** Advances an oval's fold phases and its breathing. `dt` is already clamped by the caller. */
function advanceRibbonShape(shape: RibbonShape, dt: number): void {
    for (const w of shape.warp) w.phase += w.drift * dt;
    for (const w of shape.heightWobble) w.phase += w.drift * dt;
    shape.breathPhase += shape.breathRate * dt;
}

/**
 * Evaluates the oval into an existing position buffer.
 *
 * Writes `(RING_SEGMENTS + 1) * 2` vertices — a base/top pair per segment, plus one extra
 * pair closing the ring (see `buildRibbonGeometry`).
 */
function writeRibbonPositions(positions: Float32Array, shape: RibbonShape): void {
    const { radius, baseRadius, hemisphere, warp, heightWobble } = shape;

    // A real substorm pushes the oval equatorward and drives the curtains higher at the same
    // time, so both scale together off the one breathing term.
    const breath = Math.sin(shape.breathPhase);
    const colatitudeRad = shape.colatitudeRad * (1 + BREATH_AMOUNT * breath);
    const curtainHeight = shape.curtainHeight * (1 + BREATH_AMOUNT * 1.5 * breath);

    for (let i = 0; i <= RING_SEGMENTS; i++) {
        const phi = (i / RING_SEGMENTS) * Math.PI * 2;

        let warpSum = 0;
        for (const w of warp) warpSum += w.amplitude * Math.sin(w.harmonic * phi + w.phase);
        const theta = colatitudeRad * (1 + warpSum);

        let wobbleSum = 0;
        for (const w of heightWobble) {
            wobbleSum += w.amplitude * Math.sin(w.harmonic * phi + w.phase);
        }
        const height = curtainHeight * (0.6 + 0.4 * (0.5 + 0.5 * wobbleSum));

        // The top edge leans poleward, mimicking magnetic field lines converging on the pole.
        const thetaTop = Math.max(0, theta - (height / radius) * 0.35);

        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);

        const p = i * 2 * 3;
        positions[p] = Math.sin(theta) * cosPhi * baseRadius;
        positions[p + 1] = hemisphere * Math.cos(theta) * baseRadius;
        positions[p + 2] = Math.sin(theta) * sinPhi * baseRadius;

        const topRadius = baseRadius + height;
        positions[p + 3] = Math.sin(thetaTop) * cosPhi * topRadius;
        positions[p + 4] = hemisphere * Math.cos(thetaTop) * topRadius;
        positions[p + 5] = Math.sin(thetaTop) * sinPhi * topRadius;
    }
}

/**
 * Builds one auroral oval as a closed ribbon of quads around the magnetic pole.
 *
 * Geometry is generated in a frame where the magnetic axis is +Y; the caller rotates the
 * containing group onto the real axis. `shape.hemisphere` is +1 for the northern oval and
 * -1 for the southern one, which mirrors the band through the equatorial plane.
 *
 * Returns the position buffer and its attribute alongside the geometry, so the caller can
 * keep re-evaluating the ribbon in place as the shape animates.
 */
function buildRibbonGeometry(shape: RibbonShape): {
    geo: THREE.BufferGeometry;
    positions: Float32Array;
    positionAttr: THREE.BufferAttribute;
} {
    // One extra vertex pair closes the ring. It sits exactly on top of the first pair —
    // phi = 2pi and the integer warp harmonics both repeat — but carries u = TEXTURE_REPEAT
    // instead of u = 0. Wrapping the last quad back onto vertex 0 instead would run the
    // texture backwards across the entire seam segment, leaving a smeared vertical band.
    const vertexPairs = RING_SEGMENTS + 1;
    const positions = new Float32Array(vertexPairs * 2 * 3);
    const uvs = new Float32Array(vertexPairs * 2 * 2);
    const indices: number[] = [];

    for (let i = 0; i < vertexPairs; i++) {
        const baseIdx = i * 2;
        const u = (i / RING_SEGMENTS) * TEXTURE_REPEAT;
        const t = baseIdx * 2;
        uvs[t] = u;
        uvs[t + 1] = 0;
        uvs[t + 2] = u;
        uvs[t + 3] = 1;

        // The duplicated seam pair is a vertex target only — it starts no quad of its own.
        if (i < RING_SEGMENTS) {
            const nextBase = (i + 1) * 2;
            indices.push(baseIdx, baseIdx + 1, nextBase + 1);
            indices.push(baseIdx, nextBase + 1, nextBase);
        }
    }

    writeRibbonPositions(positions, shape);

    const geo = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(positions, 3);
    positionAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', positionAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    // Fixed rather than recomputed per frame: every vertex lies between the body centre and
    // `baseRadius + curtainHeight`, whatever the folds and breathing are doing, so an
    // origin-centred sphere at that outer limit always contains the ribbon.
    geo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 0, 0),
        shape.baseRadius + shape.curtainHeight * (1 + BREATH_AMOUNT * 1.5) * 1.05
    );

    return { geo, positions, positionAttr };
}

/**
 * Aurora curtains ringing a body's magnetic poles.
 *
 * Rendered as texture-mapped ribbon meshes rather than particles: each oval is a closed
 * band of quads wrapped around the magnetic pole, carrying a procedurally drawn curtain
 * texture that scrolls to give the drifting shimmer. Two concentric layers per pole drift
 * in opposite directions, which reads as depth.
 *
 * The texture supplies only the fine ray detail. Each curtain's height, brightness and
 * emission colour are decided per-pixel in the fragment shader, so neighbouring bands differ
 * from one another — and, at the `dynamic` detail setting, flare and fade independently over
 * time. See `AURORA_FRAGMENT_CHUNK`.
 *
 * The group is added as a child of `parent` (the body mesh), so it inherits axial tilt and
 * spin automatically. That is also physically right: the auroral oval is fixed in magnetic
 * coordinates and turns with the body.
 *
 * Brightness, curtain height, and how tightly the oval hugs the pole all come from the
 * body's real dipole data — see `IMagneticFieldOptions`.
 *
 * @param radius Host body radius, in the same units as the body mesh.
 * @param field The body's dipole; `strength` (gauss) drives intensity, `tilt`/`azimuth` the axis.
 * @param seed Deterministic seed string for the curtain texture and oval warp.
 * @param parent Object3D to attach to — the body mesh.
 */
export function createAurora(
    radius: number,
    field: IMagneticFieldOptions,
    seed: string,
    parent: THREE.Object3D
): AuroraHandle {
    const rng = new SeededRandom(`${seed}|aurora`);

    // Log-scale the strength: the real spread (Mercury 0.003 G to Jupiter 4.17 G) is so wide
    // that a linear map would leave everything but the gas giants invisible.
    const strength = Number.isFinite(field.strength)
        ? Math.max(field.strength, MIN_GAUSS)
        : MIN_GAUSS;
    const intensity = clamp01(
        (Math.log(strength) - Math.log(MIN_GAUSS)) / (Math.log(MAX_GAUSS) - Math.log(MIN_GAUSS))
    );

    const baseColatitude = THREE.MathUtils.degToRad(
        lerp(OVAL_COLATITUDE_WEAK, OVAL_COLATITUDE_STRONG, intensity)
    );
    // The envelope factor gives the shader's tallest bands somewhere to reach; the shader's
    // mean band height is its reciprocal, so the typical curtain keeps the silhouette it had
    // before band heights became a per-pixel decision.
    const baseHeight =
        radius * lerp(CURTAIN_HEIGHT_WEAK, CURTAIN_HEIGHT_STRONG, intensity) * BAND_HEIGHT_ENVELOPE;
    const baseOpacity = lerp(OPACITY_WEAK, OPACITY_STRONG, intensity);

    // A displaced dipole sits closer to one pole, so that hemisphere gets a tighter, brighter
    // oval and the far one a wider, dimmer one — the asymmetry Neptune shows at offset ≈0.55.
    // `reversed` flips which hemisphere the dipole moment points toward.
    const offset = clamp01(field.offset ?? 0);
    const nearHemisphere: 1 | -1 = field.reversed ? -1 : 1;

    const group = new THREE.Group();

    // Hue jitter so same-strength bodies aren't visually identical, matching the
    // atmosphere-tint idiom in the planet factory.
    const tint = new THREE.Color(0xffffff);
    tint.offsetHSL((rng.next() - 0.5) * 0.06, 0, 0);

    const canvas = drawCurtainTexture(rng);
    // One CanvasTexture, cloned per layer: clones share `.source`, so this is a single GPU
    // upload, but each clone carries its own `offset` and can scroll independently.
    const baseTexture = new THREE.CanvasTexture(canvas);
    baseTexture.wrapS = THREE.RepeatWrapping;
    baseTexture.wrapT = THREE.ClampToEdgeWrapping;
    baseTexture.needsUpdate = true;

    type Ribbon = {
        geo: THREE.BufferGeometry;
        mat: THREE.MeshBasicMaterial;
        tex: THREE.Texture;
        /** Drives the per-band shader animation; `uTime` is advanced every frame. */
        uniforms: AuroraUniforms;
        /** Animated shape state, re-evaluated into `positions` every frame. */
        shape: RibbonShape;
        positions: Float32Array;
        positionAttr: THREE.BufferAttribute;
        /** Texture scroll rate, distinct from the fold drift inside `shape`. */
        scrollRate: number;
        baseOpacity: number;
        pulsePhase: number;
        pulseRate: number;
    };
    const ribbons: Ribbon[] = [];

    // Read once at build time and then edge-detected in `update()`, so switching detail
    // recompiles the four materials in place rather than rebuilding the whole effect.
    let detail: AuroraDetailMode = settingsStore.settings.auroraDetail;

    for (const hemisphere of [1, -1] as const) {
        const isNear = hemisphere === nearHemisphere;
        const colatitudeScale = isNear ? 1 - offset * 0.6 : 1 + offset * 0.6;
        const opacityScale = Math.min(isNear ? 1 + offset * 0.8 : 1 - offset * 0.8, 1.4);

        for (const layer of LAYERS) {
            const colatitude = baseColatitude * colatitudeScale * layer.colatitudeMult;
            const shape = createRibbonShape(radius, colatitude, baseHeight, hemisphere, rng);
            const { geo, positions, positionAttr } = buildRibbonGeometry(shape);

            const tex = baseTexture.clone();
            tex.needsUpdate = true;

            const opacity = clamp01(baseOpacity * opacityScale * layer.opacityMult);
            const mat = new THREE.MeshBasicMaterial({
                map: tex,
                color: tint,
                transparent: true,
                blending: THREE.AdditiveBlending,
                opacity,
                depthWrite: false,
                depthTest: true,
                side: THREE.DoubleSide,
            });

            // The seed is distinct per ribbon so the four of them (two poles x two layers)
            // don't share a band pattern, but drawn from the seeded stream so the whole
            // effect stays deterministic for a given body seed.
            const uniforms: AuroraUniforms = {
                uTime: { value: 0 },
                uSeed: { value: rng.range(0, 100) },
            };
            applyBandShader(mat, uniforms);
            if (detail === 'dynamic') mat.defines = { AURORA_DYNAMIC: '' };

            const mesh = new THREE.Mesh(geo, mat);
            // Above the cloud layer (2) and atmosphere shell (1).
            mesh.renderOrder = 3;
            group.add(mesh);

            ribbons.push({
                geo,
                mat,
                tex,
                uniforms,
                shape,
                positions,
                positionAttr,
                scrollRate: layer.drift,
                baseOpacity: opacity,
                pulsePhase: rng.range(0, Math.PI * 2),
                pulseRate: rng.range(0.15, 0.35),
            });
        }
    }

    // `setRotation` bakes axial tilt into the body mesh's quaternion and leaves `rotationAxis`
    // as the mesh-local +Y, so the local rotation axis to tilt away from is always +Y here.
    const magneticAxis = computeMagneticAxis(new THREE.Vector3(0, 1, 0), field);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), magneticAxis);

    parent.add(group);

    // Remembered so setRadius can rescale rather than rebuild every ribbon.
    const builtRadius = radius;
    let elapsed = 0;

    return {
        dispose: () => {
            if (group.parent) group.parent.remove(group);
            for (const r of ribbons) {
                r.geo.dispose();
                r.mat.dispose();
                r.tex.dispose();
            }
            baseTexture.dispose();
        },

        update: (dtTotal: number) => {
            if (!settingsStore.settings.auroraEnabled) {
                group.visible = false;
                return;
            }
            group.visible = true;

            // Detail is polled rather than pushed — the same contract every other setting in
            // this project uses. Swapping the define and flagging the material is enough to
            // get a recompile; the geometry, textures and uniforms all survive untouched, so
            // the switch costs one frame of shader compilation and nothing else.
            const wanted = settingsStore.settings.auroraDetail;
            if (wanted !== detail) {
                detail = wanted;
                for (const r of ribbons) {
                    r.mat.defines = detail === 'dynamic' ? { AURORA_DYNAMIC: '' } : {};
                    r.mat.needsUpdate = true;
                }
            }

            // Clamped so the curtains keep a steady wall-clock pace however fast the
            // simulation is running, but still signed, so reversing time reverses the motion.
            // Zero means the sim is paused, and the aurora holds its pose with it.
            const dt = Math.sign(dtTotal) * Math.min(Math.abs(dtTotal), MAX_ANIM_DELTA);
            if (dt === 0) return;

            elapsed += dt;
            for (const r of ribbons) {
                r.tex.offset.x += r.scrollRate * dt;
                r.mat.opacity =
                    r.baseOpacity * (0.75 + 0.25 * Math.sin(elapsed * r.pulseRate + r.pulsePhase));

                // Drives the band breathing and the arc drift. Unreferenced by the static
                // shader variant, but kept advancing so switching back to dynamic resumes
                // from where the curtain would have been rather than snapping to t = 0.
                r.uniforms.uTime.value = elapsed;

                // Re-evaluate the oval in place: the folds travel around the ring and the
                // whole band slowly breathes wider and narrower.
                advanceRibbonShape(r.shape, dt);
                writeRibbonPositions(r.positions, r.shape);
                r.positionAttr.needsUpdate = true;
            }
        },

        setVisible: (visible: boolean) => {
            group.visible = visible;
        },

        setRadius: (newRadius: number) => {
            if (!Number.isFinite(newRadius) || newRadius <= 0 || builtRadius <= 0) return;
            group.scale.setScalar(newRadius / builtRadius);
        },
    };
}
