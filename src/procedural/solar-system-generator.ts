import type { Body } from '../bodies/body';
import type { ProceduralGenerationReporter } from './procedural-generation-progress';

export abstract class SolarSystemGenerator {
    constructor() {}

    /**
     * Generates actual bodies suitable for direct use as `simulationState.bodies`.
     */
    abstract generateSolarSystem(): Body[];

    /**
     * Async entrypoint used by the UI for progressive generation.
     * Default implementation falls back to the synchronous method.
     */
    async generateSolarSystemAsync(
        _reporter?: ProceduralGenerationReporter,
        options?: { signal?: AbortSignal }
    ): Promise<Body[]> {
        if (options?.signal?.aborted) {
            throw new Error('Procedural generation aborted.');
        }
        return this.generateSolarSystem();
    }
}
