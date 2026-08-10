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
 */

import { settingsStore } from '../settings/settings-store';

export enum SoundEffect {
    // Voice prompts
    WarpDriveActive,
    AutopilotEngaged,
    AutopilotDisengaged,
    // Weapon sounds
    WeaponFire,
    WeaponImpact,
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
    /** The active loop controller, or null when no loop is playing. */
    activeLoop: LoopSoundController | null;
}

let ctx: AudioContext | null = null;

/** Base volume for weapon fire/impact (0–1) — multiplied by settingsStore.settings.sfxVolume. */
const WEAPON_VOLUME = 0.8;

/**
 * Contains the states for all sound effects, including their audio buffers,
 * load status, and pending play status.
 */
const soundEffectStates: Record<SoundEffect, ISoundEffectState> = {
    // Voice prompts
    [SoundEffect.WarpDriveActive]: {
        soundEffectBank: [new URL('../assets/sounds/voice/warp-drive-active.mp3', import.meta.url).href],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        activeLoop: null,
    },
    [SoundEffect.AutopilotEngaged]: {
        soundEffectBank: [new URL('../assets/sounds/voice/autopilot-engaged.mp3', import.meta.url).href],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        activeLoop: null,
    },
    [SoundEffect.AutopilotDisengaged]: {
        soundEffectBank: [new URL('../assets/sounds/voice/autopilot-disengaged.mp3', import.meta.url).href],
        buffers: [],
        volume: 1.0,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
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
        activeLoop: null,
    },
    [SoundEffect.WeaponImpact]: {
        soundEffectBank: [
            new URL('../assets/sounds/weapon-blast-1.mp3', import.meta.url).href,
            new URL('../assets/sounds/weapon-blast-2.mp3', import.meta.url).href,
            new URL('../assets/sounds/weapon-blast-3.mp3', import.meta.url).href,
        ],
        buffers: [],
        volume: WEAPON_VOLUME,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        activeLoop: null,
    },
    // Loop sounds
    [SoundEffect.WarpLoop]: {
        soundEffectBank: [new URL('../assets/sounds/warp-loop.wav', import.meta.url).href],
        buffers: [],
        volume: 0.6,
        defaultFadeDuration: 1.5,
        loadStarted: false,
        pendingPlay: false,
        activeLoop: null,
    },
    [SoundEffect.LaserBeam]: {
        soundEffectBank: [new URL('../assets/sounds/laser-beam.wav', import.meta.url).href],
        buffers: [],
        volume: 0.5,
        defaultFadeDuration: 0.15,
        loadStarted: false,
        pendingPlay: false,
        activeLoop: null,
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

/** Pick a random decoded buffer from the effect's bank, or null while nothing is loaded. */
function pickRandomBuffer(state: ISoundEffectState): AudioBuffer | null {
    if (state.buffers.length === 0) return null;
    return state.buffers[Math.floor(Math.random() * state.buffers.length)];
}

// ── Loopable sounds (warp drive, laser beam, ...) ────────────────────────────

/**
 * Controller returned by `playSoundEffect(effect, true)` for managing
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

/**
 * Start playing the effect's bank entry on a continuous loop.
 * Returns a controller or `null` while the buffer is still decoding — the
 * caller should retry next frame (mirrors the warp-loop pattern).
 *
 * Each call creates a new source + gain node pair so multiple loops can play
 * simultaneously (though the same effect's loop is tracked in `activeLoop` and
 * handing back the live controller prevents stack-ups on rapid re-trigger).
 *
 * The effective gain is state.volume * settingsStore.settings.sfxVolume,
 * multiplied by the caller's volume passed via setVolume().
 */
function startLoop(state: ISoundEffectState): LoopSoundController | null {
    try {
        const ac = getCtx();

        // If the buffer isn't loaded yet, the caller should retry next frame.
        const buffer = pickRandomBuffer(state);
        if (!buffer) return null;

        // Loop already running — hand back the live controller so re-triggers
        // don't stack up copies of the same loop while it is active.
        if (state.activeLoop) return state.activeLoop;

        const baseVolume = state.volume;
        const defaultFadeDuration = state.defaultFadeDuration;

        const t = ac.currentTime;
        const source = ac.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const gainNode = ac.createGain();
        gainNode.gain.setValueAtTime(baseVolume * settingsStore.settings.sfxVolume, t);

        source.connect(gainNode);
        gainNode.connect(ac.destination);
        source.start(t);

        let _isFadingOut = false;
        let _disposed = false;
        let activeController: LoopSoundController | null = null;

        const clearActive = (): void => {
            if (state.activeLoop === activeController) state.activeLoop = null;
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
                        clearActive();
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
                clearActive();
            },
        };

        activeController = controller;
        state.activeLoop = controller;

        return controller;
    } catch {
        console.error('Error playing loop sound');
        return null;
    }
}

/**
 * Play a sound effect.
 *
 * @param effect  The sound effect to play.
 * @param loop    When true, starts the effect on a continuous loop and returns
 *                a `LoopSoundController` (or `null` while the buffer is still
 *                decoding — retry each frame until non-null).  When false,
 *                plays the one-shot and returns `null`.
 *
 * One-shot effects play immediately if their buffer is already decoded; if not,
 * they are marked pending and play automatically the moment the buffer becomes
 * ready.  Effects with multiple files in their bank pick a random loaded file
 * on each play.
 */
export function playSoundEffect(effect: SoundEffect, loop = false): LoopSoundController | null {
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
                        if (ready) playBuffer(ac, ready, state.volume);
                    }
                });
            }
        }

        if (loop) {
            return startLoop(state);
        }

        const buffer = pickRandomBuffer(state);
        if (buffer) {
            playBuffer(ac, buffer, state.volume);
        } else {
            state.pendingPlay = true;
        }
        return null;
    } catch {
        console.error(`Error playing sound effect: ${effect}`);
        return null;
    }
}
