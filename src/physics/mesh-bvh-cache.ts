import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/**
 * BVHs keyed by geometry. Models are cloned from shared templates (GLB ships, OBJ asteroids and
 * comets), so one BVH serves every instance of a type. Entries go away with their geometry, so no
 * explicit cleanup is needed.
 */
const bvhCache = new WeakMap<THREE.BufferGeometry, MeshBVH>();

/**
 * The BVH of `geometry`, built the first time it is needed so models that are never queried never
 * pay for one. `indirect` keeps the BVH from reordering the index buffer the renderer draws from.
 */
export function getMeshBVH(geometry: THREE.BufferGeometry): MeshBVH {
    let bvh = bvhCache.get(geometry);
    if (!bvh) {
        bvh = new MeshBVH(geometry, { indirect: true });
        bvhCache.set(geometry, bvh);
    }
    return bvh;
}
