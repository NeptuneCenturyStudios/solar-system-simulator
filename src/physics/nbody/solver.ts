import { IBodyArrays, FLAG_STATIC } from './store-view';
import type { PhysicsSolverMode } from '../../settings/settings-store';

export type { PhysicsSolverMode };

export interface INBodySolver {
    readonly mode: PhysicsSolverMode;

    /**
     * Fill `store.ax/ay/az` with the gravitational acceleration acting on every body.
     * Implementations own clearing the acceleration arrays.
     *
     * @param gEff Gravitational constant already multiplied by the simulation's gMultiplier.
     * @param eps2 Squared Plummer softening length, added to every r² term.
     */
    computeAccelerations(store: IBodyArrays, gEff: number, eps2: number): void;
}

/** Reset every acceleration slot. */
export function clearAccelerations(store: IBodyArrays): void {
    const { ax, ay, az, count } = store;
    for (let i = 0; i < count; i++) {
        ax[i] = 0;
        ay[i] = 0;
        az[i] = 0;
    }
}

/**
 * Zero the acceleration of bodies that take no part in gravity.
 *
 * The symmetric kernels below deposit a reaction force on every body they touch, including
 * static ones, so this runs afterwards rather than branching inside the hot loop.
 */
export function zeroStaticAccelerations(store: IBodyArrays): void {
    const { flags, ax, ay, az, count } = store;
    for (let i = 0; i < count; i++) {
        if ((flags[i] & FLAG_STATIC) !== 0) {
            ax[i] = 0;
            ay[i] = 0;
            az[i] = 0;
        }
    }
}

/**
 * Recompute, exactly, the acceleration on every body flagged as an exact target.
 *
 * Ships carry negligible mass, so an approximating solver would class them as background
 * dust and skip forces acting on them — which would make flight handling depend on the
 * selected solver. Overwriting their acceleration with a full direct sum keeps the ship's
 * experienced gravity identical in every mode; the cost is O(shipCount × N), which is
 * nothing next to the main pass.
 *
 * Note the asymmetry is intentional: a ship *receives* exact forces from asteroids, while
 * its own vanishing pull on those asteroids is still skipped by the approximating solvers.
 */
export function accumulateExactTargets(store: IBodyArrays, gEff: number, eps2: number): void {
    const { exactTargets, px, py, pz, ax, ay, az, mass, count } = store;

    for (let t = 0; t < exactTargets.length; t++) {
        const i = exactTargets[t];
        const pxi = px[i];
        const pyi = py[i];
        const pzi = pz[i];

        let axi = 0;
        let ayi = 0;
        let azi = 0;

        for (let j = 0; j < count; j++) {
            if (j === i) continue;

            const mj = mass[j];
            if (mj <= 0) continue;

            const dx = px[j] - pxi;
            const dy = py[j] - pyi;
            const dz = pz[j] - pzi;

            const r2 = dx * dx + dy * dy + dz * dz + eps2;
            const invR = 1 / Math.sqrt(r2);
            const s = gEff * mj * invR * invR * invR;

            axi += s * dx;
            ayi += s * dy;
            azi += s * dz;
        }

        ax[i] = axi;
        ay[i] = ayi;
        az[i] = azi;
    }
}
