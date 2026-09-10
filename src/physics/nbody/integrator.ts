import * as THREE from 'three';
import { Body } from '../../bodies/body';
import { BodyStore, FLAG_STATIC } from './body-store';
import { INBodySolver } from './solver';

/**
 * Per-substep callbacks that need to run against live `Body` objects rather than the
 * flat arrays — ship thrust and autopilot impulses.
 */
export interface ISubstepHooks {
    /** Apply player and AI ship thrust for one substep. Mutates ship velocity/position. */
    applyThrust: (dt: number) => void;
    /** Autopilot impulse for one substep, or null when the autopilot is idle. */
    updateAutopilot: ((dt: number) => void) | null;
    /** Body the autopilot is steering toward, whose position it reads each substep. */
    autopilotTarget: Body | null;
}

/**
 * Kick-drift-kick leapfrog over a {@link BodyStore}.
 *
 * The previous implementation applied the *same* acceleration to both half-kicks, which
 * makes the update map non-symplectic (its Jacobian determinant is `1 - a'·dt²/2`, not 1)
 * and lets orbital energy drift monotonically. Recomputing the acceleration between the
 * two half-kicks makes the scheme genuinely symplectic, so energy error stays bounded and
 * oscillatory instead of accumulating.
 *
 * This costs no extra force evaluations: the acceleration computed at the end of substep
 * *n* is carried into substep *n+1*'s opening half-kick, leaving exactly one solver call
 * per substep — the same budget the old loop used.
 */
export class NBodyIntegrator {
    readonly store = new BodyStore();

    /** Accelerations carried across frames, keyed by body so reindexing cannot mismatch them. */
    private prevAcc = new Map<Body, [number, number, number]>();

    /**
     * Slots that must stay mirrored onto their `Body` objects during the substep loop,
     * because ship controllers and the autopilot read `mesh.position` directly. Always tiny
     * (the ships plus the autopilot's target), so the per-substep sync is negligible.
     */
    private liveSlots: number[] = [];

    private readonly scratch = new THREE.Vector3();

    /**
     * Advance the whole simulation by `steps` substeps of `dt`.
     *
     * @param bodies Every body in the simulation.
     * @param solver Force solver selected by the user.
     * @param gEff Gravitational constant times the simulation's gMultiplier.
     * @param eps2 Squared Plummer softening length.
     */
    step(
        bodies: Body[],
        solver: INBodySolver,
        gEff: number,
        eps2: number,
        steps: number,
        dt: number,
        hooks: ISubstepHooks
    ): void {
        const store = this.store;

        store.sync(bodies);
        store.remapAccelerations(this.prevAcc);

        if (store.count === 0) return;

        this.buildLiveSlots(hooks.autopilotTarget);

        // Opening acceleration for the first half-kick. Every later substep reuses the
        // acceleration produced by the previous substep's mid-step solve.
        solver.computeAccelerations(store, gEff, eps2);

        for (let s = 0; s < steps; s++) {
            this.kick(dt * 0.5);

            // Controllers read and write Body objects, so surface the in-flight state to
            // them and absorb whatever they changed.
            this.pushLive();
            hooks.applyThrust(dt);
            if (hooks.updateAutopilot) hooks.updateAutopilot(dt);
            this.pullLive();

            this.drift(dt);

            solver.computeAccelerations(store, gEff, eps2);

            this.kick(dt * 0.5);
            this.clampSpeeds();
        }

        store.captureAccelerations(this.prevAcc);
        store.writeBack();
    }

    /** Discard carried accelerations — used when the world is rebuilt under the simulation. */
    reset(): void {
        this.prevAcc.clear();
    }

    private buildLiveSlots(autopilotTarget: Body | null): void {
        const store = this.store;

        this.liveSlots.length = 0;
        for (let i = 0; i < store.exactTargets.length; i++) {
            this.liveSlots.push(store.exactTargets[i]);
        }

        const targetSlot = store.indexOf(autopilotTarget);
        if (targetSlot >= 0 && !this.liveSlots.includes(targetSlot)) {
            this.liveSlots.push(targetSlot);
        }
    }

    /** Copy the in-flight state of the live slots onto their Body objects. */
    private pushLive(): void {
        const store = this.store;

        for (let k = 0; k < this.liveSlots.length; k++) {
            const i = this.liveSlots[k];
            const body = store.bodyAtIndex(i);
            if (!body || body._isDisposed || !body.mesh) continue;

            body.mesh.position.set(store.px[i], store.py[i], store.pz[i]);
            body.velocity.set(store.vx[i], store.vy[i], store.vz[i]);
        }
    }

    /** Absorb any changes the controllers made back into the flat arrays. */
    private pullLive(): void {
        const store = this.store;

        for (let k = 0; k < this.liveSlots.length; k++) {
            const i = this.liveSlots[k];
            const body = store.bodyAtIndex(i);
            if (!body || body._isDisposed || !body.mesh) continue;

            const p = body.mesh.position;
            store.px[i] = p.x;
            store.py[i] = p.y;
            store.pz[i] = p.z;

            const v = body.velocity;
            store.vx[i] = v.x;
            store.vy[i] = v.y;
            store.vz[i] = v.z;
        }
    }

    private kick(halfDt: number): void {
        const { vx, vy, vz, ax, ay, az, count } = this.store;

        for (let i = 0; i < count; i++) {
            vx[i] += ax[i] * halfDt;
            vy[i] += ay[i] * halfDt;
            vz[i] += az[i] * halfDt;
        }
    }

    private drift(dt: number): void {
        const { px, py, pz, vx, vy, vz, count } = this.store;

        for (let i = 0; i < count; i++) {
            px[i] += vx[i] * dt;
            py[i] += vy[i] * dt;
            pz[i] += vz[i] * dt;
        }
    }

    /**
     * Bulk equivalent of the old per-body `CelestialBody.clampToLightSpeed`.
     *
     * Bodies with `maxSpeed === 0` are uncapped — that covers ships (which never clamped)
     * and the degenerate case where the effective speed of light is zero or non-finite,
     * where clamping would zero every velocity and then produce NaN on the next substep.
     */
    private clampSpeeds(): void {
        const { vx, vy, vz, maxSpeed, flags, count } = this.store;

        for (let i = 0; i < count; i++) {
            const cap = maxSpeed[i];
            if (cap <= 0) continue;
            if ((flags[i] & FLAG_STATIC) !== 0) continue;

            const x = vx[i];
            const y = vy[i];
            const z = vz[i];
            const speedSq = x * x + y * y + z * z;

            if (speedSq > cap * cap) {
                const scale = (cap * 0.9999) / Math.sqrt(speedSq);
                vx[i] = x * scale;
                vy[i] = y * scale;
                vz[i] = z * scale;
            }
        }
    }

    /** Read a body's live position mid-substep, for callers outside the loop. */
    readPosition(body: Body, out: THREE.Vector3 = this.scratch): THREE.Vector3 {
        return this.store.readPosition(this.store.indexOf(body), out);
    }
}
