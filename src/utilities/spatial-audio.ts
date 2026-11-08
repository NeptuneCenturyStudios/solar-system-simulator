/**
 * Distance attenuation, muffling and stereo panning for positional sound effects.
 *
 * Battles in this sim can span thousands of km, so the Web Audio PannerNode's built-in
 * distance models (linear / inverse / exponential) are not used — none of them gives a
 * near-flat zone followed by a steep, tunable falloff. Instead each spatial effect carries an
 * IAttenuationProfile and a SpatialVoice applies three stages after the effect's own gain:
 *
 *   distance gain (custom curve) → low-pass filter (muffling) → PannerNode (direction only)
 *
 * The panner has rolloffFactor 0, so it contributes direction but no distance loss. The Web
 * Audio listener is left at its default pose (origin, facing −Z, up +Y) — the same as a
 * three.js camera's local frame — and every source is fed in camera space. That keeps huge
 * world coordinates out of Web Audio and means the listener never needs updating, only the
 * cached camera pose below (see updateAudioListener).
 */

import * as THREE from 'three';
import { DIST_SCALE } from './consts';

/** How a positional sound fades and muffles with distance from the camera. All distances in km. */
export interface IAttenuationProfile {
    /** Edge of the near zone. Inside it the gain eases gently from 1 down to `nearGain`. */
    nearKm: number;
    /** Distance at which the sound reaches silence; beyond it the sound is not played at all. */
    farKm: number;
    /** Gain at `nearKm` (0–1). */
    nearGain: number;
    /** Exponent of the inverse-power falloff past `nearKm`. 1 = inverse distance; higher falls faster. */
    rolloff: number;
    /** Low-pass cutoff (Hz) reached at `farKm`; the cutoff sweeps from MAX_CUTOFF_HZ on a log scale. */
    muffleMinHz: number;
}

/** Blasters, missile launches and laser beams: short reach, sharp falloff. */
export const WEAPON_FIRE_PROFILE: IAttenuationProfile = {
    nearKm: 10,
    farKm: 1500,
    nearGain: 0.85,
    rolloff: 1.0,
    muffleMinHz: 1200,
};

/** Weapon impacts and shockwaves: carry a little further than the shot that caused them. */
export const IMPACT_PROFILE: IAttenuationProfile = {
    nearKm: 10,
    farKm: 3000,
    nearGain: 0.85,
    rolloff: 0.8,
    muffleMinHz: 800,
};

/** Bodies being destroyed: audible across a battle spread over thousands of km. */
export const EXPLOSION_PROFILE: IAttenuationProfile = {
    nearKm: 10,
    farKm: 6000,
    nearGain: 0.85,
    rolloff: 0.6,
    muffleMinHz: 400,
};

/**
 * Source size (km of radius) that adds one more multiple of a profile's range — see
 * scaleProfileForSource. A ship (radius well under 1 km) keeps the base range; Mercury
 * (~2,440 km) carries ~99× further, Earth ~256×, Jupiter ~2,800×.
 */
const SOURCE_SIZE_RANGE_STEP_KM = 25;

/** Low-pass cutoff for an unmuffled sound (just under the 22.05 kHz Nyquist of a 44.1 kHz context). */
const MAX_CUTOFF_HZ = 20000;
/** Fraction of `farKm` at which the end taper begins pulling the gain down to exactly 0. */
const FAR_TAPER_START = 0.6;
/**
 * Forward offset (km) added to every source before panning, so sounds right next to the camera
 * (the player's own wing guns, a few metres off-axis) stay near centre instead of snapping hard
 * left/right. Negligible at battle distances.
 */
const PAN_CENTER_BIAS_KM = 1;
/** Time constant (s) for smoothing a moving loop's gain / cutoff / pan between frames. */
const SMOOTHING_TIME_CONSTANT = 0.05;

/** Camera pose cached once per frame by updateAudioListener. */
const _listenerPosition = new THREE.Vector3();
const _listenerInverseRotation = new THREE.Quaternion();
const _scratch = new THREE.Vector3();

function clamp01(x: number): number {
    return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

/**
 * Gain (0–1) for a sound `distanceKm` from the camera:
 *   - inside nearKm: 1 − (1 − nearGain)·(d/near)², a near-flat ease;
 *   - past nearKm: nearGain·(near/d)^rolloff, tapered smoothly to 0 at farKm;
 *   - at or beyond farKm: 0.
 */
export function computeDistanceGain(distanceKm: number, profile: IAttenuationProfile): number {
    if (distanceKm >= profile.farKm) return 0;
    if (distanceKm <= profile.nearKm) {
        const r = distanceKm / profile.nearKm;
        return 1 - (1 - profile.nearGain) * r * r;
    }
    const falloff = profile.nearGain * Math.pow(profile.nearKm / distanceKm, profile.rolloff);
    const taper = 1 - smoothstep(FAR_TAPER_START * profile.farKm, profile.farKm, distanceKm);
    return falloff * taper;
}

/** Low-pass cutoff (Hz): unmuffled inside nearKm, sweeping log-linearly to muffleMinHz at farKm. */
export function computeMuffleCutoff(distanceKm: number, profile: IAttenuationProfile): number {
    if (distanceKm <= profile.nearKm) return MAX_CUTOFF_HZ;
    const t = clamp01(
        Math.log(distanceKm / profile.nearKm) / Math.log(profile.farKm / profile.nearKm)
    );
    return MAX_CUTOFF_HZ * Math.pow(profile.muffleMinHz / MAX_CUTOFF_HZ, t);
}

/**
 * Cache the camera's pose for positional audio. Call once per frame after the camera has been
 * placed for that frame.
 */
export function updateAudioListener(camera: THREE.Camera): void {
    _listenerPosition.copy(camera.position);
    _listenerInverseRotation.copy(camera.quaternion).invert();
}

/** Distance (km) from the camera to a world-space position (sim units). */
export function distanceFromListenerKm(worldPosition: THREE.Vector3): number {
    return worldPosition.distanceTo(_listenerPosition) * DIST_SCALE;
}

/**
 * Distance (km) from the camera to the surface of a source of `sourceRadiusKm` centred at
 * `worldPosition`; 0 when the camera is inside it. For a point source (radius 0) this is the
 * plain centre distance.
 */
export function distanceFromSourceKm(worldPosition: THREE.Vector3, sourceRadiusKm: number): number {
    return Math.max(0, distanceFromListenerKm(worldPosition) - sourceRadiusKm);
}

/**
 * Stretch a profile's near and far distances for a large source, so a planet blowing up is
 * heard far beyond where a ship explosion fades. Range grows linearly with radius:
 * `1 + radiusKm / SOURCE_SIZE_RANGE_STEP_KM`. Returns the profile unchanged for point sources.
 */
export function scaleProfileForSource(
    profile: IAttenuationProfile,
    sourceRadiusKm: number
): IAttenuationProfile {
    if (sourceRadiusKm <= 0) return profile;
    const scale = 1 + sourceRadiusKm / SOURCE_SIZE_RANGE_STEP_KM;
    return { ...profile, nearKm: profile.nearKm * scale, farKm: profile.farKm * scale };
}

/**
 * Unit direction to `worldPosition` in camera space (−Z forward), biased toward the front by
 * PAN_CENTER_BIAS_KM so near sounds stay centred.
 */
function panDirection(worldPosition: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.subVectors(worldPosition, _listenerPosition).applyQuaternion(_listenerInverseRotation);
    out.z -= PAN_CENTER_BIAS_KM / DIST_SCALE;
    const len = out.length();
    if (len < 1e-12) return out.set(0, 0, -1);
    return out.divideScalar(len);
}

/**
 * One positional voice: distance gain → low-pass → panner → destination. Connect the effect's
 * own gain node to `input`; call update() with the source's world position to (re)place it.
 */
export class SpatialVoice {
    /** Connect the effect's output here. Its gain is the distance gain. */
    readonly input: GainNode;
    private readonly filter: BiquadFilterNode;
    private readonly panner: PannerNode;
    /** The profile after scaling for the source's size (see scaleProfileForSource). */
    readonly profile: IAttenuationProfile;

    /**
     * @param sourceRadiusKm Radius of the emitting body. Distances are measured from its
     *   surface and the profile's range is stretched for its size; 0 for a point source.
     */
    constructor(
        private readonly ac: AudioContext,
        profile: IAttenuationProfile,
        private readonly sourceRadiusKm = 0
    ) {
        this.profile = scaleProfileForSource(profile, sourceRadiusKm);
        this.input = ac.createGain();
        this.filter = ac.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.Q.value = Math.SQRT1_2;
        this.panner = ac.createPanner();
        this.panner.panningModel = 'equalpower';
        this.panner.distanceModel = 'linear';
        this.panner.rolloffFactor = 0; // distance gain is ours; the panner only pans

        this.input.connect(this.filter);
        this.filter.connect(this.panner);
        this.panner.connect(ac.destination);
    }

    /**
     * Place the voice at `worldPosition` (sim units).
     * @param immediate True to jump straight to the new values (a one-shot's first placement);
     *   false to glide there with a short time-based smoothing (a loop's per-frame refresh).
     * @returns The applied distance gain; 0 means the source is out of range.
     */
    update(worldPosition: THREE.Vector3, immediate: boolean): number {
        const distanceKm = distanceFromSourceKm(worldPosition, this.sourceRadiusKm);
        const gain = computeDistanceGain(distanceKm, this.profile);
        const cutoff = computeMuffleCutoff(distanceKm, this.profile);
        const dir = panDirection(worldPosition, _scratch);

        const t = this.ac.currentTime;
        const set = (param: AudioParam, value: number): void => {
            if (immediate) {
                param.cancelScheduledValues(t);
                param.setValueAtTime(value, t);
            } else {
                param.setTargetAtTime(value, t, SMOOTHING_TIME_CONSTANT);
            }
        };
        set(this.input.gain, gain);
        set(this.filter.frequency, cutoff);
        set(this.panner.positionX, dir.x);
        set(this.panner.positionY, dir.y);
        set(this.panner.positionZ, dir.z);
        return gain;
    }

    /** Disconnect every node in the chain. */
    disconnect(): void {
        this.input.disconnect();
        this.filter.disconnect();
        this.panner.disconnect();
    }
}
