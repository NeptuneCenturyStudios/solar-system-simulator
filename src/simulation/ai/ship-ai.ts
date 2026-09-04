import { ObstacleAvoidance } from './obstacle-avoidance';
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
 * That includes the warp drive: `controlInput.warp` is the AI's equivalent of the
 * player holding Space, and `Spaceship.updateWarpIntentState()` turns it into the
 * same charge/engage/disengage calls the key handler makes. A controller therefore
 * has to live with the same restrictions — a ship at warp flies a locked straight
 * heading with steering, thrust and weapons all disabled.
 *
 * Subclasses implement `update()`, which runs once per rendered frame at
 * wall-clock dt. Thrust itself is applied later, per physics substep, by
 * `Spaceship.applyFlightThrustSubstep()`.
 */
export abstract class ShipAI {
    /** The ship this controller is piloting. */
    protected readonly ship: Spaceship;

    /**
     * Obstacle perception, shared by every controller so none has to re-derive it.
     *
     * Public rather than protected because the AI debug gizmo reads `avoidance.last` to draw
     * what the controller is currently seeing.
     */
    readonly avoidance: ObstacleAvoidance;

    /** Short human-readable name for this controller, shown in debug output. */
    abstract readonly name: string;

    constructor(ship: Spaceship) {
        this.ship = ship;
        this.avoidance = new ObstacleAvoidance(ship);
    }

    /**
     * Run one frame of decision-making and write the result into
     * `this.ship.controlInput`.
     *
     * @param dt Wall-clock seconds since the previous frame (not time-scaled).
     * @param simDt Sim-time seconds advanced this frame (wall dt × time scale). Decisions are
     *   made at wall-clock rate but the world moves at sim rate, so anything that reasons about
     *   how far the ship travels before the next decision needs this rather than `dt`.
     */
    abstract update(dt: number, simDt: number): void;

    /**
     * Release any resources this controller holds. Called when the ship dies or
     * the controller is detached. The base implementation does nothing.
     */
    dispose(): void {
        // No resources held by default.
    }
}
