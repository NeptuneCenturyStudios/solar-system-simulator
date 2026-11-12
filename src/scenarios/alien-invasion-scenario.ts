import * as THREE from 'three';

import { triggerScenarioMessage } from '../drawing/scenario-message-hud';
import { hideTeamScoreHud, showTeamScoreHud, updateTeamScoreHud } from '../drawing/team-score-hud';
import type { TeamScore } from '../drawing/team-score-hud';
import { NotificationType } from '../event-log/event-log';
import type { IScenario, IStateDependencies } from '../interfaces';
import { ScenarioLock } from '../interfaces';
import type { Body } from '../bodies/body';
import type { Spaceship } from '../bodies/ships/spaceship';
import { Wormhole } from '../bodies/wormhole';
import { getShipTypeById } from '../bodies/ships/ship-registry';
import { ShipRole, TEAM_ALIEN, TEAM_EARTH, teamDisplayName } from '../bodies/ships/ship-team';
import { CombatShipAI } from '../simulation/ai/combat-ship-ai';
import { SoundEffect, playSoundEffect } from '../utilities/audio';
import { createUniqueId } from '../utilities/utilities';
import {
    ALIEN_INVASION_ARRIVAL_RANGE,
    ALIEN_INVASION_ARRIVAL_SECS,
    ALIEN_INVASION_BOMBARD_STANDOFF_FACTOR,
    ALIEN_INVASION_EMERGE_GROUP_SIZE,
    ALIEN_INVASION_EMERGE_INTERVAL,
    ALIEN_INVASION_EMERGE_OFFSET,
    ALIEN_INVASION_EMERGE_SPACING,
    ALIEN_INVASION_WORLD_DESTROYER_DELAY,
    ALIEN_INVASION_WORMHOLE_LINGER,
} from '../utilities/consts';
import { addShipLive, spawnFleetShip } from './fleet-spawn';
import { reportScenarioOutcome, requestPlayerDownChoice } from './scenario-outcome';

/**
 * Where the scenario is:
 *  - `waiting`: distress call sent; the wormhole is open and the Team Earth fleet is
 *    investigating it. Ends after ALIEN_INVASION_ARRIVAL_SECS, or as soon as the player is within
 *    ALIEN_INVASION_ARRIVAL_RANGE of the wormhole.
 *  - `emerging`: the alien fleet comes through the wormhole in groups, which then closes.
 *  - `battle`: the fleets fight it out until one side (or Earth) is gone.
 */
type InvasionPhase = 'waiting' | 'emerging' | 'battle';

/**
 * Where the super capital (World Destroyer) is: not called in yet, on its way through the
 * re-opened wormhole, or through it.
 */
type SuperCapitalState = 'none' | 'incoming' | 'arrived';

/** Everything the scenario needs from its generator. */
export interface IAlienInvasionSetup {
    playerShip: Spaceship;
    /** Team Earth's AI ships (the player is not included). */
    earthFleet: Spaceship[];
    /** Ship type ids of the alien capital ships; they emerge first, together. */
    alienCapitals: string[];
    /** Ship type ids of the alien fighters, in emergence order. */
    alienFighters: string[];
    /**
     * Ship type id of the alien super capital. It is held back until the motherships turn on
     * Earth, then comes through a re-opened wormhole and targets nothing but Earth.
     */
    alienSuperCapital: string;
    wormhole: Wormhole;
    earth: Body;
}

/**
 * Alien Invasion: a full Team Earth vs Team Alien fleet battle at Earth.
 *
 * The player starts behind the Team Earth fleet and receives a distress call: a red, unlinked
 * wormhole has opened near Earth and the fleet is investigating it. After
 * ALIEN_INVASION_ARRIVAL_SECS (or once the player is close) the alien fleet — two Harbinger
 * motherships and their Wraiths and Stingers — comes through, the wormhole collapses, and a
 * second call reports that Earth is under attack.
 * A team score panel stays on screen from then on.
 *
 * Once every Team Earth capital ship is down, the Harbingers turn on Earth itself. At that moment
 * the wormhole re-opens where it first appeared and, ALIEN_INVASION_WORLD_DESTROYER_DELAY later,
 * the World Destroyer comes through it. It ignores every ship and bombards Earth; the wormhole
 * collapses again behind it. As a super capital it outranks the motherships in Team Earth's
 * targeting, so the fleet focuses it once no alien fighters are left to engage.
 *
 * Outcome:
 *  - fails when every Team Earth ship (the player included) is destroyed, or Earth is;
 *  - succeeds when every alien ship is destroyed.
 * The player's death alone is not a failure while their team fights on: they are offered a
 * restart or to spectate the rest of the battle.
 */
export class AlienInvasionScenario implements IScenario {
    readonly name = 'Alien Invasion';
    readonly locks = [ScenarioLock.AddBody, ScenarioLock.EditBody, ScenarioLock.DeleteBody];

    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    private readonly playerShip: Spaceship;
    private readonly earth: Body;
    /** The current wormhole: the original, or the re-opened one once the super capital is called. */
    private wormhole: Wormhole;
    /** The original wormhole's placement, kept so it can re-open in the same spot. */
    private readonly wormholeOffsetFromEarth: THREE.Vector3;
    private readonly wormholeQuaternion: THREE.Quaternion;
    private readonly wormholeRadius: number;
    private readonly wormholeName: string;
    /** The whole alien fleet in emergence order: capitals, then fighters. */
    private readonly alienRoster: string[];
    private readonly alienCapitals: string[];
    private readonly alienSuperCapital: string;
    private superCapitalState: SuperCapitalState = 'none';
    /** Sim-seconds until the super capital comes through, while it is incoming. */
    private superCapitalTimer = 0;

    /** Team Earth ships, the player included. */
    private readonly earthShips: Spaceship[];
    /** Alien ships that have emerged so far. */
    private readonly alienShips: Spaceship[] = [];

    private phase: InvasionPhase = 'waiting';
    /** Sim-seconds since the scenario started. */
    private elapsed = 0;
    /** Index into alienRoster of the next ship to emerge. */
    private nextEmerge = 0;
    /** Sim-seconds until the next group emerges. */
    private emergeTimer = 0;
    /** Sim-seconds until the wormhole closes, once the last ship is through; null until then. */
    private closeTimer: number | null = null;

    private bombarding = false;
    private finished = false;
    private disposed = false;
    private playerDownHandled = false;
    /** The ship the camera is following while spectating, or null when not spectating. */
    private spectated: Spaceship | null = null;
    private spectating = false;

    private readonly onShipDestroyed = (e: WindowEventMap['ship:destroyed']): void => {
        const { ship, team, killer } = e.detail;
        if (!this.earthShips.includes(ship) && !this.alienShips.includes(ship)) return;
        const killerName = killer && killer !== ship ? ` by ${killer.name}` : '';
        this.dependencies.addEvent({
            message: `${ship.name} (${teamDisplayName(team)}) destroyed${killerName}.`,
            notificationType: team === TEAM_EARTH ? NotificationType.Alert : NotificationType.Info,
        });
    };

    constructor(dependencies: IStateDependencies, scene: THREE.Scene, setup: IAlienInvasionSetup) {
        this.dependencies = dependencies;
        this.scene = scene;
        this.playerShip = setup.playerShip;
        this.earth = setup.earth;
        this.wormhole = setup.wormhole;
        this.wormholeOffsetFromEarth = setup.wormhole.mesh.position
            .clone()
            .sub(setup.earth.mesh.position);
        this.wormholeQuaternion = setup.wormhole.mesh.quaternion.clone();
        this.wormholeRadius = setup.wormhole.radius;
        this.wormholeName = setup.wormhole.name;
        this.alienSuperCapital = setup.alienSuperCapital;
        this.alienCapitals = [...setup.alienCapitals];
        this.alienRoster = [...setup.alienCapitals, ...setup.alienFighters];
        this.earthShips = [setup.playerShip, ...setup.earthFleet];
    }

    start(): void {
        // Hidden so the player can't swap ships from Flight Controls mid-battle.
        this.dependencies.setPanelManagerVisible(false);
        window.addEventListener('ship:destroyed', this.onShipDestroyed);
        // Selected so the stats panel shows it and the autopilot can be pointed at it.
        this.dependencies.selectBody(this.wormhole);

        playSoundEffect(SoundEffect.AssistanceNeeded);
        this.dependencies.addEvent({
            message:
                'Distress call: an unstable wormhole has opened near Earth. The fleet is investigating and requests assistance.',
            notificationType: NotificationType.Alert,
        });
        triggerScenarioMessage('DISTRESS CALL — join the fleet at the wormhole!', {
            holdSecs: 4,
            fontSizePx: 32,
        });
    }

    update(simDt: number): void {
        if (this.finished || this.disposed) return;

        // Before the pause gate, so the player-down prompt is never missed.
        if (this.playerShip._isDisposed && !this.playerDownHandled) this.onPlayerDown();

        if (simDt <= 0) return;
        this.elapsed += simDt;

        if (this.phase === 'waiting') {
            const near =
                !this.playerShip._isDisposed &&
                this.playerShip.mesh.position.distanceTo(this.wormhole.mesh.position) <=
                    ALIEN_INVASION_ARRIVAL_RANGE;
            if (near || this.elapsed >= ALIEN_INVASION_ARRIVAL_SECS) this.beginEmergence();
        }
        if (this.phase === 'emerging') this.updateEmergence(simDt);
        if (this.superCapitalState === 'incoming') this.updateSuperCapitalArrival(simDt);
        this.updateWormholeClose(simDt);

        if (this.spectating && (!this.spectated || this.spectated._isDisposed)) {
            this.spectateNext();
        }

        if (this.phase !== 'waiting') this.updateBattle();
    }

    dispose(): void {
        this.disposed = true;
        window.removeEventListener('ship:destroyed', this.onShipDestroyed);
        hideTeamScoreHud();
        this.dependencies.setPanelManagerVisible(true);
    }

    // ── Emergence ────────────────────────────────────────────────────────────

    private beginEmergence(): void {
        this.phase = 'emerging';
        this.emergeTimer = 0;

        playSoundEffect(SoundEffect.EarthUnderAttack);
        this.dependencies.addEvent({
            message: 'Alien ships are pouring out of the wormhole. Earth is under attack!',
            notificationType: NotificationType.Alert,
        });
        triggerScenarioMessage('ALERT — EARTH IS UNDER ATTACK!', { holdSecs: 4, fontSizePx: 36 });
        showTeamScoreHud(this.score());
    }

    private updateEmergence(simDt: number): void {
        this.emergeTimer -= simDt;
        if (this.emergeTimer > 0) return;
        this.emergeTimer = ALIEN_INVASION_EMERGE_INTERVAL;

        // Motherships come through together, side by side; fighters follow in groups.
        const groupSize =
            this.nextEmerge < this.alienCapitals.length
                ? this.alienCapitals.length - this.nextEmerge
                : ALIEN_INVASION_EMERGE_GROUP_SIZE;
        const group = this.alienRoster.slice(this.nextEmerge, this.nextEmerge + groupSize);
        this.nextEmerge += group.length;
        this.spawnGroup(group);

        if (this.nextEmerge >= this.alienRoster.length) {
            this.phase = 'battle';
            this.closeTimer = ALIEN_INVASION_WORMHOLE_LINGER;
        }
    }

    private isCapitalType(typeId: string): boolean {
        return this.alienCapitals.includes(typeId);
    }

    /**
     * Bring `typeIds` through the wormhole: each ship appears just past the mouth on its exit
     * side — so it never crosses the lethal plane — spread across the disc, heading out along
     * the exit normal toward the Team Earth fleet, at the wormhole's velocity.
     */
    private spawnGroup(typeIds: string[]): Spaceship[] {
        const spawned: Spaceship[] = [];
        const centre = this.wormhole.mesh.position;
        const normal = this.wormhole.getEntranceNormal();
        // Two axes spanning the mouth.
        const u = new THREE.Vector3(0, 1, 0);
        if (Math.abs(u.dot(normal)) > 0.9) u.set(1, 0, 0);
        u.addScaledVector(normal, -u.dot(normal)).normalize();
        const v = new THREE.Vector3().crossVectors(normal, u);

        typeIds.forEach((typeId, i) => {
            // Centre, then a ring around it.
            const angle = (i / Math.max(1, typeIds.length - 1)) * Math.PI * 2;
            const r = i === 0 ? 0 : ALIEN_INVASION_EMERGE_SPACING;
            const capital = this.isCapitalType(typeId);
            const spread = capital
                ? (i - (typeIds.length - 1) / 2) * ALIEN_INVASION_EMERGE_SPACING * 2
                : 0;
            const position = centre
                .clone()
                .addScaledVector(normal, ALIEN_INVASION_EMERGE_OFFSET)
                .addScaledVector(u, capital ? 0 : Math.cos(angle) * r)
                .addScaledVector(v, capital ? spread : Math.sin(angle) * r);

            const count = this.alienShips.filter((s) => s.shipTypeId === typeId).length + 1;
            const ship = spawnFleetShip({
                dependencies: this.dependencies,
                scene: this.scene,
                shipTypeId: typeId,
                position,
                velocity: this.wormhole.velocity,
                heading: normal,
                team: TEAM_ALIEN,
                name: `${getShipTypeById(typeId).label} ${count}`,
            });
            // Clear its hull of the mouth, whatever its size.
            ship.mesh.position.addScaledVector(normal, ship.radius);
            addShipLive(this.dependencies, ship);
            this.alienShips.push(ship);
            spawned.push(ship);
        });
        return spawned;
    }

    // ── Super capital ────────────────────────────────────────────────────────

    /**
     * Re-open the wormhole where it first appeared (it keeps pace with Earth, so the same offset
     * from Earth) and start the countdown to the super capital coming through.
     */
    private callSuperCapital(): void {
        if (this.superCapitalState !== 'none') return;
        this.superCapitalState = 'incoming';
        this.superCapitalTimer = ALIEN_INVASION_WORLD_DESTROYER_DELAY;

        if (this.wormhole._isDisposed) {
            const wormhole = new Wormhole(
                this.dependencies,
                this.scene,
                this.earth.mesh.position.clone().add(this.wormholeOffsetFromEarth),
                this.wormholeRadius,
                createUniqueId('wormhole'),
                this.wormholeName
            );
            wormhole.mesh.quaternion.copy(this.wormholeQuaternion);
            wormhole.velocity.copy(this.earth.velocity);
            this.dependencies.addBody(wormhole);
            this.wormhole = wormhole;
        } else {
            // Still lingering after the main fleet: keep it open for the super capital.
            this.closeTimer = null;
        }

        this.dependencies.addEvent({
            message: 'The wormhole is re-opening. Something massive is coming through!',
            notificationType: NotificationType.Alert,
        });
        triggerScenarioMessage('WARNING — THE WORMHOLE IS RE-OPENING!', {
            holdSecs: 3,
            fontSizePx: 32,
            queue: true,
        });
    }

    /** Count down to the super capital's arrival, then bring it through, aimed at Earth. */
    private updateSuperCapitalArrival(simDt: number): void {
        this.superCapitalTimer -= simDt;
        if (this.superCapitalTimer > 0) return;
        this.superCapitalState = 'arrived';

        // Earth died during the countdown: there is nothing left for it to do.
        if (this.earth._isDisposed || this.wormhole._isDisposed) return;

        for (const ship of this.spawnGroup([this.alienSuperCapital])) {
            if (ship.ai instanceof CombatShipAI) {
                ship.ai.setBombardTarget(this.earth, ALIEN_INVASION_BOMBARD_STANDOFF_FACTOR);
            }
        }
        this.closeTimer = ALIEN_INVASION_WORMHOLE_LINGER;

        // Re-pick now rather than at each ship's next re-evaluation: the super capital outranks
        // the motherships (see target-selector.ts), while alien fighters still come first.
        for (const ship of this.alive(this.earthShips)) {
            if (ship.ai instanceof CombatShipAI) ship.ai.targetSelector.invalidate();
        }

        playSoundEffect(SoundEffect.HostilesInbound);
        const label = getShipTypeById(this.alienSuperCapital).label;
        this.dependencies.addEvent({
            message: `A ${label} has emerged from the wormhole and is targeting Earth!`,
            notificationType: NotificationType.Alert,
        });
        triggerScenarioMessage(`ALERT — A ${label.toUpperCase()} IS TARGETING EARTH!`, {
            holdSecs: 4,
            fontSizePx: 36,
            queue: true,
        });
        this.dependencies.addEvent({
            message: `All Team Earth ships: focus fire on the ${label}!`,
            notificationType: NotificationType.Alert,
        });
        triggerScenarioMessage(`FOCUS FIRE ON THE ${label.toUpperCase()}!`, {
            holdSecs: 3,
            fontSizePx: 32,
            queue: true,
        });
    }

    private updateWormholeClose(simDt: number): void {
        if (this.closeTimer === null) return;
        this.closeTimer -= simDt;
        if (this.closeTimer > 0) return;
        this.closeTimer = null;
        if (!this.wormhole._isDisposed) {
            this.wormhole.die({ skipExplosion: true, skipImpactSound: true });
            triggerScenarioMessage('The wormhole has collapsed.', {
                holdSecs: 2,
                fontSizePx: 28,
                queue: true,
            });
        }
    }

    // ── Battle ───────────────────────────────────────────────────────────────

    private updateBattle(): void {
        updateTeamScoreHud(this.score());

        if (
            !this.bombarding &&
            this.alienShips.length > 0 &&
            this.alive(this.earthShips).every((s) => s.role !== ShipRole.Capital)
        ) {
            this.beginBombardment();
        }

        if (this.earth._isDisposed) {
            this.finish('failed', 'Earth has been destroyed.');
        } else if (this.alive(this.earthShips).length === 0) {
            this.finish('failed', 'Team Earth has been wiped out.');
        } else if (
            this.phase === 'battle' &&
            this.superCapitalState !== 'incoming' &&
            this.alive(this.alienShips).length === 0
        ) {
            this.finish('succeeded', 'The alien invasion has been repelled.');
        }
    }

    /**
     * Every Team Earth capital is down: the motherships turn their guns on Earth, and the
     * wormhole re-opens for the super capital.
     */
    private beginBombardment(): void {
        const motherships = this.alive(this.alienShips).filter((s) => s.role === ShipRole.Capital);
        if (motherships.length === 0) return;
        this.bombarding = true;
        for (const ship of motherships) {
            if (ship.ai instanceof CombatShipAI) {
                ship.ai.setBombardTarget(this.earth, ALIEN_INVASION_BOMBARD_STANDOFF_FACTOR);
            }
        }
        this.dependencies.addEvent({
            message:
                'The fleet capital ships are down. The alien motherships are turning on Earth!',
            notificationType: NotificationType.Alert,
        });
        triggerScenarioMessage('The motherships are turning on Earth!', {
            holdSecs: 3,
            fontSizePx: 32,
        });
        this.callSuperCapital();
    }

    private alive(ships: Spaceship[]): Spaceship[] {
        return ships.filter((s) => !s._isDisposed);
    }

    private score(): TeamScore {
        return {
            earthAlive: this.alive(this.earthShips).length,
            earthTotal: this.earthShips.length,
            alienAlive: this.alive(this.alienShips).length,
            // The whole roster, so the bar reads as the fleet still coming through — plus the
            // super capital once it has been called in.
            alienTotal: this.alienRoster.length + (this.superCapitalState === 'none' ? 0 : 1),
            earthIntegrity: this.bombarding
                ? Math.max(0, this.earth.healthPoints / this.earth.maxHealthPoints)
                : null,
        };
    }

    // ── Player down / spectate ───────────────────────────────────────────────

    private onPlayerDown(): void {
        this.playerDownHandled = true;
        // With nobody left on Team Earth, the battle-end check reports the failure instead.
        if (this.alive(this.earthShips).length === 0) return;
        void requestPlayerDownChoice(this.name).then((choice) => {
            if (choice !== 'spectate' || this.finished || this.disposed) return;
            this.spectating = true;
            this.spectateNext();
        });
    }

    /** Follow a surviving Team Earth ship — a capital if any is left. */
    private spectateNext(): void {
        const alive = this.alive(this.earthShips);
        const next = alive.find((s) => s.role === ShipRole.Capital) ?? alive[0] ?? null;
        this.spectated = next;
        if (next) this.dependencies.spectateBody(next);
    }

    private finish(outcome: 'failed' | 'succeeded', message: string): void {
        this.finished = true;
        playSoundEffect(outcome === 'failed' ? SoundEffect.EarthDestroyed : SoundEffect.EarthSaved);
        const score = this.score();
        this.dependencies.addEvent({
            message,
            notificationType:
                outcome === 'failed' ? NotificationType.Alert : NotificationType.Success,
        });
        reportScenarioOutcome({
            outcome,
            scenarioName: this.name,
            message,
            stats: [
                {
                    label: 'Team Earth ships left',
                    value: `${score.earthAlive} / ${score.earthTotal}`,
                },
                {
                    label: 'Alien ships destroyed',
                    value: `${score.alienTotal - score.alienAlive} / ${score.alienTotal}`,
                },
                {
                    label: 'Earth integrity',
                    value: this.earth._isDisposed
                        ? 'Destroyed'
                        : `${Math.round((this.earth.healthPoints / this.earth.maxHealthPoints) * 100)}%`,
                },
            ],
        });
    }
}
