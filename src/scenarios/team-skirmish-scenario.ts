import { triggerScenarioMessage } from '../drawing/scenario-message-hud';
import { NotificationType } from '../event-log/event-log';
import type { IScenario, IStateDependencies } from '../interfaces';
import { ScenarioLock } from '../interfaces';
import type { Spaceship } from '../bodies/ships/spaceship';
import { TEAM_ALIEN, TEAM_EARTH, teamDisplayName } from '../bodies/ships/ship-team';
import { reportScenarioOutcome } from './scenario-outcome';

/**
 * Test scenario for the alien-invasion prerequisites: a small Team Earth vs Team Alien fleet
 * battle near Earth, with every ship flying under locked guidance.
 *
 * What it exercises:
 *  - team tags / ship roles (threat flags, Tab target lock only cycling enemies),
 *  - the guidance velocity frame (everyone dogfights relative to Earth, not at 30 km/s),
 *  - team-aware AI (fighters engage fighters first, motherships duel each other, the player is
 *    not swarmed while other targets remain, AI holds fire with a teammate in the way),
 *  - kill attribution (`ship:destroyed` → event log).
 *
 * The player's death is not a failure while their team fights on — the battle continues and the
 * camera stays on the wreck. The scenario fails when every Team Earth ship is down and succeeds
 * when every Team Alien ship is.
 */
export class TeamSkirmishScenario implements IScenario {
    readonly name = 'Team Skirmish';
    readonly locks = [ScenarioLock.AddBody, ScenarioLock.EditBody, ScenarioLock.DeleteBody];

    private readonly dependencies: IStateDependencies;
    private readonly playerShip: Spaceship;
    /** Every ship in the battle, the player's included. */
    private readonly ships: Spaceship[];
    private finished = false;
    private playerDownReported = false;

    private readonly onShipDestroyed = (e: WindowEventMap['ship:destroyed']): void => {
        const { ship, team, killer } = e.detail;
        if (!this.ships.includes(ship)) return;
        const killerName = killer && killer !== ship ? ` by ${killer.name}` : '';
        this.dependencies.addEvent({
            message: `${ship.name} (${teamDisplayName(team)}) destroyed${killerName}. ${this.scoreLine()}`,
            notificationType: team === TEAM_EARTH ? NotificationType.Alert : NotificationType.Info,
        });
    };

    constructor(dependencies: IStateDependencies, playerShip: Spaceship, ships: Spaceship[]) {
        this.dependencies = dependencies;
        this.playerShip = playerShip;
        this.ships = [...ships];
    }

    start(): void {
        this.finished = false;
        this.playerDownReported = false;
        // Hidden so the player can't swap ships from Flight Controls mid-battle.
        this.dependencies.setPanelManagerVisible(false);
        window.addEventListener('ship:destroyed', this.onShipDestroyed);

        this.dependencies.addEvent({
            message: `Team Skirmish: ${this.alive(TEAM_EARTH)} Team Earth vs ${this.alive(TEAM_ALIEN)} Team Alien. Guidance is locked on.`,
            notificationType: NotificationType.Alert,
        });
        triggerScenarioMessage('TEAM SKIRMISH — destroy the alien fleet!', {
            holdSecs: 3,
            fontSizePx: 32,
        });
    }

    update(simDt: number): void {
        if (this.finished || simDt <= 0) return;

        if (this.playerShip._isDisposed && !this.playerDownReported) {
            this.playerDownReported = true;
            triggerScenarioMessage('Your ship is down — the battle continues.', {
                holdSecs: 3,
                fontSizePx: 28,
            });
        }

        const earth = this.alive(TEAM_EARTH);
        const alien = this.alive(TEAM_ALIEN);
        if (earth === 0) this.finish('failed', 'Team Earth has been wiped out.');
        else if (alien === 0) this.finish('succeeded', 'The alien fleet has been destroyed.');
    }

    dispose(): void {
        window.removeEventListener('ship:destroyed', this.onShipDestroyed);
        this.dependencies.setPanelManagerVisible(true);
    }

    private alive(team: string): number {
        return this.ships.filter((s) => s.team === team && !s._isDisposed).length;
    }

    private total(team: string): number {
        return this.ships.filter((s) => s.team === team).length;
    }

    private scoreLine(): string {
        return `Earth ${this.alive(TEAM_EARTH)}/${this.total(TEAM_EARTH)} · Alien ${this.alive(TEAM_ALIEN)}/${this.total(TEAM_ALIEN)}`;
    }

    private finish(outcome: 'failed' | 'succeeded', message: string): void {
        this.finished = true;
        this.dependencies.addEvent({
            message: `${message} ${this.scoreLine()}`,
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
                    value: `${this.alive(TEAM_EARTH)} / ${this.total(TEAM_EARTH)}`,
                },
                {
                    label: 'Team Alien ships left',
                    value: `${this.alive(TEAM_ALIEN)} / ${this.total(TEAM_ALIEN)}`,
                },
            ],
        });
    }
}
