/**
 * Sound effects using the Web Audio API.
 * Audio files are loaded and decoded once on first use, then cached.
 * The AudioContext is created lazily so it is always triggered by a user
 * gesture, satisfying browser autoplay policy.
 *
 * Volume is controlled by the global settingsStore.settings.sfxVolume (0–1).
 * When sfxVolume is 0, no sounds play.
 *
 * Every effect is defined in the `soundEffectStates` table and plays through
 * the single `playSoundEffect(effect, loop?)` entry point:
 *   - one-shot effects play immediately when their buffer is loaded; if the
 *     buffer is still decoding, they play automatically the moment it becomes
 *     ready (pendingPlay).
 *   - loop effects return a `LoopSoundController` when ready, or `null` while
 *     the buffer is still decoding — callers retry each frame until non-null,
 *     then stop()/dispose() the controller when the loop should end.
 *   - effects with multiple files in their bank pick a random loaded buffer
 *     on every play (e.g. weapon impact).
 *
 * Positional effects (weapons, impacts, explosions) carry an `attenuation`
 * profile and are played with `playSoundEffectAt` / `playLoopSoundEffectAt`.
 * They fade, muffle and pan with distance from the camera (see spatial-audio.ts)
 * and are skipped entirely when beyond the profile's `farKm`.
 */

import * as THREE from 'three';
import { settingsStore } from '../settings/settings-store';
import {
    EXPLOSION_PROFILE,
    IAttenuationProfile,
    IMPACT_PROFILE,
    SpatialVoice,
    WEAPON_FIRE_PROFILE,
    distanceFromListenerKm,
    distanceFromSourceKm,
    scaleProfileForSource,
} from './spatial-audio';

export enum SoundEffect {
    // Voice prompts
    WarpDriveActive,
    AutopilotEngaged,
    AutopilotDisengaged,
    AutopilotDestinationReached,
    GuidanceEnabled,
    GuidanceDisabled,
    LandingInitiated,
    LandingCanceled,
    LandingComplete,
    // Scenario voice lines
    AssistanceNeeded,
    EarthUnderAttack,
    EarthDestroyed,
    EarthSaved,
    HostilesInbound,
    // Weapon sounds
    WeaponFire,
    WeaponImpact,
    MissileLaunch,
    /** A body being destroyed — same clips as WeaponImpact, but carries much further. */
    Explosion,
    // Loop sounds
    WarpLoop,
    LaserBeam,
}

interface ISoundEffectState {
    /** Resolved asset URLs for this effect. Effects with multiple files pick one at random per play. */
    soundEffectBank: string[];
    /** Decoded buffers, one per bank entry, filled in as each file decodes. */
    buffers: AudioBuffer[];
    /** Base gain (0–1), multiplied by settingsStore.settings.sfxVolume at play time. */
    volume: number;
    /** Fade-out duration in seconds used when a loop controller's stop() is called without an explicit duration. */
    defaultFadeDuration: number;
    /** True once the fetch + decode for every bank entry has been kicked off. */
    loadStarted: boolean;
    /** True when a one-shot play was requested before the buffer finished decoding. */
    pendingPlay: boolean;
    /** World position of the pending one-shot, or null for a non-positional request. */
    pendingPosition: THREE.Vector3 | null;
    /** Source radius (km) of the pending one-shot — see playSoundEffectAt. */
    pendingSourceRadiusKm: number;
    /**
     * Distance falloff for positional plays. Effects without one never spatialise,
     * even when played with a position (voice prompts, the player's warp loop).
     */
    attenuation?: IAttenuationProfile;
    /** The active loop controller, or null when no loop is playing. */
    activeLoop: LoopSoundController | null;
}

let ctx: AudioContext | null = null;

/** Base volume for weapon fire/impact (0–1) — multiplied by settingsStore.settings.sfxVolume. */
const WEAPON_VOLUME = 0.8;

/** Blast clips shared by WeaponImpact and Explosion (one is picked at random per play). */
const WEAPON_BLAST_BANK: string[] = [
    new URL('../assets/sounds/weapon-blast-1.mp3', import.meta.url).href,
    new URL('../assets/sounds/weapon-blast-2.mp3', import.meta.url).href,
    new URL('../assets/sounds/weapon-blast-3.mp3', import.meta.url).href,
];

/**
 * Contains the states for all sound effects, including their audio buffers,
 * load status, and pending play status.
 */
const soundEffectStates: Record<SoundEffect, ISoundEffectState> = {
    // Voice prompts
    [SoundEffect.WarpDriveActive]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/warp-drive-active.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.AutopilotEngaged]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/autopilot-engaged.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.AutopilotDisengaged]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/autopilot-disengaged.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.AutopilotDestinationReached]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/autopilot-destination-reached.mp3', import.meta.url)
                .href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.GuidanceEnabled]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/guidance-enabled.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.GuidanceDisabled]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/guidance-disabled.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.LandingInitiated]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/initiating-landing.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.LandingCanceled]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/landing-canceled.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.LandingComplete]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/landing-complete.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.AssistanceNeeded]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/assistance-needed.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.EarthUnderAttack]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/earth-under-attack.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.EarthDestroyed]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/earth-destroyed.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.EarthSaved]: {
        soundEffectBank: [new URL('../assets/sounds/voice/earth-saved.mp3', import.meta.url).href],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.HostilesInbound]: {
        soundEffectBank: [
            new URL('../assets/sounds/voice/hostiles-inbound.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    // Weapon sounds
    [SoundEffect.WeaponFire]: {
        soundEffectBank: [new URL('../assets/sounds/spaceship-blaster.wav', import.meta.url).href],
        buffers: [],
        volume: WEAPON_VOLUME,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
        attenuation: WEAPON_FIRE_PROFILE,
    },
    [SoundEffect.WeaponImpact]: {
        soundEffectBank: WEAPON_BLAST_BANK,
        buffers: [],
        volume: WEAPON_VOLUME,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
        attenuation: IMPACT_PROFILE,
    },
    [SoundEffect.MissileLaunch]: {
        soundEffectBank: [new URL('../assets/sounds/missile-launch.mp3', import.meta.url).href],
        buffers: [],
        volume: WEAPON_VOLUME,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
        attenuation: WEAPON_FIRE_PROFILE,
    },
    [SoundEffect.Explosion]: {
        soundEffectBank: WEAPON_BLAST_BANK,
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
        attenuation: EXPLOSION_PROFILE,
    },
    // Loop sounds
    [SoundEffect.WarpLoop]: {
        soundEffectBank: [new URL('../assets/sounds/warp-loop.mp3', import.meta.url).href],
        buffers: [],
        volume: 0.6,
        defaultFadeDuration: 1.5,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
    },
    [SoundEffect.LaserBeam]: {
        soundEffectBank: [new URL('../assets/sounds/laser-beam.wav', import.meta.url).href],
        buffers: [],
        volume: 0.5,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        pendingPosition: null,
        pendingSourceRadiusKm: 0,
        activeLoop: null,
        attenuation: WEAPON_FIRE_PROFILE,
    },
};

function getCtx(): AudioContext {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
}

function loadAndCache(ac: AudioContext, url: string, onReady: (buf: AudioBuffer) => void): void {
    fetch(url)
        .then((r) => r.arrayBuffer())
        .then((ab) => ac.decodeAudioData(ab))
        .then(onReady)
        .catch(() => {});
}

/** Minimum wall-clock ms between debug log lines for one moving loop. */
const SFX_DEBUG_LOOP_LOG_INTERVAL_MS = 1000;

/**
 * Debug trace for positional sounds, enabled by typing `sfxDebug = true` in the
 * dev-tools console (`sfxDebug = false` turns it off). One line per one-shot
 * played or skipped, per loop started, and about once a second per running loop:
 *
 *   [sfx] LaserBeam loop  distance=1,234.5 km  gain=0.0061 (-44.3 dB)
 *
 * `gain` is the distance gain only — the effect's base volume and the SFX
 * volume setting multiply on top of it.
 */
function logSpatialSound(
    effect: SoundEffect,
    event: string,
    distanceKm: number,
    gain: number
): void {
    if (!window.sfxDebug) return;
    const db = gain > 0 ? `${(20 * Math.log10(gain)).toFixed(1)} dB` : 'silent';
    const km = distanceKm.toLocaleString(undefined, { maximumFractionDigits: 1 });
    console.info(
        `[sfx] ${SoundEffect[effect]} ${event}  distance=${km} km  gain=${gain.toFixed(4)} (${db})`
    );
}

/**
 * Play one of the effect's decoded buffers once.  When `position` is given and
 * the effect has an attenuation profile, the sound is placed in the world
 * (distance gain, muffling, panning) and skipped outright if it is beyond the
 * profile's farKm.
 * @param sourceRadiusKm Radius of the emitting body: distance is measured from its
 *   surface and the range is stretched for its size (see scaleProfileForSource).
 */
function playBuffer(
    ac: AudioContext,
    effect: SoundEffect,
    buffer: AudioBuffer,
    position: THREE.Vector3 | null,
    sourceRadiusKm: number
): void {
    // Respect global SFX volume: if 0, don't play anything
    const vol = settingsStore.settings.sfxVolume;
    if (vol <= 0) return;

    const state = soundEffectStates[effect];
    const attenuation = state.attenuation;
    let voice: SpatialVoice | null = null;
    if (position && attenuation) {
        // Out of earshot — don't build any nodes (also keeps voice counts down in big battles).
        const distanceKm = distanceFromSourceKm(position, sourceRadiusKm);
        if (distanceKm >= scaleProfileForSource(attenuation, sourceRadiusKm).farKm) {
            logSpatialSound(effect, 'skipped (out of range)', distanceKm, 0);
            return;
        }
        voice = new SpatialVoice(ac, attenuation, sourceRadiusKm);
        logSpatialSound(effect, 'play', distanceKm, voice.update(position, true));
    }

    const t = ac.currentTime;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const gainNode = ac.createGain();
    gainNode.gain.setValueAtTime(state.volume * vol, t);
    source.connect(gainNode);
    gainNode.connect(voice ? voice.input : ac.destination);
    source.onended = (): void => {
        source.disconnect();
        gainNode.disconnect();
        voice?.disconnect();
    };
    source.start(t);
}

/** Pick a random decoded buffer from the effect's bank, or null while nothing is loaded. */
function pickRandomBuffer(state: ISoundEffectState): AudioBuffer | null {
    if (state.buffers.length === 0) return null;
    return state.buffers[Math.floor(Math.random() * state.buffers.length)];
}

// ── Loopable sounds (warp drive, laser beam, ...) ────────────────────────────

/**
 * Controller returned by `playSoundEffect(effect, true)` /
 * `playLoopSoundEffectAt(effect, position)` for managing a looping sound.
 */
export interface LoopSoundController {
    /**
     * Fade out over `duration` seconds, then stop and disconnect.
     * The loop continues to play during the fade ramps.
     */
    stop(duration?: number): void;
    /**
     * Set the current gain (0–1).  While a stop-fade is in progress
     * this value is ignored — the scheduled Web Audio ramp takes priority.
     * Distance attenuation (positional loops) is applied on top of this.
     */
    setVolume(vol: number): void;
    /**
     * Move a positional loop to `position` (world space, sim units).  Call each
     * frame while the source moves.  No-op for non-positional loops.
     */
    setPosition(position: THREE.Vector3): void;
    /**
     * True when stop() has been called but the fade-out has not yet completed.
     */
    readonly isFadingOut: boolean;
    /**
     * Release all resources immediately (no fade). Called on ship destruction.
     */
    dispose(): void;
}

/** Backwards-compatible name for the loop controller used by the warp drive. */
export type WarpSoundController = LoopSoundController;

/**
 * Start playing the effect's bank entry on a continuous loop.
 * Returns a controller or `null` while the buffer is still decoding — the
 * caller should retry next frame (mirrors the warp-loop pattern).
 *
 * Non-positional loops are tracked in `activeLoop`: re-triggering hands back the
 * live controller so copies of the same loop don't stack up.  Positional loops
 * (a `position` plus an attenuation profile) are per-instance instead — every
 * ship's laser gets its own loop, so a distant AI beam never takes over or cuts
 * off the player's.
 *
 * The effective gain is state.volume * settingsStore.settings.sfxVolume,
 * multiplied by the caller's volume passed via setVolume(), multiplied by the
 * distance gain for positional loops.
 */
function startLoop(
    effect: SoundEffect,
    state: ISoundEffectState,
    position: THREE.Vector3 | null
): LoopSoundController | null {
    try {
        const ac = getCtx();

        // If the buffer isn't loaded yet, the caller should retry next frame.
        const buffer = pickRandomBuffer(state);
        if (!buffer) return null;

        const attenuation = position ? state.attenuation : undefined;
        const isPositional = attenuation !== undefined;

        // Loop already running — hand back the live controller so re-triggers
        // don't stack up copies of the same loop while it is active.
        if (!isPositional && state.activeLoop) return state.activeLoop;

        const baseVolume = state.volume;
        const defaultFadeDuration = state.defaultFadeDuration;

        let voice: SpatialVoice | null = null;
        if (position && attenuation) {
            voice = new SpatialVoice(ac, attenuation);
            const gain = voice.update(position, true);
            logSpatialSound(effect, 'loop start', distanceFromListenerKm(position), gain);
        }
        let lastDebugLogMs = performance.now();

        const t = ac.currentTime;
        const source = ac.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const gainNode = ac.createGain();
        gainNode.gain.setValueAtTime(baseVolume * settingsStore.settings.sfxVolume, t);

        source.connect(gainNode);
        gainNode.connect(voice ? voice.input : ac.destination);
        source.start(t);

        let _isFadingOut = false;
        let _disposed = false;
        let activeController: LoopSoundController | null = null;

        const clearActive = (): void => {
            if (state.activeLoop === activeController) state.activeLoop = null;
        };

        const release = (): void => {
            source.disconnect();
            gainNode.disconnect();
            voice?.disconnect();
            clearActive();
        };

        const controller: LoopSoundController = {
            get isFadingOut(): boolean {
                return _isFadingOut;
            },

            setVolume(vol: number): void {
                if (_disposed || _isFadingOut) return;
                // Multiply caller's volume by the base volume and global SFX volume.
                gainNode.gain.setValueAtTime(
                    vol * baseVolume * settingsStore.settings.sfxVolume,
                    ac.currentTime
                );
            },

            setPosition(pos: THREE.Vector3): void {
                if (_disposed || !voice) return;
                const gain = voice.update(pos, false);
                if (window.sfxDebug) {
                    const now = performance.now();
                    if (now - lastDebugLogMs >= SFX_DEBUG_LOOP_LOG_INTERVAL_MS) {
                        lastDebugLogMs = now;
                        logSpatialSound(effect, 'loop', distanceFromListenerKm(pos), gain);
                    }
                }
            },

            stop(duration: number = defaultFadeDuration): void {
                if (_disposed) return;
                if (voice && window.sfxDebug)
                    console.info(`[sfx] ${SoundEffect[effect]} loop stop`);
                _isFadingOut = true;
                const now = ac.currentTime;
                // Schedule a linear ramp to 0, then stop + disconnect on completion.
                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                gainNode.gain.linearRampToValueAtTime(0, now + duration);
                // Schedule cleanup after the ramp completes.
                source.stop(now + duration + 0.05);
                setTimeout(
                    () => {
                        if (_disposed) return;
                        _disposed = true;
                        release();
                    },
                    (duration + 0.1) * 1000
                );
            },

            dispose(): void {
                if (_disposed) return;
                if (voice && window.sfxDebug)
                    console.info(`[sfx] ${SoundEffect[effect]} loop dispose`);
                _disposed = true;
                _isFadingOut = true;
                try {
                    source.stop();
                } catch {
                    /* already stopped */
                }
                release();
            },
        };

        if (!isPositional) {
            activeController = controller;
            state.activeLoop = controller;
        }

        return controller;
    } catch {
        console.error('Error playing loop sound');
        return null;
    }
}

/**
 * Shared implementation behind the public play functions.
 *
 * One-shot effects play immediately if their buffer is already decoded; if not,
 * they are marked pending (with their position) and play automatically the
 * moment the buffer becomes ready.  Effects with multiple files in their bank
 * pick a random loaded file on each play.
 */
function playEffect(
    effect: SoundEffect,
    loop: boolean,
    position: THREE.Vector3 | null,
    sourceRadiusKm = 0
): LoopSoundController | null {
    try {
        const ac = getCtx();
        // Get the sound effect state
        const state = soundEffectStates[effect];

        if (!state.loadStarted) {
            state.loadStarted = true;
            // Kick off the fetch + decode for every file in the bank so any of
            // them is ready to play (effects with multiple files pick randomly).
            for (const url of state.soundEffectBank) {
                loadAndCache(ac, url, (buf) => {
                    state.buffers.push(buf);
                    // If a one-shot play was requested before the buffer decoded,
                    // play it now that a file is ready.
                    if (!loop && state.pendingPlay) {
                        state.pendingPlay = false;
                        const ready = pickRandomBuffer(state);
                        if (ready) {
                            playBuffer(
                                ac,
                                effect,
                                ready,
                                state.pendingPosition,
                                state.pendingSourceRadiusKm
                            );
                        }
                        state.pendingPosition = null;
                    }
                });
            }
        }

        if (loop) {
            return startLoop(effect, state, position);
        }

        const buffer = pickRandomBuffer(state);
        if (buffer) {
            playBuffer(ac, effect, buffer, position, sourceRadiusKm);
        } else {
            state.pendingPlay = true;
            state.pendingPosition = position ? position.clone() : null;
            state.pendingSourceRadiusKm = sourceRadiusKm;
        }
        return null;
    } catch {
        console.error(`Error playing sound effect: ${effect}`);
        return null;
    }
}

/**
 * Play a non-positional sound effect (voice prompts, the player's warp loop).
 *
 * @param effect  The sound effect to play.
 * @param loop    When true, starts the effect on a continuous loop and returns
 *                a `LoopSoundController` (or `null` while the buffer is still
 *                decoding — retry each frame until non-null).  When false,
 *                plays the one-shot and returns `null`.
 */
export function playSoundEffect(effect: SoundEffect, loop = false): LoopSoundController | null {
    return playEffect(effect, loop, null);
}

/**
 * Play a one-shot sound effect at a world position (sim units).  Effects with an
 * attenuation profile fade, muffle and pan with distance from the camera, and are
 * not played at all beyond the profile's farKm.
 *
 * @param sourceRadiusKm Radius (km) of the emitting body, for big sources such as a
 *   planet exploding: distance is then measured from its surface rather than its
 *   centre, and the audible range grows with its size (see scaleProfileForSource).
 *   Omit for point-like sources (ships, weapon fire, impacts).
 */
export function playSoundEffectAt(
    effect: SoundEffect,
    position: THREE.Vector3,
    sourceRadiusKm = 0
): void {
    playEffect(effect, false, position, sourceRadiusKm);
}

/**
 * Start a looping sound effect at a world position (sim units).  Returns a
 * per-instance controller (or `null` while the buffer is still decoding — retry
 * each frame); call `setPosition` on it each frame while the source moves.
 */
export function playLoopSoundEffectAt(
    effect: SoundEffect,
    position: THREE.Vector3
): LoopSoundController | null {
    return playEffect(effect, true, position);
}
