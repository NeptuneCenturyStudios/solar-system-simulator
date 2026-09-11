import type { IScenario } from '../interfaces';

/**
 * Owns the scenario (if any) that the live system's generator returned, and drives it once
 * per frame from the animation loop.
 *
 * spawn() in index.ts hands the new scenario to `start()` once the generated bodies are live,
 * and cleanUpSolarSystem() calls `stop()` before tearing the old system down, so a scenario
 * never outlives the system it was built for. A scenario that throws is stopped rather than
 * allowed to break the render loop.
 */
class ScenarioManager {
    private active: IScenario | null = null;

    /** The scenario currently running, or null when the live system has none. */
    get activeScenario(): IScenario | null {
        return this.active;
    }

    /** Stop the current scenario (if any), then start `scenario`. Passing null just stops. */
    start(scenario: IScenario | null): void {
        this.stop();
        if (!scenario) return;

        this.active = scenario;
        try {
            scenario.start();
            console.info('[scenario] started:', scenario.name);
        } catch (e) {
            console.error(`[scenario] ${scenario.name} failed to start:`, e);
            this.stop();
        }
    }

    /**
     * Advance the active scenario by one frame.
     * @param simDt Sim-time seconds advanced this frame (0 while paused).
     */
    update(simDt: number): void {
        const scenario = this.active;
        if (!scenario) return;

        try {
            scenario.update(simDt);
        } catch (e) {
            console.error(`[scenario] ${scenario.name} threw during update; stopping it:`, e);
            this.stop();
        }
    }

    /** Dispose the active scenario and clear it. Safe to call when none is running. */
    stop(): void {
        const scenario = this.active;
        if (!scenario) return;

        this.active = null;
        try {
            scenario.dispose();
            console.info('[scenario] stopped:', scenario.name);
        } catch (e) {
            console.error(`[scenario] ${scenario.name} failed to dispose:`, e);
        }
    }
}

export const scenarioManager = new ScenarioManager();
