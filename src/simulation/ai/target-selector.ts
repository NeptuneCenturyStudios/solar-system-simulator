import type { Spaceship } from '../../bodies/ships/spaceship';
import { ShipRole } from '../../bodies/ships/ship-team';
import { areHostile, playerShip } from '../teams';
import { simulationState } from '../simulation';

/**
 * Team-aware target selection for AI ships.
 *
 * A ship on a team picks among hostile ships by **role priority** first: fighters go after
 * enemy fighters before enemy capital ships, and capital ships duel enemy capitals before
 * turning on fighters. Within the highest-priority role that has any candidate, the pick is
 * the cheapest by score:
 *
 *     score = hullGap × (1 + ATTACKER_PENALTY × attackersAlready) × (player ? PLAYER_PENALTY : 1)
 *
 * The attacker term spreads a fleet across the enemy instead of everyone dog-piling the
 * nearest ship. The player term keeps the AI from swarming the player while other targets are
 * available — the player is still picked when they are the only target left in that role (or
 * when they are much closer than anything else).
 *
 * The choice is re-evaluated every few sim-seconds with hysteresis, so a ship commits to a
 * target instead of flipping between two at similar range. A target that dies or stops being
 * hostile is dropped immediately.
 */

/** Per-AI targeting rules. */
export interface ITargetingProfile {
    /** Roles to hunt, most preferred first. Roles not listed are never targeted. */
    priorities: ShipRole[];
    /** Score multiplier applied to the player's ship. > 1 makes the AI prefer other targets. */
    playerPenalty: number;
    /** Sim-seconds between re-evaluations of the current choice. */
    reevaluateSecs: number;
}

/** Fraction of score added per other AI ship already engaging a candidate. */
const ATTACKER_PENALTY = 0.75;
/** A challenger must score below this fraction of the current target's score to replace it. */
const SWITCH_HYSTERESIS = 0.6;

const FIGHTER_PROFILE: ITargetingProfile = {
    priorities: [ShipRole.Fighter, ShipRole.Capital],
    playerPenalty: 4,
    reevaluateSecs: 4,
};

const CAPITAL_PROFILE: ITargetingProfile = {
    priorities: [ShipRole.Capital, ShipRole.Fighter],
    playerPenalty: 4,
    reevaluateSecs: 6,
};

/** Default targeting rules for a ship of the given role. */
export function defaultTargetingProfile(role: ShipRole): ITargetingProfile {
    const base = role === ShipRole.Capital ? CAPITAL_PROFILE : FIGHTER_PROFILE;
    return { ...base, priorities: [...base.priorities] };
}

/** Anything that can report what it is currently shooting at. */
interface ITargetHolder {
    readonly currentTarget: Spaceship | null;
}

/** Live, hostile, flyable ship that `self` may attack. */
function isValidTarget(self: Spaceship, candidate: Spaceship | null): candidate is Spaceship {
    return (
        !!candidate &&
        candidate !== self &&
        !candidate._isDisposed &&
        !!candidate.mesh &&
        areHostile(self, candidate) &&
        simulationState.bodies.includes(candidate)
    );
}

export class TargetSelector implements ITargetHolder {
    private _current: Spaceship | null = null;
    private timer = 0;
    /** Ship to skip on the next pick only (see invalidate). */
    private avoidOnce: Spaceship | null = null;

    constructor(
        private readonly self: Spaceship,
        public profile: ITargetingProfile = defaultTargetingProfile(self.role)
    ) {}

    /** The ship currently targeted, or null. */
    get currentTarget(): Spaceship | null {
        return this._current;
    }

    /**
     * Advance the re-evaluation clock and update the choice when due (or immediately when the
     * current target became invalid). Call once per frame, before the AI reads the target.
     */
    tick(simDt: number): void {
        this.timer -= simDt;
        const valid = isValidTarget(this.self, this._current);
        if (valid && this.timer > 0) return;
        this.timer = this.profile.reevaluateSecs;
        this._current = this.choose(valid ? this._current : null);
    }

    /**
     * Force a fresh pick on the next tick (e.g. after a scenario changes teams).
     *
     * @param avoid A ship to pass over for that one pick, as long as anything else is available
     *   (e.g. a target a teammate keeps screening).
     */
    invalidate(avoid: Spaceship | null = null): void {
        this.timer = 0;
        this.avoidOnce = avoid;
    }

    private choose(current: Spaceship | null): Spaceship | null {
        const self = this.self;
        const candidates: Spaceship[] = [];
        const player = playerShip();
        for (const npc of simulationState.npcShips) {
            if (isValidTarget(self, npc)) candidates.push(npc);
        }
        if (player && !candidates.includes(player) && isValidTarget(self, player)) {
            candidates.push(player);
        }

        const avoid = this.avoidOnce;
        this.avoidOnce = null;
        if (avoid && candidates.length > 1) {
            const i = candidates.indexOf(avoid);
            if (i !== -1) {
                candidates.splice(i, 1);
                // No hysteresis toward a target we are deliberately leaving.
                if (current === avoid) current = null;
            }
        }
        if (candidates.length === 0) return null;

        for (const role of this.profile.priorities) {
            let best: Spaceship | null = null;
            let bestScore = Infinity;
            let currentScore = Infinity;
            for (const c of candidates) {
                if (c.role !== role) continue;
                const score = this.score(c, player);
                if (c === current) currentScore = score;
                if (score < bestScore) {
                    bestScore = score;
                    best = c;
                }
            }
            if (!best) continue;
            // Hysteresis: keep the current target (if it is in this role tier) unless the
            // challenger is clearly better.
            if (
                current &&
                currentScore < Infinity &&
                bestScore > currentScore * SWITCH_HYSTERESIS
            ) {
                return current;
            }
            return best;
        }
        return null;
    }

    private score(candidate: Spaceship, player: Spaceship | null): number {
        const self = this.self;
        const gap = Math.max(
            0,
            self.mesh.position.distanceTo(candidate.mesh.position) - candidate.radius - self.radius
        );
        let attackers = 0;
        for (const npc of simulationState.npcShips) {
            if (npc === self) continue;
            const holder = npc.ai as Partial<ITargetHolder> | null;
            if (holder && holder.currentTarget === candidate) attackers++;
        }
        // Floor the distance so a target in contact still accrues the attacker penalty.
        let s = (gap + self.radius) * (1 + ATTACKER_PENALTY * attackers);
        if (candidate === player) s *= this.profile.playerPenalty;
        return s;
    }
}
