import { IStateDependencies } from '../interfaces';

/**
 * Effect interface that defines the structure for all effects in the simulation. Each effect must implement an update method to handle its behavior over time and a dispose method to clean up resources when the effect is no longer needed.
 */
export interface IEffect {
    dependencies: IStateDependencies;
    active: boolean;
    update(dt: number): void;
    dispose(): void;
}

/**
 * Extends IEffect for particle effects that participate in the siphon → accretion → jet
 * pipeline. The effect spawns particles continuously while `isSpawning` is true; calling
 * `stopSpawning()` halts new spawns while allowing in-flight particles to drain naturally.
 * The effect sets `active = false` once all in-flight particles have been handed off
 * downstream, signalling that it is safe to dispose.
 */
export interface IPipelineFeedEffect extends IEffect {
    /** Whether the effect is currently spawning new particles. */
    readonly isSpawning: boolean;
    /**
     * Stops new particle spawns. Existing in-flight particles continue until they reach
     * their destination. Once the last particle has been handed off, `active` becomes false.
     */
    stopSpawning(): void;
}
