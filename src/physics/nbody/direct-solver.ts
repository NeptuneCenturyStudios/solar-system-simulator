import { IBodyArrays } from './store-view';
import {
    INBodySolver,
    PhysicsSolverMode,
    clearAccelerations,
    zeroStaticAccelerations,
} from './solver';

/**
 * Exact all-pairs gravity, O(N²/2).
 *
 * This is the reference implementation — no interaction is dropped and no multipole
 * approximation is made, so the other solvers are validated against it.
 *
 * Two things make it substantially faster than the loop it replaces despite computing the
 * same forces: it uses Newton's third law to evaluate each pair once instead of twice, and
 * it derives the inverse cube from a single `Math.sqrt` rather than calling `length()` and
 * then `normalize()` (which square-roots a second time).
 */
export class DirectSolver implements INBodySolver {
    readonly mode: PhysicsSolverMode = 'direct';

    computeAccelerations(store: IBodyArrays, gEff: number, eps2: number): void {
        const { px, py, pz, ax, ay, az, mass, count } = store;

        clearAccelerations(store);

        for (let i = 0; i < count; i++) {
            const pxi = px[i];
            const pyi = py[i];
            const pzi = pz[i];
            const mi = mass[i];

            // Accumulate body i's own pull in locals; only one array write-back per i.
            let axi = 0;
            let ayi = 0;
            let azi = 0;

            for (let j = i + 1; j < count; j++) {
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

        zeroStaticAccelerations(store);
    }
}
