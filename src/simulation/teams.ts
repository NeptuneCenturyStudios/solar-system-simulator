import { Body } from '../bodies/body';
import { Spaceship } from '../bodies/ships/spaceship';
import type { ShipTeam } from '../bodies/ships/ship-team';
import { flightState, simulationState } from './simulation';

/**
 * Team relationships between ships.
 *
 * A ship with a `null` team is unaligned and is neither hostile nor friendly to anyone by team —
 * the legacy behaviour, where AI ships attack the player and `isThreat` is set by hand.
 */

/** The team a body fights for, or null for planets, asteroids and unaligned ships. */
export function teamOf(body: Body | null | undefined): ShipTeam | null {
    return body instanceof Spaceship ? body.team : null;
}

/** True when both bodies are on a team and the teams differ. */
export function areHostile(a: Body | null | undefined, b: Body | null | undefined): boolean {
    const ta = teamOf(a);
    const tb = teamOf(b);
    return ta !== null && tb !== null && ta !== tb;
}

/** True when both bodies are on the same (non-null) team. A ship is friendly to itself. */
export function areFriendly(a: Body | null | undefined, b: Body | null | undefined): boolean {
    const ta = teamOf(a);
    return ta !== null && ta === teamOf(b);
}

/** The player's ship (flying, or parked/known), if any. */
export function playerShip(): Spaceship | null {
    return flightState.activeShip ?? flightState.knownShip;
}

/**
 * Sync `isThreat` on every team-tagged NPC with whether it is hostile to the player's team, so
 * target lock (Tab), the red HUD theme and the threat indicators treat enemies — and only
 * enemies — as threats. Ships without a team (and every NPC while the player has no team) keep
 * whatever `isThreat` their scenario set.
 *
 * Call whenever an NPC registers or the player's ship / team changes.
 */
export function refreshThreatFlags(): void {
    const player = playerShip();
    if (!player || player.team === null) return;
    for (const npc of simulationState.npcShips) {
        if (npc.team === null || npc === player) continue;
        npc.isThreat = areHostile(player, npc);
    }
}
