import * as THREE from 'three';
import type { Body } from '../bodies/body';
import type { Spaceship } from '../bodies/ships/spaceship';
import { SHIP_LANDING_TERRAIN_SAMPLE_FACTOR } from '../utilities/consts';
import { surfaceReach } from './body-surface';

/**
 * The local ground plane under a ship's hull footprint, cached on the ship (Spaceship.groundPlane)
 * in its body's own rotating frame, so it turns with a spinning or tumbling body.
 *
 * Ship contact otherwise measures along the line of centres (see surfaceClearance), which is right
 * for level ground but wrong on a slope: a ship tilted to match the slope would rest on its
 * downhill corner, with its belly floating above the ground. While a ship is landing or grounded
 * the landing procedure, ground alignment and contact all work against this plane instead.
 *
 * Alongside it is the normal of the surrounding terrain — the same fit over a footprint
 * SHIP_LANDING_TERRAIN_SAMPLE_FACTOR times wider — which is "up" for the landing procedure. On a
 * sphere both are the local vertical; on an irregular asteroid the terrain normal follows the face
 * the ship is over, which the direction away from the body's centre does not.
 */
export interface IShipGroundPlane {
    /** The body whose surface was sampled. */
    body: Body;
    /** Unit normal of the plane under the hull (pointing out of the ground), in the body's frame. */
    normalLocal: THREE.Vector3;
    /** A point on the plane, as an offset from the body's centre in its rotation frame. */
    pointLocal: THREE.Vector3;
    /** Unit normal of the surrounding terrain (pointing out of the ground), in the body's frame. */
    terrainNormalLocal: THREE.Vector3;
    /** Angle (radians) between the plane under the hull and the surrounding terrain. */
    slope: number;
}

/** Scratch, so the per-frame sampling never allocates. */
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _below = new THREE.Vector3();
const _fore = new THREE.Vector3();
const _aft = new THREE.Vector3();
const _left = new THREE.Vector3();
const _rightPt = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _point = new THREE.Vector3();
const _terrain = new THREE.Vector3();
const _terrainPoint = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();
const _negNormal = new THREE.Vector3();
const _rel = new THREE.Vector3();

/** Writes the drawn ground point of `body` below world point `p` (along its centre line) to `out`. */
function groundBelow(body: Body, p: THREE.Vector3, out: THREE.Vector3): boolean {
    _dir.subVectors(p, body.mesh.position);
    const distance = _dir.length();
    if (distance < 1e-12) return false;
    _dir.divideScalar(distance);
    out.copy(body.mesh.position).addScaledVector(_dir, surfaceReach(body, _dir));
    return true;
}

/**
 * Sets _fwd / _right to the ship's nose and right axes flattened onto the plane perpendicular to
 * unit `up` (with the nose along `up`, the ship's top/bottom stands in for it).
 *
 * @returns false when the axes are degenerate.
 */
function horizonAxes(ship: Spaceship, up: THREE.Vector3): boolean {
    _fwd.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
    const noseUp = _fwd.dot(up);
    _fwd.addScaledVector(up, -noseUp);
    if (_fwd.lengthSq() < 1e-6) {
        _fwd.set(0, noseUp > 0 ? -1 : 1, 0).applyQuaternion(ship.controlFrameQuat);
        _fwd.addScaledVector(up, -_fwd.dot(up));
        if (_fwd.lengthSq() < 1e-12) return false;
    }
    _fwd.normalize();
    _right.crossVectors(up, _fwd).normalize();
    return true;
}

/**
 * Fits a plane to the ground of `body` around _below: the ground is sampled below the four ends of
 * the hull footprint along _fwd / _right — each at the hull's own reach that way (hulls are rarely
 * symmetric) times `scale` — and the normal is the cross product of the fore–aft and left–right
 * chords, oriented to the side of unit `up`.
 *
 * @returns false when a sample fails or the chords are degenerate.
 */
function fitPlane(
    ship: Spaceship,
    body: Body,
    scale: number,
    up: THREE.Vector3,
    outNormal: THREE.Vector3,
    outPoint: THREE.Vector3
): boolean {
    const ef = scale * Math.max(1e-12, ship.hullExtentAlong(_fwd));
    const er = scale * Math.max(1e-12, ship.hullExtentAlong(_right));
    _a.copy(_fwd).negate();
    const ea = scale * Math.max(1e-12, ship.hullExtentAlong(_a));
    _b.copy(_right).negate();
    const el = scale * Math.max(1e-12, ship.hullExtentAlong(_b));

    _a.copy(_below).addScaledVector(_fwd, ef);
    if (!groundBelow(body, _a, _fore)) return false;
    _a.copy(_below).addScaledVector(_fwd, -ea);
    if (!groundBelow(body, _a, _aft)) return false;
    _a.copy(_below).addScaledVector(_right, er);
    if (!groundBelow(body, _a, _rightPt)) return false;
    _a.copy(_below).addScaledVector(_right, -el);
    if (!groundBelow(body, _a, _left)) return false;

    // fwd × right = up, so (fore − aft) × (right − left) points out of the ground.
    _a.subVectors(_fore, _aft);
    _b.subVectors(_rightPt, _left);
    outNormal.crossVectors(_a, _b);
    if (outNormal.lengthSq() < 1e-30) return false;
    outNormal.normalize();
    if (outNormal.dot(up) < 0) outNormal.negate();

    outPoint.copy(_fore).add(_aft).add(_left).add(_rightPt).multiplyScalar(0.25);
    return true;
}

/**
 * Fits the ground plane of `body` under `ship`'s hull footprint, and the surrounding terrain, in
 * world space.
 *
 * The ground point straight below the ship is found first. The terrain is fitted around it over a
 * footprint SHIP_LANDING_TERRAIN_SAMPLE_FACTOR times the hull's, along its nose and right axes
 * flattened onto the local vertical's horizon; the plane under the hull is then fitted over the
 * hull's own footprint, along those axes flattened onto the terrain. Each is a plane through four
 * ground samples, so it is what the hull would rest on, not a single facet's tilt. When the terrain
 * fit fails, the local vertical (away from the body's centre) stands in for it.
 *
 * @returns The slope (radians between the plane under the hull and the terrain), or null when the
 *   ship is at the body's centre or the hull axes are degenerate.
 */
export function sampleGroundPlane(
    ship: Spaceship,
    body: Body,
    outNormal: THREE.Vector3,
    outPoint: THREE.Vector3,
    outTerrainNormal: THREE.Vector3
): number | null {
    if (!ship.mesh || !body.mesh) return null;
    _up.subVectors(ship.mesh.position, body.mesh.position);
    if (_up.lengthSq() < 1e-24) return null;
    _up.normalize();

    if (!horizonAxes(ship, _up)) return null;
    if (!groundBelow(body, ship.mesh.position, _below)) return null;

    // The surrounding terrain, against the local vertical.
    if (!fitPlane(ship, body, SHIP_LANDING_TERRAIN_SAMPLE_FACTOR, _up, _terrain, _terrainPoint)) {
        _terrain.copy(_up);
    }
    outTerrainNormal.copy(_terrain);

    // The ground under the hull, along axes laid on the terrain.
    if (!horizonAxes(ship, _terrain)) return null;
    if (!fitPlane(ship, body, 1, _terrain, outNormal, outPoint)) return null;

    return Math.acos(THREE.MathUtils.clamp(outNormal.dot(_terrain), -1, 1));
}

/**
 * Samples the ground plane under `ship` on `body` and caches it on the ship (see
 * {@link IShipGroundPlane}).
 *
 * @returns The cached plane, or null (and the cache cleared) when sampling failed.
 */
export function updateShipGroundPlane(ship: Spaceship, body: Body): IShipGroundPlane | null {
    const slope = sampleGroundPlane(ship, body, _normal, _point, _terrain);
    if (slope === null) {
        ship.groundPlane = null;
        return null;
    }
    _invQuat.copy(body.mesh.quaternion).invert();
    let plane = ship.groundPlane;
    if (!plane) {
        plane = {
            body,
            normalLocal: new THREE.Vector3(),
            pointLocal: new THREE.Vector3(),
            terrainNormalLocal: new THREE.Vector3(),
            slope,
        };
        ship.groundPlane = plane;
    }
    plane.body = body;
    plane.slope = slope;
    plane.normalLocal.copy(_normal).applyQuaternion(_invQuat);
    plane.pointLocal.subVectors(_point, body.mesh.position).applyQuaternion(_invQuat);
    plane.terrainNormalLocal.copy(_terrain).applyQuaternion(_invQuat);
    return plane;
}

/**
 * Writes `ship`'s cached ground plane on `body` in world space.
 *
 * @returns false when the ship has no cached plane on that body.
 */
export function shipGroundPlaneWorld(
    ship: Spaceship,
    body: Body,
    outNormal: THREE.Vector3,
    outPoint: THREE.Vector3
): boolean {
    const plane = ship.groundPlane;
    if (!plane || plane.body !== body || body._isDisposed || !body.mesh) return false;
    outNormal.copy(plane.normalLocal).applyQuaternion(body.mesh.quaternion);
    outPoint.copy(plane.pointLocal).applyQuaternion(body.mesh.quaternion).add(body.mesh.position);
    return true;
}

/**
 * Writes the normal of the terrain around `ship` on `body` (world space) to `out`: the cached
 * terrain normal when the ship has a plane on that body, else the local vertical (away from the
 * body's centre).
 *
 * @returns false only when the ship sits at the body's centre.
 */
export function shipTerrainUpWorld(ship: Spaceship, body: Body, out: THREE.Vector3): boolean {
    const plane = ship.groundPlane;
    if (plane && plane.body === body && !body._isDisposed && body.mesh) {
        out.copy(plane.terrainNormalLocal).applyQuaternion(body.mesh.quaternion);
        return true;
    }
    out.subVectors(ship.mesh.position, body.mesh.position);
    if (out.lengthSq() < 1e-24) return false;
    out.normalize();
    return true;
}

/**
 * Gap between `ship`'s hull and the plane (unit `normal` through `point`), measured along the
 * normal: the hull's lowest point against the slope, not its centre line.
 */
export function groundPlaneClearance(
    ship: Spaceship,
    normal: THREE.Vector3,
    point: THREE.Vector3
): number {
    _negNormal.copy(normal).negate();
    return (
        _rel.subVectors(ship.mesh.position, point).dot(normal) - ship.hullExtentAlong(_negNormal)
    );
}

/** Drops `ship`'s cached ground plane. */
export function clearShipGroundPlane(ship: Spaceship): void {
    ship.groundPlane = null;
}
