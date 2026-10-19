import * as THREE from 'three';
import type { Body } from '../../../bodies/body';
import type { Spaceship } from '../../../bodies/ships/spaceship';
import type { ObstacleAvoidance } from '../obstacle-avoidance';

/**
 * Maneuvers are the building blocks of ship AI *commands*.
 *
 * A command (the autopilot today; escort, patrol and the like later) is a small state machine
 * that picks which maneuver to fly and reacts to what it reports. A maneuver flies one well-defined
 * piece of a trip — get to a point, hold an orbit — entirely through the shared navigation layer
 * (`ai/navigation/`), so it obeys the same rules as every other ship AI: it may only write into
 * `ship.controlInput`.
 *
 * Maneuvers hold their own latches and telemetry but never decide what comes next; that is the
 * command's job.
 */

/** What a maneuver reports after a frame. */
export type ManeuverStatus =
    /** Still working. */
    | 'running'
    /** Finished what it set out to do (e.g. arrived). The command picks the next maneuver. */
    | 'done'
    /** The target is getting away faster than this ship can follow. The maneuver keeps trying. */
    | 'outpaced'
    /** This maneuver cannot work here (e.g. no gravity to orbit naturally). */
    | 'infeasible';

/** Coarse description of what a maneuver is doing, mapped by commands onto HUD phases. */
export type ManeuverActivity =
    | 'turning'
    | 'warp-charging'
    | 'warp'
    | 'approach'
    | 'braking'
    | 'inserting'
    | 'orbiting'
    | 'evading';

/** Everything a maneuver needs to fly a frame. Owned and refreshed by the command. */
export interface IManeuverContext {
    readonly ship: Spaceship;
    readonly target: Body;
    readonly avoidance: ObstacleAvoidance;
    /** Centre-to-centre radius of the orbit the trip ends in (u). */
    orbitRadius: number;
    /**
     * Unit normal of the orbit plane. Commands latch it when the orbit begins; maneuvers
     * re-orthogonalise their working copy against the current radial each frame.
     */
    readonly orbitNormal: THREE.Vector3;
}

/** One flyable piece of a trip. */
export interface IManeuver {
    /** Fly one frame. `simDt` is sim-time seconds this frame (wall dt × time scale). */
    update(ctx: IManeuverContext, simDt: number): ManeuverStatus;
    /** What the maneuver did on its last update. */
    readonly activity: ManeuverActivity;
    /** Clear latches and timers so the maneuver can be flown afresh. */
    reset(): void;
    /** Human-readable status for the AI debug overlay. May allocate. */
    debugLines(): string[];
}

/** Below this squared length a projected vector is treated as degenerate. */
const DEGENERATE_EPSILON = 1e-12;

const _ref = new THREE.Vector3();

/**
 * Build the orbit's local frame at the ship's current position.
 *
 * Writes the outward radial (target → ship) into `outRadial`, the orbit normal re-orthogonalised
 * against it into `outNormal`, and the direction of travel round the orbit (normal × radial) into
 * `outTangent`. All unit length.
 *
 * @returns The ship's centre-to-centre distance from the target, or 0 when the two coincide (in
 *   which case the outputs are left in an arbitrary but valid orthonormal state).
 */
export function orbitFrame(
    ship: Spaceship,
    target: Body,
    normal: THREE.Vector3,
    outRadial: THREE.Vector3,
    outNormal: THREE.Vector3,
    outTangent: THREE.Vector3
): number {
    outRadial.subVectors(ship.mesh.position, target.mesh.position);
    const r = outRadial.length();
    if (r <= 0) {
        outRadial.set(1, 0, 0);
    } else {
        outRadial.divideScalar(r);
    }

    outNormal.copy(normal).addScaledVector(outRadial, -normal.dot(outRadial));
    if (outNormal.lengthSq() <= DEGENERATE_EPSILON) {
        // The latched normal has rotated onto the radial. Any perpendicular will do; prefer the
        // ecliptic so the orbit reads as flat.
        _ref.set(0, 1, 0);
        outNormal.copy(_ref).addScaledVector(outRadial, -_ref.dot(outRadial));
        if (outNormal.lengthSq() <= DEGENERATE_EPSILON) outNormal.set(1, 0, 0).cross(outRadial);
    }
    outNormal.normalize();
    outTangent.crossVectors(outNormal, outRadial).normalize();
    return r;
}

/**
 * Pick an orbit normal for an orbit starting now: the plane the ship is already moving in
 * relative to the target when it has meaningful sideways motion (so the orbit continues the
 * approach rather than reversing it), otherwise the ecliptic (world up), like the classic
 * autopilot's equatorial orbits.
 *
 * @param minSpeed Sideways relative speed (u/s) below which the motion is treated as no hint.
 */
export function chooseOrbitNormal(
    ship: Spaceship,
    target: Body,
    minSpeed: number,
    out: THREE.Vector3
): THREE.Vector3 {
    out.subVectors(ship.mesh.position, target.mesh.position);
    const r = out.length();
    if (r > 0) {
        out.divideScalar(r);
        _ref.subVectors(ship.velocity, target.velocity);
        // Sideways part of the relative velocity.
        _ref.addScaledVector(out, -_ref.dot(out));
        if (_ref.length() > minSpeed) {
            return out.cross(_ref).normalize();
        }
    }
    return out.set(0, 1, 0);
}
