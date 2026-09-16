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
}

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

    return { longestDim: Math.max(size.x, size.y, size.z), center };
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
