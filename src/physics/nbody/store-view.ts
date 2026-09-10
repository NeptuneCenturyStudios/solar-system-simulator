/**
 * The flat-array view the force solvers operate on.
 *
 * This module deliberately has **no imports**. The solvers are pure numerics and know
 * nothing about `Body`, `THREE`, or the scene graph, which keeps them testable in isolation
 * (see bench_nbody.ts) and portable to a Web Worker later without dragging the renderer
 * along.
 *
 * `BodyStore` is the real implementation; benchmarks supply a plain object.
 */

/** Receives no gravitational acceleration, but still drifts at its own velocity (wormholes). */
export const FLAG_STATIC = 1 << 0;

/** Must receive exact forces from every source, whatever solver is selected (ships). */
export const FLAG_EXACT_TARGET = 1 << 1;

export interface IBodyArrays {
    /** Number of live bodies. Indices `[0, count)` are valid in every array below. */
    count: number;

    px: Float64Array;
    py: Float64Array;
    pz: Float64Array;

    vx: Float64Array;
    vy: Float64Array;
    vz: Float64Array;

    ax: Float64Array;
    ay: Float64Array;
    az: Float64Array;

    mass: Float64Array;

    /** Per-body speed cap in scaled units, or 0 when uncapped. */
    maxSpeed: Float64Array;

    flags: Uint8Array;

    /** Slots flagged {@link FLAG_EXACT_TARGET}. */
    exactTargets: number[];
}
