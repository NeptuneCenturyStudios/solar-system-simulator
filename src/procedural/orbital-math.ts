import * as THREE from 'three';

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
