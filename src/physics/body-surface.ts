import * as THREE from 'three';
import { Body } from '../bodies/body';
import { sphereMeshSurfaceFactor } from './sphere-mesh-surface';

/** Scratch, so the per-frame query never allocates. */
const _raycaster = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _down = new THREE.Vector3();
const _hits: THREE.Intersection[] = [];

/** Only visible meshes count as ground (skips the invisible placeholder a model body is built on). */
function isVisibleMesh(object: THREE.Object3D): object is THREE.Mesh {
    if (!(object as THREE.Mesh).isMesh || !object.visible) return false;
    const material = (object as THREE.Mesh).material;
    return Array.isArray(material) ? material.some((m) => m.visible) : material.visible;
}

/**
 * Fraction of `body.radius` at which its *drawn* surface lies in world direction `worldDir`
 * (unit) from its centre.
 *
 * - A sphere-mesh body (planet, moon) uses the faceted UV sphere — see sphereMeshSurfaceFactor.
 * - A model body (asteroid, comet nucleus: an invisible placeholder mesh with the loaded model
 *   as its child) is ray cast from outside toward its centre against its visible meshes; the
 *   first hit is the outermost surface along that line, i.e. the ground you would stand on.
 *
 * @returns 1 when there is nothing to hit yet (model still loading).
 */
export function surfaceReachFactor(body: Body, worldDir: THREE.Vector3): number {
    const mesh = body.mesh;
    const radius = body.radius;
    if (!mesh || !(radius > 0)) return 1;
    if (mesh.geometry instanceof THREE.SphereGeometry)
        return sphereMeshSurfaceFactor(mesh, worldDir);

    // Start well outside the model: it is fitted so its longest axis spans the diameter, so no
    // point of it lies further than the half-diagonal of that cube (√3 r) from the centre.
    const scale = mesh.scale.x || 1;
    const start = 2 * radius * scale;
    _origin.copy(mesh.position).addScaledVector(worldDir, start);
    _down.copy(worldDir).negate();
    _raycaster.set(_origin, _down);
    _raycaster.far = start;

    mesh.updateMatrixWorld(true);
    _hits.length = 0;
    let nearest = Infinity;
    mesh.traverse((child) => {
        if (child === mesh || !isVisibleMesh(child)) return;
        child.raycast(_raycaster, _hits);
    });
    for (const hit of _hits) nearest = Math.min(nearest, hit.distance);
    _hits.length = 0;
    if (!Number.isFinite(nearest)) return 1;

    return THREE.MathUtils.clamp((start - nearest) / (radius * scale), 0, 2);
}
