import * as THREE from 'three';
import { BodyTypeEnum } from '../bodies/body-enums';
import { MAX_LIGHTING_STARS } from '../utilities/consts';

/**
 * The parts of a star this module reads. Structural, so it needs no import of Star (which
 * would close an import cycle through CelestialBody).
 */
interface ILightingStar {
    readonly bodyType: number;
    readonly _isDisposed: boolean;
    readonly mesh: THREE.Object3D;
    readonly sunLight: THREE.PointLight | null;
}

/** The parts of any body this module looks at when picking out the stars. */
interface ILightingCandidate {
    readonly bodyType: number;
    readonly _isDisposed: boolean;
}

/** One star's light at a given point. */
export interface IStarLight {
    /** Star world position. */
    readonly position: THREE.Vector3;
    /** Unit direction from the lit point toward the star (world space). */
    readonly dir: THREE.Vector3;
    /** The star's light colour (linear), as its point light carries it. */
    readonly color: THREE.Color;
    /**
     * Irradiance the star's point light delivers here, in the same units three.js lights the
     * surfaces with (before the colour and N·L). No reference, normalisation or cap.
     */
    irradiance: number;
}

/** Up to MAX_LIGHTING_STARS lights at one point, brightest first. Pre-allocated; reuse it. */
export interface IStarLightingSet {
    count: number;
    readonly lights: IStarLight[];
}

export function createStarLightingSet(): IStarLightingSet {
    const lights: IStarLight[] = [];
    for (let i = 0; i < MAX_LIGHTING_STARS; i++) {
        lights.push({
            position: new THREE.Vector3(),
            dir: new THREE.Vector3(),
            color: new THREE.Color(),
            irradiance: 0,
        });
    }
    return { count: 0, lights };
}

/**
 * Irradiance a point light delivers at `distance`, exactly as three.js attenuates it
 * (getDistanceAttenuation in lights_pars_begin): intensity / max(d^decay, 0.01), windowed by
 * (1 - (d / cutoff)^4)^2 when the light has a cutoff distance.
 */
function pointLightIrradiance(
    intensity: number,
    decay: number,
    cutoff: number,
    distance: number
): number {
    let falloff = 1 / Math.max(Math.pow(distance, decay), 0.01);
    if (cutoff > 0) {
        const ratio = distance / cutoff;
        const window = Math.min(Math.max(1 - ratio * ratio * ratio * ratio, 0), 1);
        falloff *= window * window;
    }
    return intensity * falloff;
}

/**
 * Irradiance a star's point light delivers at `distance`: the light's live intensity, decay
 * and cutoff, exactly what the surfaces it lights receive. Zero for a star without a light.
 */
export function starIrradiance(star: ILightingStar, distance: number): number {
    const light = star.sunLight;
    if (!light || !light.visible || !(light.intensity > 0)) return 0;
    return pointLightIrradiance(light.intensity, light.decay, light.distance, distance);
}

function isLightingStar(body: ILightingCandidate): body is ILightingCandidate & ILightingStar {
    return !body._isDisposed && (body.bodyType & BodyTypeEnum.Star) !== 0 && 'sunLight' in body;
}

/** Live stars for this frame, gathered once by beginStarLightingFrame. */
const _frameStars: ILightingStar[] = [];

/** Scratch for ranking stars at one point. */
interface IRankedStar {
    star: ILightingStar;
    light: THREE.PointLight;
    distance: number;
    irradiance: number;
}
const _ranked: IRankedStar[] = [];
const _toStar = new THREE.Vector3();

/**
 * Collects this frame's live stars. Call once per frame, before any body's updateVisuals, so
 * every atmosphere shell (and Earth) reads the same list without scanning all bodies itself.
 */
export function beginStarLightingFrame(bodies: readonly ILightingCandidate[]): void {
    _frameStars.length = 0;
    for (const body of bodies) {
        if (isLightingStar(body)) _frameStars.push(body);
    }
}

/**
 * Fills `out` with the (at most MAX_LIGHTING_STARS) stars lighting `position` most strongly,
 * brightest first. Stars whose light doesn't reach it are left out. Allocation-free once warm.
 */
export function gatherStarLighting(position: THREE.Vector3, out: IStarLightingSet): void {
    let n = 0;
    for (const star of _frameStars) {
        const pointLight = star.sunLight;
        if (star._isDisposed || !pointLight) continue;
        const distance = position.distanceTo(star.mesh.position);
        if (distance <= 0) continue;
        const irradiance = starIrradiance(star, distance);
        if (irradiance <= 0) continue;
        let slot = _ranked[n];
        if (!slot) {
            slot = { star, light: pointLight, distance: 0, irradiance: 0 };
            _ranked.push(slot);
        }
        slot.star = star;
        slot.light = pointLight;
        slot.distance = distance;
        slot.irradiance = irradiance;
        n++;
    }

    // Partial selection sort: only the top MAX_LIGHTING_STARS are needed.
    const count = Math.min(n, MAX_LIGHTING_STARS);
    for (let i = 0; i < count; i++) {
        let best = i;
        for (let j = i + 1; j < n; j++) {
            if (_ranked[j].irradiance > _ranked[best].irradiance) best = j;
        }
        if (best !== i) {
            const tmp = _ranked[i];
            _ranked[i] = _ranked[best];
            _ranked[best] = tmp;
        }

        const ranked = _ranked[i];
        const light = out.lights[i];
        light.position.copy(ranked.star.mesh.position);
        _toStar.subVectors(ranked.star.mesh.position, position);
        light.dir.copy(_toStar).divideScalar(ranked.distance);
        // The point light's own colour, so the sky matches what the surface is lit with (a
        // brown dwarf's light, for one, differs from its surface tint).
        light.color.copy(ranked.light.color);
        light.irradiance = ranked.irradiance;
    }
    out.count = count;
}
