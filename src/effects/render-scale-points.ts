import * as THREE from 'three';

/**
 * three.js sizes point sprites in canvas pixels: PointsMaterial's `size` (times the renderer's
 * pixel ratio) and, with size attenuation, the canvas height. Neither knows about a render target
 * smaller than the canvas, so when the scene is captured at a reduced render scale and stretched
 * back up, every point (Kuiper belt, particles, weapon bolts, comet tails) would come out
 * 1/scale times too large.
 *
 * `renderWithScaledPoints` shrinks the size of every visible point material by the render scale
 * for the duration of one render and restores it exactly afterwards, so points cover the same
 * share of the screen at any scale.
 */

const _seen = new Set<THREE.PointsMaterial>();
const _materials: THREE.PointsMaterial[] = [];
const _savedSizes: number[] = [];

function collectPointMaterials(object: THREE.Object3D): void {
    if (!(object instanceof THREE.Points)) return;
    const material = object.material as THREE.Material | THREE.Material[];
    const list = Array.isArray(material) ? material : [material];
    for (const m of list) {
        // A material shared by several Points objects is scaled once.
        if (m instanceof THREE.PointsMaterial && !_seen.has(m)) {
            _seen.add(m);
            _materials.push(m);
        }
    }
}

/**
 * Renders `scene` into the current render target with point sizes scaled by `scale`. At scale 1
 * it is a plain render, with no traversal.
 */
export function renderWithScaledPoints(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    scale: number
): void {
    if (scale === 1) {
        renderer.render(scene, camera);
        return;
    }

    _materials.length = 0;
    _seen.clear();
    scene.traverseVisible(collectPointMaterials);
    _seen.clear();
    _savedSizes.length = _materials.length;
    for (let i = 0; i < _materials.length; i++) {
        _savedSizes[i] = _materials[i].size;
        _materials[i].size = _savedSizes[i] * scale;
    }
    try {
        renderer.render(scene, camera);
    } finally {
        // Restored from the saved value, not divided back, so no rounding drift builds up.
        for (let i = 0; i < _materials.length; i++) _materials[i].size = _savedSizes[i];
        _materials.length = 0;
    }
}
