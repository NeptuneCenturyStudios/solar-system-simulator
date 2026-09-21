import { Body } from '../bodies/body';
import { flightState, simulationState } from './simulation';

/**
 * Sets `flightState.selectedTarget` to whichever threat is nearest the active ship right now
 * — or, in reverse, farthest. The candidate list (and every distance in it) is recomputed
 * fresh on every call, so this always reflects where the ship actually is rather than a rank
 * left over from earlier in the flight: continuing to advance a stale numeric index through a
 * list that keeps re-sorting itself as the ship moves is what used to hand back some unrelated
 * object several presses deep once the ship had moved well away from wherever that index used
 * to point.
 *
 * If the current lock is already the nearest threat (or, in reverse, the farthest), pressing
 * again steps one further out instead of re-selecting the same one — otherwise cycling would
 * never be able to move past it. With only one threat left, one more press past it clears the
 * lock, and the press after that reacquires it.
 */
export function cycleTargetLock(reverse = false): Body | null {
    const ship = flightState.activeShip;
    if (!ship || ship._isDisposed) {
        flightState.selectedTarget = null;
        return null;
    }

    const candidates = simulationState.bodies
        .filter((b): b is Body => !!b && b.isThreat && !b._isDisposed && b !== ship && !!b.mesh)
        .sort(
            (a, b) =>
                ship.mesh.position.distanceTo(a.mesh.position) -
                ship.mesh.position.distanceTo(b.mesh.position)
        );

    if (candidates.length === 0) {
        flightState.selectedTarget = null;
        return null;
    }

    const idx = flightState.selectedTarget ? candidates.indexOf(flightState.selectedTarget) : -1;
    const lastIdx = candidates.length - 1;

    const next = !reverse
        ? idx === 0
            ? (candidates[1] ?? null)
            : candidates[0]
        : idx === lastIdx
          ? (candidates[lastIdx - 1] ?? null)
          : candidates[lastIdx];

    flightState.selectedTarget = next;
    return next;
}
