import type { Spaceship } from '../../bodies/ships/spaceship';

/**
 * Base class for every pluggable ship AI.
 *
 * A ShipAI is a virtual pilot: it may ONLY express its intent by writing into
 * `ship.controlInput` — the same virtual control surface the player's keyboard
 * and mouse feed. It must never mutate `ship.velocity` or `ship.mesh.quaternion`
 * directly. Everything downstream (acceleration curves, boost and brake
 * ceilings, steering smoothing, visual banking, perpendicular-drift decay) is
 * then applied by the ship's own flight control methods, so an AI-piloted ship
 * handles exactly like a player-piloted one and automatically inherits any
 * future change to a ship's handling.
 *
 * Subclasses implement `update()`, which runs once per rendered frame at
 * wall-clock dt. Thrust itself is applied later, per physics substep, by
 * `Spaceship.applyFlightThrustSubstep()`.
 */
export abstract class ShipAI {
    /** The ship this controller is piloting. */
    protected readonly ship: Spaceship;

    /** Short human-readable name for this controller, shown in debug output. */
    abstract readonly name: string;

    constructor(ship: Spaceship) {
        this.ship = ship;
    }

    /**
     * Run one frame of decision-making and write the result into
     * `this.ship.controlInput`.
     *
     * @param dt Wall-clock seconds since the previous frame (not time-scaled).
     */
    abstract update(dt: number): void;

    /**
     * Release any resources this controller holds. Called when the ship dies or
     * the controller is detached. The base implementation does nothing.
     */
    dispose(): void {
        // No resources held by default.
    }
}
