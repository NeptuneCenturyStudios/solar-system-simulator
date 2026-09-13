import * as THREE from 'three';
import { Body } from '../../bodies/body';

/**
 * Where a body landed in UI screen space this frame.
 *
 * Instances are reused across frames via {@link ProjectionBuffer}, replacing the
 * `{ body, nx, ny, dist }` object literals the indicators used to allocate per body
 * per frame.
 */
export interface ScreenProjection {
    body: Body;
    /** Normalised device coordinates, as produced by `Vector3.project`. */
    nx: number;
    ny: number;
    nz: number;
    /** Position in UI pixel space: origin at screen centre, +X right, +Y up. */
    uiX: number;
    uiY: number;
    /** Distance from the camera to the body, in world units. */
    camDist: number;
    /** True when the body is in front of the camera and inside the NDC box. */
    onScreen: boolean;
}

/** Placement of an off-screen edge marker (the autopilot and threat chevrons). */
export interface EdgeMarker {
    uiX: number;
    uiY: number;
    /** Sprite rotation in radians, pointing from the screen centre toward the body. */
    rotation: number;
}

/**
 * Projects bodies into UI screen space for the overlay indicators.
 *
 * `PlanetNameIndicator` (twice), `HealthBarIndicator`, `ThreatIndicator` and
 * `AutopilotTargetIndicator` each carried their own copy of this arithmetic, and each
 * recomputed `Math.tan(degToRad(fov * 0.5))` and the viewport half-dimensions per body.
 * One projector shared by all of them computes those once per frame in `beginFrame`.
 *
 * Every method writes into caller-owned structs, so a frame costs no allocations.
 */
export class ScreenProjector {
    private camera: THREE.PerspectiveCamera | null = null;
    private halfW = 0;
    private halfH = 0;
    private tanHalfFovY = 0;

    private readonly scratch = new THREE.Vector3();

    /** Cache the per-frame constants. Call once per frame before any `project` call. */
    beginFrame(camera: THREE.PerspectiveCamera): void {
        this.camera = camera;
        this.halfW = window.innerWidth / 2;
        this.halfH = window.innerHeight / 2;
        this.tanHalfFovY = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    }

    /** Half the viewport width in pixels, as cached for this frame. */
    get viewportHalfWidth(): number {
        return this.halfW;
    }

    /** Half the viewport height in pixels, as cached for this frame. */
    get viewportHalfHeight(): number {
        return this.halfH;
    }

    /**
     * Project `body` into UI screen space, filling `out`.
     *
     * @returns false when the body cannot be projected at all (disposed, or no mesh yet),
     *          in which case `out` is left untouched.
     */
    project(body: Body, out: ScreenProjection): boolean {
        const camera = this.camera;
        if (!camera) return false;
        if (!body || body._isDisposed || !body.mesh) return false;

        body.mesh.getWorldPosition(this.scratch);
        this.scratch.project(camera);

        const nx = this.scratch.x;
        const ny = this.scratch.y;
        const nz = this.scratch.z;

        out.body = body;
        out.nx = nx;
        out.ny = ny;
        out.nz = nz;
        out.uiX = nx * this.halfW;
        out.uiY = ny * this.halfH;
        out.camDist = camera.position.distanceTo(body.mesh.position);
        out.onScreen = nz < 1 && Math.abs(nx) <= 1 && Math.abs(ny) <= 1;

        return true;
    }

    /**
     * The body's on-screen radius in pixels, floored at `minPx` so small or distant bodies
     * still get a usable indicator.
     */
    apparentRadius(radius: number, camDist: number, minPx: number): number {
        return Math.max(minPx, (radius / camDist) * (this.halfH / this.tanHalfFovY));
    }

    /**
     * Place an edge marker for a body that is off screen or behind the camera, filling `out`.
     *
     * A body behind the camera projects to a mirrored NDC position, so its direction is
     * negated before clamping — otherwise the chevron points the wrong way as the target
     * passes out of view.
     *
     * @param marginPx  Pixels of clearance kept between the marker and the viewport edge.
     */
    clampToEdge(nx: number, ny: number, nz: number, marginPx: number, out: EdgeMarker): void {
        let dx = nz >= 1 ? -nx : nx;
        const dy = nz >= 1 ? -ny : ny;
        if (dx === 0 && dy === 0) dx = 1;

        const maxX = 1 - marginPx / this.halfW;
        const maxY = 1 - marginPx / this.halfH;

        const scale = Math.min(maxX / Math.abs(dx), maxY / Math.abs(dy));

        out.uiX = dx * scale * this.halfW;
        out.uiY = dy * scale * this.halfH;
        out.rotation = Math.atan2(dy, dx);
    }
}

/** Allocate a blank projection struct. */
export function createScreenProjection(): ScreenProjection {
    return {
        body: null as unknown as Body,
        nx: 0,
        ny: 0,
        nz: 0,
        uiX: 0,
        uiY: 0,
        camDist: 0,
        onScreen: false,
    };
}

/** Allocate a blank edge-marker struct. */
export function createEdgeMarker(): EdgeMarker {
    return { uiX: 0, uiY: 0, rotation: 0 };
}

/**
 * A grow-only buffer of reusable {@link ScreenProjection} structs.
 *
 * Indicators call `reset()` at the top of a frame and `next()` for each body they keep,
 * then iterate `0 .. length`. The structs persist between frames, so the per-frame
 * `visible: {...}[] = []` arrays of object literals disappear.
 */
export class ProjectionBuffer {
    private readonly items: ScreenProjection[] = [];
    private count = 0;

    get length(): number {
        return this.count;
    }

    reset(): void {
        this.count = 0;
    }

    /** Borrow the next struct, growing the buffer if this frame needs more than any before it. */
    next(): ScreenProjection {
        if (this.count === this.items.length) this.items.push(createScreenProjection());
        return this.items[this.count++];
    }

    /** Give back the struct handed out by the most recent `next()` — used when a body is rejected mid-fill. */
    rollback(): void {
        if (this.count > 0) this.count--;
    }

    at(index: number): ScreenProjection {
        return this.items[index];
    }
}
