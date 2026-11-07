import * as THREE from 'three';
import type { Body } from '../../bodies/body';
import { Spaceship } from '../../bodies/ships/spaceship';
import { settingsStore, type ShadowQuality } from '../../settings/settings-store';
import { SHADOW_CASTER_LAYER, SHIP_SHADOW_CASTER_RANGE } from '../../utilities/consts';
import { clearEclipseUniforms, updateEclipseUniforms } from './eclipse-shadows';
import {
    patchShadowReceiversIn,
    setShadowShaderMode,
    type ShadowShaderMode,
} from './shadow-receiver';
import { ShipShadowMap } from './ship-shadow-map';

const MODE_FOR_QUALITY: Record<ShadowQuality, ShadowShaderMode> = { off: 0, low: 1, high: 2 };

/**
 * What has been done for a body: the root material its subtree was last patched under (a swap
 * means re-patching), and for a ship whether its loaded hull has been patched and put on the
 * shadow-caster layer.
 */
interface IBodyShadowState {
    material: THREE.Material | THREE.Material[];
    hullReady: boolean;
}

const _bodyState = new WeakMap<Body, IBodyShadowState>();
const _shipShadowMap = new ShipShadowMap();
const _casters: Spaceship[] = [];
const _casterDistance = new Map<Spaceship, number>();
const _camPos = new THREE.Vector3();

/** Puts every mesh of the ship's loaded model on the shadow-caster layer (still on layer 0 too). */
function enableCasterLayer(ship: Spaceship): void {
    for (const child of ship.mesh.children) {
        if (child.userData.isShipModel !== true) continue;
        child.traverse((node) => node.layers.enable(SHADOW_CASTER_LAYER));
    }
}

/** Patches new bodies (and ships whose model has just loaded) as shadow receivers. */
function trackReceivers(bodies: readonly Body[]): void {
    for (const body of bodies) {
        if (!body || body._isDisposed || !body.mesh) continue;
        const state = _bodyState.get(body);
        const hullReady = body instanceof Spaceship && body.hasHullModel;
        if (state && state.material === body.mesh.material && state.hullReady === hullReady)
            continue;

        patchShadowReceiversIn(body.mesh);
        if (hullReady) enableCasterLayer(body as Spaceship);
        _bodyState.set(body, { material: body.mesh.material, hullReady });
    }
}

/**
 * Ships near the camera that can cast a shadow-map shadow, nearest first, with `priority` (the
 * player's ship) at the front whenever it qualifies.
 */
function selectCasters(bodies: readonly Body[], priority: Body | null): Spaceship[] {
    _casters.length = 0;
    _casterDistance.clear();
    for (const body of bodies) {
        if (!(body instanceof Spaceship)) continue;
        if (body._isDisposed || !body.mesh?.visible || !body.hasHullModel) continue;
        const distance = body.mesh.position.distanceTo(_camPos) - body.radius;
        if (distance > SHIP_SHADOW_CASTER_RANGE) continue;
        _casters.push(body);
        _casterDistance.set(body, body === priority ? -Infinity : distance);
    }
    _casters.sort((a, b) => (_casterDistance.get(a) ?? 0) - (_casterDistance.get(b) ?? 0));
    return _casters;
}

/**
 * Per-frame shadow driver. Call once per frame after the camera's final move and right before the
 * main scene render: it reads the shadow quality setting, patches any new lit surfaces, uploads
 * the eclipse occluders and renders the ship shadow atlas.
 *
 * @param priority The player's ship, which always gets a shadow tile when it is near the camera.
 */
export function updateShadows(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    bodies: readonly Body[],
    priority: Body | null
): void {
    const quality = settingsStore.settings.shadowQuality;
    const mode = MODE_FOR_QUALITY[quality] ?? 1;
    setShadowShaderMode(mode);
    trackReceivers(bodies);

    if (mode === 0) {
        clearEclipseUniforms();
        _shipShadowMap.clear();
        return;
    }

    // Matrices must match exactly what the main render is about to use, so light and occluder
    // positions computed here agree with three.js's own light uniforms.
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    _camPos.setFromMatrixPosition(camera.matrixWorld);

    updateEclipseUniforms(bodies, camera);
    _shipShadowMap.render(renderer, scene, camera, selectCasters(bodies, priority), mode === 2);
}
