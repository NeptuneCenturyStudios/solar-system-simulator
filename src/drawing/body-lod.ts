import * as THREE from 'three';
import { Body } from '../bodies/body';
import { BodyTypeEnum } from '../bodies/body-enums';
import { CelestialBody } from '../bodies/celestial-body';
import { getFrameStars, starIrradiance } from '../effects/star-illumination';
import type { DistantBodyDetail } from '../settings/settings-store';
import {
    BODY_LOD_HIDDEN_LAYER,
    BODY_LOD_TUNING,
    DIST_SCALE,
    RADIUS_SCALE,
    STAR_LIGHT_EXPOSURE,
} from '../utilities/consts';
import type { ScreenProjector } from './hud/screen-projection';

// ── Generic screen-size tier picker ─────────────────────────────────────────

/**
 * One boundary between two adjacent detail tiers, in apparent pixels. Below `enter` the coarser
 * tier is chosen; once there, the finer tier only returns above `exit` (> `enter`).
 */
export interface IScreenSizeBoundary {
    readonly enter: number;
    readonly exit: number;
}

/**
 * Picks a detail tier from an apparent screen size, with hysteresis.
 *
 * Tier 0 is the finest. `boundaries[k]` separates tier k from tier k + 1, ordered from the
 * largest size to the smallest. Nothing here knows about bodies, so the same picker can drive
 * any screen-size LOD (bodies today, terrain patches later).
 *
 * @param currentTier The tier the object is on now (its hysteresis side of each boundary).
 * @param sizePx      Apparent size in pixels (whatever measure the boundaries were tuned for).
 * @param scale       Multiplier on every boundary: > 1 switches to coarser tiers sooner.
 */
export function pickScreenSizeTier(
    currentTier: number,
    sizePx: number,
    boundaries: readonly IScreenSizeBoundary[],
    scale = 1
): number {
    let tier = 0;
    for (let k = 0; k < boundaries.length; k++) {
        const b = boundaries[k];
        // Already on the coarse side of this boundary: stay there until clearly past `exit`.
        const coarser = currentTier > k ? sizePx <= b.exit * scale : sizePx < b.enter * scale;
        if (!coarser) break;
        tier = k + 1;
    }
    return tier;
}

// ── Body LOD ────────────────────────────────────────────────────────────────

export const enum BodyLodTier {
    /** The body as built. */
    Full = 0,
    /** Sphere drawn by a low-poly proxy; attached effects unchanged. */
    Reduced = 1,
    /** Hidden from the camera; drawn as one point in the shared dot buffer. */
    Dot = 2,
}

const BOUNDARIES: readonly IScreenSizeBoundary[] = [BODY_LOD_TUNING.REDUCED, BODY_LOD_TUNING.DOT];

/** Bodies whose look depends on effects that must stay visible at any size (glows, lensing). */
const NEVER_LOD_TYPES =
    BodyTypeEnum.Star |
    BodyTypeEnum.WhiteDwarf |
    BodyTypeEnum.BrownDwarf |
    BodyTypeEnum.Pulsar |
    BodyTypeEnum.BlackHole |
    BodyTypeEnum.Wormhole |
    BodyTypeEnum.Player;

const THREAT_DOT_COLOR = new THREE.Color(0xff5a4a);
const SHIP_DOT_COLOR = new THREE.Color(0x9fe8ff);
const DEFAULT_DOT_COLOR = new THREE.Color(0xffffff);

/** How many bodies were on each tier in the last update (for the render-info readout). */
export interface IBodyLodCounts {
    full: number;
    reduced: number;
    dot: number;
}

interface IBodyLodState {
    tier: BodyLodTier;
    /** Nodes moved off layer 0 by this system, to be moved back on restore. */
    readonly hidden: THREE.Object3D[];
    /** Low-poly stand-in for a sphere body, created on first use. Null for non-sphere bodies. */
    proxy: THREE.Mesh | null;
}

/** The shared low-poly unit sphere every proxy draws. Never disposed. */
let _proxyGeometry: THREE.SphereGeometry | null = null;
function proxyGeometry(): THREE.SphereGeometry {
    _proxyGeometry ??= new THREE.SphereGeometry(
        1,
        BODY_LOD_TUNING.REDUCED_WIDTH_SEGMENTS,
        BODY_LOD_TUNING.REDUCED_HEIGHT_SEGMENTS
    );
    return _proxyGeometry;
}

const _worldPos = new THREE.Vector3();
const _toBody = new THREE.Vector3();
const _color = new THREE.Color();

/**
 * Screen-size LOD for bodies: bodies that look small are drawn with less, and bodies smaller than
 * a couple of pixels are replaced by a single dot. Run once per frame after the camera's final
 * move (the same place the screen projector is primed), before the scene is rendered.
 *
 * Bodies are hidden from the main camera by moving nodes from layer 0 to BODY_LOD_HIDDEN_LAYER,
 * never by `visible` or by swapping `mesh.geometry`: eclipse shadows and lens flares treat
 * `mesh.visible === false` as "the body is gone", and the physics surface, eclipse sag and the
 * surface precision patch all read the full sphere's segment counts. Layers change neither.
 */
export class BodyLodSystem {
    private readonly states = new WeakMap<Body, IBodyLodState>();

    /** One Points object for every Dot-tier body: one draw call however many there are. */
    private readonly dots: THREE.Points;
    private readonly dotGeometry: THREE.BufferGeometry;
    private readonly dotMaterial: THREE.PointsMaterial;
    private positions = new Float32Array(0);
    private colors = new Float32Array(0);

    readonly counts: IBodyLodCounts = { full: 0, reduced: 0, dot: 0 };

    constructor(scene: THREE.Scene) {
        this.dotGeometry = new THREE.BufferGeometry();
        this.dotMaterial = new THREE.PointsMaterial({
            size: BODY_LOD_TUNING.DOT_SIZE_PX,
            sizeAttenuation: false,
            vertexColors: true,
            depthWrite: false,
            // A dimmed dot adds a little light; it never darkens what is behind it.
            blending: THREE.AdditiveBlending,
        });
        this.dots = new THREE.Points(this.dotGeometry, this.dotMaterial);
        this.dots.name = 'BodyLodDots';
        // Positions are rewritten every frame; the bounding sphere would always be stale.
        this.dots.frustumCulled = false;
        this.dots.renderOrder = -1;
        this.ensureCapacity(64);
        scene.add(this.dots);
    }

    /**
     * Re-tier every body for this frame and refill the dot buffer.
     *
     * @param camera    The camera about to render the scene, with its final pose for the frame.
     * @param projector Primed for this frame (`beginFrame`), for the apparent-size maths.
     * @param keepFull  A body always drawn in full (the player's ship), or null.
     * @param skyBrightness How bright the sky at the camera is: 0 at night / in space, 1 in full
     *                  daylight. A bright sky raises the dot visibility limit.
     */
    update(
        camera: THREE.PerspectiveCamera,
        projector: ScreenProjector,
        bodies: readonly Body[],
        detail: DistantBodyDetail,
        keepFull: Body | null,
        skyBrightness: number
    ): void {
        const scale = BODY_LOD_TUNING.DETAIL_SCALE[detail];
        const camPos = camera.position;
        const maxDotDist = camera.far * BODY_LOD_TUNING.DOT_FAR_FRACTION;
        const sky = THREE.MathUtils.clamp(skyBrightness, 0, 1);
        const limitLog =
            BODY_LOD_TUNING.DOT_LIMIT_LOG_FLUX + sky * BODY_LOD_TUNING.DOT_DAY_LIMIT_DECADES;
        const markerFade = 1 - sky;

        this.ensureCapacity(bodies.length);
        const positions = this.positions;
        const colors = this.colors;
        const counts = this.counts;
        counts.full = 0;
        counts.reduced = 0;
        counts.dot = 0;
        let dotCount = 0;

        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (!body || body._isDisposed || !body.mesh) continue;

            let state = this.states.get(body);
            const lodable = body !== keepFull && (body.bodyType & NEVER_LOD_TYPES) === 0;

            body.mesh.getWorldPosition(_worldPos);
            let tier = BodyLodTier.Full;
            let camDist = 0;
            if (lodable) {
                camDist = camPos.distanceTo(_worldPos);
                const sizePx = projector.apparentRadius(body.radius, camDist, 0);
                tier = pickScreenSizeTier(state?.tier ?? 0, sizePx, BOUNDARIES, scale);
            }

            if (!state) {
                if (tier === BodyLodTier.Full) {
                    counts.full++;
                    continue; // Never touched: nothing to track.
                }
                state = { tier: BodyLodTier.Full, hidden: [], proxy: null };
                this.states.set(body, state);
            }

            if (tier !== state.tier) this.applyTier(body, state, tier);

            if (tier === BodyLodTier.Full) {
                counts.full++;
            } else if (tier === BodyLodTier.Reduced) {
                counts.reduced++;
                this.syncProxy(body, state);
            } else {
                counts.dot++;
                // Catch nodes attached since the body went dark (a rebuilt aurora, a new cloud
                // tier), so nothing pops up on a dot.
                hideFromCamera(body.mesh, state.hidden);

                // Ships and threats are markers at a fixed brightness; everything else shines
                // with the light it reflects. Either way a daytime sky hides them.
                let brightness: number;
                if (isMarker(body)) {
                    brightness = markerFade;
                } else {
                    brightness = dotVisibility(body, _worldPos, camDist, limitLog);
                }
                if (brightness <= 0) continue;

                // Past the far plane, pull the dot in along its view ray: same screen position,
                // but inside the frustum, so it stays visible beyond the Render Distance.
                _toBody.subVectors(_worldPos, camPos);
                const dist = _toBody.length();
                if (dist > maxDotDist)
                    _worldPos.copy(camPos).addScaledVector(_toBody, maxDotDist / dist);

                const o = dotCount * 3;
                positions[o] = _worldPos.x;
                positions[o + 1] = _worldPos.y;
                positions[o + 2] = _worldPos.z;
                dotColor(body, _color);
                colors[o] = _color.r * brightness;
                colors[o + 1] = _color.g * brightness;
                colors[o + 2] = _color.b * brightness;
                dotCount++;
            }
        }

        this.dotGeometry.setDrawRange(0, dotCount);
        this.dots.visible = dotCount > 0;
        if (dotCount > 0) {
            const pos = this.dotGeometry.getAttribute('position') as THREE.BufferAttribute;
            const col = this.dotGeometry.getAttribute('color') as THREE.BufferAttribute;
            pos.clearUpdateRanges();
            pos.addUpdateRange(0, dotCount * 3);
            pos.needsUpdate = true;
            col.clearUpdateRanges();
            col.addUpdateRange(0, dotCount * 3);
            col.needsUpdate = true;
        }
    }

    /** Put every body back to full detail (e.g. before tearing the scene down). */
    restoreAll(bodies: readonly Body[]): void {
        for (const body of bodies) {
            const state = this.states.get(body);
            if (state && state.tier !== BodyLodTier.Full)
                this.applyTier(body, state, BodyLodTier.Full);
        }
    }

    dispose(): void {
        this.dots.parent?.remove(this.dots);
        this.dotGeometry.dispose();
        this.dotMaterial.dispose();
    }

    // ── internals ────────────────────────────────────────────────────────────

    private applyTier(body: Body, state: IBodyLodState, tier: BodyLodTier): void {
        // Undo the previous tier completely, then apply the new one from a clean slate.
        restoreToCamera(state.hidden);
        if (state.proxy) state.proxy.visible = false;

        if (tier === BodyLodTier.Reduced && this.syncProxy(body, state)) {
            state.proxy!.visible = true;
            // Hide only the body's own mesh node: its children (atmosphere, clouds, rings and
            // the proxy itself) keep drawing.
            hideNodeFromCamera(body.mesh, state.hidden);
        } else if (tier === BodyLodTier.Dot) {
            hideFromCamera(body.mesh, state.hidden);
        }

        state.tier = tier;
    }

    /**
     * Create or refresh the low-poly proxy for a sphere body. Kept in step with the body's own
     * material (which can be replaced) and radius (which can be edited). Returns false when the
     * body is not a single-material sphere, which then stays at full detail in the Reduced tier.
     */
    private syncProxy(body: Body, state: IBodyLodState): boolean {
        const mesh = body.mesh;
        const geometry = mesh.geometry;
        if (!(geometry instanceof THREE.SphereGeometry) || Array.isArray(mesh.material)) {
            return false;
        }
        let proxy = state.proxy;
        if (!proxy) {
            proxy = new THREE.Mesh(proxyGeometry(), mesh.material);
            proxy.name = 'BodyLodProxy';
            proxy.visible = false;
            // Click picking resolves the hit node's body by walking up to the tagged mesh.
            mesh.add(proxy);
            state.proxy = proxy;
        }
        if (proxy.material !== mesh.material) proxy.material = mesh.material;
        const r = geometry.parameters.radius;
        if (proxy.scale.x !== r) proxy.scale.setScalar(r);
        return true;
    }

    private ensureCapacity(count: number): void {
        if (this.positions.length >= count * 3) return;
        const capacity = Math.max(64, Math.ceil(count * 1.5));
        this.positions = new Float32Array(capacity * 3);
        this.colors = new Float32Array(capacity * 3);
        this.dotGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)
        );
        this.dotGeometry.setAttribute(
            'color',
            new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage)
        );
    }
}

/** Move `node` (only) from layer 0 to the hidden layer, recording it. */
function hideNodeFromCamera(node: THREE.Object3D, hidden: THREE.Object3D[]): void {
    // Nodes that are not on layer 0 were never drawn by the camera (e.g. shadow-only casters);
    // leave them alone so restoring cannot put them on it.
    if (!node.layers.isEnabled(0)) return;
    node.layers.disable(0);
    node.layers.enable(BODY_LOD_HIDDEN_LAYER);
    hidden.push(node);
}

/** Hide `root` and every descendant from the main camera. */
function hideFromCamera(root: THREE.Object3D, hidden: THREE.Object3D[]): void {
    root.traverse((node) => hideNodeFromCamera(node, hidden));
}

/** Undo every hide recorded in `hidden`. */
function restoreToCamera(hidden: THREE.Object3D[]): void {
    for (let i = 0; i < hidden.length; i++) {
        const node = hidden[i];
        node.layers.disable(BODY_LOD_HIDDEN_LAYER);
        node.layers.enable(0);
    }
    hidden.length = 0;
}

/** Ships and threats: dots that mark where they are rather than how bright they would look. */
function isMarker(body: Body): boolean {
    return body.isThreat || (body.bodyType & BodyTypeEnum.SpaceShip) !== 0;
}

/**
 * Brightness 0..1 of a celestial body's dot, from the starlight it reflects toward the camera
 * (see BODY_LOD_TUNING in consts.ts): irradiance at the body × albedo × angular radius², on a
 * log scale between `limitLog` (gone) and `limitLog + DOT_SPAN_DECADES` (full). Squared so the
 * fade reads evenly once tone mapping and the sRGB output lift the low end.
 */
function dotVisibility(
    body: Body,
    worldPos: THREE.Vector3,
    camDist: number,
    limitLog: number
): number {
    const stars = getFrameStars();
    let irradiance = 0;
    for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        if (star._isDisposed || star === (body as object)) continue;
        irradiance += starIrradiance(star, worldPos.distanceTo(star.mesh.position));
    }
    if (!(irradiance > 0) || !(camDist > 0)) return 0;

    // Radius and distance carry separate scales, so compare them in km.
    const angular = (body.radius * RADIUS_SCALE) / (camDist * DIST_SCALE);
    const flux = irradiance * STAR_LIGHT_EXPOSURE * BODY_LOD_TUNING.DOT_ALBEDO * angular * angular;
    const v = THREE.MathUtils.clamp(
        (Math.log10(flux) - limitLog) / BODY_LOD_TUNING.DOT_SPAN_DECADES,
        0,
        1
    );
    return v * v;
}

/** The colour a body's dot is drawn in: threats red, ships cyan, celestial bodies their trail colour. */
function dotColor(body: Body, out: THREE.Color): void {
    if (body.isThreat) {
        out.copy(THREAT_DOT_COLOR);
    } else if (body.bodyType & BodyTypeEnum.SpaceShip) {
        out.copy(SHIP_DOT_COLOR);
    } else if (body instanceof CelestialBody && body.trail) {
        const material = body.trail.material as THREE.LineBasicMaterial;
        out.copy(material.color ?? DEFAULT_DOT_COLOR);
    } else {
        out.copy(DEFAULT_DOT_COLOR);
    }
}
