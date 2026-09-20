import type { IScenario, IStateDependencies } from '../interfaces';

/**
 * Scenario shell for the Asteroid Field: no objectives or win/loss state, it only
 * hides the panel manager (System Explorer + toolbar) for the duration of the run,
 * matching Asteroid Defense's presentation, and restores it on teardown.
 */
export class AsteroidFieldScenario implements IScenario {
    readonly name = 'Asteroid Field';

    private readonly dependencies: IStateDependencies;

    constructor(dependencies: IStateDependencies) {
        this.dependencies = dependencies;
    }

    start(): void {
        this.dependencies.setPanelManagerVisible(false);
    }

    update(_simDt: number): void {
        // No per-frame logic; the band itself is ordinary orbital bodies.
    }

    dispose(): void {
        this.dependencies.setPanelManagerVisible(true);
    }
}
