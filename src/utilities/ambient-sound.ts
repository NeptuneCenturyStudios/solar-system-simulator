/**
 * Background ambience music manager.
 *
 * Plays a single playlist (space-ambience-1..7.mp3) in a continuous loop:
 * play a random track → wait 60–180s → play another random track → repeat.
 *
 * When the player enters flight mode, if nothing is currently playing or we're
 * in the delay period, a new track starts immediately.  Exit flight mode has
 * no effect on the music.
 *
 * Uses HTMLAudioElement + MediaElementAudioSourceNode for streaming
 * playback with Web-Audio-API gain-node fades.
 *
 * Volume is controlled by `setVolume()` (0–1). When volume is 0 the current
 * track stops and the delay timer is cancelled; when set back > 0 playback
 * resumes with a new track.
 *
 * Scenario overrides
 * ------------------
 * A scenario can temporarily replace the ambient playlist with a track of its
 * own via `playOverride(url, loop)`.  While an override is active the ambient
 * playlist never advances (no inter-track delay, `startPlayback()` is a no-op),
 * and a looping override repeats forever.  `releaseOverride()` drops the
 * override and fades back into the ambient rotation.  Overrides play at the same
 * `musicVolume` as the ambient tracks and honour the 0-volume mute.
 */

import { settingsStore } from '../settings/settings-store';
import { createPlaylistEntry, PLAYLIST_FILENAMES, type PlaylistEntry } from './playlist';

const FADE_DURATION = 1.5; // seconds
const DELAY_MIN = 60; // seconds
const DELAY_MAX = 180; // seconds
const VOLUME = 1; // base internal volume level

type ManagerState = 'idle' | 'fading-out' | 'playing' | 'delaying' | 'paused';

export class AmbientSoundManager {
    private ctx: AudioContext | null = null;
    private gainNode: GainNode | null = null;
    private currentAudio: HTMLAudioElement | null = null;
    private sourceNode: MediaElementAudioSourceNode | null = null;

    private state: ManagerState = 'idle';
    /** Which track index number is currently loaded/playing. */
    private currentTrackIndex: number = -1;
    /** Timer handle for the between-track delay. */
    private delayTimer: ReturnType<typeof setTimeout> | null = null;
    /** True once init() has been called. */
    private initialized = false;
    /** Whether playback is currently paused by the user. */
    isPaused = false;
    /** Called whenever a new track starts playing, with the track's index in the shuffled playlist. */
    onTrackChange: ((index: number) => void) | null = null;
    /** Array of track entries (shuffled at init), initialized once. */
    private playlist: PlaylistEntry[] = [];

    /** URL of the active scenario override track, or null when none is running. */
    private overrideUrl: string | null = null;
    /** Whether the active override loops (false = play once, then return to ambient). */
    private overrideLoop = false;

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Must be called once after a user gesture to satisfy browser autoplay policy.
     * Starts the first random track immediately.
     */
    init(): void {
        if (this.initialized) return;
        this.initialized = true;

        this.setupAudioContext();
        this.initializePlaylist();
        this.playNextTrack();
    }

    /**
     * If nothing is currently playing or we're in the inter-track delay,
     * a new track starts right away.  If a track is already playing, it
     * continues uninterrupted.
     *
     * A scenario override owns the output while it is active, so this is a
     * no-op until the override is released.
     */
    startPlayback(): void {
        if (!this.initialized) return;
        if (this.overrideUrl !== null) return;
        if (this.state === 'idle') {
            this.playNextTrack();
        } else if (this.state === 'delaying') {
            if (this.delayTimer) {
                clearTimeout(this.delayTimer);
                this.delayTimer = null;
            }
            this.state = 'idle';
            this.playNextTrack();
        }
        // state === 'playing' || 'fading-out': nothing to do, music continues
    }

    /**
     * Set the user volume (0–1).  When set to 0 the current track stops
     * and the inter-track delay is cancelled.  When set from 0 back to
     * a positive value playback resumes immediately with a new track.
     */
    setVolume(vol: number): void {
        const clamped = Math.max(0, Math.min(1, vol));

        if (!this.initialized || !this.ctx || !this.gainNode) return;

        // Stop playback entirely when volume is 0
        if (clamped <= 0) {
            // Cancel any pending delay
            if (this.delayTimer) {
                clearTimeout(this.delayTimer);
                this.delayTimer = null;
            }
            // Stop current track immediately
            this.stopCurrentAudio();
            this.state = 'idle';
            return;
        }

        // If we were stopped (idle) because volume was 0, restart playback —
        // the scenario override if one is active, otherwise the next ambient track.
        if (this.state === 'idle') {
            if (this.overrideUrl !== null) {
                this.startAudio(this.overrideUrl, this.overrideLoop, true);
            } else {
                this.playNextTrack();
            }
            return;
        }

        // Otherwise just update the gain node volume
        const now = this.ctx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(VOLUME * clamped, now);
    }

    /**
     * Pause the current track with a fade-out. No-op if already paused or not playing.
     */
    pause(): void {
        if (this.state !== 'playing' || !this.ctx || !this.gainNode || !this.currentAudio) return;
        const now = this.ctx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + FADE_DURATION);
        const audio = this.currentAudio;
        setTimeout(() => {
            audio.pause();
        }, FADE_DURATION * 1000);
        this.state = 'paused';
        this.isPaused = true;
    }

    /**
     * Resume the current track with a fade-in. No-op if not paused.
     */
    resume(): void {
        if (this.state !== 'paused' || !this.ctx || !this.gainNode || !this.currentAudio) return;
        const audio = this.currentAudio;
        audio.play().catch((err) => {
            console.error('Failed to resume audio track:', err);
        });
        const now = this.ctx.currentTime;
        const targetGain = VOLUME * settingsStore.settings.musicVolume;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(targetGain, now + FADE_DURATION);
        this.state = 'playing';
        this.isPaused = false;
    }

    /**
     * Skip to the next track immediately, cancelling any inter-track delay.
     * Picking an ambient track drops any active scenario override.
     */
    skipToNext(): void {
        if (!this.initialized) return;
        this.clearOverrideState();
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }
        this.isPaused = false;
        this.stopCurrentAudio();
        this.state = 'idle';
        this.playNextTrack();
    }

    /**
     * Skip to the previous track (wrapping around to the end), cancelling any delay.
     * Picking an ambient track drops any active scenario override.
     */
    skipToPrev(): void {
        if (!this.initialized) return;
        this.clearOverrideState();
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }
        this.isPaused = false;
        this.stopCurrentAudio();
        this.state = 'idle';
        // Step back two so that pickTrackIndex() (+1) lands on the previous track
        this.currentTrackIndex = this.currentTrackIndex - 2;
        if (this.currentTrackIndex < -1) {
            this.currentTrackIndex = this.playlist.length - 2;
        }
        this.playNextTrack();
    }

    /**
     * Immediately play the track at the given index in the shuffled playlist.
     * Subsequent tracks will play in sequential order from that position.
     * Picking a track drops any active scenario override.
     */
    playTrackAt(index: number): void {
        if (!this.initialized || index < 0 || index >= this.playlist.length) return;
        this.clearOverrideState();
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }
        this.isPaused = false;
        this.stopCurrentAudio();
        this.state = 'idle';
        // Set index one behind so pickTrackIndex() returns the requested index
        this.currentTrackIndex = index - 1;
        this.playNextTrack();
    }

    // ── Scenario override API ────────────────────────────────────────────────

    /**
     * Replace the current track with a scenario-provided track.
     *
     * While the override is active the ambient playlist never advances, so the
     * track keeps playing (or repeating, when `loop` is true).  Respects
     * `musicVolume`: if muted, the override is remembered and starts as soon as
     * the volume is raised.  A non-looping override hands control back to the
     * ambient playlist when it finishes.
     *
     * @param url  Audio URL to play.
     * @param loop When true the track repeats forever (the inter-track delay is
     *             never scheduled because a looping track never fires 'ended').
     */
    playOverride(url: string, loop = false): void {
        if (!this.initialized) return;

        this.setupAudioContext();
        if (!this.ctx || !this.gainNode) return;

        // Cancel any pending inter-track delay so it cannot fire over the override.
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }
        this.state = 'idle';
        this.overrideUrl = url;
        this.overrideLoop = loop;
        this.isPaused = false;

        console.log(`Playing scenario track: ${url} (loop: ${loop})`);

        // Muted: remember the override; setVolume(>0) will start it.
        if (settingsStore.settings.musicVolume <= 0) {
            this.stopCurrentAudio();
            return;
        }

        this.startAudio(url, loop, true);
    }

    /**
     * Drop the active scenario override and fade back into the ambient playlist.
     * No-op when no override is active.
     */
    releaseOverride(): void {
        if (this.overrideUrl === null) return;
        this.clearOverrideState();

        if (!this.initialized) return;

        this.stopCurrentAudio();
        this.state = 'idle';

        if (settingsStore.settings.musicVolume > 0) {
            this.playNextTrack();
        }
    }

    /** True while a scenario override track is active. */
    get hasOverride(): boolean {
        return this.overrideUrl !== null;
    }

    /** Returns a shallow copy of the shuffled playlist. Only valid after init(). */
    getShuffledPlaylist(): PlaylistEntry[] {
        return [...this.playlist];
    }

    /** Returns the index of the currently playing/paused track, or -1 if none. */
    getCurrentTrackIndex(): number {
        return this.currentTrackIndex;
    }

    /** Clean up all resources. */
    dispose(): void {
        if (this.delayTimer) clearTimeout(this.delayTimer);
        this.clearOverrideState();
        this.stopCurrentAudio();
        if (this.gainNode) this.gainNode.disconnect();
        if (this.ctx) this.ctx.close();
        this.ctx = null;
        this.gainNode = null;
        this.initialized = false;
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    private initializePlaylist(): void {
        if (!this.initialized) return;
        this.setupAudioContext();

        // Build PlaylistEntry objects from the raw filename list
        const tempList: PlaylistEntry[] = PLAYLIST_FILENAMES.map(createPlaylistEntry);

        // Fisher-Yates shuffle so the order differs each session
        for (let i = tempList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tempList[i], tempList[j]] = [tempList[j], tempList[i]];
        }

        this.playlist = tempList;
    }

    private setupAudioContext(): void {
        if (this.ctx) return;
        this.ctx = new AudioContext();
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = 0; // silence until first track starts
        this.gainNode.connect(this.ctx.destination);
    }

    /**
     * Pick the next track index in sequence, looping back to the beginning if necessary.
     * This ensures a linear progression through the playlist rather than random selection.
     */
    private pickTrackIndex(): number {
        if (!this.playlist.length) return -1;

        // Advance the index by one until we reach the end of the playout and then go back to the beginning
        let nextIndex = this.currentTrackIndex + 1;
        if (nextIndex >= this.playlist.length) {
            nextIndex = 0;
        }
        return nextIndex;
    }

    /** Forget the scenario override without touching playback. */
    private clearOverrideState(): void {
        this.overrideUrl = null;
        this.overrideLoop = false;
    }

    /**
     * Create the audio element for `url`, wire it into the gain graph and fade it in.
     * Shared by the ambient playlist and scenario overrides.
     *
     * @param isOverride True when this track is a scenario override — such a
     *   non-looping track returns control to the ambient playlist when it ends
     *   instead of scheduling the normal inter-track delay.
     */
    private startAudio(url: string, loop: boolean, isOverride: boolean): void {
        if (!this.ctx || !this.gainNode) return;

        // Stop any leftover audio element
        this.stopCurrentAudio();

        const audio = new Audio(url);
        audio.volume = 1; // we control volume via the gain node
        audio.loop = loop;

        // Wire into the audio graph for fade control
        const source = this.ctx.createMediaElementSource(audio);
        source.connect(this.gainNode);

        this.currentAudio = audio;
        this.sourceNode = source;

        // Start at silence and fade in (respecting user volume)
        const now = this.ctx.currentTime;
        const targetGain = VOLUME * settingsStore.settings.musicVolume;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(targetGain, now + FADE_DURATION);

        this.state = 'playing';
        this.isPaused = false;

        // When the track ends naturally, advance. A looping track never fires this.
        audio.addEventListener('ended', () => {
            if (this.state !== 'playing') return;
            this.state = 'idle';
            this.currentAudio = null;
            this.sourceNode = null;

            if (isOverride) {
                // A non-looping override finishes → hand control back to the ambient playlist.
                this.clearOverrideState();
                if (settingsStore.settings.musicVolume > 0) this.playNextTrack();
                return;
            }

            this.startDelay(() => this.playNextTrack());
        });

        audio.play().catch((err) => {
            // Autoplay policy — should not happen since init() is called after a gesture
            console.error('Failed to play audio track:', err);
            this.dispose();
        });
    }

    /**
     * Play the next track in the shuffled playlist, unless a scenario override
     * currently owns the output.  Extracted from the old inline body so both the
     * normal rotation and the override hand-back share one code path.
     */
    public playNextTrack(): void {
        if (!this.ctx || !this.gainNode || settingsStore.settings.musicVolume === 0) return;
        // A scenario override owns the output until it is released.
        if (this.overrideUrl !== null) return;

        const index = this.pickTrackIndex();
        if (index === -1) return; // no tracks available
        this.currentTrackIndex = index;

        const entry = this.playlist[index];
        console.log(`Playing track: ${entry.url}`);

        this.startAudio(entry.url, false, false);

        // Notify listeners that a new track has started
        this.onTrackChange?.(index);
    }

    /**
     * Wait a random delay, then call the callback.
     */
    private startDelay(callback: () => void): void {
        if (this.state === 'delaying') return;

        const delay = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);
        this.state = 'delaying';

        if (this.delayTimer) clearTimeout(this.delayTimer);
        this.delayTimer = setTimeout(() => {
            this.delayTimer = null;
            if (this.state !== 'delaying') return;
            this.state = 'idle';
            callback();
        }, delay * 1000);
    }

    private stopCurrentAudio(): void {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.src = '';
            this.currentAudio.load();
            this.currentAudio = null;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
    }
}
