import * as THREE from 'three';

/**
 * Cached measurement of an unscaled loaded model, used to re-fit it whenever the
 * owning body's radius changes.
 */
export interface IModelFit {
    /** Longest axis of the unscaled bounding box. */
    longestDim: number;
    /** Centre of the unscaled bounding box, in the model's own space. */
    center: THREE.Vector3;
    /**
     * Farthest vertex from `center`, as a multiple of half the longest axis (≥ 1). Once fitted,
     * the model reaches out to `radius × maxReach` — an irregular rock can poke a little past its
     * radius off the long axis — so this is what a contact broad phase must allow for.
     */
    maxReach: number;
}

const _vertex = new THREE.Vector3();

/**
 * Measures a freshly loaded model group so it can later be fitted to any radius.
 *
 * Must be called while the group is still detached from the scene graph — the
 * bounding box is computed from world matrices, so a parented group would be
 * measured in world space and the cached centre would be wrong.
 */
export function measureModelFit(group: THREE.Object3D): IModelFit {
    group.scale.setScalar(1);
    group.position.set(0, 0, 0);
    group.updateMatrixWorld(true);

    const bbox = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const longestDim = Math.max(size.x, size.y, size.z);

    let maxDistSq = 0;
    group.traverse((child) => {
        const position = (child as THREE.Mesh).isMesh
            ? (child as THREE.Mesh).geometry?.attributes.position
            : undefined;
        if (!position) return;
        for (let i = 0; i < position.count; i++) {
            _vertex.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
            maxDistSq = Math.max(maxDistSq, _vertex.distanceToSquared(center));
        }
    });
    const maxReach = longestDim > 0 ? Math.max(1, Math.sqrt(maxDistSq) / (longestDim * 0.5)) : 1;

    return { longestDim, center, maxReach };
}

/**
 * Scales a measured model group so its longest axis spans the body's diameter and
 * re-centres it on the body's origin. Safe to call repeatedly: both the scale and
 * the offset are derived from the cached unscaled measurement rather than from the
 * group's current transform.
 */
export function applyModelFit(group: THREE.Object3D, fit: IModelFit, radius: number): void {
    if (!isFinite(fit.longestDim) || fit.longestDim <= 0) return;
    if (!isFinite(radius) || radius <= 0) return;

    const scale = radius / (fit.longestDim * 0.5);
    group.scale.setScalar(scale);
    group.position.copy(fit.center).multiplyScalar(-scale);
    group.updateMatrixWorld(true);
}
