import {
    AI_AUTOPILOT_HIGH_TIER_ENGAGE,
    AI_AUTOPILOT_LOW_TIER_RELEASE,
    AI_HIGH_SPEED_ENGAGE_RANGE,
    AI_HIGH_SPEED_HANDOFF_RANGE,
} from '../../../utilities/consts';
import type { Spaceship } from '../../../bodies/ships/spaceship';

/**
 * Pick the flight tier from what a maneuver is actually asking of the ship — the AI-side
 * equivalent of the player's R key.
 *
 * The question is "can the low (dogfight) tier fly the velocity I want?", answered on the
 * *world* speed being commanded, since the ship's speed caps are world-frame. Near a planet that
 * means the planet's own orbital motion counts: holding station next to Earth asks for ~30 km/s,
 * far beyond the low tier, so the ship stays high even though it is barely moving relative to
 * Earth. Far from anything the range alone forces high, so a long haul isn't flown at a few km/s.
 *
 * Hysteresis on both: high once the commanded speed passes AI_AUTOPILOT_HIGH_TIER_ENGAGE of the
 * low tier's boost max (or the range passes AI_HIGH_SPEED_ENGAGE_RANGE), and back to low only
 * once it falls below AI_AUTOPILOT_LOW_TIER_RELEASE of it *and* the ship is already inside the low
 * envelope and within AI_HIGH_SPEED_HANDOFF_RANGE. A refused change (warp or a stop-brake owns the
 * speed) is simply retried next frame.
 *
 * Stateless: the ship's own `highSpeedMode` is the latch.
 *
 * Must run before anything reads `ship.handling` this frame.
 *
 * @param requiredSpeed Magnitude of the world velocity the maneuver is commanding (u/s).
 * @param gap Distance still to cover before the ship is where it wants to be (u).
 */
export function selectSpeedTier(ship: Spaceship, requiredSpeed: number, gap: number): void {
    const low = ship.lowSpeedHandling;
    if (ship.highSpeedMode) {
        const fits = requiredSpeed < low.flightBoostMaxSpeed * AI_AUTOPILOT_LOW_TIER_RELEASE;
        const inside = ship.velocity.length() < low.flightBoostMaxSpeed;
        if (fits && inside && gap < AI_HIGH_SPEED_HANDOFF_RANGE) ship.setHighSpeedMode(false);
    } else if (
        requiredSpeed > low.flightBoostMaxSpeed * AI_AUTOPILOT_HIGH_TIER_ENGAGE ||
        gap > AI_HIGH_SPEED_ENGAGE_RANGE
    ) {
        ship.setHighSpeedMode(true);
    }
}
