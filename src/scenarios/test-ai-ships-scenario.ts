import * as THREE from 'three';

import { NotificationType } from '../event-log/event-log';
import type { IScenario, IStateDependencies } from '../interfaces';
import type { Spaceship } from '../bodies/ships/spaceship';
import { CombatShipAI } from '../simulation/ai/combat-ship-ai';
import { createNpcShip, registerNpcShip } from '../simulation/ai/npc-manager';
import { flightState } from '../simulation/simulation';
import { TEST_AI_SHIPS_RESPAWN_DELAY, TEST_AI_SHIPS_SPAWN_DISTANCE } from '../utilities/consts';

/**
 * Scenario: a single AI-piloted ship hunts the player, forever.
 *
 * This is a test bed rather than a game — there is no win condition, no score and no outcome
 * modal. Destroy the NPC and a replacement arrives a few seconds later at
 * TEST_AI_SHIPS_SPAWN_DISTANCE, far enough out that the whole engagement (turn, close, enter
 * weapons range, open fire) plays through again on every respawn. That repeatability is the
 * entire point: combat AI is only meaningful to judge across many identical engagements.
 *
 * Respawns are anchored on the player's ship rather than on a fixed point in space, so the fight
 * follows the player wherever they fly instead of staying where it started.
 */
export class TestAiShipsScenario implements IScenario {
    readonly name = 'Test AI Ships';

    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    /**
     * The ship the generator started the player in.
     *
     * Only a fallback: the live ship is resolved from flightState every frame instead, because
     * the player's ship is not a fixed object for the life of the scenario. Spawning a different
     * ship type from the Flight Controls panel destroys the old one and builds a replacement,
     * and this scenario deliberately leaves that panel available. Holding this reference as the
     * authority would strand the scenario on a destroyed ship the moment that happened.
     */
    private readonly initialPlayerShip: Spaceship;

    /** The live NPC, or null while one is waiting to respawn. */
    private npc: Spaceship | null;
    /** Sim-seconds until the replacement NPC appears; only counts down while `npc` is null. */
    private respawnTimer = 0;
    /** NPCs the player has destroyed so far — reported to the event log on each kill. */
    private kills = 0;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        playerShip: Spaceship,
        npc: Spaceship
    ) {
        this.dependencies = dependencies;
        this.scene = scene;
        this.initialPlayerShip = playerShip;
        this.npc = npc;
    }

    start(): void {
        this.kills = 0;
        this.respawnTimer = 0;
        this.dependencies.addEvent({
            message: 'Hostile ship detected. It is closing on your position.',
            notificationType: NotificationType.Alert,
        });
    }

    /**
     * The ship the player is currently flying, or null if they no longer have one.
     *
     * Resolved fresh each frame so the fight follows the player across ship changes, and falls
     * back to the ship the scenario started them in for the window before flight mode is entered
     * (flightState is still empty while the system is being handed over).
     */
    private livePlayerShip(): Spaceship | null {
        const candidates = [flightState.activeShip, flightState.knownShip, this.initialPlayerShip];
        for (const ship of candidates) {
            if (ship && !ship._isDisposed && ship.mesh) return ship;
        }
        return null;
    }

    update(simDt: number): void {
        // Nobody left to fight, and nothing to anchor a respawn on. Deliberately does NOT latch:
        // the player can lose a ship and get another one, and the scenario resumes when they do.
        const player = this.livePlayerShip();
        if (!player) return;

        // Paused: freeze the respawn countdown along with everything else.
        if (simDt <= 0) return;

        if (this.npc && this.npc._isDisposed) {
            this.npc = null;
            this.kills++;
            this.respawnTimer = TEST_AI_SHIPS_RESPAWN_DELAY;
            this.dependencies.addEvent({
                message: `Hostile destroyed (${this.kills}). Another is inbound.`,
                notificationType: NotificationType.Info,
            });
        }

        if (!this.npc) {
            this.respawnTimer -= simDt;
            if (this.respawnTimer <= 0) {
                // Contained rather than allowed to propagate: ScenarioManager stops a scenario
                // that throws from update(), which would turn one bad spawn into a permanently
                // dead scenario with no further respawns. Log it and try again next tick.
                try {
                    this.spawnNpc(player);
                } catch (e) {
                    console.error('[test-ai-ships] failed to spawn NPC; retrying:', e);
                    this.respawnTimer = TEST_AI_SHIPS_RESPAWN_DELAY;
                }
            }
        }
    }

    dispose(): void {
        // The NPC is an ordinary body; the system teardown disposes it.
        this.npc = null;
    }

    /**
     * Build a replacement NPC a fixed distance from the player, on a random bearing.
     *
     * It inherits the player's velocity outright rather than being given its own orbital
     * solution. At this range the difference in orbital speed between the two positions is a
     * fraction of a metre per second, so matching velocities both starts the pair at rest
     * relative to each other — letting the AI's own approach controller own the entire closing
     * phase — and guarantees neither ship is spawned onto a trajectory into the star.
     */
    private spawnNpc(anchor: Spaceship): void {
        // Uniform random direction on the sphere, so respawns are not biased to a plane.
        const bearing = new THREE.Vector3(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1
        );
        // Guard the vanishingly unlikely zero vector, which would normalize to (0,0,0) and stack
        // the NPC on top of the player.
        if (bearing.lengthSq() < 1e-12) bearing.set(1, 0, 0);
        bearing.normalize();

        const position = anchor.mesh.position
            .clone()
            .addScaledVector(bearing, TEST_AI_SHIPS_SPAWN_DISTANCE);

        const ship = createNpcShip({
            dependencies: this.dependencies,
            scene: this.scene,
            position,
            velocity: anchor.velocity.clone(),
            name: 'NPC Zenith',
            ai: (s) => new CombatShipAI(s),
        });

        // Face the player from the outset, so the respawn reads as a deliberate attack run.
        // Ships are +Z forward while Matrix4.lookAt aims -Z at its target, so the eye is placed
        // one unit along the desired heading and aimed back at the ship — the same inversion the
        // system generators use.
        const heading = new THREE.Vector3().subVectors(anchor.mesh.position, position).normalize();
        const eye = position.clone().add(heading);
        const m = new THREE.Matrix4().lookAt(eye, position, new THREE.Vector3(0, 1, 0));
        ship.mesh.quaternion.setFromRotationMatrix(m);
        ship.controlFrameQuat.copy(ship.mesh.quaternion);
        ship.isThreat = true;

        // Order matters: the body list first, the NPC registry second. The registry must never
        // hold a ship the physics loop cannot see, or its AI would fly it while gravity did not
        // yet act on it.
        this.dependencies.addBody(ship);
        registerNpcShip(ship);

        this.npc = ship;
        console.info('[test-ai-ships] NPC respawned at', TEST_AI_SHIPS_SPAWN_DISTANCE, 'units');
    }
}
