import { PhysicsSolverMode, settingsStore } from '../../settings/settings-store';
import { BarnesHutSolver } from './barnes-hut-solver';
import { CutoffSolver } from './cutoff-solver';
import { DirectSolver } from './direct-solver';
import { INBodySolver } from './solver';

// Solvers are stateful (index partitions, octree node pools) and are sized to the body
// count on first use, so they are kept alive across frames rather than rebuilt per frame.
const _direct = new DirectSolver();
const _cutoff = new CutoffSolver();
const _barnesHut = new BarnesHutSolver();

/** Solver instance for an explicit mode. Used by benchmarks and cross-checks. */
export function getSolver(mode: PhysicsSolverMode): INBodySolver {
    switch (mode) {
        case 'direct':
            return _direct;
        case 'barnes-hut':
            return _barnesHut;
        case 'cutoff':
        default:
            return _cutoff;
    }
}

/**
 * Solver currently selected in Options -> Physics, with its tuning applied.
 *
 * Read fresh every frame so changing the setting takes effect immediately, without
 * restarting the simulation or rebuilding the world.
 */
export function getActiveSolver(): INBodySolver {
    const settings = settingsStore.settings;

    const theta = settings.barnesHutTheta;
    if (Number.isFinite(theta) && theta > 0) _barnesHut.theta = theta;

    return getSolver(settings.physicsSolver);
}
