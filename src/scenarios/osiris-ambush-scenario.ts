import * as THREE from 'three';

import { NotificationType } from '../event-log/event-log';
import type { IScenario, IStateDependencies } from '../interfaces';
import type { Spaceship } from '../bodies/ships/spaceship';
import { CombatShipAI } from '../simulation/ai/combat-ship-ai';
import { createNpcShip, registerNpcShip } from '../simulation/ai/npc-manager';
import { flightState } from '../simulation/simulation';
import {
    OSIRIS_AMBUSH_MIN_SEPARATION_DEG,
    OSIRIS_AMBUSH_NPC_COUNT,
    OSIRIS_AMBUSH_RESPAWN_DELAY,
    OSIRIS_AMBUSH_SPAWN_DISTANCE,
} from '../utilities/consts';

/** Attempts at finding a bearing clear of the others before the separation rule is waived. */
const MAX_BEARING_ATTEMPTS = 30;

/** Uniform random direction on the sphere. */
function randomBearing(): THREE.Vector3 {
    const bearing = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
    );
    // Guard the vanishingly unlikely zero vector, which would normalize to (0,0,0) and stack the
    // ship on top of the player.
    if (bearing.lengthSq() < 1e-12) bearing.set(1, 0, 0);
    return bearing.normalize();
}

/**
 * Pick `count` bearings from the player, each at least OSIRIS_AMBUSH_MIN_SEPARATION_DEG from every
 * other. Best effort: a bearing that can't find a clear slot in MAX_BEARING_ATTEMPTS is accepted
 * as-is, so a large `count` degrades to plain random instead of looping forever.
 */
function pickBearings(count: number): THREE.Vector3[] {
    const minCos = Math.cos(THREE.MathUtils.degToRad(OSIRIS_AMBUSH_MIN_SEPARATION_DEG));
    const bearings: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
        let candidate = randomBearing();
        for (let attempt = 0; attempt < MAX_BEARING_ATTEMPTS; attempt++) {
            // A larger cosine means a smaller angle, so any neighbour above minCos is too close.
            if (bearings.every((b) => b.dot(candidate) <= minCos)) break;
            candidate = randomBearing();
        }
        bearings.push(candidate);
    }
    return bearings;
}

/**
 * Build a wave of AI-piloted hostiles around an anchor point, ready to be added to the simulation.
 *
 * Shared by the generator (the opening wave, which goes into the system's body list) and the
 * scenario (every later wave), so the two cannot drift apart. Like createNpcShip, this does NOT
 * touch simulationState — the caller adds the bodies and registers the NPCs.
 *
 * Each ship inherits the anchor's velocity outright rather than being given its own orbital
 * solution: at this range the difference in orbital speed is a fraction of a metre per second, so
 * matching velocities starts the pair at rest relative to each other — letting the AI's own
 * approach controller own the entire closing phase.
 */
export function createHostileWave(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    anchorPosition: THREE.Vector3,
    anchorVelocity: THREE.Vector3,
    count: number
): Spaceship[] {
    return pickBearings(count).map((bearing, index) => {
        const position = anchorPosition
            .clone()
            .addScaledVector(bearing, OSIRIS_AMBUSH_SPAWN_DISTANCE);

        const ship = createNpcShip({
            dependencies,
            scene,
            position,
            velocity: anchorVelocity.clone(),
            name: `NPC Zenith ${index + 1}`,
            ai: (s) => new CombatShipAI(s),
        });

        // Face the player from the outset, so the spawn reads as a deliberate attack run. Ships
        // are +Z forward while Matrix4.lookAt aims -Z at its target, so the eye is placed one unit
        // along the desired heading and aimed back at the ship — the same inversion the system
        // generators use.
        const heading = bearing.clone().negate();
        const eye = position.clone().add(heading);
        const m = new THREE.Matrix4().lookAt(eye, position, new THREE.Vector3(0, 1, 0));
        ship.mesh.quaternion.setFromRotationMatrix(m);
        ship.controlFrameQuat.copy(ship.mesh.quaternion);
        ship.isThreat = true;

        return ship;
    });
}

/**
 * Scenario: the player, flying the Osiris Mothership, is hunted by a wave of AI ships.
 *
 * Like Test AI Ships there is no win condition, score or outcome modal — but the hostiles come in
 * waves. Destroying one does not bring a replacement; only once the *entire* wave is down does the
 * respawn countdown start, after which a fresh wave of OSIRIS_AMBUSH_NPC_COUNT arrives around the
 * player's current position.
 */
export class OsirisAmbushScenario implements IScenario {
    readonly name = 'Osiris Ambush';

    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    /**
     * The ship the generator started the player in. Only a fallback: the live ship is resolved
     * from flightState every frame, because spawning a different ship type from the Flight
     * Controls panel destroys this one and builds a replacement.
     */
    private readonly initialPlayerShip: Spaceship;

    /** The live hostiles of the current wave; empty while the next wave is counting down. */
    private npcs: Spaceship[];
    /** Sim-seconds until the next wave appears; only counts down while `npcs` is empty. */
    private respawnTimer = 0;
    /** Hostiles destroyed so far across all waves. */
    private kills = 0;
    /** The wave currently in play (the opening wave is 1). */
    private wave = 1;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        playerShip: Spaceship,
        npcs: Spaceship[]
    ) {
        this.dependencies = dependencies;
        this.scene = scene;
        this.initialPlayerShip = playerShip;
        this.npcs = [...npcs];
    }

    start(): void {
        this.kills = 0;
        this.wave = 1;
        this.respawnTimer = 0;
        this.dependencies.addEvent({
            message: `${this.npcs.length} hostile ships detected. They are closing on your position.`,
            notificationType: NotificationType.Alert,
        });
    }

    /**
     * The ship the player is currently flying, or null if they no longer have one. Falls back to
     * the ship the scenario started them in for the window before flight mode is entered.
     */
    private livePlayerShip(): Spaceship | null {
        const candidates = [flightState.activeShip, flightState.knownShip, this.initialPlayerShip];
        for (const ship of candidates) {
            if (ship && !ship._isDisposed && ship.mesh) return ship;
        }
        return null;
    }

    update(simDt: number): void {
        // Nobody left to fight, and nothing to anchor a wave on. Deliberately does NOT latch: the
        // player can lose a ship and get another one, and the scenario resumes when they do.
        const player = this.livePlayerShip();
        if (!player) return;

        // Paused: freeze the respawn countdown along with everything else.
        if (simDt <= 0) return;

        if (this.npcs.length > 0) {
            const alive = this.npcs.filter((npc) => !npc._isDisposed);
            const destroyed = this.npcs.length - alive.length;
            if (destroyed > 0) {
                this.kills += destroyed;
                this.npcs = alive;
                if (alive.length > 0) {
                    this.dependencies.addEvent({
                        message: `Hostile destroyed (${alive.length} remaining).`,
                        notificationType: NotificationType.Info,
                    });
                } else {
                    this.respawnTimer = OSIRIS_AMBUSH_RESPAWN_DELAY;
                    this.dependencies.addEvent({
                        message: `Wave ${this.wave} cleared (${this.kills} destroyed). Another wave is inbound.`,
                        notificationType: NotificationType.Info,
                    });
                }
            }
            return;
        }

        // Whole wave is down — count down to the next one.
        this.respawnTimer -= simDt;
        if (this.respawnTimer <= 0) {
            // Contained rather than allowed to propagate: ScenarioManager stops a scenario that
            // throws from update(), which would turn one bad spawn into a permanently dead
            // scenario with no further waves. Log it and try again after a delay.
            try {
                this.spawnWave(player);
            } catch (e) {
                console.error('[osiris-ambush] failed to spawn wave; retrying:', e);
                this.respawnTimer = OSIRIS_AMBUSH_RESPAWN_DELAY;
            }
        }
    }

    dispose(): void {
        // The NPCs are ordinary bodies; the system teardown disposes them.
        this.npcs = [];
    }

    private spawnWave(anchor: Spaceship): void {
        const wave = createHostileWave(
            this.dependencies,
            this.scene,
            anchor.mesh.position,
            anchor.velocity,
            OSIRIS_AMBUSH_NPC_COUNT
        );

        // Order matters: the body list first, the NPC registry second. The registry must never
        // hold a ship the physics loop cannot see, or its AI would fly it while gravity did not
        // yet act on it.
        for (const ship of wave) {
            this.dependencies.addBody(ship);
            registerNpcShip(ship);
        }

        this.npcs = wave;
        this.wave++;
        this.dependencies.addEvent({
            message: `Wave ${this.wave}: ${wave.length} hostile ships detected.`,
            notificationType: NotificationType.Alert,
        });
    }
}
