import * as THREE from 'three';

import { deriveSeed, generateSeedString } from '../../procedural/seed-utils';
import { SeededRandom } from '../../utilities/prng';

/**
 * Procedural geometry for a lightning bolt: a straight axis from muzzle to tip, with the drawn
 * line displaced sideways around it in three dimensions.
 *
 * This module knows nothing about scenes, materials or damage — it only fills a Float32Array with
 * vertex positions. That keeps the shape logic readable on its own terms, and means a bug in the
 * jitter cannot reach the weapon's hitscan.
 *
 * The randomness is split in two so a held beam can both keep an identity and crackle:
 *
 *   - **macro** — three low harmonics, re-rolled once per shot. This is the bolt's character.
 *   - **micro** — three higher harmonics plus per-vertex white noise, re-rolled at the crackle
 *     rate. This is the electricity crawling along it.
 *
 * Both draw from their own {@link SeededRandom} stream, derived from the shot's seed, so the same
 * seed always produces the same bolt.
 */

/**
 * Reference point count the noise amplitude is tuned against (see `build`). Also the weapon's
 * default minimum point count.
 */
export const LIGHTNING_SEGMENTS = 10;

/** Low harmonics that give a bolt its overall wander. */
const MACRO_OCTAVES = 3;
/** High harmonics plus white noise that give it its sharp corners. */
const MICRO_OCTAVES = 3;

/**
 * Harmonic number ranges for the macro octaves. Integers on purpose: `sin(2πk·s)` is exactly zero
 * at both s=0 and s=1, so every octave is already pinned to the muzzle and the tip before the
 * envelope is applied.
 */
const MACRO_HARMONIC_RANGES: readonly (readonly [number, number])[] = [
    [2, 5],
    [6, 12],
    [13, 24],
];
const MICRO_HARMONIC_RANGES: readonly (readonly [number, number])[] = [
    [26, 44],
    [46, 78],
    [80, 130],
];

/** Amplitude weight of each octave, index-aligned with the harmonic ranges above. */
const MACRO_WEIGHTS = [1, 0.55, 0.3];
const MICRO_WEIGHTS = [0.55, 0.35, 0.22];

/**
 * How much of the total displacement the per-vertex white noise contributes. High enough that the
 * line reads as electricity rather than a smooth wave, low enough that the octaves still give it
 * a recognisable shape.
 */
const NOISE_WEIGHT = 0.85;

/**
 * Sum of every displacement contributor's weight. Each octave and the noise can reach its own
 * weight, so dividing by this total normalises the whole field to a peak of 1 — which is what
 * lets `wobbleFraction` be an honest bound instead of an arbitrary scale factor whose real
 * amplitude depends on how many octaves happen to be configured.
 */
const TOTAL_WEIGHT =
    MACRO_WEIGHTS.reduce((sum, weight) => sum + weight, 0) +
    MICRO_WEIGHTS.reduce((sum, weight) => sum + weight, 0) +
    NOISE_WEIGHT;

/** Scales the raw summed displacement so its peak magnitude is exactly 1. */
const DISPLACEMENT_NORM = 1 / TOTAL_WEIGHT;

/**
 * Shape of the displacement envelope along the bolt. `sin(πs)` is zero at both ends; the exponent
 * below 1 makes it rise quickly, so the jaggedness covers most of the length instead of
 * collapsing into a smooth taper near the muzzle.
 */
const ENVELOPE_EXPONENT = 0.6;

/** One set of harmonics: frequencies in cycles across the bolt, phases, and signed amplitudes. */
interface IOctaveSet {
    /** Cycles of the sine across the full beam length, per octave. */
    cycles: Float64Array;
    /** Phase offset per octave, radians. */
    phase: Float64Array;
    /** Signed amplitude weight per octave. */
    amplitude: Float64Array;
}

function createOctaveSet(count: number): IOctaveSet {
    return {
        cycles: new Float64Array(count),
        phase: new Float64Array(count),
        amplitude: new Float64Array(count),
    };
}

/** Roll a fresh set of harmonics from `rng`. */
function rollOctaves(
    out: IOctaveSet,
    ranges: readonly (readonly [number, number])[],
    weights: readonly number[],
    rng: SeededRandom
): void {
    for (let i = 0; i < ranges.length; i++) {
        const [min, max] = ranges[i];
        out.cycles[i] = rng.rangeInt(min, max);
        out.phase[i] = rng.range(0, Math.PI * 2);
        // Sign is random so an octave can push either way; this is what stops the bolt having a
        // consistent bias to one side of its axis.
        out.amplitude[i] = weights[i] * (rng.chance(0.5) ? -1 : 1);
    }
}

/** Every octave, macro then micro, as flat arrays the build loop can walk without branching. */
const TOTAL_OCTAVES = MACRO_OCTAVES + MICRO_OCTAVES;

/**
 * The shape of one bolt. Owned by a single weapon instance and reused every frame; nothing here
 * allocates once the seed has been rolled.
 */
export class LightningShape {
    /** Scratch for the point list, before it is expanded into segment pairs. */
    private readonly points: Float32Array;

    /** Per-vertex white noise, two components per point (one per perpendicular axis). */
    private readonly noise: Float32Array;

    private readonly macro: IOctaveSet;
    private readonly micro: IOctaveSet;

    /**
     * Independent streams, so re-rolling the crackle never disturbs the macro identity. Both are
     * plain {@link SeededRandom} sequences that simply advance — a re-roll is just the next draw,
     * not a fresh generator.
     */
    private macroRng: SeededRandom;
    private microRng: SeededRandom;

    /** Perpendicular basis the displacement is expressed in, refreshed per frame. */
    private readonly axisU = new THREE.Vector3();
    private readonly axisV = new THREE.Vector3();

    /**
     * Per-octave phasor scratch for {@link build}: the current `(cos, sin)` of each octave's angle
     * and the fixed rotation that advances it by one point. Stepping a phasor replaces a `sin` and
     * a `cos` per octave per point with four multiplies.
     */
    private readonly phCos = new Float64Array(TOTAL_OCTAVES);
    private readonly phSin = new Float64Array(TOTAL_OCTAVES);
    private readonly stepCos = new Float64Array(TOTAL_OCTAVES);
    private readonly stepSin = new Float64Array(TOTAL_OCTAVES);
    private readonly octAmp = new Float64Array(TOTAL_OCTAVES);

    /**
     * Points the last {@link build} used. The crackle only re-rolls noise for this many points —
     * a bolt drawn with 40 points doesn't need 1,000 fresh random pairs 20 times a second.
     */
    private lastCount: number;

    /**
     * @param maxSegments Most points {@link build} will ever be asked for, including both
     *   endpoints. Every buffer is sized for this once; a frame may use fewer.
     * @param seed Seed for this bolt; {@link rerollMacro} can replace it.
     */
    constructor(
        readonly maxSegments: number = LIGHTNING_SEGMENTS,
        seed: string = generateSeedString()
    ) {
        if (maxSegments < 2) throw new Error('LightningShape needs at least two points');

        this.points = new Float32Array(maxSegments * 3);
        this.noise = new Float32Array(maxSegments * 2);
        // Fill every slot once, so a bolt that later grows past `lastCount` still has noise.
        this.lastCount = maxSegments;
        this.macro = createOctaveSet(MACRO_OCTAVES);
        this.micro = createOctaveSet(MICRO_OCTAVES);

        this.macroRng = new SeededRandom(deriveSeed(seed, 'lightning-macro'));
        this.microRng = new SeededRandom(deriveSeed(seed, 'lightning-micro'));

        this.rollMacro();
        this.rollMicro();
    }

    /**
     * Give the bolt a new overall shape. Call once per trigger pull — a weapon that has been idle
     * fires a visibly different bolt each time.
     * @param seed Fresh seed, or omitted to draw one at random.
     */
    rerollMacro(seed: string = generateSeedString()): void {
        this.macroRng = new SeededRandom(deriveSeed(seed, 'lightning-macro'));
        this.microRng = new SeededRandom(deriveSeed(seed, 'lightning-micro'));
        this.rollMacro();
        this.rollMicro();
    }

    /**
     * Re-roll only the fine detail: the high harmonics and the white noise. The bolt keeps the
     * shape {@link rerollMacro} gave it while the electricity along it crawls.
     */
    rerollMicro(): void {
        this.rollMicro();
    }

    private rollMacro(): void {
        rollOctaves(this.macro, MACRO_HARMONIC_RANGES, MACRO_WEIGHTS, this.macroRng);
    }

    private rollMicro(): void {
        rollOctaves(this.micro, MICRO_HARMONIC_RANGES, MICRO_WEIGHTS, this.microRng);
        const n = this.lastCount * 2;
        for (let i = 0; i < n; i++) {
            this.noise[i] = this.microRng.range(-1, 1);
        }
    }

    /**
     * Floats needed to hold the longest bolt {@link build} can write: two endpoints per segment,
     * three floats each.
     */
    get maxPositionCount(): number {
        return (this.maxSegments - 1) * 6;
    }

    /**
     * Write the bolt as segment endpoints, ready to hand straight to a `LineSegmentsGeometry`.
     *
     * Positions are written **camera-relative** (world position minus `camera`), for the same
     * reason the laser does it: at interplanetary distances a world-space vertex in float32
     * visibly snaps to a lattice, and the camera-relative form keeps the precision local. The
     * caller places the drawn object at the camera's world position.
     *
     * The octaves (the bolt's overall wander) scale with `length` and are capped by `wobbleMax`.
     * The per-point white noise instead scales with the spacing between points and is never
     * capped, so each kink is the same shape whether the bolt is 1 km or 150,000 km long — a
     * long bolt gets more kinks, not flatter ones.
     *
     * @param out Destination array of at least {@link maxPositionCount} floats; the first
     *   `(count - 1) * 6` are overwritten.
     * @param count Points to sample, including both endpoints. Clamped to `[2, maxSegments]`.
     * @param origin World-space muzzle position.
     * @param dir Unit direction from muzzle to tip — the straight axis the bolt is drawn around.
     * @param length World-space length to the current tip (may be shorter than the full range).
     * @param camera Camera world position the output is made relative to.
     * @param wobbleFraction Peak sideways displacement per axis, as a fraction of `length`. The
     *   bolt's total offset from the axis can reach about √2× this where both perpendicular
     *   components peak together, which is rare.
     * @param wobbleMax Hard ceiling on the octave displacement, world units.
     * @returns The number of line segments written (`count - 1` after clamping).
     */
    build(
        out: Float32Array,
        count: number,
        origin: THREE.Vector3,
        dir: THREE.Vector3,
        length: number,
        camera: THREE.Vector3,
        wobbleFraction: number,
        wobbleMax: number
    ): number {
        count = Math.max(2, Math.min(this.maxSegments, Math.floor(count)));
        this.lastCount = count;
        // Normalised so this is really the peak sideways displacement: the raw sums reach
        // TOTAL_WEIGHT, so without the division the bolt wanders several times `wobbleFraction`.
        const amplitude = Math.min(length * wobbleFraction, wobbleMax) * DISPLACEMENT_NORM;
        // Noise follows point spacing. At LIGHTNING_SEGMENTS points and no cap this equals
        // `amplitude` exactly, so a short bolt looks the same as it always has.
        const spacing = length / (count - 1);
        const noiseAmplitude =
            spacing * (LIGHTNING_SEGMENTS - 1) * wobbleFraction * DISPLACEMENT_NORM * NOISE_WEIGHT;

        // Perpendicular basis: the displacement happens in the plane these two span, which is what
        // makes the wiggle go in all directions around the axis rather than in one fixed plane.
        this.axisU.set(0, 1, 0);
        if (Math.abs(dir.y) > 0.99) this.axisU.set(1, 0, 0);
        this.axisU.crossVectors(dir, this.axisU);
        if (this.axisU.lengthSq() < 1e-12) this.axisU.set(1, 0, 0);
        this.axisU.normalize();
        this.axisV.crossVectors(dir, this.axisU).normalize();

        const { points, noise, axisU, axisV, phCos, phSin, stepCos, stepSin, octAmp } = this;
        const invLast = 1 / (count - 1);
        // Camera-relative origin, so only the per-point offsets are added in the loop.
        const camRelOX = origin.x - camera.x;
        const camRelOY = origin.y - camera.y;
        const camRelOZ = origin.z - camera.z;

        // Seed each octave's phasor at s = 0 and its per-point rotation. The two perpendicular
        // axes take the sine and the cosine of the same octave, so each traces an ellipse around
        // the beam axis instead of a flat zig-zag in one plane.
        for (let k = 0; k < TOTAL_OCTAVES; k++) {
            const set = k < MACRO_OCTAVES ? this.macro : this.micro;
            const j = k < MACRO_OCTAVES ? k : k - MACRO_OCTAVES;
            const step = set.cycles[j] * Math.PI * 2 * invLast;
            phCos[k] = Math.cos(set.phase[j]);
            phSin[k] = Math.sin(set.phase[j]);
            stepCos[k] = Math.cos(step);
            stepSin[k] = Math.sin(step);
            octAmp[k] = set.amplitude[j] * amplitude;
        }

        // Envelope sin(πs), stepped the same way. Pinned at both ends: the bolt must stay welded
        // to the muzzle and to the tip, which is where the impact flash is drawn.
        const envStep = Math.PI * invLast;
        const envStepCos = Math.cos(envStep);
        const envStepSin = Math.sin(envStep);
        let envCos = 1;
        let envSin = 0;

        for (let i = 0; i < count; i++) {
            const s = i * invLast;
            const envelope = envSin > 0 ? Math.pow(envSin, ENVELOPE_EXPONENT) : 0;

            // Signed world-unit offsets along the two perpendicular axes: the length-scaled
            // octaves plus the spacing-scaled noise.
            let offsetU = noise[i * 2] * noiseAmplitude;
            let offsetV = noise[i * 2 + 1] * noiseAmplitude;
            for (let k = 0; k < TOTAL_OCTAVES; k++) {
                const c = phCos[k];
                const sn = phSin[k];
                offsetU += octAmp[k] * sn;
                offsetV += octAmp[k] * c;
                phCos[k] = c * stepCos[k] - sn * stepSin[k];
                phSin[k] = sn * stepCos[k] + c * stepSin[k];
            }

            const dispU = (axisU.x * offsetU + axisV.x * offsetV) * envelope;
            const dispV = (axisU.y * offsetU + axisV.y * offsetV) * envelope;
            const dispW = (axisU.z * offsetU + axisV.z * offsetV) * envelope;

            points[i * 3] = camRelOX + dir.x * length * s + dispU;
            points[i * 3 + 1] = camRelOY + dir.y * length * s + dispV;
            points[i * 3 + 2] = camRelOZ + dir.z * length * s + dispW;

            const ec = envCos;
            envCos = ec * envStepCos - envSin * envStepSin;
            envSin = envSin * envStepCos + ec * envStepSin;
        }

        // Expand the point list into the endpoint-pair layout LineSegmentsGeometry expects:
        // [p0,p1, p1,p2, p2,p3, ...].
        let o = 0;
        for (let i = 0; i < count - 1; i++) {
            const a = i * 3;
            const b = (i + 1) * 3;
            out[o++] = points[a];
            out[o++] = points[a + 1];
            out[o++] = points[a + 2];
            out[o++] = points[b];
            out[o++] = points[b + 1];
            out[o++] = points[b + 2];
        }
        return count - 1;
    }
}
