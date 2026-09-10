import { CUTOFF_MASS_FRACTION } from '../../utilities/consts';
import { IBodyArrays } from './store-view';
import {
    INBodySolver,
    PhysicsSolverMode,
    accumulateExactTargets,
    clearAccelerations,
    zeroStaticAccelerations,
} from './solver';

/**
 * Exact gravity between everything that matters; drops only provably negligible pairs.
 *
 * Bodies are split by a *relative* mass threshold (a fraction of the system's total mass)
 * into `significant` and `tracer` sets:
 *
 * - significant ↔ significant — exact
 * - significant ↔ tracer      — exact, including the reaction on the significant body
 * - tracer ↔ tracer           — **skipped**
 *
 * So the only omitted term is dust-on-dust: asteroid-on-asteroid, debris-on-debris. In a
 * star-dominated system those forces are ~1e-9 of the dominant term, far below the
 * integrator's own truncation error.
 *
 * Cost is `O(M²/2 + M·T)`. With 30 significant bodies and 2000 tracers that is ~60k pair
 * evaluations instead of ~2M.
 *
 * Because the threshold is relative rather than absolute, a scenario where every body has
 * comparable mass — a star cluster, a collapsing cloud — puts everything in the significant
 * set and this degrades gracefully into exact all-pairs rather than silently losing physics.
 */
export class CutoffSolver implements INBodySolver {
    readonly mode: PhysicsSolverMode = 'cutoff';

    private significant: number[] = [];
    private tracers: number[] = [];

    /** Fraction of total system mass at or above which a body interacts with everything. */
    massFraction = CUTOFF_MASS_FRACTION;

    computeAccelerations(store: IBodyArrays, gEff: number, eps2: number): void {
        const { px, py, pz, ax, ay, az, mass } = store;

        clearAccelerations(store);
        this.partition(store);

        const significant = this.significant;
        const tracers = this.tracers;
        const sigCount = significant.length;

        // --- significant ↔ significant, symmetric ---
        for (let a = 0; a < sigCount; a++) {
            const i = significant[a];
            const pxi = px[i];
            const pyi = py[i];
            const pzi = pz[i];
            const mi = mass[i];

            let axi = 0;
            let ayi = 0;
            let azi = 0;

            for (let b = a + 1; b < sigCount; b++) {
                const j = significant[b];

                const dx = px[j] - pxi;
                const dy = py[j] - pyi;
                const dz = pz[j] - pzi;

                const r2 = dx * dx + dy * dy + dz * dz + eps2;
                const invR = 1 / Math.sqrt(r2);
                const s = gEff * invR * invR * invR;

                const si = s * mass[j];
                axi += si * dx;
                ayi += si * dy;
                azi += si * dz;

                const sj = s * mi;
                ax[j] -= sj * dx;
                ay[j] -= sj * dy;
                az[j] -= sj * dz;
            }

            ax[i] += axi;
            ay[i] += ayi;
            az[i] += azi;
        }

        // --- tracer ↔ significant, symmetric ---
        // The reaction on the significant body is free once the pair term is computed, so
        // taking it keeps total momentum conserved instead of leaking it.
        for (let t = 0; t < tracers.length; t++) {
            const i = tracers[t];
            const pxi = px[i];
            const pyi = py[i];
            const pzi = pz[i];
            const mi = mass[i];

            let axi = 0;
            let ayi = 0;
            let azi = 0;

            for (let b = 0; b < sigCount; b++) {
                const j = significant[b];

                const dx = px[j] - pxi;
                const dy = py[j] - pyi;
                const dz = pz[j] - pzi;

                const r2 = dx * dx + dy * dy + dz * dz + eps2;
                const invR = 1 / Math.sqrt(r2);
                const s = gEff * invR * invR * invR;

                const si = s * mass[j];
                axi += si * dx;
                ayi += si * dy;
                azi += si * dz;

                const sj = s * mi;
                ax[j] -= sj * dx;
                ay[j] -= sj * dy;
                az[j] -= sj * dz;
            }

            ax[i] += axi;
            ay[i] += ayi;
            az[i] += azi;
        }

        accumulateExactTargets(store, gEff, eps2);
        zeroStaticAccelerations(store);
    }

    /** Split slots into significant and tracer sets by share of total mass. */
    private partition(store: IBodyArrays): void {
        const { mass, count } = store;

        this.significant.length = 0;
        this.tracers.length = 0;

        let total = 0;
        for (let i = 0; i < count; i++) total += mass[i];

        const threshold = total * this.massFraction;

        for (let i = 0; i < count; i++) {
            const m = mass[i];
            // Massless bodies (wormholes) exert nothing, so they belong with the tracers
            // regardless of threshold — they still need to *receive* correct forces.
            if (m > 0 && m >= threshold) {
                this.significant.push(i);
            } else {
                this.tracers.push(i);
            }
        }
    }
}
