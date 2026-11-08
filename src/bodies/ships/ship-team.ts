/**
 * Ship classification and team allegiance.
 *
 * `ShipRole` says what a ship is (a small fighter or a capital ship / mothership), so AI target
 * selection can prioritise e.g. "enemy motherships first". `ShipTeam` says whose side a ship is
 * on. A `null` team means "no team": the legacy behaviour, where an AI ship simply attacks the
 * player and the player's threat flags are set by hand.
 */
export enum ShipRole {
    Fighter = 'fighter',
    Capital = 'capital',
    SuperCapital = 'super_capital',
}

/** A team identifier. Ships with different non-null teams are hostile to each other. */
export type ShipTeam = string;

/** Humanity's fleet: Zenith, Dart, Osiris, Paladin. */
export const TEAM_EARTH: ShipTeam = 'earth';
/** The alien invasion fleet: Harbinger, Wraith, Stinger. */
export const TEAM_ALIEN: ShipTeam = 'alien';

/** Display names for the built-in teams (used in HUD / event-log text). */
export function teamDisplayName(team: ShipTeam | null): string {
    if (team === TEAM_EARTH) return 'Team Earth';
    if (team === TEAM_ALIEN) return 'Team Alien';
    return team ?? 'Unaligned';
}
