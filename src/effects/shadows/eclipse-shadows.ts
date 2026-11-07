import * as THREE from 'three';
import type { Body } from '../../bodies/body';
import { BodyTypeEnum } from '../../bodies/body-enums';
import { MAX_SHADOW_OCCLUDERS, MAX_SHADOW_STARS } from '../../utilities/consts';
import { getFrameStars } from '../star-illumination';
import { shadowUniforms } from './shadow-receiver';

/** Bodies that never cast an eclipse: stars light, ships and asteroids aren't spheres. */
const NON_OCCLUDER_TYPES =
    BodyTypeEnum.Star | BodyTypeEnum.SpaceShip | BodyTypeEnum.Asteroid | BodyTypeEnum.Wormhole;

/** Pull the inscribed radius in by a hair more, for float rounding on the facets. */
const INSCRIBED_MARGIN = 0.9999;

const _viewPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();

/** Scratch ranking of the nearest occluders: body + its surface distance to the camera. */
const _nearBodies: (Body | null)[] = new Array<Body | null>(MAX_SHADOW_OCCLUDERS).fill(null);
const _nearScores: number[] = new Array<number>(MAX_SHADOW_OCCLUDERS).fill(Infinity);

/**
 * Radius of the sphere inscribed in a faceted UV-sphere mesh, in world units. The flat facets
 * sag inward from the true sphere, deepest at the equator: by cos(Δφ/2)·cos(Δθ/2) with Δφ = 2π/W
 * and Δθ = π/H (≈ 0.9987 for the 64 × 128 body meshes). The occluder is uploaded at this radius so
 * a fragment on the body's own drawn surface is never inside its own occluder — the body's own night
 * side comes from N·L, not from here — while something resting on that surface (a landed ship) is
 * still outside it and still falls into the body's shadow.
 */
function inscribedRadius(mesh: THREE.Mesh): number {
    const geometry = mesh.geometry as THREE.SphereGeometry;
    const p = geometry.parameters;
    const scale = Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
    const sag = Math.cos(Math.PI / p.widthSegments) * Math.cos(Math.PI / (2 * p.heightSegments));
    return p.radius * scale * sag * INSCRIBED_MARGIN;
}

function isOccluder(body: Body): boolean {
    if (!body || body._isDisposed || !body.mesh || !body.mesh.visible) return false;
    if (body.bodyType & NON_OCCLUDER_TYPES) return false;
    const mesh = body.mesh as THREE.Mesh;
    return mesh.geometry instanceof THREE.SphereGeometry && mesh.geometry.parameters.radius > 0;
}

/**
 * Uploads this frame's eclipse inputs: every star's light position and radius, and the
 * MAX_SHADOW_OCCLUDERS sphere bodies nearest the camera (by distance to their surface) as
 * occluders. Everything goes up in the camera's view space.
 *
 * Expects `camera.matrixWorldInverse` and the scene's world matrices to be current.
 */
export function updateEclipseUniforms(bodies: readonly Body[], camera: THREE.Camera): void {
    const view = camera.matrixWorldInverse;

    // ── Stars ──
    let starCount = 0;
    for (const star of getFrameStars()) {
        if (starCount >= MAX_SHADOW_STARS) break;
        const light = star.sunLight;
        if (star._isDisposed || !light || !light.visible || !(light.intensity > 0)) continue;
        // Exactly how three.js derives the light's view-space position for its own uniform, so
        // the shader can match the two.
        _viewPos.setFromMatrixPosition(light.matrixWorld).applyMatrix4(view);
        shadowUniforms.uSimStars.value[starCount].set(
            _viewPos.x,
            _viewPos.y,
            _viewPos.z,
            star.radius
        );
        starCount++;
    }
    shadowUniforms.uSimStarCount.value = starCount;

    // ── Occluders: the nearest few sphere bodies to the camera ──
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    _nearBodies.fill(null);
    _nearScores.fill(Infinity);
    for (const body of bodies) {
        if (!isOccluder(body)) continue;
        const score = body.mesh.position.distanceTo(_camPos) - body.radius;
        if (score >= _nearScores[MAX_SHADOW_OCCLUDERS - 1]) continue;
        // Insertion into the sorted fixed-size list.
        let i = MAX_SHADOW_OCCLUDERS - 1;
        while (i > 0 && _nearScores[i - 1] > score) {
            _nearScores[i] = _nearScores[i - 1];
            _nearBodies[i] = _nearBodies[i - 1];
            i--;
        }
        _nearScores[i] = score;
        _nearBodies[i] = body;
    }

    let occluderCount = 0;
    for (const body of _nearBodies) {
        if (!body) break;
        _viewPos.setFromMatrixPosition(body.mesh.matrixWorld).applyMatrix4(view);
        shadowUniforms.uSimOccluders.value[occluderCount].set(
            _viewPos.x,
            _viewPos.y,
            _viewPos.z,
            inscribedRadius(body.mesh as THREE.Mesh)
        );
        occluderCount++;
    }
    shadowUniforms.uSimOccluderCount.value = occluderCount;
}

/** No eclipses (shadows off). */
export function clearEclipseUniforms(): void {
    shadowUniforms.uSimStarCount.value = 0;
    shadowUniforms.uSimOccluderCount.value = 0;
}
