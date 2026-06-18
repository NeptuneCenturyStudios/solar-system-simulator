import * as THREE from 'three';
import { G } from '../utilities/consts';

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
