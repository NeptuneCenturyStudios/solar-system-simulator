import { Body } from '../bodies/body';
import { BodyTypeEnum } from '../bodies/body-enums';
import type { Spaceship } from '../bodies/ships/spaceship';
import { surfaceClearance } from './collision';

/** Bodies that never count as "the surface below": other ships and probes. */
const NEAREST_SURFACE_EXCLUDED_TYPES = BodyTypeEnum.SpaceShip | BodyTypeEnum.Probe;

/** The nearest surface to a ship and the hull-to-ground gap to it. */
export interface INearestSurface {
    body: Body;
    /** Gap between the ship's hull and the body's drawn surface, in sim units (see surfaceClearance). */
    clearance: number;
}

/** Reused result, so the per-frame callers never allocate. */
const _result: INearestSurface = { body: null as unknown as Body, clearance: 0 };

/**
 * The body whose surface is nearest `ship`, and the clearance to it — the altitude both the cockpit
 * dashboard and the flight HUD altimeter read.
 *
 * Bodies are ranked by centre distance minus radius, then the winner is refined to the hull-to-
 * drawn-ground gap that ship contact uses, so a landed ship reads ~0 m instead of its centre height
 * above the true (un-faceted) sphere. Ships and probes are skipped.
 *
 * @returns A shared object overwritten by the next call (copy what you keep), or null when there
 *   is no candidate body.
 */
export function findNearestSurface(
    ship: Spaceship,
    bodies: readonly Body[]
): INearestSurface | null {
    if (ship._isDisposed || !ship.mesh) return null;
    let nearest: Body | null = null;
    let nearestAlt = Infinity;
    for (const body of bodies) {
        if (!body || body === ship || body._isDisposed || !body.mesh) continue;
        if (body.bodyType & NEAREST_SURFACE_EXCLUDED_TYPES) continue;
        const alt = body.mesh.position.distanceTo(ship.mesh.position) - body.radius;
        if (alt < nearestAlt) {
            nearestAlt = alt;
            nearest = body;
        }
    }
    if (!nearest) return null;
    _result.body = nearest;
    _result.clearance = surfaceClearance(ship, nearest);
    return _result;
}
