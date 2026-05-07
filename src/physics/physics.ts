import * as THREE from 'three';
import { Body } from '../bodies/body';
import { ParticleExplosion } from '../effects/particle-explosion';

/**
 * Represents the rotation of a body in 3D space
 */
export interface IRotation {
    axis: THREE.Vector3;
    speed: number;
}

/**
 * Represents the state of the physics simulation, including all bodies, explosions, and simulation parameters.
 */
export interface ISimulationState {
    timeScale: number;
    isPaused: boolean;
    savedTimeScale: number;
    lastT: number;
    bodies: Body[];
    explosions: ParticleExplosion[];
    showNames: boolean;
    G: number;
}

/**
 * Autopilot state and phase information used to control the ship's automatic navigation behavior
 */
export type AutopilotPhase = 'WARP_CHARGING' | 'WARP' | 'APPROACH' | 'BRAKE' | 'CIRCULARIZE';

/**
 * Represents the state of the autopilot, including its activity status, target body, current phase, and various timers.
 */
export interface IAutopilotState {
    isActive: boolean;
    targetBody: Body | null;
    phase: AutopilotPhase | null;
    /** Stable-orbit notification timer (seconds remaining to display). */
    orbitNotifyTimer: number;
    /** True while the autopilot WARP phase is active (post-charge). */
    isWarpActive: boolean;
    /** Accumulated charge time (seconds) during the WARP_CHARGING phase. */
    warpChargeTimer: number;
    /** True while the approach phase is using boost speed. */
    isBoostActive: boolean;
    /** Distance from target when BRAKE phase started — used to compute the
     *  0→1 blend factor that rotates the desired velocity from 'stop' to
     *  'orbital velocity' as the ship closes on the orbit radius. */
    brakeEntryDistance: number;
}

/**
 * Calculate position and velocity for a circular orbit around a parent body
 * @param {number} distance The distance from the parent body at which the orbit is calculated
 * @param {number} parentMass The mass of the parent body around which the orbit is calculated
 * @returns An object containing the position and velocity vectors for the circular orbit
 */
export function calculateTrajectory(gForce: number, distance: number, parentMass: number) {
    const speed = Math.sqrt((gForce * parentMass) / distance);

    // Position body on the X axis
    const pos = new THREE.Vector3(distance, 0, 0);

    // Velocity must be on the Z axis (perpendicular to X) to start a circular orbit
    const vel = new THREE.Vector3(0, 0, speed);

    return { pos, vel };
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
    steps: number,
    dt: number,
    updateAutopilot: (dt: number) => void
) {
    // Physics integration loop
    for (let i = 0; i < steps; i++) {
        // Apply physics to bodies
        updatePhysics(simulationState);

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
    const diff = new THREE.Vector3().subVectors(p2, p1);
    const r = diff.length();

    // Prevent division by zero
    if (r < 0.01) return new THREE.Vector3(0, 0, 0);

    // Gravitational acceleration: a = G * m / r²
    const accMag = (G * m2) / (r * r);

    // Normalize and scale
    diff.normalize();

    // Return acceleration vector
    return diff.multiplyScalar(accMag);
}

/**
 * Update the physics simulation for all bodies in the simulation state, calculating gravitational accelerations.
 * @param simulationState The current state of the simulation, including all bodies.
 */
function updatePhysics(simulationState: ISimulationState) {
    // Calculate accelerations for all bodies
    for (const body of simulationState.bodies) {
        const totalAcc = new THREE.Vector3(0, 0, 0);

        // Calculate pull from ALL OTHER bodies (n-body simulation)
        for (const other of simulationState.bodies) {
            if (other !== body && !other?._isDisposed && other.mesh) {
                const accFromOther = getAcc(body.mesh.position, other.mesh.position, other.mass, simulationState.G);
                totalAcc.add(accFromOther);
            }
        }

        // Store the accumulated force to apply in the update step
        body.tempAcc = totalAcc;
    }
}
