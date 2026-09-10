import * as THREE from 'three';
import { Body } from '../../bodies/body';
import { CelestialBody } from '../../bodies/celestial-body';
import { StaticBody } from '../../bodies/static-body';
import { Spaceship } from '../../bodies/ships/spaceship';

import { FLAG_EXACT_TARGET, FLAG_STATIC, IBodyArrays } from './store-view';

export { FLAG_EXACT_TARGET, FLAG_STATIC };
export type { IBodyArrays };

/**
 * Structure-of-arrays mirror of the simulation's bodies, used for the duration of a
 * frame's substep loop.
 *
 * The physics hot loop reads and writes these flat `Float64Array`s only — never
 * `body.mesh.position` or `body.velocity`. State is copied in once per frame by
 * {@link BodyStore.sync} and copied back out once by {@link BodyStore.writeBack}, so the
 * inner loops touch contiguous memory instead of chasing pointers through
 * `Body -> THREE.Mesh -> THREE.Vector3` for every interacting pair.
 *
 * Indices are dense and stable only within a single frame. They are rebuilt by every
 * `sync()` call, because bodies can be added, disposed, or absorbed between frames.
 */
export class BodyStore implements IBodyArrays {
    /** Number of live bodies currently mirrored. Indices `[0, count)` are valid. */
    count = 0;

    px: Float64Array = new Float64Array(0);
    py: Float64Array = new Float64Array(0);
    pz: Float64Array = new Float64Array(0);

    vx: Float64Array = new Float64Array(0);
    vy: Float64Array = new Float64Array(0);
    vz: Float64Array = new Float64Array(0);

    ax: Float64Array = new Float64Array(0);
    ay: Float64Array = new Float64Array(0);
    az: Float64Array = new Float64Array(0);

    mass: Float64Array = new Float64Array(0);

    /**
     * Per-body speed cap in scaled units, or 0 when the body is not capped.
     * Mirrors `CelestialBody.clampToLightSpeed`, which the integrator now applies in
     * bulk rather than through a virtual call per body per substep.
     */
    maxSpeed: Float64Array = new Float64Array(0);

    flags: Uint8Array = new Uint8Array(0);

    /** Compacted, index-aligned view of the live bodies. `bodyAt[i]` owns slot `i`. */
    private bodyAt: (Body | null)[] = [];

    /** Slot lookup for the few callers that need to reach a specific body (ships, autopilot). */
    private indexOf_ = new Map<Body, number>();

    /** Slots flagged {@link FLAG_EXACT_TARGET}, gathered once per sync for the solvers. */
    readonly exactTargets: number[] = [];

    private capacity = 0;

    private ensureCapacity(needed: number): void {
        if (needed <= this.capacity) return;

        const next = Math.max(64, Math.ceil(needed * 1.5));

        this.px = new Float64Array(next);
        this.py = new Float64Array(next);
        this.pz = new Float64Array(next);

        this.vx = new Float64Array(next);
        this.vy = new Float64Array(next);
        this.vz = new Float64Array(next);

        this.ax = new Float64Array(next);
        this.ay = new Float64Array(next);
        this.az = new Float64Array(next);

        this.mass = new Float64Array(next);
        this.maxSpeed = new Float64Array(next);
        this.flags = new Uint8Array(next);

        this.capacity = next;
    }

    /**
     * Copy live body state into the flat arrays and rebuild the slot mapping.
     * Disposed bodies and bodies without a mesh are dropped, so the resulting indices are
     * dense — the solvers never need to re-check liveness inside their loops.
     *
     * Accelerations are deliberately NOT cleared here: the leapfrog integrator carries the
     * acceleration computed at the end of the previous frame into this frame's first kick.
     * {@link remapAccelerations} handles preserving those values across the reindex.
     */
    sync(bodies: Body[]): void {
        this.ensureCapacity(bodies.length);

        this.indexOf_.clear();
        this.exactTargets.length = 0;

        let n = 0;

        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (!body || body._isDisposed || !body.mesh) continue;

            const pos = body.mesh.position;
            this.px[n] = pos.x;
            this.py[n] = pos.y;
            this.pz[n] = pos.z;

            const vel = body.velocity;
            this.vx[n] = vel.x;
            this.vy[n] = vel.y;
            this.vz[n] = vel.z;

            this.mass[n] = body.mass > 0 ? body.mass : 0;

            let flags = 0;

            // Wormholes and anything else deriving from StaticBody keep their velocity but
            // are never accelerated by gravity, matching StaticBody.update's old behaviour.
            if (body instanceof StaticBody) flags |= FLAG_STATIC;

            // Solver choice is a performance dial and must never change how a ship flies,
            // so ships always receive exact forces from every source.
            if (body instanceof Spaceship) {
                flags |= FLAG_EXACT_TARGET;
                this.exactTargets.push(n);
            }

            this.flags[n] = flags;

            // Only CelestialBody clamped to light speed previously; Spaceship extends Body
            // directly and was never clamped, so it stays uncapped here.
            if (body instanceof CelestialBody && !(body instanceof StaticBody)) {
                const c = body.dependencies.getC();
                this.maxSpeed[n] = Number.isFinite(c) && c > 0 ? c : 0;
            } else {
                this.maxSpeed[n] = 0;
            }

            this.bodyAt[n] = body;
            this.indexOf_.set(body, n);
            n++;
        }

        for (let i = n; i < this.bodyAt.length; i++) this.bodyAt[i] = null;

        this.count = n;
    }

    /**
     * Write integrated positions and velocities back onto the bodies.
     *
     * Everything downstream of the substep loop — rendering, the collision pass, wormhole
     * sweeps, orbit prediction — still reads `mesh.position`, so this is what makes the
     * SoA representation invisible to the rest of the codebase.
     *
     * `tempAcc` is refreshed here too: the net-force HUD readout, the coordinate gizmo's
     * acceleration arrow, and the ship g-force meter all read it.
     */
    writeBack(): void {
        for (let i = 0; i < this.count; i++) {
            const body = this.bodyAt[i];
            if (!body || body._isDisposed || !body.mesh) continue;

            body.mesh.position.set(this.px[i], this.py[i], this.pz[i]);
            body.velocity.set(this.vx[i], this.vy[i], this.vz[i]);

            // Allocated once per body, then reused — never per frame.
            if (!body.tempAcc) body.tempAcc = new THREE.Vector3();
            body.tempAcc.set(this.ax[i], this.ay[i], this.az[i]);
        }
    }

    /**
     * Re-associate accelerations with their bodies after a reindex.
     *
     * The kick-drift-kick integrator reuses the previous step's acceleration for the next
     * step's opening half-kick. Slot numbers shift whenever a body is added or absorbed, so
     * carrying raw slot-indexed accelerations across frames would silently hand a body
     * somebody else's acceleration. Keying by body identity avoids that.
     */
    remapAccelerations(previous: Map<Body, [number, number, number]>): void {
        for (let i = 0; i < this.count; i++) {
            const body = this.bodyAt[i];
            const prev = body ? previous.get(body) : undefined;

            if (prev) {
                this.ax[i] = prev[0];
                this.ay[i] = prev[1];
                this.az[i] = prev[2];
            } else {
                this.ax[i] = 0;
                this.ay[i] = 0;
                this.az[i] = 0;
            }
        }
    }

    /** Snapshot accelerations keyed by body, for {@link remapAccelerations} on the next frame. */
    captureAccelerations(out: Map<Body, [number, number, number]>): void {
        out.clear();
        for (let i = 0; i < this.count; i++) {
            const body = this.bodyAt[i];
            if (body) out.set(body, [this.ax[i], this.ay[i], this.az[i]]);
        }
    }

    /**
     * Size the store to `n` slots without binding it to real `Body` objects.
     *
     * For benchmarks and solver cross-checks, which need to drive the solvers on synthetic
     * bodies. The normal simulation path uses {@link sync} instead.
     */
    allocate(n: number): void {
        this.ensureCapacity(n);
        this.count = n;
        this.exactTargets.length = 0;
        this.indexOf_.clear();
        for (let i = 0; i < n; i++) this.bodyAt[i] = null;
    }

    /** Slot for a body, or -1 if it is not currently mirrored. */
    indexOf(body: Body | null | undefined): number {
        if (!body) return -1;
        const i = this.indexOf_.get(body);
        return i === undefined ? -1 : i;
    }

    /** Body occupying a slot, for callers that walk the store directly. */
    bodyAtIndex(i: number): Body | null {
        return i >= 0 && i < this.count ? this.bodyAt[i] : null;
    }

    /** Apply a velocity delta to one body — the path ship thrust and autopilot impulses take. */
    addVelocity(i: number, dvx: number, dvy: number, dvz: number): void {
        if (i < 0 || i >= this.count) return;
        this.vx[i] += dvx;
        this.vy[i] += dvy;
        this.vz[i] += dvz;
    }

    /** Read a body's in-flight position without leaving the store. */
    readPosition(i: number, out: THREE.Vector3): THREE.Vector3 {
        if (i < 0 || i >= this.count) return out.set(0, 0, 0);
        return out.set(this.px[i], this.py[i], this.pz[i]);
    }

    /** Read a body's in-flight velocity without leaving the store. */
    readVelocity(i: number, out: THREE.Vector3): THREE.Vector3 {
        if (i < 0 || i >= this.count) return out.set(0, 0, 0);
        return out.set(this.vx[i], this.vy[i], this.vz[i]);
    }

    /** Overwrite a body's velocity, used when a controller sets velocity outright. */
    writeVelocity(i: number, v: THREE.Vector3): void {
        if (i < 0 || i >= this.count) return;
        this.vx[i] = v.x;
        this.vy[i] = v.y;
        this.vz[i] = v.z;
    }
}
