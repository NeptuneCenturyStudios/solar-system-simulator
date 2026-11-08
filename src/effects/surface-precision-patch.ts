import * as THREE from 'three';
import { Body } from '../bodies/body';
import { BodyTypeEnum } from '../bodies/body-enums';
import { BlackHole } from '../bodies/black-hole';
import { CelestialBody } from '../bodies/celestial-body';
import { Star } from '../bodies/star';
import {
    ISphereSurfaceHit,
    locateSphereSurface,
    sphereVertex,
} from '../physics/sphere-mesh-surface';
import {
    SURFACE_PATCH_MAX_ALTITUDE,
    SURFACE_PATCH_MAX_TRIANGLES,
    SURFACE_PATCH_MIN_EDGE,
    SURFACE_PATCH_REBUILD_FRACTION,
    SURFACE_PATCH_SUBDIVIDE_RATIO,
} from '../utilities/consts';

/**
 * Surface precision patch: redraws the ground under the camera so it does not jitter.
 *
 * The GPU transforms vertices in float32. A body mesh's vertices are stored relative to the body's
 * centre, so they are as large as its radius and carry a rounding error of roughly radius × 6e-8
 * — about 4 m on Jupiter, 0.4 m on Earth. However precisely the CPU builds the matrices, that
 * error is already in the vertices, so as the camera moves the drawn ground slides by that much
 * against small objects near it: a grounded ship sinks into and pops out of the surface.
 *
 * For the body nearest the camera, while the camera is within SURFACE_PATCH_MAX_ALTITUDE of it:
 *
 * 1. The 3 × 3 block of mesh quads under the camera is cut out of the body mesh (its index buffer
 *    is reordered to put those triangles last, and its drawRange stops before them).
 * 2. The same triangles are drawn by a child mesh whose origin is the point on the surface below
 *    the camera, split adaptively — finely near the camera, coarsely further away. Every split
 *    lies in the original flat facet, so the drawn shape is unchanged (ship contact, which uses
 *    the same facets via locateSphereSurface, still agrees with it). Positions are computed in
 *    float64 relative to the origin, so the vertices near the camera are tiny and lose nothing to
 *    float32; every other attribute is interpolated linearly, exactly as the GPU interpolates it
 *    across the original triangle, so shading and texturing are unchanged.
 *
 * The patch uses the body's own material object, so every shader patch and uniform applies to it.
 *
 * Built so procedural terrain can grow out of it: the surface comes from one query
 * (locateSphereSurface / sphereVertex), and the refinement and cut-out are independent of how
 * that surface is defined.
 */

/** Body types that are never patched (their surfaces are not solid ground or use own shaders). */
const UNPATCHED_TYPES =
    BodyTypeEnum.Star |
    BodyTypeEnum.BlackHole |
    BodyTypeEnum.WhiteDwarf |
    BodyTypeEnum.BrownDwarf |
    BodyTypeEnum.Pulsar |
    BodyTypeEnum.Wormhole;

/** Scratch, so the per-frame pass never allocates. */
const _camLocal = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();
const _vtx = new THREE.Vector3();
const _hit: ISphereSurfaceHit = { distance: 0, ix: 0, iy: 0 };
const _ZERO = new THREE.Vector3();

/** A body mesh the patch can sit in: a single-material SphereGeometry with an index buffer. */
interface IPatchableMesh extends THREE.Mesh {
    geometry: THREE.SphereGeometry;
    material: THREE.Material;
}

function patchableMesh(body: Body): IPatchableMesh | null {
    if (!(body instanceof CelestialBody) || body instanceof Star || body instanceof BlackHole) {
        return null;
    }
    if (body._isDisposed || (body.bodyType & UNPATCHED_TYPES) !== 0) return null;
    const mesh = body.mesh;
    if (!mesh || !mesh.visible || !(mesh.geometry instanceof THREE.SphereGeometry)) return null;
    if (!mesh.geometry.index || Array.isArray(mesh.material)) return null;
    return mesh as IPatchableMesh;
}

/** Uniform scale of a body mesh (they are scaled uniformly, if at all). */
function meshScale(mesh: THREE.Object3D): number {
    return Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
}

/** One non-position attribute copied from the body geometry onto the patch. */
interface IAttrChannel {
    name: string;
    itemSize: number;
    source: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    /** Offset of this attribute's components within a patch vertex record. */
    offset: number;
}

export class SurfacePrecisionPatch {
    private readonly geometry = new THREE.BufferGeometry();
    private readonly mesh: THREE.Mesh;

    // ── Current target ──────────────────────────────────────────────────────
    private body: Body | null = null;
    private target: IPatchableMesh | null = null;
    private targetGeometry: THREE.SphereGeometry | null = null;
    /** The body geometry's index as it was before the cut-out. */
    private originalIndex: Uint16Array | Uint32Array | null = null;
    /** Quad (ix, iy) the cut-out is centred on, or -1. */
    private holeIx = -1;
    private holeIy = -1;
    /** Patch origin in body-geometry space (the surface point under the camera when built). */
    private readonly origin = new THREE.Vector3();

    // ── Build scratch ───────────────────────────────────────────────────────
    private channels: IAttrChannel[] = [];
    /** Floats per vertex record: 3 position components + every channel. */
    private stride = 3;
    /** Output, one record per emitted vertex (non-indexed). */
    private out = new Float64Array(0);
    private outVertices = 0;
    private minEdgeGeom = 0;
    private altitudeGeom = 0;

    constructor() {
        this.mesh = new THREE.Mesh(this.geometry);
        this.mesh.name = 'surface-precision-patch';
        this.mesh.matrixAutoUpdate = true;
    }

    /**
     * Re-target and, if needed, rebuild the patch for this frame. Call after the camera has been
     * placed for the frame and before the scene is rendered.
     */
    update(camera: THREE.Camera, bodies: readonly Body[]): void {
        // A body that was resized has a new geometry: forget the old one (it is disposed) without
        // trying to restore it.
        if (this.target && this.target.geometry !== this.targetGeometry) {
            this.originalIndex = null;
            this.detach();
        }
        if (this.body && (this.body._isDisposed || !patchableMesh(this.body))) this.detach();

        // ── Nearest eligible body within range ──
        let best: IPatchableMesh | null = null;
        let bestBody: Body | null = null;
        let bestGap = SURFACE_PATCH_MAX_ALTITUDE;
        for (const body of bodies) {
            const mesh = patchableMesh(body);
            if (!mesh) continue;
            const gap =
                camera.position.distanceTo(mesh.position) -
                mesh.geometry.parameters.radius * meshScale(mesh);
            if (gap <= bestGap) {
                bestGap = gap;
                best = mesh;
                bestBody = body;
            }
        }
        if (!best || !bestBody) {
            this.detach();
            return;
        }
        if (bestBody !== this.body) {
            this.detach();
            this.attach(bestBody, best);
        }
        const target = best;

        // ── The surface point under the camera, in body-geometry space ──
        const scale = meshScale(target);
        if (!(scale > 0)) return;
        _invQuat.copy(target.quaternion).invert();
        _camLocal
            .subVectors(camera.position, target.position)
            .applyQuaternion(_invQuat)
            .divideScalar(scale);
        const camDist = _camLocal.length();
        if (camDist < 1e-12) return;
        _dir.copy(_camLocal).divideScalar(camDist);
        if (!locateSphereSurface(target.geometry.parameters, _dir, _hit)) return;

        // (Range was decided against the true sphere above; the facet sits at most ~0.13% of the
        // radius lower, so this altitude can read slightly over the limit — that's fine.)
        const altitudeGeom = Math.max(0, camDist - _hit.distance);

        // ── Rebuild only when the camera has wandered off the patch's origin or quad ──
        _vtx.copy(_dir).multiplyScalar(_hit.distance); // foot point
        const minEdgeGeom = SURFACE_PATCH_MIN_EDGE / scale;
        const drift = _vtx.distanceTo(this.origin);
        const sameQuad = _hit.ix === this.holeIx && _hit.iy === this.holeIy;
        if (
            sameQuad &&
            this.mesh.parent === target &&
            drift <= SURFACE_PATCH_REBUILD_FRACTION * Math.max(altitudeGeom, minEdgeGeom)
        ) {
            return;
        }

        this.origin.copy(_vtx);
        this.altitudeGeom = altitudeGeom;
        this.minEdgeGeom = minEdgeGeom;
        if (!sameQuad) this.cutHole(target.geometry, _hit.ix, _hit.iy);
        this.build(target.geometry);
    }

    /** Remove the patch and restore the body mesh it was attached to. */
    dispose(): void {
        this.detach();
        this.geometry.dispose();
    }

    // ── Attachment ──────────────────────────────────────────────────────────

    private attach(body: Body, mesh: IPatchableMesh): void {
        this.body = body;
        this.target = mesh;
        this.targetGeometry = mesh.geometry;
        const index = mesh.geometry.index!.array;
        this.originalIndex =
            index instanceof Uint32Array ? new Uint32Array(index) : new Uint16Array(index);

        this.mesh.material = mesh.material;
        this.mesh.layers.mask = mesh.layers.mask;
        this.mesh.castShadow = mesh.castShadow;
        this.mesh.receiveShadow = mesh.receiveShadow;
        this.mesh.renderOrder = mesh.renderOrder;
        mesh.add(this.mesh);

        // Every non-position attribute the body geometry carries (normal, uv, …).
        this.channels = [];
        let offset = 3;
        for (const [name, attr] of Object.entries(mesh.geometry.attributes)) {
            if (name === 'position') continue;
            this.channels.push({ name, itemSize: attr.itemSize, source: attr, offset });
            offset += attr.itemSize;
        }
        this.stride = offset;
        for (const name of Object.keys(this.geometry.attributes)) {
            this.geometry.deleteAttribute(name);
        }
        this.outVertices = 0;
    }

    private detach(): void {
        const target = this.target;
        if (target && target.geometry === this.targetGeometry && this.originalIndex) {
            const index = target.geometry.index;
            if (index) {
                (index.array as Uint16Array | Uint32Array).set(this.originalIndex);
                index.needsUpdate = true;
            }
            target.geometry.setDrawRange(0, Infinity);
        }
        this.mesh.removeFromParent();
        this.body = null;
        this.target = null;
        this.targetGeometry = null;
        this.originalIndex = null;
        this.holeIx = -1;
        this.holeIy = -1;
        this.origin.set(Infinity, Infinity, Infinity);
    }

    // ── Cut-out ─────────────────────────────────────────────────────────────

    /** Quad (ix, iy) of the vertex grid triangle starting at index `t` belongs to. */
    private static quadOf(index: ArrayLike<number>, t: number, W: number): [number, number] {
        // In SphereGeometry's triangles (a, b, d) and (b, c, d), b = iy·(W+1) + ix is the
        // smallest vertex index of the quad, so the minimum identifies the quad.
        const b = Math.min(index[t], index[t + 1], index[t + 2]);
        return [b % (W + 1), Math.floor(b / (W + 1))];
    }

    private inHole(ix: number, iy: number, W: number): boolean {
        if (Math.abs(iy - this.holeIy) > 1) return false;
        const dx = Math.abs(ix - this.holeIx);
        return dx <= 1 || dx >= W - 1; // wraps around the φ seam
    }

    /** Reorder the body's index so the 3 × 3 quads around (ix, iy) come last, and stop before them. */
    private cutHole(geometry: THREE.SphereGeometry, ix: number, iy: number): void {
        const original = this.originalIndex;
        const index = geometry.index;
        if (!original || !index) return;
        this.holeIx = ix;
        this.holeIy = iy;

        const W = geometry.parameters.widthSegments;
        const array = index.array as Uint16Array | Uint32Array;
        const triangles = original.length / 3;
        let kept = 0;
        let cut = triangles - 1;
        for (let t = 0; t < triangles; t++) {
            const [qx, qy] = SurfacePrecisionPatch.quadOf(original, t * 3, W);
            const slot = this.inHole(qx, qy, W) ? cut-- : kept++;
            array[slot * 3] = original[t * 3];
            array[slot * 3 + 1] = original[t * 3 + 1];
            array[slot * 3 + 2] = original[t * 3 + 2];
        }
        index.needsUpdate = true;
        geometry.setDrawRange(0, kept * 3);
    }

    // ── Patch build ─────────────────────────────────────────────────────────

    /** Write vertex `vi` of the body geometry into a record: exact position − origin, then channels. */
    private readVertex(geometry: THREE.SphereGeometry, vi: number, rec: Float64Array): void {
        const W = geometry.parameters.widthSegments;
        sphereVertex(geometry.parameters, vi % (W + 1), Math.floor(vi / (W + 1)), _vtx);
        rec[0] = _vtx.x - this.origin.x;
        rec[1] = _vtx.y - this.origin.y;
        rec[2] = _vtx.z - this.origin.z;
        for (const ch of this.channels) {
            for (let k = 0; k < ch.itemSize; k++) {
                rec[ch.offset + k] = ch.source.getComponent(vi, k);
            }
        }
    }

    private build(geometry: THREE.SphereGeometry): void {
        const original = this.originalIndex;
        if (!original) return;
        const W = geometry.parameters.widthSegments;
        const stride = this.stride;

        this.outVertices = 0;
        const v0 = new Float64Array(stride);
        const v1 = new Float64Array(stride);
        const v2 = new Float64Array(stride);
        for (let t = 0; t < original.length; t += 3) {
            const [qx, qy] = SurfacePrecisionPatch.quadOf(original, t, W);
            if (!this.inHole(qx, qy, W)) continue;
            this.readVertex(geometry, original[t], v0);
            this.readVertex(geometry, original[t + 1], v1);
            this.readVertex(geometry, original[t + 2], v2);
            this.subdivide(v0, v1, v2);
        }
        this.upload();
    }

    private static edgeSq(a: Float64Array, b: Float64Array): number {
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        const dz = a[2] - b[2];
        return dx * dx + dy * dy + dz * dz;
    }

    private static midpoint(a: Float64Array, b: Float64Array): Float64Array {
        const m = new Float64Array(a.length);
        for (let i = 0; i < a.length; i++) m[i] = 0.5 * (a[i] + b[i]);
        return m;
    }

    /**
     * Emit triangle (a, b, c), split into four at its edge midpoints while it is large compared
     * with its distance from the camera. Midpoints lie on the original facet, and the channels are
     * interpolated linearly, so the result draws exactly like the original triangle.
     */
    private subdivide(a: Float64Array, b: Float64Array, c: Float64Array): void {
        const longestSq = Math.max(
            SurfacePrecisionPatch.edgeSq(a, b),
            SurfacePrecisionPatch.edgeSq(b, c),
            SurfacePrecisionPatch.edgeSq(c, a)
        );
        const longest = Math.sqrt(longestSq);
        // Distance from the camera, roughly: the centroid's distance from the origin (the point
        // under the camera), but never less than the camera's altitude.
        const cx = (a[0] + b[0] + c[0]) / 3;
        const cy = (a[1] + b[1] + c[1]) / 3;
        const cz = (a[2] + b[2] + c[2]) / 3;
        const distance = Math.max(Math.sqrt(cx * cx + cy * cy + cz * cz), this.altitudeGeom);

        const capReached = this.outVertices / 3 + 3 >= SURFACE_PATCH_MAX_TRIANGLES;
        if (
            !capReached &&
            longest > this.minEdgeGeom * 2 &&
            longest > SURFACE_PATCH_SUBDIVIDE_RATIO * distance
        ) {
            const ab = SurfacePrecisionPatch.midpoint(a, b);
            const bc = SurfacePrecisionPatch.midpoint(b, c);
            const ca = SurfacePrecisionPatch.midpoint(c, a);
            this.subdivide(a, ab, ca);
            this.subdivide(ab, b, bc);
            this.subdivide(ca, bc, c);
            this.subdivide(ab, bc, ca);
            return;
        }
        this.emit(a);
        this.emit(b);
        this.emit(c);
    }

    private emit(rec: Float64Array): void {
        const stride = this.stride;
        const needed = (this.outVertices + 1) * stride;
        if (needed > this.out.length) {
            const grown = new Float64Array(Math.max(needed, this.out.length * 2, 1024 * stride));
            grown.set(this.out);
            this.out = grown;
        }
        this.out.set(rec, this.outVertices * stride);
        this.outVertices++;
    }

    /** Copy the emitted records into the patch geometry's float32 attributes. */
    private upload(): void {
        const count = this.outVertices;
        const stride = this.stride;
        const geometry = this.geometry;

        const ensure = (name: string, itemSize: number): THREE.BufferAttribute => {
            const existing = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
            if (existing && existing.itemSize === itemSize && existing.count >= count) {
                return existing;
            }
            const capacity = Math.max(count, existing ? existing.count * 2 : 0, 1024);
            const attr = new THREE.BufferAttribute(new Float32Array(capacity * itemSize), itemSize);
            attr.setUsage(THREE.DynamicDrawUsage);
            geometry.setAttribute(name, attr);
            return attr;
        };

        const position = ensure('position', 3);
        const pos = position.array as Float32Array;
        let maxRadiusSq = 0;
        for (let v = 0; v < count; v++) {
            const x = this.out[v * stride];
            const y = this.out[v * stride + 1];
            const z = this.out[v * stride + 2];
            pos[v * 3] = x;
            pos[v * 3 + 1] = y;
            pos[v * 3 + 2] = z;
            maxRadiusSq = Math.max(maxRadiusSq, x * x + y * y + z * z);
        }
        position.needsUpdate = true;

        for (const ch of this.channels) {
            const attr = ensure(ch.name, ch.itemSize);
            const arr = attr.array as Float32Array;
            for (let v = 0; v < count; v++) {
                for (let k = 0; k < ch.itemSize; k++) {
                    arr[v * ch.itemSize + k] = this.out[v * stride + ch.offset + k];
                }
            }
            attr.needsUpdate = true;
        }

        geometry.setDrawRange(0, count);
        // Over the emitted vertices only (the buffers may be larger), for culling and raycasts.
        geometry.boundingSphere ??= new THREE.Sphere();
        geometry.boundingSphere.set(_ZERO, Math.sqrt(maxRadiusSq));
        this.mesh.position.copy(this.origin);
    }
}
