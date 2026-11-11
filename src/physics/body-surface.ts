import * as THREE from 'three';
import { Body } from '../bodies/body';
import { getMeshBVH } from './mesh-bvh-cache';
import { sphereMeshSurfaceFactor } from './sphere-mesh-surface';

/** Scratch, so the per-substep query never allocates. */
const _invQuat = new THREE.Quaternion();
const _localDir = new THREE.Vector3();
const _ray = new THREE.Ray();
const _partToBody = new THREE.Matrix4();
const _bodyToPart = new THREE.Matrix4();
const _hitPoint = new THREE.Vector3();

/** Only visible meshes count as ground (skips the invisible placeholder a model body is built on). */
function isVisibleMesh(object: THREE.Object3D): object is THREE.Mesh {
    if (!(object as THREE.Mesh).isMesh || !object.visible) return false;
    const material = (object as THREE.Mesh).material;
    return Array.isArray(material) ? material.some((m) => m.visible) : material.visible;
}

/**
 * Writes `part`'s transform relative to `root` into `out`, from the local matrices along the
 * chain. Working in the body's own frame keeps the query near the origin, so the float32 geometry
 * and BVH bounds keep their precision however far the body is from the world origin.
 */
function partToRootMatrix(part: THREE.Object3D, root: THREE.Object3D, out: THREE.Matrix4): void {
    out.identity();
    for (let node: THREE.Object3D | null = part; node && node !== root; node = node.parent) {
        node.updateMatrix();
        out.premultiply(node.matrix);
    }
}

/**
 * Fraction of `body.radius` at which its *drawn* surface lies in world direction `worldDir`
 * (unit) from its centre.
 *
 * - A sphere-mesh body (planet, moon) uses the faceted UV sphere — see sphereMeshSurfaceFactor.
 * - A model body (asteroid, comet nucleus: an invisible placeholder mesh with the loaded model
 *   as its child) is ray cast from outside toward its centre against its visible meshes, through
 *   each geometry's BVH (cheap enough to run every physics substep); the first hit is the
 *   outermost surface along that line, i.e. the ground you would stand or land on.
 *
 * @returns 1 when there is nothing to hit yet (model still loading).
 */
export function surfaceReachFactor(body: Body, worldDir: THREE.Vector3): number {
    const mesh = body.mesh;
    const radius = body.radius;
    if (!mesh || !(radius > 0)) return 1;
    if (mesh.geometry instanceof THREE.SphereGeometry)
        return sphereMeshSurfaceFactor(mesh, worldDir);

    // In the body's own (unscaled) frame. Start well outside the model: it is fitted so its
    // longest axis spans the diameter, so no point of it lies further than the half-diagonal of
    // that cube (√3 r) from the centre.
    _invQuat.copy(mesh.quaternion).invert();
    _localDir.copy(worldDir).applyQuaternion(_invQuat).normalize();
    const start = 2 * radius;

    let best = -Infinity;
    mesh.traverse((child) => {
        if (child === mesh || !isVisibleMesh(child)) return;
        if (!child.geometry?.attributes.position) return;

        partToRootMatrix(child, mesh, _partToBody);
        _bodyToPart.copy(_partToBody).invert();
        _ray.origin.copy(_localDir).multiplyScalar(start).applyMatrix4(_bodyToPart);
        _ray.direction.copy(_localDir).negate().transformDirection(_bodyToPart);

        const material = child.material;
        const side = Array.isArray(material) ? THREE.DoubleSide : material.side;
        const hit = getMeshBVH(child.geometry).raycastFirst(_ray, side);
        if (!hit) return;

        // Height of the hit above the centre along the query direction.
        _hitPoint.copy(hit.point).applyMatrix4(_partToBody);
        best = Math.max(best, _hitPoint.dot(_localDir));
    });
    if (!Number.isFinite(best)) return 1;

    return THREE.MathUtils.clamp(best / radius, 0, 2);
}

/**
 * Distance (sim units) from `body`'s centre to its drawn surface in world direction `worldDir`
 * (unit): the true ground for both faceted sphere bodies and model bodies.
 */
export function surfaceReach(body: Body, worldDir: THREE.Vector3): number {
    return body.radius * (body.mesh?.scale.x || 1) * surfaceReachFactor(body, worldDir);
}
