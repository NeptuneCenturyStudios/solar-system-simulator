import { ISolarSystem } from '../interfaces';
import { ProceduralGenerationReporter } from './procedural-generation-progress';

export abstract class SolarSystemGenerator {
    /** The seed this generator resolved or generated. Populated after construction. */
    public seed: string = '';

    constructor() {}

    /**
     *
     * @returns A promise that resolves after yielding to the event loop, allowing the UI to remain responsive.
     */
    async yieldToEventLoop(): Promise<void> {
        return new Promise<void>((resolve) =>
            setTimeout(() => {
                setTimeout(resolve, 10);
            }, 0)
        );
    }

    /**
     * Generates a solar system asynchronously. This method is intended for use by the UI for progressive generation.
     * Must be implemented by subclasses to return a promise that resolves to an array of `Body` instances representing the solar system.
     * The `progressReporter` callback, if provided, should be called periodically with updates on the generation progress.
     */
    async generateSolarSystemAsync(
        _progressReporter?: ProceduralGenerationReporter
    ): Promise<ISolarSystem> {
        throw new Error('generateSolarSystemAsync must be implemented by subclasses.');
    }
}
