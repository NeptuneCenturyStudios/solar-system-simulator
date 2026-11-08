import * as THREE from 'three';

/** Scratch vectors so surface queries never allocate. */
const _localDir = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _pvec = new THREE.Vector3();
const _tvec = new THREE.Vector3();
const _qvec = new THREE.Vector3();

/**
 * Writes vertex (iy, ix) of a THREE.SphereGeometry into `out`, using the same formula as
 * SphereGeometry's constructor — in float64, unlike the geometry's own float32 position buffer.
 */
export function sphereVertex(
    params: THREE.SphereGeometry['parameters'],
    ix: number,
    iy: number,
    out: THREE.Vector3
): THREE.Vector3 {
    const u = ix / params.widthSegments;
    const v = iy / params.heightSegments;
    const phi = params.phiStart + u * params.phiLength;
    const theta = params.thetaStart + v * params.thetaLength;
    return out.set(
        -params.radius * Math.cos(phi) * Math.sin(theta),
        params.radius * Math.cos(theta),
        params.radius * Math.sin(phi) * Math.sin(theta)
    );
}

/** Barycentric slack so a ray grazing a shared edge still counts as a hit on one side of it. */
const EDGE_TOLERANCE = 1e-9;

/**
 * Distance from the origin along unit `dir` to triangle (p0, p1, p2) — Möller–Trumbore with the
 * ray starting at the origin — or Infinity if the ray misses it or the triangle is degenerate
 * (the collapsed pole rows).
 */
function rayFromOriginToTriangle(
    dir: THREE.Vector3,
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3
): number {
    _e1.subVectors(p1, p0);
    _e2.subVectors(p2, p0);
    _pvec.crossVectors(dir, _e2);
    const det = _e1.dot(_pvec);
    if (Math.abs(det) < 1e-20) return Infinity;
    const invDet = 1 / det;

    _tvec.copy(p0).negate(); // origin − p0
    const u = _tvec.dot(_pvec) * invDet;
    if (u < -EDGE_TOLERANCE || u > 1 + EDGE_TOLERANCE) return Infinity;

    _qvec.crossVectors(_tvec, _e1);
    const v = dir.dot(_qvec) * invDet;
    if (v < -EDGE_TOLERANCE || u + v > 1 + EDGE_TOLERANCE) return Infinity;

    const t = _e2.dot(_qvec) * invDet;
    return t > 0 ? t : Infinity;
}

/** Where a ray from a sphere geometry's centre meets its drawn (faceted) surface. */
export interface ISphereSurfaceHit {
    /** Distance from the centre to the drawn surface, in geometry units. */
    distance: number;
    /** Column of the quad the ray passes through. */
    ix: number;
    /** Row of the quad the ray passes through. */
    iy: number;
}

/**
 * Finds where the ray from the centre of a SphereGeometry along geometry-space unit direction
 * `localDir` meets the geometry's *drawn* surface — the flat facet it passes through, using
 * SphereGeometry's own vertex layout — and which quad that facet belongs to.
 *
 * This is the one "where is the ground in this direction" query shared by ship contact
 * ({@link sphereMeshSurfaceFactor}) and the surface precision patch, so what a ship rests on and
 * what is drawn under it always agree.
 *
 * @returns false for a direction outside a partial sphere, or a degenerate geometry.
 */
export function locateSphereSurface(
    params: THREE.SphereGeometry['parameters'],
    localDir: THREE.Vector3,
    out: ISphereSurfaceHit
): boolean {
    if (!(params.radius > 0) || params.widthSegments < 3 || params.heightSegments < 2) return false;

    // Invert SphereGeometry's parameterisation: y = cos θ, (x, z) = (−cos φ, sin φ)·sin θ.
    const theta = Math.acos(THREE.MathUtils.clamp(localDir.y, -1, 1));
    let phi = Math.atan2(localDir.z, -localDir.x);
    if (phi < 0) phi += Math.PI * 2;

    const u = (phi - params.phiStart) / params.phiLength;
    const v = (theta - params.thetaStart) / params.thetaLength;
    // Partial spheres (not used for bodies) fall outside the mesh.
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;

    const W = params.widthSegments;
    const H = params.heightSegments;
    const ix0 = Math.min(W - 1, Math.floor(u * W));
    const iy0 = Math.min(H - 1, Math.floor(v * H));

    // The (u, v) cell is only a first guess: facet edges are straight chords, not the curved
    // lines of constant φ/θ, so near a cell edge the ray can pass through a neighbouring quad.
    // Test the 3 × 3 block of quads around it.
    let best = Infinity;
    let bestIx = ix0;
    let bestIy = iy0;
    for (let dy = -1; dy <= 1; dy++) {
        const iy = iy0 + dy;
        if (iy < 0 || iy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
            let ix = ix0 + dx;
            if (ix < 0 || ix >= W) {
                // Wrap around the seam on a full sphere; a partial one has no neighbour there.
                if (params.phiLength < Math.PI * 2 - 1e-9) continue;
                ix = (ix + W) % W;
            }

            // SphereGeometry splits each quad along b–d: triangles (a, b, d) and (b, c, d).
            sphereVertex(params, ix + 1, iy, _a);
            sphereVertex(params, ix, iy, _b);
            sphereVertex(params, ix, iy + 1, _c);
            sphereVertex(params, ix + 1, iy + 1, _d);

            const t = Math.min(
                rayFromOriginToTriangle(localDir, _a, _b, _d),
                rayFromOriginToTriangle(localDir, _b, _c, _d)
            );
            if (t < best) {
                best = t;
                bestIx = ix;
                bestIy = iy;
            }
        }
    }
    if (!Number.isFinite(best)) return false;

    out.distance = best;
    out.ix = bestIx;
    out.iy = bestIy;
    return true;
}

const _hit: ISphereSurfaceHit = { distance: 0, ix: 0, iy: 0 };

/**
 * Fraction of a sphere mesh's nominal radius at which its *drawn* surface actually lies in world
 * direction `worldDir` (unit), i.e. |hit point| / radius for a ray from the centre.
 *
 * A UV sphere is a polyhedron inscribed in the true sphere: its vertices sit at the radius, but
 * every flat facet between them sags inward — up to ~0.13% for the 64 × 128 body meshes, which is
 * ~8 km on Earth. Anything resting on the true sphere therefore floats visibly above the ground.
 * See {@link locateSphereSurface}.
 *
 * @param mesh The body mesh (a scene-root object, like every body mesh); its quaternion maps
 *   `worldDir` into geometry space.
 * @returns 1 for a mesh that is not a SphereGeometry (nothing to correct).
 */
export function sphereMeshSurfaceFactor(mesh: THREE.Mesh, worldDir: THREE.Vector3): number {
    const geometry = mesh.geometry;
    if (!(geometry instanceof THREE.SphereGeometry)) return 1;

    const params = geometry.parameters;
    _invQuat.copy(mesh.quaternion).invert();
    _localDir.copy(worldDir).applyQuaternion(_invQuat).normalize();

    if (!locateSphereSurface(params, _localDir, _hit)) return 1;
    return THREE.MathUtils.clamp(_hit.distance / params.radius, 0.9, 1);
}
