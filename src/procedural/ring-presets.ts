/**
 * ring-presets.ts
 *
 * Hand-tuned ring systems for the real giant planets.
 *
 * Radii are the real ring edges divided by the simulator's body radius (`SATURN_RADIUS` etc.,
 * which is the mean radius rather than the equatorial one), so the rings land where the real
 * ones do relative to the rendered planet. Band fractions run 0–1 across [innerRatio, outerRatio].
 * The colours and densities are artistic approximations of the real structure.
 */
import type { IRingSpec } from '../interfaces';

/** Saturn: C ring, the B ring (brighter toward its outer edge), Cassini Division, A ring, F ring. */
export const SATURN_RING_SPEC: IRingSpec = {
    innerRatio: 1.28,
    outerRatio: 2.42,
    seed: 'saturn-rings',
    bands: [
        { start: 0.0, end: 0.26, color: 0x6b5f52, opacity: 0.3 },
        { start: 0.26, end: 0.45, color: 0xb89f78, opacity: 0.85 },
        { start: 0.45, end: 0.647, color: 0xe0cda6, opacity: 0.95 },
        { start: 0.647, end: 0.716, color: 0x3a332b, opacity: 0.04 },
        { start: 0.716, end: 0.936, color: 0xc2ae88, opacity: 0.7 },
        { start: 0.936, end: 0.972, color: 0x3a332b, opacity: 0.02 },
        { start: 0.972, end: 1.0, color: 0xb8a888, opacity: 0.35 },
    ],
};

/** Jupiter: a diffuse inner halo, the narrow main ring, then the very faint gossamer rings. */
export const JUPITER_RING_SPEC: IRingSpec = {
    innerRatio: 1.32,
    outerRatio: 2.6,
    seed: 'jupiter-rings',
    bands: [
        { start: 0.0, end: 0.336, color: 0x7a6a5a, opacity: 0.06 },
        { start: 0.336, end: 0.414, color: 0x8a7a6a, opacity: 0.3 },
        { start: 0.414, end: 1.0, color: 0x6e6254, opacity: 0.04 },
    ],
};

/** Uranus: a faint dusty background crossed by several narrow dark rings and the bright epsilon ring. */
export const URANUS_RING_SPEC: IRingSpec = {
    innerRatio: 1.63,
    outerRatio: 2.05,
    seed: 'uranus-rings',
    bands: [
        { start: 0.0, end: 0.04, color: 0x6a6a6a, opacity: 0.35 },
        { start: 0.04, end: 0.15, color: 0x555555, opacity: 0.05 },
        { start: 0.15, end: 0.17, color: 0x6a6a6a, opacity: 0.35 },
        { start: 0.17, end: 0.3, color: 0x555555, opacity: 0.05 },
        { start: 0.3, end: 0.32, color: 0x6a6a6a, opacity: 0.35 },
        { start: 0.32, end: 0.45, color: 0x555555, opacity: 0.05 },
        { start: 0.45, end: 0.47, color: 0x6a6a6a, opacity: 0.35 },
        { start: 0.47, end: 0.6, color: 0x555555, opacity: 0.05 },
        { start: 0.6, end: 0.62, color: 0x6a6a6a, opacity: 0.35 },
        { start: 0.62, end: 0.96, color: 0x555555, opacity: 0.05 },
        { start: 0.96, end: 1.0, color: 0x7a7a7a, opacity: 0.6 },
    ],
};

/** Neptune: the faint Galle ring, the Le Verrier ring, and the outermost Adams ring. */
export const NEPTUNE_RING_SPEC: IRingSpec = {
    innerRatio: 1.7,
    outerRatio: 2.58,
    seed: 'neptune-rings',
    bands: [
        { start: 0.0, end: 0.05, color: 0x7f8a9a, opacity: 0.08 },
        { start: 0.05, end: 0.51, color: 0x6a7482, opacity: 0.02 },
        { start: 0.51, end: 0.54, color: 0x7f8a9a, opacity: 0.3 },
        { start: 0.54, end: 0.975, color: 0x6a7482, opacity: 0.02 },
        { start: 0.975, end: 1.0, color: 0x8a94a4, opacity: 0.4 },
    ],
};
