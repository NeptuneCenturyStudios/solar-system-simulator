/**
 * ring-generator.ts
 *
 * Procedural roll for a planet's ring system.
 *
 * Produces data for `IRingSpec` and renders nothing — `effects/planet-rings.ts` turns the
 * spec into geometry and texture. Takes an RNG rather than a seed string, like
 * `rollMagneticField`, so seeded factories and any unseeded caller share one implementation.
 */
import * as THREE from 'three';
import type { IRingBand, IRingSpec } from '../interfaces';
import { SeededRandom } from '../utilities/prng';

/** The body classes that roll for rings, each with its own extent, density and palette. */
export type RingKind = 'gasGiant' | 'iceGiant' | 'solid' | 'dwarf';

type RingKindProfile = {
    /** Inner edge range, in body radii. */
    inner: [min: number, max: number];
    /** Width of the ring (outer minus inner), in body radii. */
    width: [min: number, max: number];
    /** Band count range. */
    bandCount: [min: number, max: number];
    /** Band density range. Thin, faint rings sit low; broad bright ones high. */
    opacity: [min: number, max: number];
    /** Base colours; each band is a hue/lightness-jittered pick from these. */
    palette: number[];
};

const ICE_PALETTE = [0xf2f4f8, 0xd9e4ee, 0xbfcfdc, 0xa8b8c8, 0xe8e2d8];
const DUST_PALETTE = [0xc9a97a, 0xa8865a, 0x8c6a48, 0xb8734a, 0x7a6550];
const GAS_PALETTE = [0xe6cc80, 0xd4b574, 0xc2a26a, 0xb89060, 0xeadcb8, 0x9c8468];

const RING_PROFILES: Record<RingKind, RingKindProfile> = {
    gasGiant: {
        inner: [1.25, 1.7],
        width: [0.7, 1.7],
        bandCount: [7, 14],
        opacity: [0.55, 0.95],
        palette: [...GAS_PALETTE, ...ICE_PALETTE],
    },
    iceGiant: {
        inner: [1.4, 1.9],
        width: [0.3, 0.9],
        bandCount: [4, 9],
        opacity: [0.25, 0.65],
        palette: [...ICE_PALETTE, 0x9fb4c6, 0x8fa0b4],
    },
    solid: {
        inner: [1.4, 1.8],
        width: [0.2, 0.6],
        bandCount: [3, 7],
        opacity: [0.2, 0.5],
        palette: [...DUST_PALETTE, 0xb0a898],
    },
    dwarf: {
        inner: [1.4, 1.8],
        width: [0.15, 0.45],
        bandCount: [2, 5],
        opacity: [0.15, 0.4],
        palette: [...DUST_PALETTE, 0xb0a898],
    },
};

/** Probability that any one band (beyond the first and last) is a near-empty gap. */
const GAP_CHANCE = 0.15;
const MAX_GAPS = 2;

/** Nudges a base colour so neighbouring bands of the same palette still differ. */
function jitterColor(base: number, rng: SeededRandom): number {
    const color = new THREE.Color(base);
    color.offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.08, 0.08), rng.range(-0.1, 0.08));
    return color.getHex();
}

/**
 * Splits 0–1 into `count` contiguous bands of uneven width.
 * Squaring the weights exaggerates the spread, so a few broad bands sit among thin ones.
 */
function partition(count: number, rng: SeededRandom): number[] {
    const weights: number[] = [];
    for (let i = 0; i < count; i++) weights.push(0.2 + rng.next() ** 2);
    const total = weights.reduce((sum, w) => sum + w, 0);

    const edges = [0];
    let acc = 0;
    for (const w of weights) {
        acc += w / total;
        edges.push(acc);
    }
    edges[count] = 1; // avoid float drift leaving a sliver at the outer edge
    return edges;
}

/**
 * Rolls a ring system for a planet.
 *
 * Size, band count, palette and density all vary by `kind`; every other detail comes from the
 * passed RNG, so a seeded caller gets the same rings for the same body every time.
 */
export function rollRingSpec(rng: SeededRandom, kind: RingKind): IRingSpec {
    const profile = RING_PROFILES[kind];

    const innerRatio = rng.range(...profile.inner);
    const outerRatio = innerRatio + rng.range(...profile.width);

    const count = rng.rangeInt(...profile.bandCount);
    const edges = partition(count, rng);

    // Only interior bands can be gaps; one at either edge would just read as a thinner ring.
    let gaps = 0;
    const bands: IRingBand[] = [];
    for (let i = 0; i < count; i++) {
        const interior = i > 0 && i < count - 1;
        const isGap = interior && gaps < MAX_GAPS && rng.chance(GAP_CHANCE);
        if (isGap) gaps++;

        bands.push({
            start: edges[i],
            end: edges[i + 1],
            color: jitterColor(rng.pick(profile.palette) ?? 0xffffff, rng),
            opacity: isGap ? rng.range(0.02, 0.08) : rng.range(...profile.opacity),
        });
    }

    // Real rings have a dense core (Saturn's B ring); promote one solid band to the densest.
    const solid = bands.filter((b) => b.opacity > 0.1);
    if (solid.length > 0) {
        const core = solid[rng.rangeInt(0, solid.length - 1)];
        core.opacity = Math.min(1, profile.opacity[1] * 1.05);
    }

    return { innerRatio, outerRatio, bands, seed: `${rng.next()}` };
}
