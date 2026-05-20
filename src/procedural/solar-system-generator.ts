import type { Body } from '../bodies/body';

export abstract class SolarSystemGenerator {
    constructor() {}

    /**
     * Generates actual bodies (stars for this pass) suitable for direct use
     * as `simulationState.bodies`.
     */
    abstract generateSolarSystem(): Body[];
}
