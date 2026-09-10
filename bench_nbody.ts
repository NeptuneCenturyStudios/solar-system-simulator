/**
 * N-body engine benchmark and correctness harness.
 *
 * Run with:
 *   npx esbuild bench_nbody.ts --bundle --format=esm --platform=node --outfile=tmp/bench.mjs
 *   node tmp/bench.mjs
 *
 * Covers three things:
 *  1. Throughput of each solver at realistic body counts.
 *  2. Accuracy of the approximating solvers, measured against the exact all-pairs solver.
 *  3. Energy conservation of the kick-drift-kick integrator versus the previous scheme.
 */

import { IBodyArrays } from './src/physics/nbody/store-view';
import { DirectSolver } from './src/physics/nbody/direct-solver';
import { CutoffSolver } from './src/physics/nbody/cutoff-solver';
import { BarnesHutSolver } from './src/physics/nbody/barnes-hut-solver';
import { INBodySolver } from './src/physics/nbody/solver';

// Scaled-unit constants matching src/utilities/consts.ts.
const MASS_SCALE = 6.025757575757576e22;
const DIST_SCALE = 100;
const G = 6.6743e-20 * (MASS_SCALE / DIST_SCALE ** 3);
const G_MULTIPLIER = 2_500_000;
const G_EFF = G * G_MULTIPLIER;
const EPS2 = 0.01 * 0.01;

const SUN_MASS = 1.989e30 / MASS_SCALE;
const EARTH_MASS = 5.97237e24 / MASS_SCALE;
const EARTH_DIST = 149_600_000 / DIST_SCALE;

/** Bare flat-array store — the solvers need nothing else. */
function makeArrays(n: number): IBodyArrays {
    return {
        count: n,
        px: new Float64Array(n),
        py: new Float64Array(n),
        pz: new Float64Array(n),
        vx: new Float64Array(n),
        vy: new Float64Array(n),
        vz: new Float64Array(n),
        ax: new Float64Array(n),
        ay: new Float64Array(n),
        az: new Float64Array(n),
        mass: new Float64Array(n),
        maxSpeed: new Float64Array(n),
        flags: new Uint8Array(n),
        exactTargets: [],
    };
}

/** Deterministic PRNG so every run measures the same configuration. */
function makeRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/**
 * A star-dominated system: one star, a few planets, and a large belt of negligible-mass
 * asteroids. This is the mass distribution the simulator actually produces.
 */
function makeSolarSystem(n: number, seed = 12345): IBodyArrays {
    const store = makeArrays(n);
    const rng = makeRng(seed);

    for (let i = 0; i < n; i++) {
        if (i === 0) {
            store.px[i] = 0;
            store.py[i] = 0;
            store.pz[i] = 0;
            store.mass[i] = SUN_MASS;
        } else {
            // First ~10 bodies are planets; the rest are belt asteroids.
            const isPlanet = i < 10;
            const r = isPlanet ? EARTH_DIST * (0.4 + i * 0.35) : EARTH_DIST * (2.2 + rng() * 1.2);
            const angle = rng() * Math.PI * 2;

            store.px[i] = r * Math.cos(angle);
            store.py[i] = (rng() - 0.5) * r * 0.02;
            store.pz[i] = r * Math.sin(angle);

            // Asteroids are ~1e-12 of Earth's mass — genuinely negligible sources.
            store.mass[i] = isPlanet ? EARTH_MASS * (0.5 + rng()) : EARTH_MASS * 1e-12;
        }

        store.vx[i] = 0;
        store.vy[i] = 0;
        store.vz[i] = 0;
        store.maxSpeed[i] = 0;
        store.flags[i] = 0;
    }

    return store;
}

/** An equal-mass cluster — the case with no dominant-mass hierarchy to exploit. */
function makeCluster(n: number, seed = 999): IBodyArrays {
    const store = makeArrays(n);
    const rng = makeRng(seed);

    for (let i = 0; i < n; i++) {
        store.px[i] = (rng() - 0.5) * EARTH_DIST * 4;
        store.py[i] = (rng() - 0.5) * EARTH_DIST * 4;
        store.pz[i] = (rng() - 0.5) * EARTH_DIST * 4;
        store.mass[i] = SUN_MASS / n;
        store.vx[i] = 0;
        store.vy[i] = 0;
        store.vz[i] = 0;
        store.maxSpeed[i] = 0;
        store.flags[i] = 0;
    }

    return store;
}

function snapshotAcc(store: IBodyArrays): Float64Array {
    const out = new Float64Array(store.count * 3);
    for (let i = 0; i < store.count; i++) {
        out[i * 3] = store.ax[i];
        out[i * 3 + 1] = store.ay[i];
        out[i * 3 + 2] = store.az[i];
    }
    return out;
}

/** Max and RMS acceleration error relative to the exact reference, per body. */
function compareAcc(
    reference: Float64Array,
    actual: Float64Array,
    count: number
): { max: number; rms: number } {
    let max = 0;
    let sumSq = 0;

    for (let i = 0; i < count; i++) {
        const rx = reference[i * 3];
        const ry = reference[i * 3 + 1];
        const rz = reference[i * 3 + 2];
        const refMag = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (refMag === 0) continue;

        const dx = actual[i * 3] - rx;
        const dy = actual[i * 3 + 1] - ry;
        const dz = actual[i * 3 + 2] - rz;
        const rel = Math.sqrt(dx * dx + dy * dy + dz * dz) / refMag;

        if (rel > max) max = rel;
        sumSq += rel * rel;
    }

    return { max, rms: Math.sqrt(sumSq / count) };
}

// ── 1. Throughput ────────────────────────────────────────────────────────────

const SUBSTEPS = 64;

function benchSolver(solver: INBodySolver, store: IBodyArrays, frames: number): number {
    for (let i = 0; i < 5; i++) solver.computeAccelerations(store, G_EFF, EPS2);

    const start = performance.now();
    for (let f = 0; f < frames; f++) {
        for (let s = 0; s < SUBSTEPS; s++) solver.computeAccelerations(store, G_EFF, EPS2);
    }
    return (performance.now() - start) / frames;
}

function runThroughput(): void {
    // Both distributions matter: the star-dominated case is what the simulator normally
    // produces, while the equal-mass cluster is the case Barnes-Hut actually exists for.
    for (const [label, factory] of [
        ['star-dominated (star + planets + belt)', makeSolarSystem],
        ['equal-mass cluster', makeCluster],
    ] as const) {
        console.log(`\n=== Throughput, ${SUBSTEPS} substeps/frame — ${label} ===`);
        console.log('    N  |    direct |    cutoff | barnes-hut');
        console.log('  -----+-----------+-----------+-----------');

        for (const n of [130, 500, 1000, 2000, 4000]) {
            const frames = n >= 1000 ? 3 : 20;
            const cells: string[] = [];

            for (const solver of [new DirectSolver(), new CutoffSolver(), new BarnesHutSolver()]) {
                // A fresh store per solver so none benefits from another's warm cache.
                const ms = benchSolver(solver, factory(n), frames);
                cells.push(`${ms.toFixed(1).padStart(7)}ms`);
            }

            console.log(`  ${String(n).padStart(4)} | ${cells.join(' | ')}`);
        }
    }
}

// ── 2. Solver accuracy ───────────────────────────────────────────────────────

function runAccuracy(): void {
    console.log('\n=== Acceleration error vs exact all-pairs ===');

    for (const [label, factory] of [
        ['star-dominated', makeSolarSystem],
        ['equal-mass cluster', makeCluster],
    ] as const) {
        const n = 1000;
        console.log(`\n  ${label} (N=${n}):`);

        const reference = makeSolarSystem === factory ? makeSolarSystem(n) : makeCluster(n);
        new DirectSolver().computeAccelerations(reference, G_EFF, EPS2);
        const refAcc = snapshotAcc(reference);

        for (const solver of [new CutoffSolver(), new BarnesHutSolver()]) {
            const store = makeSolarSystem === factory ? makeSolarSystem(n) : makeCluster(n);
            solver.computeAccelerations(store, G_EFF, EPS2);
            const { max, rms } = compareAcc(refAcc, snapshotAcc(store), n);
            console.log(
                `    ${solver.mode.padEnd(11)} max ${max.toExponential(2)}   rms ${rms.toExponential(2)}`
            );
        }
    }

    // The cutoff solver must classify every body as significant when masses are comparable,
    // which is what makes it safe to leave on as the default in any scenario.
    const cluster = makeCluster(500);
    const cutoff = new CutoffSolver();
    cutoff.computeAccelerations(cluster, G_EFF, EPS2);
    const direct = makeCluster(500);
    new DirectSolver().computeAccelerations(direct, G_EFF, EPS2);
    const degraded = compareAcc(snapshotAcc(direct), snapshotAcc(cluster), 500);
    console.log(
        `\n  cutoff degrades to exact on equal masses: max rel err ${degraded.max.toExponential(2)}` +
            ` ${degraded.max < 1e-12 ? 'PASS' : 'FAIL'}`
    );

    // Near-coincident bodies drive the octree straight into its depth cap, where
    // subdivision stops and bodies chain inside a single leaf. That path is the easiest one
    // to get wrong, and getting it wrong loses forces silently rather than crashing.
    const coincident = makeArrays(400);
    for (let i = 0; i < 400; i++) {
        coincident.px[i] = 1000 + (i % 7) * 1e-7;
        coincident.py[i] = 1000 + (i % 5) * 1e-7;
        coincident.pz[i] = 1000 + (i % 3) * 1e-7;
        coincident.mass[i] = EARTH_MASS;
    }
    const coincidentRef = makeArrays(400);
    coincidentRef.px.set(coincident.px);
    coincidentRef.py.set(coincident.py);
    coincidentRef.pz.set(coincident.pz);
    coincidentRef.mass.set(coincident.mass);

    new DirectSolver().computeAccelerations(coincidentRef, G_EFF, EPS2);
    new BarnesHutSolver().computeAccelerations(coincident, G_EFF, EPS2);

    const coincidentErr = compareAcc(snapshotAcc(coincidentRef), snapshotAcc(coincident), 400);
    const finite =
        Array.from(coincident.ax).every(Number.isFinite) &&
        Array.from(coincident.ay).every(Number.isFinite) &&
        Array.from(coincident.az).every(Number.isFinite);

    // What this guards against is corruption — NaN from a degenerate node, or silently
    // dropped contributions from a stack overflow. It is not a precision test: at 1e-7
    // separations the softening length (0.01) dominates every pair, so ordinary theta=0.5
    // multipole error of ~1e-4 is expected and fine.
    console.log(
        `  barnes-hut on 400 near-coincident bodies (depth cap): max rel err ` +
            `${coincidentErr.max.toExponential(2)}, all finite: ${finite}` +
            ` ${finite && coincidentErr.max < 1e-2 ? 'PASS' : 'FAIL'}`
    );
}

// ── 3. Integrator energy conservation ────────────────────────────────────────

interface TwoBody {
    px: Float64Array;
    py: Float64Array;
    vx: Float64Array;
    vy: Float64Array;
    m: Float64Array;
}

function makeTwoBody(): TwoBody {
    const m0 = SUN_MASS;
    const m1 = EARTH_MASS;
    const r = EARTH_DIST;
    const v = Math.sqrt((G_EFF * m0) / r);

    return {
        px: new Float64Array([0, r]),
        py: new Float64Array([0, 0]),
        vx: new Float64Array([0, 0]),
        vy: new Float64Array([-(m1 / m0) * v, v]),
        m: new Float64Array([m0, m1]),
    };
}

function accelOf(s: TwoBody, out: Float64Array): void {
    out.fill(0);
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            if (i === j) continue;
            const dx = s.px[j] - s.px[i];
            const dy = s.py[j] - s.py[i];
            const r2 = dx * dx + dy * dy + EPS2;
            const invR = 1 / Math.sqrt(r2);
            const f = G_EFF * s.m[j] * invR * invR * invR;
            out[i * 2] += f * dx;
            out[i * 2 + 1] += f * dy;
        }
    }
}

function energyOf(s: TwoBody): number {
    let ke = 0;
    for (let i = 0; i < 2; i++) {
        ke += 0.5 * s.m[i] * (s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i]);
    }
    const dx = s.px[1] - s.px[0];
    const dy = s.py[1] - s.py[0];
    const r = Math.sqrt(dx * dx + dy * dy + EPS2);
    return ke - (G_EFF * s.m[0] * s.m[1]) / r;
}

/** The previous scheme: same acceleration used for both half-kicks. Not symplectic. */
function stepOld(s: TwoBody, dt: number, acc: Float64Array): void {
    accelOf(s, acc);
    for (let i = 0; i < 2; i++) {
        s.vx[i] += acc[i * 2] * dt * 0.5;
        s.vy[i] += acc[i * 2 + 1] * dt * 0.5;
        s.px[i] += s.vx[i] * dt;
        s.py[i] += s.vy[i] * dt;
        s.vx[i] += acc[i * 2] * dt * 0.5;
        s.vy[i] += acc[i * 2 + 1] * dt * 0.5;
    }
}

/** True kick-drift-kick: acceleration recomputed between the half-kicks. */
function stepNew(s: TwoBody, dt: number, acc: Float64Array): void {
    for (let i = 0; i < 2; i++) {
        s.vx[i] += acc[i * 2] * dt * 0.5;
        s.vy[i] += acc[i * 2 + 1] * dt * 0.5;
        s.px[i] += s.vx[i] * dt;
        s.py[i] += s.vy[i] * dt;
    }
    accelOf(s, acc);
    for (let i = 0; i < 2; i++) {
        s.vx[i] += acc[i * 2] * dt * 0.5;
        s.vy[i] += acc[i * 2 + 1] * dt * 0.5;
    }
}

function runEnergy(): void {
    console.log('\n=== Integrator energy drift (2-body, 200k steps) ===');

    const steps = 200_000;
    const period = (2 * Math.PI * Math.sqrt(EARTH_DIST ** 3 / (G_EFF * SUN_MASS))) as number;
    const dt = period / 2000;

    for (const [label, stepFn] of [
        ['old (reused accel)', stepOld],
        ['new (true KDK)', stepNew],
    ] as const) {
        const s = makeTwoBody();
        const acc = new Float64Array(4);
        accelOf(s, acc);

        const e0 = energyOf(s);
        let maxDrift = 0;
        let finalDrift = 0;

        for (let i = 0; i < steps; i++) {
            stepFn(s, dt, acc);
            const drift = Math.abs((energyOf(s) - e0) / e0);
            if (drift > maxDrift) maxDrift = drift;
            finalDrift = drift;
        }

        console.log(
            `  ${label.padEnd(20)} final |dE/E| ${finalDrift.toExponential(3)}   max ${maxDrift.toExponential(3)}`
        );
    }

    console.log(
        '  (symplectic integration keeps final drift comparable to max — bounded oscillation,'
    );
    console.log('   rather than final drift growing to meet max, which indicates a secular trend)');
}

runThroughput();
runAccuracy();
runEnergy();
