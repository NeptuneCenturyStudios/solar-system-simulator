import { ISolarSystem } from '../interfaces';

export abstract class SolarSystemGenerator {
    /** The seed this generator resolved or generated. Populated after construction. */
    public seed: string = '';

    constructor() {}

    /**
     * Generates a solar system asynchronously. This method is intended for use by the UI for progressive generation.
     * Must be implemented by subclasses to return a promise that resolves to an array of `Body` instances representing the solar system.
     */
    async generateSolarSystemAsync(): Promise<ISolarSystem> {
        throw new Error('generateSolarSystemAsync must be implemented by subclasses.');
    }
}
