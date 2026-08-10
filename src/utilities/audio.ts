/**
 * Weapon and warp sound effects using the Web Audio API.
 * Audio files are loaded and decoded once on first use, then cached.
 * The AudioContext is created lazily so it is always triggered by a user
 * gesture, satisfying browser autoplay policy.
 *
 * Volume is controlled by the global settingsStore.settings.sfxVolume (0–1).
 * When sfxVolume is 0, no sounds play.
 */

import { settingsStore } from '../settings/settings-store';

export enum SoundEffect {
    WarpDriveActive,
    AutopilotEngaged,
    AutopilotDisengaged,
}

type SoundEffectBank = string[];

interface ISoundEffectState {
    soundEffectBank: SoundEffectBank;
    buffer: AudioBuffer | null;
    loadStarted: boolean;
    pendingPlay: boolean;
}

let ctx: AudioContext | null = null;
let blasterBuffer: AudioBuffer | null = null;
let blasterLoadStarted = false;
/** One entry per impact file; fills in as each decodes. */
const impactBuffers: AudioBuffer[] = [];
let impactLoadStarted = false;

const IMPACT_FILES = [
    '../assets/sounds/weapon-blast-1.mp3',
    '../assets/sounds/weapon-blast-2.mp3',
    '../assets/sounds/weapon-blast-3.mp3',
] as const;

/** Resolved URLs for loop-capable sound assets. */
const WARP_LOOP_URL = new URL('../assets/sounds/warp-loop-1.mp3', import.meta.url).href;
const LASER_BEAM_URL = new URL('../assets/sounds/laser-beam.mp3', import.meta.url).href;

/** Decoded-buffer cache for loop-capable sounds, keyed by asset URL. */
interface ILoopBufferCacheEntry {
    buffer: AudioBuffer | null;
    loadStarted: boolean;
}
const loopBufferCache = new Map<string, ILoopBufferCacheEntry>();

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

function playBuffer(ac: AudioContext, buffer: AudioBuffer, baseGain = 0.8): void {
    // Respect global SFX volume: if 0, don't play anything
    const vol = settingsStore.settings.sfxVolume;
    if (vol <= 0) return;

    const t = ac.currentTime;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const gainNode = ac.createGain();
    gainNode.gain.setValueAtTime(baseGain * vol, t);
    source.connect(gainNode);
    gainNode.connect(ac.destination);
    source.start(t);
}

/** Play the weapon fire sound (spaceship-blaster.wav). */
export function playWeaponFire(): void {
    try {
        const ac = getCtx();
        if (!blasterLoadStarted) {
            blasterLoadStarted = true;
            const url = new URL('../assets/sounds/spaceship-blaster.wav', import.meta.url).href;
            loadAndCache(ac, url, (buf) => {
                blasterBuffer = buf;
            });
        }
        if (blasterBuffer) playBuffer(ac, blasterBuffer);
    } catch {
        console.error('Error playing weapon fire sound');
    }
}

/** Play the weapon impact sound — picks randomly from the loaded buffers. */
export function playWeaponImpact(): void {
    try {
        const ac = getCtx();
        if (!impactLoadStarted) {
            impactLoadStarted = true;
            for (const path of IMPACT_FILES) {
                const url = new URL(path, import.meta.url).href;
                loadAndCache(ac, url, (buf) => {
                    impactBuffers.push(buf);
                });
            }
        }
        if (impactBuffers.length === 0) return;
        const buf = impactBuffers[Math.floor(Math.random() * impactBuffers.length)];
        playBuffer(ac, buf);
    } catch {
        console.error('Error playing weapon impact sound');
    }
}

// ── Loopable sounds (warp drive, laser beam, ...) ────────────────────────────

/**
 * Controller returned by `playSoundLoop()` / `playLaserBeamLoop()` for managing
 * a looping sound.
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
     */
    setVolume(vol: number): void;
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

/** Base volume for the warp loop (0–1) — multiplied by settingsStore.settings.sfxVolume at play time. */
const WARP_VOLUME = 0.6;
/** Fade-out duration in seconds when warp ends. */
const WARP_FADE_DURATION = 1.5;
/** Base volume for the laser beam loop (0–1) — multiplied by settingsStore.settings.sfxVolume. */
const LASER_BEAM_VOLUME = 0.5;
/** Fade-out duration in seconds when the beam is cut — short to avoid a click. */
const LASER_BEAM_FADE_DURATION = 0.15;

/**
 * Start playing a sound file on a continuous loop.
 * Returns a controller or `null` if loading fails.
 *
 * The first call for a given URL triggers a fetch+decode; subsequent calls use
 * the cached buffer.  Each call creates a new source + gain node pair so
 * multiple loops can play simultaneously (though only one ship exists in
 * practice).
 *
 * The effective gain is baseVolume * settingsStore.settings.sfxVolume, multiplied
 * by the caller's volume passed via setVolume().
 */
export function playSoundLoop(
    url: string,
    baseVolume: number,
    defaultFadeDuration = 0.15
): LoopSoundController | null {
    try {
        const ac = getCtx();

        // Kick off (or reuse) the fetch + decode for this URL.
        let entry = loopBufferCache.get(url);
        if (!entry) {
            entry = { buffer: null, loadStarted: false };
            loopBufferCache.set(url, entry);
        }
        if (!entry.loadStarted) {
            entry.loadStarted = true;
            loadAndCache(ac, url, (buf) => {
                const cached = loopBufferCache.get(url);
                if (cached) cached.buffer = buf;
            });
        }

        // If the buffer isn't loaded yet, the caller should retry next frame.
        if (!entry.buffer) return null;

        // Compute initial gain including global SFX volume.
        const initialGain = baseVolume * settingsStore.settings.sfxVolume;

        const t = ac.currentTime;
        const source = ac.createBufferSource();
        source.buffer = entry.buffer;
        source.loop = true;

        const gainNode = ac.createGain();
        gainNode.gain.setValueAtTime(initialGain, t);

        source.connect(gainNode);
        gainNode.connect(ac.destination);
        source.start(t);

        let _isFadingOut = false;
        let _disposed = false;

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

            stop(duration: number = defaultFadeDuration): void {
                if (_disposed) return;
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
                        source.disconnect();
                        gainNode.disconnect();
                    },
                    (duration + 0.1) * 1000
                );
            },

            dispose(): void {
                if (_disposed) return;
                _disposed = true;
                _isFadingOut = true;
                try {
                    source.stop();
                } catch {
                    /* already stopped */
                }
                source.disconnect();
                gainNode.disconnect();
            },
        };

        return controller;
    } catch {
        console.error('Error playing loop sound');
        return null;
    }
}

/**
 * Start playing the warp-loop sound on a continuous loop.
 * Returns a controller or `null` if loading fails.
 *
 * The first call triggers a fetch+decode; subsequent calls use the cached buffer.
 * Each call creates a new source + gain node pair so multiple ships can warp
 * simultaneously (though only one ship exists in practice).
 *
 * The effective gain is WARP_VOLUME * settingsStore.settings.sfxVolume, multiplied
 * by the caller's speedVolume × distanceFade passed via setVolume().
 */
export function playWarpLoop(): WarpSoundController | null {
    return playSoundLoop(WARP_LOOP_URL, WARP_VOLUME, WARP_FADE_DURATION);
}

/**
 * Start playing the laser-beam sound on a continuous loop while the beam is
 * active.  Returns a controller or `null` if loading fails; call stop() (or
 * dispose()) on the returned controller when the beam is cut.
 */
export function playLaserBeamLoop(): LoopSoundController | null {
    return playSoundLoop(LASER_BEAM_URL, LASER_BEAM_VOLUME, LASER_BEAM_FADE_DURATION);
}

/**
 * Contains the states for all sound effects, including their audio buffers, load status, and pending play status.
 */
const soundEffectStates: Record<SoundEffect, ISoundEffectState> = {
    // Voice prompts
    [SoundEffect.WarpDriveActive]: {
        buffer: null,
        loadStarted: false,
        pendingPlay: false,
        soundEffectBank: [new URL('../assets/sounds/voice/warp-drive-active.mp3', import.meta.url).href],
    },
    [SoundEffect.AutopilotEngaged]: {
        buffer: null,
        loadStarted: false,
        pendingPlay: false,
        soundEffectBank: [new URL('../assets/sounds/voice/autopilot-engaged.mp3', import.meta.url).href],
    },
    [SoundEffect.AutopilotDisengaged]: {
        buffer: null,
        loadStarted: false,
        pendingPlay: false,
        soundEffectBank: [new URL('../assets/sounds/voice/autopilot-disengaged.mp3', import.meta.url).href],
    },
    // Other sound effects
    // TODO: Move other sound effects here
};

/**
 * Play a sound effect once.
 */
export function playSoundEffect(effect: SoundEffect): void {
    try {
        const ac = getCtx();
        // Get the sound effect state
        const state = soundEffectStates[effect];

        if (!state.loadStarted) {
            state.loadStarted = true;
            // For now, there is only one sound effect per bank, so we just use the first one.
            // TODO: If there are more than 1 in the bank, we might want to select one randomly or based on some criteria.
            const url = state.soundEffectBank[0];

            // Load the selected sound effect URL into the audio context and play when it is ready.
            loadAndCache(ac, url, (buf) => {
                state.buffer = buf;
                if (state.pendingPlay) {
                    state.pendingPlay = false;
                    playBuffer(ac, buf, 1.0);
                }
            });
        }
        if (state.buffer) {
            playBuffer(ac, state.buffer, 1.0);
        } else {
            state.pendingPlay = true;
        }
    } catch {
        console.error(`Error playing sound effect: ${effect}`);
    }
}
