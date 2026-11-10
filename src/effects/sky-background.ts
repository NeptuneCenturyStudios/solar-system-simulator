import * as THREE from 'three';
import { atmosphereVisualDepthScale } from './atmosphere-shell';
import { createStarLightingSet, gatherStarLighting } from './star-illumination';
import { ATMOSPHERE_RAYLEIGH_ZENITH_DEPTH, STAR_LIGHT_EXPOSURE } from '../utilities/consts';

/** The parts of an atmosphere-bearing body the dimmer reads. */
interface ISkyBody {
    readonly _isDisposed: boolean;
    readonly mesh: THREE.Object3D;
    readonly radius: number;
    readonly atmosphereRadius: number | null;
    readonly atmosphereSurfaceDensity: number;
}

/** How quickly the background follows the sky (1/s, wall clock). */
const BACKGROUND_EASE_RATE = 4;

/** Air column above the camera falls off with altitude over this fraction of the shell. */
const SKY_COLUMN_SCALE_HEIGHT = 0.2;

/**
 * Sky radiance (linear, as the shell outputs it, before tone mapping) at which the starfield is
 * fully hidden.
 * Below it the stars fade in proportionally, so a faint sky only partly hides them.
 */
const STAR_HIDE_SKY_RADIANCE = 0.15 * STAR_LIGHT_EXPOSURE;

/** Rough Rayleigh phase toward the zenith (3/(16π)·(1 + cos²)), for the overhead estimate. */
const ZENITH_PHASE = 0.08;

/** Star elevation (sin) band over which the sky goes from night to day at the camera. */
const SUN_ELEVATION_NIGHT = -0.12;
const SUN_ELEVATION_DAY = 0.15;

const _lighting = createStarLightingSet();
const _up = new THREE.Vector3();

function isSkyBody(body: object): body is ISkyBody {
    return 'atmosphereRadius' in body && 'atmosphereSurfaceDensity' in body;
}

/**
 * Fades the starfield background out under a daytime sky. The atmosphere shell adds its
 * in-scattered light on top of the scene, which can't hide what is behind it, so the
 * background itself is dimmed by how bright the sky is where the camera stands. Bright objects
 * (the sun, a lit moon) are drawn as geometry and stay visible.
 */
export class SkyBackgroundDimmer {
    private _intensity = 1;

    /**
     * @param wallDt Real seconds since the last frame (the ease runs on the wall clock).
     */
    update(
        scene: THREE.Scene,
        cameraPos: THREE.Vector3,
        bodies: readonly object[],
        wallDt: number
    ): void {
        const target = 1 - this._skyBrightness(cameraPos, bodies);
        const blend = 1 - Math.exp(-BACKGROUND_EASE_RATE * Math.max(wallDt, 0));
        this._intensity += (target - this._intensity) * blend;
        if (Math.abs(this._intensity - target) < 1e-3) this._intensity = target;
        scene.backgroundIntensity = this._intensity;
    }

    /** 0 (stars fully visible) .. 1 (stars hidden) for the atmosphere the camera is in. */
    private _skyBrightness(cameraPos: THREE.Vector3, bodies: readonly object[]): number {
        let brightest = 0;
        for (const body of bodies) {
            if (!isSkyBody(body) || body._isDisposed || body.atmosphereRadius === null) continue;
            const center = body.mesh.position;
            const dist = cameraPos.distanceTo(center);
            if (dist >= body.atmosphereRadius) continue;

            const thickness = Math.max(body.atmosphereRadius - body.radius, 1e-9);
            const altitude = THREE.MathUtils.clamp((dist - body.radius) / thickness, 0, 1);
            // The column above thins with height; at the shell's edge it is gone entirely.
            const column =
                Math.exp(-altitude / SKY_COLUMN_SCALE_HEIGHT) *
                (1 - THREE.MathUtils.smoothstep(altitude, 0.85, 1));
            // Overhead optical depth on the tint's brightest channel, as the shell uses it.
            const zenithDepth =
                ATMOSPHERE_RAYLEIGH_ZENITH_DEPTH *
                atmosphereVisualDepthScale(body.atmosphereSurfaceDensity) *
                column;
            const scattered = 1 - Math.exp(-zenithDepth);

            _up.subVectors(cameraPos, center).divideScalar(Math.max(dist, 1e-9));
            gatherStarLighting(cameraPos, _lighting);
            // Estimated sky radiance overhead: each star's real irradiance, scattered by the
            // air above, for as much of the star as is above the horizon.
            let radiance = 0;
            for (let i = 0; i < _lighting.count; i++) {
                const light = _lighting.lights[i];
                const elevation = THREE.MathUtils.smoothstep(
                    _up.dot(light.dir),
                    SUN_ELEVATION_NIGHT,
                    SUN_ELEVATION_DAY
                );
                radiance += light.irradiance * scattered * ZENITH_PHASE * elevation;
            }

            brightest = Math.max(brightest, radiance / STAR_HIDE_SKY_RADIANCE);
        }
        return THREE.MathUtils.clamp(brightest, 0, 1);
    }
}
