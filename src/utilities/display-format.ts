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

/** Convert a sim-space speed (u/s) to real m/s. */
export function simSpeedToMS(simSpeed: number): number {
    return simSpeedToKmS(simSpeed) * 1000;
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

    const speedKmS = simSpeedToKmS(simSpeed);
    if (speedKmS < 1) {
        return `${trimNumber(simSpeedToMS(simSpeed), 2)} m/s`;
    } else {
        return `${trimNumber(speedKmS, 2)} km/s`;
    }
}

/**
 * Format a duration in seconds as a compact two-unit estimate, e.g. "2d 5h", "5h 12m",
 * "12m 30s", "30s". Non-finite or non-positive durations (not closing on the target,
 * or already arrived) format as "∞".
 *
 * Returns the bare value with no prefix; callers that show a label add their own.
 */
export function formatETA(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '∞';

    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

/**
 * Format an age in years as a readable figure:
 *  - at least 1 billion years → "X.XX Gyr"
 *  - at least 1 million years → "X.XX Myr"
 *  - otherwise → "X,XXX yr"
 */
export function formatAge(years: number): string {
    if (years >= 1e9) return `${trimNumber(years / 1e9, 2)} Gyr`;
    if (years >= 1e6) return `${trimNumber(years / 1e6, 2)} Myr`;
    return `${Math.round(years).toLocaleString()} yr`;
}

/**
 * Format a pressure in bar, switching to smaller units for thin atmospheres:
 *  - at least 1 bar → "92 bar", "1.5 bar"
 *  - at least 1 mbar → "300 mbar", "6 mbar"
 *  - otherwise → "10 µbar"
 */
export function formatPressure(bar: number): string {
    if (bar >= 10) return `${Math.round(bar).toLocaleString()} bar`;
    if (bar >= 1) return `${trimNumber(bar, 2)} bar`;
    if (bar >= 1e-3) return `${trimNumber(bar * 1e3, bar >= 0.01 ? 0 : 1)} mbar`;
    return `${trimNumber(bar * 1e6, bar >= 1e-5 ? 0 : 2)} µbar`;
}

/** Round to `maxDecimals` and strip trailing zeros (e.g. "0.50" → "0.5", "100.00" → "100"). */
function trimNumber(value: number, maxDecimals: number): string {
    if (!Number.isFinite(value)) return '—';
    const fixed = value.toFixed(maxDecimals);
    return fixed.replace(/\.?0+$/, '');
}
