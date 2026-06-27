import * as THREE from 'three';
import { G } from '../utilities/consts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BinaryPlacement = {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
};

export function applyYawY(v: THREE.Vector3, yawRad: number): THREE.Vector3 {
    const out = v.clone();
    out.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRad);
    return out;
}

export function applyInclinationX(v: THREE.Vector3, inclinationRad: number): THREE.Vector3 {
    const out = v.clone();
    out.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);
    return out;
}

/**
 * Orbital-plane basis:
 * - `u` is the unit position direction in the orbital plane (from COM to body)
 * - base plane = XZ, base normal = +Y
 * - then apply:
 *   - yaw around Y
 *   - inclination around X
 */
export function buildUnitPositionDirection(
    phiRad: number,
    yawRad: number,
    inclinationRad: number
): THREE.Vector3 {
    const uBase = new THREE.Vector3(Math.cos(phiRad), 0, Math.sin(phiRad));
    const uYaw = applyYawY(uBase, yawRad);
    const u = applyInclinationX(uYaw, inclinationRad).normalize();
    return u;
}

/**
 * Perpendicular unit vector computed via cross product.
 * Includes a stable degenerate fallback to prevent NaNs if vectors are nearly parallel.
 */
export function safeUnitCross(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
    const out = new THREE.Vector3().crossVectors(a, b);
    if (out.lengthSq() < 1e-12) {
        const fallback =
            Math.abs(a.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        out.copy(new THREE.Vector3().crossVectors(a, fallback));

        if (out.lengthSq() < 1e-12) {
            out.copy(new THREE.Vector3().crossVectors(a, new THREE.Vector3(0, 0, 1)));
        }
    }
    out.normalize();
    return out;
}

/**
 * Computes centre-of-mass binary orbit placements for two bodies.
 * Both bodies orbit their shared barycentre; their positions and velocities
 * are expressed relative to the origin (0,0,0).
 *
 * @param masses        [m1, m2] — masses of the two bodies
 * @param separationDistance  Distance between the two bodies (m1 → m2)
 * @param yawRad        Orbital-plane yaw around Y
 * @param inclinationRad Orbital-plane inclination around X
 * @param gForce        Effective gravitational constant (G × gMultiplier). Defaults to raw G.
 */
export function generateBinaryPlacements(
    masses: [number, number],
    separationDistance: number,
    yawRad: number,
    inclinationRad: number,
    gForce: number = G
): [BinaryPlacement, BinaryPlacement] {
    const [m1, m2] = masses;
    const mSum = m1 + m2;

    const r1 = separationDistance * (m2 / mSum);
    const r2 = separationDistance * (m1 / mSum);

    const u = buildUnitPositionDirection(0, yawRad, inclinationRad);

    const normalBase = new THREE.Vector3(0, 1, 0);
    const normalYaw = applyYawY(normalBase, yawRad);
    const normal = applyInclinationX(normalYaw, inclinationRad).normalize();

    const velDir = safeUnitCross(normal, u);

    const omega = Math.sqrt((gForce * mSum) / Math.pow(separationDistance, 3));

    const pos1 = u.clone().multiplyScalar(r1);
    const pos2 = u.clone().multiplyScalar(-r2);

    const vel1 = velDir.clone().multiplyScalar(omega * r1);
    const vel2 = velDir.clone().multiplyScalar(-omega * r2);

    return [
        { pos: pos1, vel: vel1 },
        { pos: pos2, vel: vel2 },
    ];
}

// ---------------------------------------------------------------------------
// Shared orbit planning utilities
// ---------------------------------------------------------------------------

/** Minimal RNG interface required by {@link pickOrbitType}. */
interface OrbitTypeRng {
    chance(probability: number): boolean;
}

/**
 * Selects S-type vs P-type orbit and, for S-type, which host star to orbit.
 *
 * S-type: body orbits one star (stable within ~0.3 × binary separation).
 * P-type: body orbits the system barycentre (stable beyond ~2.0 × binary separation).
 */
export function pickOrbitType(params: {
    rng: OrbitTypeRng;
    starCount: number;
    sZoneValid: boolean;
    pZoneValid: boolean;
}): { isSType: boolean; hostStarIndex: number } {
    const { rng, starCount, sZoneValid, pZoneValid } = params;

    let isSType: boolean;
    let hostStarIndex = 0;

    if (starCount === 1) {
        isSType = false;
    } else if (sZoneValid && pZoneValid) {
        isSType = rng.chance(0.5);
    } else if (sZoneValid) {
        isSType = true;
    } else {
        isSType = false;
    }

    if (isSType) {
        hostStarIndex = rng.chance(0.5) ? 1 : 0;
    }

    return { isSType, hostStarIndex };
}

/**
 * Computes the minimum periapsis distance, ensuring the orbit clears all stars
 * and remains numerically stable.
 *
 * @param distanceFraction  Lower bound as a fraction of semi-major axis distance
 *                          (0.3 for planets/asteroids, 0.15 for comets).
 */
export function computeMinPeriapsis(params: {
    isSType: boolean;
    hostStarIndex: number;
    distance: number;
    distanceFraction: number;
    starParams: Array<{ radius: number }>;
    starPlacements: Array<{ pos: THREE.Vector3 }>;
    maxStarRadius: number;
    binarySeparation: number;
    P_STABLE_MULTIPLE: number;
}): number {
    const {
        isSType,
        hostStarIndex,
        distance,
        distanceFraction,
        starParams,
        starPlacements,
        maxStarRadius,
        binarySeparation,
        P_STABLE_MULTIPLE,
    } = params;

    const starCount = starParams.length;

    if (isSType) {
        return Math.max(starParams[hostStarIndex]!.radius * 5, distance * distanceFraction);
    }

    return Math.max(
        maxStarRadius * 5,
        starPlacements[0]!.pos.length() + starParams[0]!.radius * 3,
        starCount > 1 ? starPlacements[1]!.pos.length() + starParams[1]!.radius * 3 : 0,
        binarySeparation * P_STABLE_MULTIPLE,
        distance * distanceFraction
    );
}

/**
 * Converts a semi-major axis distance and periapsis floor into a maximum
 * eccentricity that keeps the orbit integrable.
 */
export function computeMaxEccentricity(distance: number, minPeriapsis: number): number {
    return Math.max(0, (distance - minPeriapsis) / (distance + minPeriapsis));
}

/**
 * Defensive finite check for orbit creation descriptors.
 * Resets position and velocity to the origin and clamps radius/mass to safe
 * minimums if any component is non-finite (NaN or ±Infinity).
 */
export function sanitizeOrbitCreations<
    T extends { pos: THREE.Vector3; vel: THREE.Vector3; radius: number; mass: number },
>(creations: T[], fallbacks?: { minRadius?: number; minMass?: number }): void {
    for (const c of creations) {
        const ok =
            Number.isFinite(c.pos.x) &&
            Number.isFinite(c.pos.y) &&
            Number.isFinite(c.pos.z) &&
            Number.isFinite(c.vel.x) &&
            Number.isFinite(c.vel.y) &&
            Number.isFinite(c.vel.z) &&
            Number.isFinite(c.radius) &&
            Number.isFinite(c.mass);

        if (!ok) {
            c.pos.set(0, 0, 0);
            c.vel.set(0, 0, 0);
            if (!Number.isFinite(c.radius)) c.radius = Math.max(0, fallbacks?.minRadius ?? 0);
            if (!Number.isFinite(c.mass)) c.mass = Math.max(0, fallbacks?.minMass ?? 0);
        }
    }
}
