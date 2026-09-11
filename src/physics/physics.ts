import * as THREE from 'three';
import { Body } from '../bodies/body';
import {
    BLACK_HOLE_RADIUS_PER_SOL,
    G,
    PLUTO_DIST,
    SOFTENING_EPS,
    SUN_MASS,
} from '../utilities/consts';
import { MainSequenceStar } from '../bodies/main-sequence-star';
import { BlackHole } from '../bodies/black-hole';
import { CelestialBody } from '../bodies/celestial-body';
import { NotificationType } from '../event-log/event-log';
import { EffectiveGForce } from '../types';
import { IFlightState, ISimulationState, IAutopilotState } from '../interfaces';
import { flightState } from '../simulation/simulation';
import { NBodyIntegrator, ISubstepHooks } from './nbody/integrator';
import { getActiveSolver } from './nbody/solver-registry';

/** Squared Plummer softening, precomputed once. */
const EPS2 = SOFTENING_EPS * SOFTENING_EPS;

/** The engine that owns the SoA mirror and carries acceleration state between frames. */
const _integrator = new NBodyIntegrator();

/** Reusable hook object so the substep loop never allocates. */
const _hooks: ISubstepHooks = {
    applyThrust: () => {},
    updateAutopilot: null,
    autopilotTarget: null,
};

/**
 * Drop acceleration state carried between frames.
 * Call when the world is replaced wholesale (new system generated, sim reset) so a fresh
 * simulation never inherits the previous one's opening half-kick.
 */
export function resetPhysicsState(): void {
    _integrator.reset();
}

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
 * Advance the simulation by `steps` substeps of `dt`, applying gravity, ship thrust and
 * autopilot impulses.
 *
 * Gravity is evaluated by the solver selected in Options -> Physics and integrated with a
 * kick-drift-kick leapfrog over a flat structure-of-arrays mirror of the bodies (see
 * {@link NBodyIntegrator}). Body state is copied into that mirror once per frame and copied
 * back once at the end, so everything downstream — rendering, collisions, wormholes, orbit
 * prediction — still sees ordinary `mesh.position` values.
 *
 * @param simulationState The current state of the simulation, including all bodies.
 * @param autopilotState The current state of the autopilot, including phase and target information.
 * @param steps The number of substeps to perform in the physics integration loop.
 * @param dt The time delta for each substep.
 * @param updateAutopilot A callback function to update the autopilot state each substep.
 */
export function updateSimulation(
    simulationState: ISimulationState,
    autopilotState: IAutopilotState,
    _flightState: IFlightState,
    steps: number,
    dt: number,
    updateAutopilot: (dt: number) => void
) {
    const gEff = G * simulationState.gMultiplier;

    // Thrust is applied per substep (rather than once per frame) so it stays correctly
    // interleaved with gravity at any time-warp factor — the same reason the old loop did it.
    _hooks.applyThrust = (substepDt: number) => {
        flightState.activeShip?.applyFlightThrustSubstep?.(substepDt);

        for (const npc of simulationState.npcShips) {
            if (!npc || npc._isDisposed || npc === flightState.activeShip) continue;
            npc.applyFlightThrustSubstep(substepDt);
        }
    };

    // Autopilot impulses likewise scale with timeScale only if applied per substep;
    // once per frame would let the ship sail through brake zones at high warp.
    _hooks.updateAutopilot = autopilotState.isActive ? updateAutopilot : null;
    _hooks.autopilotTarget = autopilotState.targetBody;

    _integrator.step(simulationState.bodies, getActiveSolver(), gEff, EPS2, steps, dt, _hooks);
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

/**
 * Removes bodies from a decisive collision without transferring any mass/radius to the
 * winner. Used for spaceships, which can claim a destroyed body as a kill but never absorb it,
 * and for destroy-both outcomes where every body is destroyed (winner is null).
 */
export function destroyBody(winner: Body | null, victims: Body[]) {
    if (!victims || victims.length === 0) return;
    if (victims.some((v) => !v || v._isDisposed)) return;
    if (winner && winner._isDisposed) return;

    const names = victims.map((v) => v.name).join(' and ');
    const message = winner ? `${winner.name} destroyed ${names}` : `${names} were destroyed`;
    console.info('[body:destroyed]', message);
    window.dispatchEvent(
        new CustomEvent('body:absorbed', {
            detail: {
                message,
                notificationType: NotificationType.Alert,
            },
        })
    );
}

/**
 * Calculates the event horizon radius for a black hole of a given mass.
 * @param mass The mass of the black hole.
 * @returns The event horizon radius.
 */
export function blackHoleMassToEventHorizonRadius(mass: number): number {
    const safeMass = Math.max(0, mass);

    // Convert mass to solar masses (if needed) before multiplying by the constant.
    const massInSolarMasses = safeMass / SUN_MASS;
    // Convert mass to radius using the constant for solar masses.
    return BLACK_HOLE_RADIUS_PER_SOL * massInSolarMasses;
}
