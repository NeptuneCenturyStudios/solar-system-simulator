import * as THREE from 'three';
import {
    MAX_SHIP_SHADOW_CASTERS,
    SHADOW_CASTER_LAYER,
    SHIP_SHADOW_ATLAS_SIZE_HIGH,
    SHIP_SHADOW_ATLAS_SIZE_LOW,
    SHIP_SHADOW_THROW,
} from '../../utilities/consts';
import { getFrameStars, starIrradiance, type ILightingStar } from '../star-illumination';
import { shadowUniforms } from './shadow-receiver';

/** Scratch, so the per-frame pass never allocates. */
const _shipPos = new THREE.Vector3();
const _starPos = new THREE.Vector3();
const _lightDir = new THREE.Vector3();
const _viewPos = new THREE.Vector3();
const _tileFromNdc = new THREE.Matrix4();
const _UP_Y = new THREE.Vector3(0, 1, 0);
const _UP_X = new THREE.Vector3(1, 0, 0);

/**
 * One shadow caster's tile framing: what the tile is centred on, how far the caster reaches from
 * that centre, and the half-width of the square the tile covers across the light.
 */
export interface IShadowCaster {
    readonly center: THREE.Vector3;
    radius: number;
    halfWidth: number;
}

/** The star lighting a point most strongly, with its point light. */
interface IDominantStar {
    star: ILightingStar;
    light: THREE.PointLight;
}

function dominantStarAt(position: THREE.Vector3): IDominantStar | null {
    let best: IDominantStar | null = null;
    let bestIrradiance = 0;
    for (const star of getFrameStars()) {
        const light = star.sunLight;
        if (star._isDisposed || !light) continue;
        const irradiance = starIrradiance(star, position.distanceTo(star.mesh.position));
        if (irradiance > bestIrradiance) {
            bestIrradiance = irradiance;
            best = { star, light };
        }
    }
    return best;
}

/**
 * The ship shadow atlas: one small orthographic depth render per nearby ship, looking along the
 * light from that ship's brightest star.
 *
 * three.js's own shadows were unusable here because the stars are point lights an AU away, so a
 * shadow map would have to span the solar system. These tiles span one ship and the ground behind
 * it instead — tens of metres to a few kilometres — so depth and texel precision are a non-issue.
 * An orthographic projection along the light keeps the whole shadow inside the ship's silhouette
 * footprint, so even a long shadow at a grazing sun lands in the tile, as long as the depth range
 * (SHIP_SHADOW_THROW) reaches the ground.
 *
 * Only the hull meshes are drawn (they are put on SHADOW_CASTER_LAYER), so flames, trails and
 * shields cast nothing. Every tile also sees any other ship inside its frustum, which is what gives
 * ship-on-ship shadows; each ship also shadows itself. In surface mode the player rig's shadow-only
 * figure is a caster too (see PlayerRig), with a tile of its own.
 *
 * Receivers look the tiles up in view space (see shadow-receiver.ts): each tile's matrix takes a
 * main-camera view-space position straight to (atlas u, atlas v, depth). It is composed in float64
 * on the CPU, so the huge world coordinates cancel before anything reaches float32.
 */
export class ShipShadowMap {
    private target: THREE.WebGLRenderTarget | null = null;
    private size = 0;
    private readonly shadowCamera = new THREE.OrthographicCamera();
    private readonly depthMaterial = new THREE.MeshBasicMaterial({
        colorWrite: false,
        side: THREE.DoubleSide,
    });

    constructor() {
        this.shadowCamera.layers.set(SHADOW_CASTER_LAYER);
    }

    /**
     * Renders the atlas for `casters` (nearest first; anything past the quality's tile count is
     * ignored) and uploads the tiles to the shared receiver uniforms.
     * @param high High quality: a 2048² atlas with up to four 1024² tiles; low is one 1024² tile.
     * @param splitLow Low quality only: split the 1024² atlas into two 512² tiles instead of one, so
     *   the player on foot and the nearest ship both get a shadow.
     */
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        mainCamera: THREE.Camera,
        casters: readonly IShadowCaster[],
        high: boolean,
        splitLow = false
    ): void {
        const uniforms = shadowUniforms;
        const split = splitLow && !high;
        const tilesPerRow = high || split ? 2 : 1;
        const maxTiles = Math.min(split ? 2 : tilesPerRow * tilesPerRow, MAX_SHIP_SHADOW_CASTERS);
        if (casters.length === 0) {
            uniforms.uSimShipTileCount.value = 0;
            return;
        }

        const target = this.ensureTarget(
            high ? SHIP_SHADOW_ATLAS_SIZE_HIGH : SHIP_SHADOW_ATLAS_SIZE_LOW
        );
        const tileSize = this.size / tilesPerRow;
        const tileUv = 1 / tilesPerRow;

        // Save renderer and scene state; the main render that follows must see none of this.
        const savedTarget = renderer.getRenderTarget();
        const savedAutoClear = renderer.autoClear;
        const savedOverride = scene.overrideMaterial;
        const savedBackground = scene.background;

        renderer.autoClear = false;
        target.scissorTest = true;
        scene.overrideMaterial = this.depthMaterial;
        scene.background = null;

        let tile = 0;
        try {
            for (const caster of casters) {
                if (tile >= maxTiles) break;
                const dominant = dominantStarAt(caster.center);
                if (!dominant) continue;

                const radius = caster.radius;
                const halfWidth = caster.halfWidth;
                _shipPos.copy(caster.center);
                _starPos.setFromMatrixPosition(dominant.light.matrixWorld);
                const starDistance = _lightDir.subVectors(_starPos, _shipPos).length();
                if (!(starDistance > 0)) continue;
                _lightDir.divideScalar(starDistance);

                // The camera sits one radius sunward of the caster, looking away from the star.
                const cam = this.shadowCamera;
                cam.position.copy(_shipPos).addScaledVector(_lightDir, radius);
                cam.up.copy(Math.abs(_lightDir.y) > 0.99 ? _UP_X : _UP_Y);
                cam.lookAt(_shipPos);
                cam.left = -halfWidth;
                cam.right = halfWidth;
                cam.top = halfWidth;
                cam.bottom = -halfWidth;
                cam.near = 0;
                cam.far = 2 * radius + SHIP_SHADOW_THROW;
                cam.updateProjectionMatrix();
                cam.updateMatrixWorld(true);

                const col = tile % tilesPerRow;
                const row = Math.floor(tile / tilesPerRow);
                const x = col * tileSize;
                const y = row * tileSize;
                // A render target supplies its own viewport and scissor; re-binding applies them.
                target.viewport.set(x, y, tileSize, tileSize);
                target.scissor.set(x, y, tileSize, tileSize);
                renderer.setRenderTarget(target);
                renderer.clear(false, true, false);
                renderer.render(scene, cam);

                // NDC → this tile's atlas uv, and NDC depth → the [0, 1] depth the texture holds.
                const offU = col * tileUv;
                const offV = row * tileUv;
                _tileFromNdc.set(
                    0.5 * tileUv,
                    0,
                    0,
                    0.5 * tileUv + offU,
                    0,
                    0.5 * tileUv,
                    0,
                    0.5 * tileUv + offV,
                    0,
                    0,
                    0.5,
                    0.5,
                    0,
                    0,
                    0,
                    1
                );
                uniforms.uSimShipTileMatrix.value[tile]
                    .copy(_tileFromNdc)
                    .multiply(cam.projectionMatrix)
                    .multiply(cam.matrixWorldInverse)
                    .multiply(mainCamera.matrixWorld);
                uniforms.uSimShipTileRect.value[tile].set(offU, offV, offU + tileUv, offV + tileUv);
                uniforms.uSimShipTileInfo.value[tile].set(
                    (2 * halfWidth) / tileSize,
                    cam.far - cam.near,
                    0,
                    0
                );

                _viewPos.copy(_starPos).applyMatrix4(mainCamera.matrixWorldInverse);
                const angularRadius = Math.asin(Math.min(1, dominant.star.radius / starDistance));
                uniforms.uSimShipTileLight.value[tile].set(
                    _viewPos.x,
                    _viewPos.y,
                    _viewPos.z,
                    angularRadius
                );
                tile++;
            }
        } finally {
            scene.overrideMaterial = savedOverride;
            scene.background = savedBackground;
            renderer.autoClear = savedAutoClear;
            renderer.setRenderTarget(savedTarget);
        }

        uniforms.uSimShipTileCount.value = tile;
        uniforms.uSimShipShadowMap.value = target.depthTexture;
        uniforms.uSimShipTexel.value = 1 / this.size;
    }

    /** No ship shadows (shadows off, or nothing nearby). */
    clear(): void {
        shadowUniforms.uSimShipTileCount.value = 0;
    }

    dispose(): void {
        this.target?.depthTexture?.dispose();
        this.target?.dispose();
        this.target = null;
        this.depthMaterial.dispose();
    }

    private ensureTarget(size: number): THREE.WebGLRenderTarget {
        if (this.target && this.size === size) return this.target;
        this.target?.depthTexture?.dispose();
        this.target?.dispose();

        const depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
        depthTexture.minFilter = THREE.NearestFilter;
        depthTexture.magFilter = THREE.NearestFilter;
        // Only depth is used; a one-channel byte colour attachment keeps the unused colour small.
        this.target = new THREE.WebGLRenderTarget(size, size, {
            format: THREE.RedFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: true,
            depthTexture,
        });
        this.size = size;
        return this.target;
    }
}
