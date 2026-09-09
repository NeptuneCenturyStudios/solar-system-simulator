import {
    C,
    DIST_SCALE,
    EARTH_DIST,
    EARTH_MASS,
    MASS_SCALE,
    RADIUS_SCALE,
    SUN_MASS,
} from './consts';

// 1 AU in km (IAU 2012 definition).
const ASTRONOMICAL_UNIT_KM = 1.495978707e8;
// Real-world reference masses (kg) derived from the scaled consts so they stay in sync.
// SUN_MASS / EARTH_MASS are stored as real-kg / MASS_SCALE, so multiplying back recovers the real kg.
const SUN_MASS_REAL = SUN_MASS * MASS_SCALE; // ≈ 1.9885e30 kg
const EARTH_MASS_REAL = EARTH_MASS * MASS_SCALE; // ≈ 5.97237e24 kg

/** Convert a sim-space distance (u) to real kilometres. */
export function simDistanceToKm(simDist: number): number {
    return simDist * DIST_SCALE;
}

/** Convert a sim-space radius (u) to real kilometres. */
export function simRadiusToKm(simRadius: number): number {
    return simRadius * RADIUS_SCALE;
}

/** Convert a sim-space mass to real kilograms. */
export function simMassToKg(simMass: number): number {
    return simMass * MASS_SCALE;
}

/** Convert a sim-space speed (u/s) to real km/s. */
export function simSpeedToKmS(simSpeed: number): number {
    return simSpeed * DIST_SCALE;
}

/** Convert a sim-space speed (u/s) to a multiple of light speed. */
export function simSpeedToWarp(simSpeed: number): number {
    return simSpeed / C;
}

/**
 * Format a sim-space distance as a real-world figure.
 * Distances at or beyond Earth's orbit are shown in AU; everything else in km.
 */
export function formatDistance(simDist: number): string {
    const km = simDistanceToKm(simDist);
    if (simDist >= EARTH_DIST) {
        return `${trimNumber(km / ASTRONOMICAL_UNIT_KM, 2)} AU`;
    }
    return `${Math.round(km).toLocaleString()} km`;
}

/** Format a sim-space radius as "X,XXX km". */
export function formatRadius(simRadius: number): string {
    return `${Math.round(simRadiusToKm(simRadius)).toLocaleString()} km`;
}

/**
 * Format a sim-space mass as a readable figure:
 *  - at least 0.1 solar masses → "X.XX M☉"
 *  - at least 0.001 Earth masses → "X.XX M🜨"
 *  - otherwise → scientific notation in kg
 */
export function formatMass(simMass: number): string {
    const kg = simMassToKg(simMass);
    if (kg >= 0.1 * SUN_MASS_REAL) {
        return `${trimNumber(kg / SUN_MASS_REAL, 2)} M☉`;
    }
    if (kg >= 0.001 * EARTH_MASS_REAL) {
        return `${trimNumber(kg / EARTH_MASS_REAL, 2)} M🜨`;
    }
    return `${kg.toExponential(2)} kg`;
}

/**
 * Format a sim-space speed:
 *  - useWarp true → "X WARP" (multiples of light speed), trailing zeros trimmed
 *  - otherwise → "X km/s"
 */
export function formatSpeed(simSpeed: number, useWarp = false): string {
    if (useWarp) {
        return `${trimNumber(simSpeedToWarp(simSpeed), 2)} WARP`;
    }
    return `${trimNumber(simSpeedToKmS(simSpeed), 2)} km/s`;
}

/** Round to `maxDecimals` and strip trailing zeros (e.g. "0.50" → "0.5", "100.00" → "100"). */
function trimNumber(value: number, maxDecimals: number): string {
    if (!Number.isFinite(value)) return '—';
    const fixed = value.toFixed(maxDecimals);
    return fixed.replace(/\.?0+$/, '');
}
