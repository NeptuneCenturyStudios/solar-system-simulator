import { BodyTypeEnum } from '../../../bodies/body-enums';
import { isBodyType } from '../../../utilities/utilities';
import {
    AI_AUTOPILOT_ORBIT_HAZARD_MARGIN,
    AUTOPILOT_ORBIT_ALTITUDE_FACTOR,
    DIST_SCALE,
    G,
} from '../../../utilities/consts';
import { simulationState } from '../../simulation';
import type { Body } from '../../../bodies/body';
import type { Spaceship } from '../../../bodies/ships/spaceship';
import type { ObstacleAvoidance } from '../obstacle-avoidance';

/** How a ship holds position around its destination once it gets there. */
export type OrbitKind = 'natural' | 'artificial';

/** A body's radius, or 0 when it has none that can be trusted. */
export function bodyRadius(body: Body): number {
    return Number.isFinite(body.radius) && body.radius > 0 ? body.radius : 0;
}

/** True for another spaceship — a target that has no meaningful gravity to orbit naturally. */
export function isShipTarget(body: Body): boolean {
    return isBodyType(body, BodyTypeEnum.SpaceShip);
}

/**
 * Clearance between the ship's hull and the target's surface, given the distance between their
 * centres. Negative once they overlap. The generalisation of FollowShipAI.hullGap to any body.
 */
export function surfaceGap(ship: Spaceship, target: Body, centreDistance: number): number {
    return centreDistance - bodyRadius(target) - bodyRadius(ship);
}

/** Effective gravitational constant, honouring the system's gravity multiplier. */
function effectiveG(): number {
    return G * simulationState.gMultiplier;
}

/** Speed (u/s) of a circular orbit of radius `r` around `body`, relative to it. 0 without gravity. */
export function circularSpeed(body: Body, r: number): number {
    const gm = effectiveG() * Math.max(0, body.mass || 0);
    return r > 0 && gm > 0 ? Math.sqrt(gm / r) : 0;
}

/** Gravitational acceleration (u/s²) toward `body` at distance `r` from its centre. */
export function gravityAccel(body: Body, r: number): number {
    const gm = effectiveG() * Math.max(0, body.mass || 0);
    return r > 0 ? gm / (r * r) : 0;
}

/**
 * Centre-to-centre radius the ship should orbit `target` at.
 *
 * - **Natural**: the classic autopilot's altitude (radius × AUTOPILOT_ORBIT_ALTITUDE_FACTOR),
 *   floored at the avoidance hazard sphere plus a margin. The floor is what matters for stars,
 *   whose hazard sphere already reaches the classic altitude.
 * - **Artificial**: the requested surface-to-hull distance, floored the same way for anything
 *   avoidance would treat as a hazard. Ships aren't avoidance hazards, so for them the floor is
 *   just "hulls not touching".
 *
 * @param distanceM Requested orbit distance in meters (artificial orbits only).
 */
export function orbitRadiusFor(
    ship: Spaceship,
    target: Body,
    kind: OrbitKind,
    distanceM: number,
    avoidance: ObstacleAvoidance
): number {
    const targetR = bodyRadius(target);
    const shipR = bodyRadius(ship);
    const floor = isShipTarget(target)
        ? (targetR + shipR) * AI_AUTOPILOT_ORBIT_HAZARD_MARGIN
        : avoidance.hazardRadiusOf(target) * AI_AUTOPILOT_ORBIT_HAZARD_MARGIN;

    if (kind === 'natural') {
        return Math.max(targetR * AUTOPILOT_ORBIT_ALTITUDE_FACTOR, floor);
    }
    return Math.max(targetR + shipR + distanceM / 1000 / DIST_SCALE, floor);
}
