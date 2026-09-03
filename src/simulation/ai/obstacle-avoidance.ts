import * as THREE from 'three';
import { BodyTypeEnum } from '../../bodies/body-enums';
import { isBodyType } from '../../utilities/utilities';
import { simulationState } from '../simulation';
import {
    AI_APPROACH_SAFETY_PAD,
    AI_AVOID_CLEARANCE_ANGLE,
    AI_AVOID_DECISION_MARGIN,
    AI_AVOID_HAZARD_FACTOR,
    AI_AVOID_LOOKAHEAD_TIME,
    AI_AVOID_PANIC_TIME,
    AI_AVOID_RELEASE_ANGLE,
    AI_AVOID_STAR_HAZARD_FACTOR,
} from '../../utilities/consts';
import type { Body } from '../../bodies/body';
import type { Spaceship } from '../../bodies/ships/spaceship';
import type { ISpaceshipHandling } from '../../interfaces';

/**
 * Obstacle perception for ship AIs.
 *
 * A ShipAI may only express itself through `ship.controlInput` — it cannot teleport a ship
 * around a star. So avoidance here is not a path: it is a *corrected desired heading* plus a
 * *speed cap*, handed back to the controller, which feeds them through the same stick-deflection
 * and throttle logic a human pilot's inputs go through. The ship then banks around the obstacle
 * under its own handling limits.
 *
 * The scheme is the tangent-steering one: when the straight line to wherever the AI wants to go
 * pierces a body's hazard sphere, steer instead along the sphere's silhouette cone, offset by a
 * small clearance angle. That construction is continuous — as the requested heading rotates out
 * to the tangent, the correction shrinks to nothing — so avoidance fades in and out smoothly and
 * needs no hysteresis. Flying the tangent also walks the ship around the limb, which is what
 * eventually re-opens the direct line.
 *
 * Known limitations, all deliberate:
 *  - **One hazard at a time.** Bodies in a solar system are sparse enough that the worst one is
 *    the only one that matters; a dense cluster could in principle steer a ship out of one
 *    sphere and into another.
 *  - **Straight-ray corridor.** The test ignores gravitational curvature of the flight path.
 *    The hazard-radius factors absorb it, and the star factor is larger precisely because the
 *    approximation is worst where the gravity is strongest.
 *  - **Reactive, not planned.** With a body wedged between ship and target at station-keeping
 *    range, the ship circles the obstacle on its tangent rather than converging. Correct for
 *    this scheme, but it is not path-finding.
 *  - **Ships are not obstacles**, so NPCs do not avoid each other or the player.
 */

/** Bodies that are never obstacles.
 *
 *  Ships are excluded so the AI's own follow target doesn't read as something to dodge.
 *
 *  Wormholes are excluded deliberately and permanently: they are a means of travel that ships
 *  are intended to use, so flying into one is the desired outcome rather than a failure. Do not
 *  "fix" this by adding them to the hazard set. */
const EXCLUDED_TYPES = BodyTypeEnum.SpaceShip | BodyTypeEnum.Wormhole;

/** Bodies that kill well outside their rendered surface — corona, accretion disk, jets. */
const STAR_LIKE_TYPES =
    BodyTypeEnum.Star | BodyTypeEnum.BlackHole | BodyTypeEnum.Pulsar | BodyTypeEnum.WhiteDwarf;

/** Below this speed (u/s) the ship has no meaningful direction of travel. */
const SPEED_EPSILON = 1e-6;

/** Below this squared length a projected vector is treated as degenerate. */
const DEGENERATE_EPSILON = 1e-12;

// Scratch vectors — module scope, reused every frame. The AI layer is deliberately
// zero-allocation per frame; the hazard scan can touch thousands of bodies per ship in a
// Kuiper-belt system, so nothing in here may allocate.
const _toBody = new THREE.Vector3();
const _bestToBody = new THREE.Vector3();
const _u = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _ref = new THREE.Vector3();

/** What the avoidance layer wants the controller to do this frame. */
export interface IAvoidanceResult {
    /** Unit direction to steer. Equals the requested direction when the path is clear. */
    readonly heading: THREE.Vector3;
    /** Upper bound on commanded speed (u/s). Infinity when the path is clear. */
    speedLimit: number;
    /** The body being avoided, or null when the path is clear. */
    hazard: Body | null;
    /** Padded hazard radius of `hazard` (sim units). Zero when there is no hazard. */
    hazardRadius: number;
    /** Distance from the ship to the hazard's *surface* (sim units). Negative means inside it. */
    surfaceGap: number;
    /** True when impact is imminent, or the ship is already inside the hazard sphere. The
     *  controller should abandon whatever it was doing and thrust along `heading`. */
    flee: boolean;
    /** Corridor length tested this frame (sim units). Debug/visualisation only. */
    lookahead: number;
    /** Direction the corridor was tested along. Debug/visualisation only. */
    readonly travelDir: THREE.Vector3;
}

/**
 * Highest speed from which a ship can still shed all of its motion within `distance`, given the
 * two deceleration regimes it actually flies with: flightBoostDecel while above flightMaxSpeed,
 * flightThrustDecel below it.
 *
 * This is the inverse of the ship's stopping-distance curve, and it is what keeps an approach
 * from committing to a speed the ship cannot get rid of in time. A pure proportional controller
 * has no notion of this: it will happily ask for boost speed at a range that needs ten times the
 * runway, sail past the target, and come back — the rubber-banding this replaces.
 *
 * Shared between the follow controller (closing on its target) and avoidance (closing on a
 * hazard it must not reach); both are asking the same question of the same curve.
 */
export function brakingSpeedLimit(distance: number, h: ISpaceshipHandling): number {
    if (distance <= 0) return 0;

    // Runway needed to brake from normal max speed to a standstill.
    const lowRegimeDistance = (h.flightMaxSpeed * h.flightMaxSpeed) / (2 * h.flightThrustDecel);
    if (distance <= lowRegimeDistance) {
        return Math.sqrt(2 * h.flightThrustDecel * distance);
    }

    // Anything left over is covered at the (much higher) boost decel rate.
    const remaining = distance - lowRegimeDistance;
    const speedSquared = h.flightMaxSpeed * h.flightMaxSpeed + 2 * h.flightBoostDecel * remaining;
    return Math.min(Math.sqrt(speedSquared), h.flightBoostMaxSpeed);
}

/**
 * Per-ship obstacle perception. Owned by {@link ShipAI}, so every controller inherits it.
 *
 * Stateful (and therefore a class rather than a free function) for two reasons: it latches the
 * obstacle it committed to and the plane it committed to going around, and it hands back a
 * single reused result object so the per-frame allocation count stays at zero.
 */
export class ObstacleAvoidance {
    private readonly ship: Spaceship;

    /** Reused result. Callers must read it before the next `evaluate()`, never retain it. */
    private readonly result: IAvoidanceResult = {
        heading: new THREE.Vector3(0, 0, 1),
        speedLimit: Infinity,
        hazard: null,
        hazardRadius: 0,
        surfaceGap: Infinity,
        flee: false,
        lookahead: 0,
        travelDir: new THREE.Vector3(0, 0, 1),
    };

    /** The body currently being avoided, held across frames. Null when nothing is. */
    private latchedHazard: Body | null = null;

    /** Unit normal of the plane the ship committed to going around the hazard in. */
    private readonly latchedAxis = new THREE.Vector3();

    constructor(ship: Spaceship) {
        this.ship = ship;
    }

    /** The most recent result. Read by the debug gizmo; do not mutate. */
    get last(): IAvoidanceResult {
        return this.result;
    }

    /**
     * Hazard sphere radius for a body: its own radius, padded for the effects that kill outside
     * it, plus the ship's hull so the corridor test can treat the ship as a point.
     */
    private hazardRadiusOf(body: Body): number {
        const factor = isBodyType(body, STAR_LIKE_TYPES)
            ? AI_AVOID_STAR_HAZARD_FACTOR
            : AI_AVOID_HAZARD_FACTOR;
        const shipRadius = Number.isFinite(this.ship.radius) ? this.ship.radius : 0;
        return body.radius * factor + shipRadius;
    }

    /**
     * Decide how far ahead to look, in sim units.
     *
     * Two terms, and both are load-bearing:
     *  - **Travel.** `speed × reaction time`. The reaction time is floored by how far the world
     *    moves between two AI decisions: controllers run once per rendered frame on wall-clock
     *    time while the simulation advances by wall dt × time scale, so at high warp the ship
     *    crosses enormous distances blind. Without this the horizon is shorter than a single
     *    decision interval and the ship flies into things it "saw".
     *  - **Turn radius.** `speed / maxTurnRate`. A ship cannot dodge anything inside its own turn
     *    circle, so an obstacle spotted closer than that is spotted too late. At boost (~1,499
     *    u/s against a 1.58 rad/s turn rate) that circle is ~950 u across.
     */
    private lookaheadDistance(speed: number, simDt: number, h: ISpaceshipHandling): number {
        const reaction = Math.max(AI_AVOID_LOOKAHEAD_TIME, simDt * AI_AVOID_DECISION_MARGIN);
        const turnRadius = h.flightMaxTurnRate > 0 ? speed / h.flightMaxTurnRate : 0;
        return speed * reaction + turnRadius;
    }

    /**
     * Pick which way around the hazard to go, and stick with it.
     *
     * What gets latched is the *plane* of the detour — its normal, `u × desiredDir` at the moment
     * of commitment — rather than the sideways direction itself. That distinction is the whole
     * trick, and getting it wrong produces a very specific wobble:
     *
     *  - A head-on approach makes the sideways direction numerically meaningless (it is the
     *    component of the requested heading perpendicular to the bearing, and that component
     *    vanishes), so an *unlatched* ship flips sides frame to frame and drives straight in.
     *  - But latching that sideways vector directly is no better, because it then drifts out of
     *    step with the requested heading as the geometry changes, so the corrected heading no
     *    longer converges on the requested one at the edge of the safe cone. Avoidance stops
     *    fading in and out and starts snapping, which is a second wobble on top of the first.
     *
     * Latching the plane fixes both. The sideways direction is re-derived every frame as
     * `axis × u`, so it rotates smoothly with the bearing, can never flip, and stays exactly
     * equal to the requested heading's own perpendicular component for as long as that heading
     * stays in the committed plane — which is what keeps the tangent construction continuous.
     *
     * Writes the unit sideways direction into `_perp`.
     */
    private resolveSide(hazard: Body, desiredDir: THREE.Vector3): void {
        if (this.latchedHazard !== hazard) {
            // Commit to the plane the requested heading already leans into, so the detour is the
            // shallowest one that clears the obstacle.
            _axis.crossVectors(_u, desiredDir);

            if (_axis.lengthSq() <= DEGENERATE_EPSILON) {
                // Dead head-on: no plane is implied. Break the tie with the ship's own frame so
                // the choice is stable and reads naturally — go "over" the obstacle, else round.
                _ref.set(0, 1, 0).applyQuaternion(this.ship.controlFrameQuat);
                _axis.crossVectors(_u, _ref);
            }
            if (_axis.lengthSq() <= DEGENERATE_EPSILON) {
                _ref.set(1, 0, 0).applyQuaternion(this.ship.controlFrameQuat);
                _axis.crossVectors(_u, _ref);
            }
            if (_axis.lengthSq() <= DEGENERATE_EPSILON) {
                // Both ship axes parallel to the bearing is impossible, but a NaN quaternion
                // isn't. Any plane containing the bearing will do at this point.
                _axis.set(0, 1, 0).cross(_u);
                if (_axis.lengthSq() <= DEGENERATE_EPSILON) _axis.set(1, 0, 0).cross(_u);
                if (_axis.lengthSq() <= DEGENERATE_EPSILON) _axis.set(0, 1, 0);
            }

            this.latchedAxis.copy(_axis).normalize();
            this.latchedHazard = hazard;
        }

        // Sideways direction for the current bearing, within the committed plane.
        _perp.crossVectors(this.latchedAxis, _u);
        if (_perp.lengthSq() <= DEGENERATE_EPSILON) {
            // The bearing has rotated onto the plane normal. Rebuild from the requested heading.
            _perp.copy(desiredDir).addScaledVector(_u, -desiredDir.dot(_u));
            if (_perp.lengthSq() <= DEGENERATE_EPSILON) _perp.set(_u.y, -_u.x, 0);
            if (_perp.lengthSq() <= DEGENERATE_EPSILON) _perp.set(0, 1, 0);
        }
        _perp.normalize();

        // Re-orthogonalise the plane against the current bearing. Mathematically a no-op, but it
        // stops floating-point drift from slowly tilting a long detour out of its own plane.
        this.latchedAxis.crossVectors(_u, _perp).normalize();
    }

    /** Fill in the "nothing in the way" result and return it. */
    private clear(desiredDir: THREE.Vector3, lookahead: number): IAvoidanceResult {
        const r = this.result;
        r.heading.copy(desiredDir);
        r.speedLimit = Infinity;
        r.hazard = null;
        r.hazardRadius = 0;
        r.surfaceGap = Infinity;
        r.flee = false;
        r.lookahead = lookahead;
        this.latchedHazard = null;
        return r;
    }

    /**
     * Should the ship stay committed to the obstacle it is already going around?
     *
     * Detection range scales with speed, and the speed cap slows the ship down — so without this,
     * avoidance eats itself: spot the star, brake, watch the shortened lookahead lose the star,
     * turn straight back into it, speed up, spot it again. That loop is what makes a ship weave
     * at an obstacle instead of arcing around it.
     *
     * So once committed, range stops mattering. The ship holds its detour until the direct line
     * to where it actually wants to go clears the obstacle by a release margin — a genuine
     * geometric all-clear rather than a side effect of having slowed down.
     *
     * Writes the hazard's geometry into `_toBody` on success.
     */
    private stillCommitted(desiredDir: THREE.Vector3): boolean {
        const held = this.latchedHazard;
        if (!held || held._isDisposed || !held.mesh) return false;

        _toBody.subVectors(held.mesh.position, this.ship.mesh.position);
        const distance = _toBody.length();
        if (distance <= 0) return false;

        const hazardRadius = this.hazardRadiusOf(held);
        if (distance <= hazardRadius) return true; // Inside it — emphatically still committed.

        const theta = Math.asin(THREE.MathUtils.clamp(hazardRadius / distance, 0, 1));
        const releaseAngle = Math.min(
            theta + AI_AVOID_CLEARANCE_ANGLE + AI_AVOID_RELEASE_ANGLE,
            Math.PI
        );
        return _toBody.dot(desiredDir) / distance > Math.cos(releaseAngle);
    }

    /**
     * Check the path ahead and return a heading the ship can safely fly.
     *
     * @param desiredDir Unit direction the controller wants to go.
     * @param simDt Sim-time seconds advanced this frame (wall dt × time scale).
     * @returns A reused result object — read it before the next call, don't retain it.
     */
    evaluate(desiredDir: THREE.Vector3, simDt: number): IAvoidanceResult {
        const ship = this.ship;
        const h = ship.handling;
        const result = this.result;

        const speed = ship.velocity.length();

        // Test along where momentum is actually taking the ship, not where its nose points: it
        // coasts ballistically between thrust pulses and gravity bends the path, so velocity is
        // what decides whether it hits anything. When effectively stationary there is no
        // direction of travel, so the requested heading is the only thing worth testing.
        const travelDir = result.travelDir;
        if (speed > SPEED_EPSILON) {
            travelDir.copy(ship.velocity).divideScalar(speed);
        } else {
            travelDir.copy(desiredDir);
        }

        // Plan at the speed the ship would fly if nothing were in the way, not the speed
        // avoidance has already slowed it to. Scaling the horizon off the current speed alone is
        // circular — braking for an obstacle shortens the very lookahead that found it.
        const planningSpeed = Math.max(speed, h.flightMaxSpeed);
        const lookahead = this.lookaheadDistance(planningSpeed, simDt, h);
        const shipPos = ship.mesh.position;

        // ── Hazard scan ──────────────────────────────────────────────────────
        // Every body qualifies except ships and wormholes, so the loop has to stay cheap: a
        // Kuiper belt puts ~12,000 entries in `bodies`. The range reject below is a squared
        // comparison with no sqrt and no allocation, and it runs before any trigonometry.
        let bestBody: Body | null = null;
        let bestGap = Infinity;
        let bestRadius = 0;
        let bestDistance = 0;

        for (const body of simulationState.bodies) {
            if (!body || body === ship || body._isDisposed || !body.mesh) continue;
            if (isBodyType(body, EXCLUDED_TYPES)) continue;
            if (!(body.radius > 0) || !Number.isFinite(body.radius)) continue;

            const hazardRadius = this.hazardRadiusOf(body);

            _toBody.subVectors(body.mesh.position, shipPos);
            const distanceSquared = _toBody.lengthSq();

            // Out of range: the surface is further away than we can see. This is also the
            // corridor's length gate — `d - hazardRadius <= lookahead` is the same inequality.
            const reach = lookahead + hazardRadius;
            if (distanceSquared > reach * reach) continue;

            const distance = Math.sqrt(distanceSquared);
            const gap = distance - hazardRadius;

            // Already inside the hazard sphere — nothing outranks that.
            if (gap <= 0) {
                if (gap < bestGap) {
                    bestBody = body;
                    bestGap = gap;
                    bestRadius = hazardRadius;
                    bestDistance = distance;
                    _bestToBody.copy(_toBody);
                }
                continue;
            }

            // Does either ray pierce the sphere's silhouette cone, widened by the clearance
            // margin? Testing both means the ship neither coasts into something nor steers into
            // it. `theta` is the cone's half-angle as seen from here.
            const theta = Math.asin(THREE.MathUtils.clamp(hazardRadius / distance, 0, 1));
            const safeAngle = Math.min(theta + AI_AVOID_CLEARANCE_ANGLE, Math.PI);
            const cosSafe = Math.cos(safeAngle);

            const cosTravel = _toBody.dot(travelDir) / distance;
            const cosDesired = _toBody.dot(desiredDir) / distance;
            if (cosTravel <= cosSafe && cosDesired <= cosSafe) continue;

            if (gap < bestGap) {
                bestBody = body;
                bestGap = gap;
                bestRadius = hazardRadius;
                bestDistance = distance;
                _bestToBody.copy(_toBody);
            }
        }

        // Nothing new in range, but we may still be part-way around something. `stillCommitted()`
        // leaves the hazard's bearing in `_toBody`.
        const held = this.latchedHazard;
        if (!bestBody && held && this.stillCommitted(desiredDir)) {
            bestBody = held;
            bestRadius = this.hazardRadiusOf(held);
            bestDistance = _toBody.length();
            bestGap = bestDistance - bestRadius;
            _bestToBody.copy(_toBody);
        }

        if (!bestBody) return this.clear(desiredDir, lookahead);

        // ── Correction ───────────────────────────────────────────────────────
        _u.copy(_bestToBody).divideScalar(bestDistance);

        result.hazard = bestBody;
        result.hazardRadius = bestRadius;
        result.surfaceGap = bestGap;
        result.lookahead = lookahead;

        if (bestGap <= 0) {
            // Inside the hazard sphere. There is no tangent to fly and nothing to be gained by
            // slowing down — the only way out is straight back the way we came in, at full power.
            result.heading.copy(_u).negate();
            result.speedLimit = Infinity;
            result.flee = true;
            this.latchedHazard = null;
            return result;
        }

        this.resolveSide(bestBody, desiredDir);

        // Aim at the silhouette tangent plus the clearance margin. Built directly from the
        // bearing and the committed side rather than by rotating the requested heading, so it is
        // exact at any angle — and it converges on the requested heading as that heading rotates
        // clear, which is what makes engagement and disengagement seamless.
        //
        // Note this degrades gracefully as the ship closes in: `theta` grows toward 90°, so the
        // commanded heading swings past perpendicular and starts pointing away from the body of
        // its own accord. No special case needed for a near miss.
        const theta = Math.asin(THREE.MathUtils.clamp(bestRadius / bestDistance, 0, 1));
        const safeAngle = Math.min(theta + AI_AVOID_CLEARANCE_ANGLE, Math.PI);
        result.heading
            .copy(_u)
            .multiplyScalar(Math.cos(safeAngle))
            .addScaledVector(_perp, Math.sin(safeAngle))
            .normalize();

        // There are two independent ways not to hit something, and either one is enough, so the
        // cap is the more permissive of them:
        //  - **Turn past it.** A ship's turn circle has radius `speed / turnRate`, so the speed
        //    at which that circle fits inside the remaining gap is `gap × turnRate`. This is the
        //    constraint that actually governs a detour, and it is far looser than stopping.
        //  - **Stop short of it.** The fallback for a head-on closure, where turning won't help.
        // Capping on the braking curve alone (the obvious first answer) makes a ship crawl around
        // obstacles it had ample room to simply steer past.
        const turnLimit = (bestGap * h.flightMaxTurnRate) / AI_APPROACH_SAFETY_PAD;
        const brakeLimit = brakingSpeedLimit(bestGap / AI_APPROACH_SAFETY_PAD, h);
        result.speedLimit = Math.max(turnLimit, brakeLimit);

        // Close enough that station-keeping is no longer the priority: get clear first.
        // Measured on the speed *toward* the hazard, not raw speed — a ship skimming a surface
        // on its way out is not in trouble, however fast it happens to be going.
        const closingOnHazard = ship.velocity.dot(_u);
        const timeToSurface =
            closingOnHazard > SPEED_EPSILON ? bestGap / closingOnHazard : Infinity;
        result.flee = timeToSurface < AI_AVOID_PANIC_TIME;

        return result;
    }
}
