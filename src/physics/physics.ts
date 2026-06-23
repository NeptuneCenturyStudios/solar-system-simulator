import * as THREE from 'three';
import { Body } from '../bodies/body';
import { G, PLUTO_DIST } from '../utilities/consts';
import { MainSequenceStar } from '../bodies/main-sequence-star';
import { BlackHole } from '../bodies/black-hole';
import { CelestialBody } from '../bodies/celestial-body';
import { Spaceship } from '../bodies/spaceship';
import { NotificationType } from '../event-log/event-log';
import { EffectiveGForce } from '../types';
import { IFlightState, ISimulationState, IAutopilotState } from '../interfaces';

// ── Scratch vectors for allocation-free physics ──────────────────────────────
// Reused by getAcc() and updatePhysics() to eliminate GC churn in the hot path.
const _scratchDiff = new THREE.Vector3();
const _scratchZero = new THREE.Vector3(0, 0, 0);
/** Pool of accelerations recycled each frame so updatePhysics never calls `new`. */
const _accPool: THREE.Vector3[] = [];
/** Number of bodies that _accPool was sized for on the last frame. */
let _accPoolSize = 0;

/**
 * Calculate position and velocity for a circular orbit around a parent body
 * @param {EffectiveGForce} gForce The gravitational constant to use in the calculation
 * @param {number} distance The distance from the parent body at which the orbit is calculated
 * @param {number} parentMass The mass of the parent body around which the orbit is calculated
 * @param {number} angleRad The orbital angle in radians (0 = +X axis, π/2 = +Z axis)
 * @returns An object containing the position and velocity vectors for the circular orbit
 */
export function calculateTrajectory(
    gForce: EffectiveGForce,
    distance: number,
    parentMass: number,
    angleRad: number = 0
) {
    const speed = Math.sqrt((gForce * parentMass) / distance);

    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    // Position body at the given angle in the XZ plane
    const pos = new THREE.Vector3(distance * cosA, 0, distance * sinA);

    // Velocity perpendicular to position (tangential) for circular orbit
    const vel = new THREE.Vector3(-speed * sinA, 0, speed * cosA);

    return { pos, vel };
}

/**
 * Calculate the orbital speed for a given distance and host mass, optionally accounting for eccentricity.
 * @param {number} gForce The gravitational constant to use in the calculation
 * @param {number} distance The distance from the parent body at which the orbit is calculated
 * @param {number} hostMass The mass of the parent body around which the orbit is calculated
 * @param {number} eccentricity The eccentricity of the orbit (0 = circular, 1 = parabolic)
 * @returns The orbital speed for the given parameters
 */
export function calculateOrbitalSpeed(
    gForce: number,
    distance: number,
    hostMass: number,
    eccentricity: number
) {
    const circularSpeed = Math.sqrt((gForce * hostMass) / distance);
    const speed = circularSpeed * Math.sqrt(Math.max(0, 1 - eccentricity));

    return speed;
}

/**
 * Update the physics simulation for all bodies in the simulation state, applying gravitational forces and autopilot thrust as needed.
 * @param simulationState The current state of the simulation, including all bodies and explosions.
 * @param autopilotState The current state of the autopilot, including phase and target information.
 * @param steps The number of substeps to perform in the physics integration loop.
 * @param dt The time delta for each substep.
 * @param updateAutopilot A callback function to update the autopilot state each substep.
 */
export function updateSimulation(
    simulationState: ISimulationState,
    autopilotState: IAutopilotState,
    flightState: IFlightState,
    steps: number,
    dt: number,
    updateAutopilot: (dt: number) => void
) {
    // Physics integration loop
    for (let i = 0; i < steps; i++) {
        // Apply physics to bodies
        updatePhysics(simulationState, flightState);

        // Apply autopilot thrust impulse each substep so it scales correctly with timeScale.
        // Running once per frame at BASE_FRAME_DT would let the ship fly through brake zones
        // at high time-warp without ever triggering phase transitions.
        if (autopilotState.isActive) updateAutopilot(dt);

        // Apply accelerations to positions
        for (const body of simulationState.bodies) {
            if (body && !body._isDisposed && body.mesh && body.tempAcc) {
                body.update(body.tempAcc, dt);
            }
        }
    }
}

// Private helpers
/**
 * Get the gravitational acceleration vector exerted on a body at position p1 by another body at position p2 with mass m2.
 * @param p1 The position of the body experiencing the acceleration.
 * @param p2 The position of the body exerting the gravitational force.
 * @param m2 The mass of the body exerting the gravitational force.
 * @returns The gravitational acceleration vector.
 */
function getAcc(p1: THREE.Vector3, p2: THREE.Vector3, m2: number, G: number) {
    // 1. Compute scaled distance vector using scratch (no allocation)
    _scratchDiff.subVectors(p2, p1);

    // 2. Scaled distance magnitude
    const r = _scratchDiff.length();

    if (r < 0.01) return _scratchZero;

    // 3. Gravitational acceleration in scaled units
    const accMag = (G * m2) / (r * r);

    // 4. Normalize and scale (in-place on scratch)
    return _scratchDiff.normalize().multiplyScalar(accMag);
}

/**
 * Update the physics simulation for all bodies in the simulation state, calculating gravitational accelerations.
 * @param simulationState The current state of the simulation, including all bodies.
 */
function updatePhysics(simulationState: ISimulationState, flightState: IFlightState) {
    const bodies = simulationState.bodies;
    const len = bodies.length;
    const gEff = G * simulationState.gMultiplier;

    // Grow the reuse pool if needed (never shrinks — avoids allocation churn).
    if (len > _accPoolSize) {
        for (let i = _accPoolSize; i < len; i++) {
            _accPool[i] = new THREE.Vector3(0, 0, 0);
        }
        _accPoolSize = len;
    }

    for (let idx = 0; idx < len; idx++) {
        const body = bodies[idx];
        if (!body || body._isDisposed || !body.mesh) continue;

        // Don't integrate physics if the ship is decelerating in warp or boost mode.
        // (kept as a silent skip — no console.info on the hot path)
        if (
            body === flightState.knownShip &&
            (flightState.warpDecelerating || flightState.boostDecelerating)
        ) {
            continue;
        }

        const totalAcc = _accPool[idx];
        totalAcc.set(0, 0, 0);

        // Calculate pull from ALL OTHER bodies (n-body simulation)
        for (const other of bodies) {
            if (other !== body && !other?._isDisposed && other.mesh) {
                const accFromOther = getAcc(
                    body.mesh.position,
                    other.mesh.position,
                    other.mass,
                    gEff
                );
                totalAcc.add(accFromOther);
            }
        }

        // Store the accumulated force to apply in the update step
        body.tempAcc = totalAcc;
    }
}

/**
 * Set the visual radius for any body. Delegates to the body's setRadius method.
 * @param {object} body - The celestial body to update
 * @param {number} newRadius - The new radius to set
 */
export function setBodyRadius(body: CelestialBody, newRadius: number) {
    if (!body) return;

    // Hard cap to prevent extreme "fills the screen" glitches.
    // Target: allow stars to grow to roughly Kuiper-belt scale, but never beyond.
    //
    // Kuiper belt generation uses:
    //   r = NEPTUNE_DIST + rand * (PLUTO_DIST - NEPTUNE_DIST + 300000)
    // So the outer edge is roughly PLUTO_DIST + 300000.
    const MAX_RADIUS = PLUTO_DIST + 300000;
    newRadius = Math.min(newRadius, MAX_RADIUS);

    body.setRadius(newRadius);
}

function collisionScoreEscapeVelocity(body: Body) {
    // Winner heuristic: compare escape velocity (constants cancel):
    //   v_esc = sqrt(2GM/R)  => ordering is equivalent to M/R
    const m = Math.max(0, body?.mass || 0);
    const r = Math.max(
        1e-6,
        typeof body?.radius === 'number' && isFinite(body.radius) && body.radius > 0
            ? body.radius
            : 0
    );

    return m / r;
}

export function chooseCollisionWinner(b1: Body, b2: Body) {
    // Spaceships always lose — they should never absorb anything.
    if (b1 instanceof Spaceship) return { winner: b2, victim: b1 };
    if (b2 instanceof Spaceship) return { winner: b1, victim: b2 };

    const s1 = collisionScoreEscapeVelocity(b1);
    const s2 = collisionScoreEscapeVelocity(b2);

    if (s1 > s2) return { winner: b1, victim: b2 };
    if (s2 > s1) return { winner: b2, victim: b1 };

    // Stable-ish tie breakers (avoid random flip-flops on exact ties)
    const m1 = Math.max(0, b1?.mass || 0);
    const m2 = Math.max(0, b2?.mass || 0);
    if (m1 > m2) return { winner: b1, victim: b2 };
    if (m2 > m1) return { winner: b2, victim: b1 };

    const n1 = String(b1?.name || '');
    const n2 = String(b2?.name || '');
    if (n1 >= n2) return { winner: b1, victim: b2 };
    return { winner: b2, victim: b1 };
}

export function absorbBody(winner: Body, victim: Body) {
    if (!winner || !victim) return;
    if (winner._isDisposed || victim._isDisposed) return;
    if (winner._isDisposed || victim._isDisposed) return;

    const mw = Math.max(0, winner.mass || 0);
    const mv = Math.max(0, victim.mass || 0);
    const newMass = mw + mv;
    if (newMass <= 0) return;

    // Momentum conservation
    const vW = winner.velocity?.clone?.() || new THREE.Vector3();
    const vV = victim.velocity?.clone?.() || new THREE.Vector3();
    const mergedVel = vW.multiplyScalar(mw).add(vV.multiplyScalar(mv)).divideScalar(newMass);
    if (winner.velocity) winner.velocity.copy(mergedVel);

    // Mass
    winner.mass = newMass;

    // Stars: transfer remaining fuel + capacity (when fuel system is active)
    if (
        winner instanceof MainSequenceStar &&
        victim instanceof MainSequenceStar &&
        winner.fuel !== null &&
        victim.fuel !== null
    ) {
        winner.fuel += victim.fuel;
        if (winner.maxFuel !== null && victim.maxFuel !== null) {
            winner.maxFuel += victim.maxFuel;
        }
    }

    // Radius:
    // - Default: volume add => cbrt(r1^3 + r2^3)
    // - Black holes: radius is derived from mass compression, not added "raw volume".
    if (winner instanceof BlackHole) {
        const compressed = BlackHole.massToEventHorizonRadius(newMass);
        setBodyRadius(winner, compressed);
        // Flood the accretion disk — a whole star's worth of material disrupted at once.
        winner.seedAccretionDisk(400);
    } else if (winner instanceof CelestialBody && victim instanceof CelestialBody) {
        const rw = Math.max(0.0001, winner.radius || 0.0001);
        const rv = Math.max(0.0001, victim.radius || 0.0001);
        const newRadius = Math.cbrt(rw * rw * rw + rv * rv * rv);
        setBodyRadius(winner, newRadius);
    }

    // Inform the user via a decoupled event so UI/logging stays in index.ts.
    // index.ts listens and turns this into a Noty notification.
    const message = `${winner.name} absorbed ${victim.name}`;
    console.info('[body:absorbed]', message);
    window.dispatchEvent(
        new CustomEvent('body:absorbed', {
            detail: {
                message,
                notificationType: NotificationType.Alert,
            },
        })
    );
}
