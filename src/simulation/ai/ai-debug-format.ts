import * as THREE from 'three';
import { DIST_SCALE } from '../../utilities/consts';

/**
 * Formatting helpers for the ship-AI debug overlay (see ShipAI.debugLines).
 *
 * Values are rounded coarsely on purpose: the overlay only repaints its canvas when the text
 * changes, so quantising keeps it from redrawing on every frame for sub-metre jitter.
 */

/** Sim units → metres. Distances and speeds share DIST_SCALE, so this serves both. */
const METRES_PER_UNIT = DIST_SCALE * 1000;

/** A sim-unit distance as metres (rounded to 10 m), switching to km past 10 km. */
export function formatDistance(units: number): string {
    const m = units * METRES_PER_UNIT;
    if (Math.abs(m) >= 10_000) return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m / 10) * 10} m`;
}

/** A sim-unit speed as m/s (rounded to 5 m/s), signed when `signed` is set. */
export function formatSpeed(unitsPerSec: number, signed = false): string {
    const ms = Math.round((unitsPerSec * METRES_PER_UNIT) / 5) * 5;
    const sign = signed && ms > 0 ? '+' : '';
    return `${sign}${ms} m/s`;
}

/** The angle whose cosine is `cos`, in whole degrees. */
export function formatAngleFromCos(cos: number): string {
    return `${Math.round(THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(cos, -1, 1))))}°`;
}

/** Which of thrust / boost / brake the controller is holding, as a short label. */
export function formatThrottle(input: { thrust: boolean; boost: boolean; brake: boolean }): string {
    if (input.boost) return 'BOOST';
    if (input.thrust) return 'THRUST';
    if (input.brake) return 'BRAKE';
    return 'COAST';
}
