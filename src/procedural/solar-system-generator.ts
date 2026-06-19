import type { Body } from '../bodies/body';

export abstract class SolarSystemGenerator {
    /** The seed this generator resolved or generated. Populated after construction. */
    public seed: string = '';

    constructor() {}

    /**
     * Generates actual bodies suitable for direct use as `simulationState.bodies`.
     */
    abstract generateSolarSystem(): Body[];

    /**
     * Async entrypoint used by the UI for progressive generation.
     * Default implementation falls back to the synchronous method.
     */
    async generateSolarSystemAsync(): Promise<Body[]> {
        return this.generateSolarSystem();
    }
}
