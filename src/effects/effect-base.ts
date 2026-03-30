/**
 * Effect interface that defines the structure for all effects in the simulation. Each effect must implement an update method to handle its behavior over time and a dispose method to clean up resources when the effect is no longer needed.
 */
export interface IEffect {
    active: boolean;
    update(dt: number): void;
    dispose(): void;
}