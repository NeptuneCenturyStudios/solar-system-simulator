import * as THREE from 'three';

import { triggerScenarioMessage } from '../drawing/scenario-message-hud';
import { NotificationType } from '../event-log/event-log';
import type { IScenario, IStateDependencies } from '../interfaces';
import { ScenarioLock } from '../interfaces';
import type { Spaceship } from '../bodies/ships/spaceship';
import { CombatShipAI } from '../simulation/ai/combat-ship-ai';
import { createNpcShip } from '../simulation/ai/npc-manager';
import {
    OSIRIS_AMBUSH_DART_FRACTION,
    OSIRIS_AMBUSH_MIN_SEPARATION_DEG,
    OSIRIS_AMBUSH_SPAWN_DISTANCE,
} from '../utilities/consts';
import { reportScenarioOutcome } from './scenario-outcome';

type HostileShipType = 'dart' | 'zenith';

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
 * Roll the ship type of each of `count` hostiles: OSIRIS_AMBUSH_DART_FRACTION of them Darts (rounded
 * to the nearest whole ship), the rest Zeniths, in random order.
 */
function pickShipTypes(count: number): HostileShipType[] {
    const darts = Math.round(count * OSIRIS_AMBUSH_DART_FRACTION);
    const types: HostileShipType[] = Array.from({ length: count }, (_, i) =>
        i < darts ? 'dart' : 'zenith'
    );
    // Fisher-Yates shuffle, so the type isn't tied to the bearing slot.
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
    }
    return types;
}

/**
 * Build the force of AI-piloted hostiles (a mix of Darts and Zeniths) around an anchor point,
 * ready to be added to the simulation.
 *
 * Like createNpcShip, this does NOT touch simulationState — the caller adds the bodies and
 * registers the NPCs.
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
    const types = pickShipTypes(count);
    const typeCounts: Record<HostileShipType, number> = { dart: 0, zenith: 0 };

    return pickBearings(count).map((bearing, index) => {
        const position = anchorPosition
            .clone()
            .addScaledVector(bearing, OSIRIS_AMBUSH_SPAWN_DISTANCE);

        const type = types[index];
        typeCounts[type]++;

        const ship = createNpcShip({
            dependencies,
            scene,
            position,
            velocity: anchorVelocity.clone(),
            shipTypeId: type,
            name: `NPC ${type === 'dart' ? 'Dart' : 'Zenith'} ${typeCounts[type]}`,
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
 * Scenario: the player, flying the Osiris Mothership, is hunted by a mixed force of AI Darts and
 * Zeniths.
 *
 * A survival scenario, like Asteroid Defense: the player wins by destroying every hostile and
 * loses the moment their own ship is destroyed. Destroyed hostiles are never replaced. The
 * outcome is reported through the scenario-agnostic reportScenarioOutcome.
 */
export class OsirisAmbushScenario implements IScenario {
    readonly name = 'Osiris Ambush';
    /** The panel manager is hidden for this scenario (see start()); these keep the System
     *  Explorer's add/edit/delete actions locked out even if it were shown. */
    readonly locks = [ScenarioLock.AddBody, ScenarioLock.EditBody, ScenarioLock.DeleteBody];

    private readonly dependencies: IStateDependencies;
    /** The player's ship, watched so its destruction ends the scenario in failure. */
    private readonly playerShip: Spaceship;

    /** The hostiles still alive. */
    private npcs: Spaceship[];
    /** Hostiles the scenario started with — the denominator of the reported score. */
    private readonly totalHostiles: number;
    /** Hostiles destroyed so far. */
    private kills = 0;
    /** Set once the scenario has ended; every further update is a no-op. */
    private finished = false;

    constructor(dependencies: IStateDependencies, playerShip: Spaceship, npcs: Spaceship[]) {
        this.dependencies = dependencies;
        this.playerShip = playerShip;
        this.npcs = [...npcs];
        this.totalHostiles = npcs.length;
    }

    start(): void {
        this.kills = 0;
        this.finished = false;
        this.npcs = this.npcs.filter((npc) => !npc._isDisposed);
        // Hidden so the player can't swap ships from Flight Controls, which would replace the
        // ship whose destruction means failure.
        this.dependencies.setPanelManagerVisible(false);

        this.dependencies.addEvent({
            message: `${this.npcs.length} hostile ships detected. They are closing on your position.`,
            notificationType: NotificationType.Alert,
        });
        triggerScenarioMessage(
            `WARNING: ${this.npcs.length} hostile ships inbound. Destroy them all!`,
            { holdSecs: 3, fontSizePx: 32 }
        );
    }

    update(simDt: number): void {
        if (this.finished) return;

        // Checked before the pause gate so a loss is never missed, and before the win check so a
        // simultaneous death counts as a loss.
        if (this.playerShip._isDisposed) {
            this.finishFailed('Your ship has been destroyed.');
            return;
        }

        // Paused: leave outcomes for the next running frame.
        if (simDt <= 0) return;

        const alive = this.npcs.filter((npc) => !npc._isDisposed);
        const destroyed = this.npcs.length - alive.length;
        if (destroyed === 0) return;

        this.kills += destroyed;
        this.npcs = alive;

        if (alive.length === 0) {
            this.finishSucceeded();
            return;
        }
        this.dependencies.addEvent({
            message: `Hostile destroyed (${alive.length} remaining).`,
            notificationType: NotificationType.Info,
        });
    }

    dispose(): void {
        // The NPCs are ordinary bodies; the system teardown disposes them.
        this.npcs = [];
        this.dependencies.setPanelManagerVisible(true);
    }

    private killStats(): { label: string; value: string }[] {
        return [{ label: 'Hostiles destroyed', value: `${this.kills} / ${this.totalHostiles}` }];
    }

    /** End the scenario in failure and report it once. */
    private finishFailed(reason: string): void {
        this.finished = true;
        this.dependencies.addEvent({
            message: `${reason} ${this.npcs.length} hostile${this.npcs.length === 1 ? '' : 's'} remained.`,
            notificationType: NotificationType.Alert,
        });
        reportScenarioOutcome({
            outcome: 'failed',
            scenarioName: this.name,
            message: reason,
            stats: this.killStats(),
        });
    }

    /** End the scenario in success: every hostile is down and the player's ship survived. */
    private finishSucceeded(): void {
        this.finished = true;
        this.dependencies.addEvent({
            message: `All ${this.totalHostiles} hostiles destroyed. You survived the ambush!`,
            notificationType: NotificationType.Success,
        });
        reportScenarioOutcome({
            outcome: 'succeeded',
            scenarioName: this.name,
            stats: this.killStats(),
        });
    }
}
