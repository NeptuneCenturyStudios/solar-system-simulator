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
 */

const FADE_DURATION = 1.5; // seconds
const DELAY_MIN = 60; // seconds
const DELAY_MAX = 180; // seconds
const VOLUME = 1; // base internal volume level

type ManagerState = 'idle' | 'fading-out' | 'playing' | 'delaying';

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
    /** Array of track URLs, initialized once. */
    private playlist: string[] = [];

    /** User-set volume multiplier (0–1). Applied on top of VOLUME. */
    private _userVolume: number = 1.0;

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
     */
    startPlayback(): void {
        if (!this.initialized) return;
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
     * a positive value a new track starts immediately.
     */
    setVolume(vol: number): void {
        const clamped = Math.max(0, Math.min(1, vol));
        this._userVolume = clamped;

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

        // If we were stopped (idle) because volume was 0, start the next track
        if (this.state === 'idle') {
            this.playNextTrack();
            return;
        }

        // Otherwise just update the gain node volume
        const now = this.ctx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(VOLUME * clamped, now);
    }

    /** Clean up all resources. */
    dispose(): void {
        if (this.delayTimer) clearTimeout(this.delayTimer);
        this.stopCurrentAudio();
        if (this.gainNode) this.gainNode.disconnect();
        if (this.ctx) this.ctx.close();
        this.ctx = null;
        this.gainNode = null;
        this.initialized = false;
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    private buildTrackUrl(filename: string): string {
        const base = new URL('../assets/sounds/music/', import.meta.url).href;
        return `${base}/${filename}`;
    }

    private initializePlaylist(): void {
        if (!this.initialized) return;
        this.setupAudioContext();

        // Initialize the playlist with track URLs
        const tempList = [];

        tempList.push(this.buildTrackUrl('alex-morgan-underwater-dreamscape-537486.mp3'));
        tempList.push(this.buildTrackUrl('cfl_turningpages-submerged-pulse-523340.mp3'));
        tempList.push(this.buildTrackUrl('delosound-space-ambient-cinematic-442834.mp3'));
        tempList.push(this.buildTrackUrl('freemusicforvideo-space-ambient-495614.mp3'));
        tempList.push(this.buildTrackUrl('leberch-space-440026.mp3'));
        tempList.push(this.buildTrackUrl('leberch-space-ambient-509783.mp3'));
        tempList.push(this.buildTrackUrl('monume-space-ambient-498030.mp3'));
        tempList.push(
            this.buildTrackUrl('shadowsandechoes-deep-quest-dark-driving-tension-394142.mp3')
        );
        tempList.push(this.buildTrackUrl('sigmamusicart-tension-background-music-460023.mp3'));
        tempList.push(this.buildTrackUrl('slimeyfox-hydrostatic-drones-479105.mp3'));
        tempList.push(this.buildTrackUrl('the_mountain-spaceship-155569.mp3'));
        tempList.push(this.buildTrackUrl('universfield-haunting-music-box-289437.mp3'));
        tempList.push(this.buildTrackUrl('musheran-low-rumbling-176033.mp3'));
        tempList.push(
            this.buildTrackUrl(
                'nickpanekaiassets-drones-of-dread-dark-cinematic-industrial-ambient-497226.mp3'
            )
        );
        tempList.push(this.buildTrackUrl('vjgalaxy-melodic-techno-09-513318.mp3'));
        tempList.push(this.buildTrackUrl('slimeyfox-hyperwoofer-tremormorph-541638.mp3'));
        tempList.push(
            this.buildTrackUrl('pwlpl-progressive-techno-cinematic-tension-arc-543153.mp3')
        );
        tempList.push(this.buildTrackUrl('absolutesound-cinematic-guitar-adventure-505779.mp3'));
        tempList.push(this.buildTrackUrl('leberch-mysterious-cinematic-255712.mp3'));
        tempList.push(this.buildTrackUrl('cfl_turningpages-vast-hollow-tidal-533251.mp3'));
        tempList.push(this.buildTrackUrl('universfield-ambient-space-background-350710.mp3'));
        tempList.push(this.buildTrackUrl('cfl_turningpages-minimalist-pulse-2-529872.mp3'));
        tempList.push(this.buildTrackUrl('databend-dark-electronic-pulse-background-546935.mp3'));
        tempList.push(this.buildTrackUrl('leberch-atmosphere-pulse-263075.mp3'));
        tempList.push(this.buildTrackUrl('joyinsound-drone-perspectives-399304.mp3'));
        tempList.push(this.buildTrackUrl('fabienroch-nebulous-173888.mp3'));

        // Randomize the playlist order
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

    /**
     * Build the full URL for a given track index.
     */
    private trackUrl(index: number): string {
        // Return the URL of the track at the given index from the playlist.
        return this.playlist[index];
    }

    /**
     * Play a random track.
     */
    public playNextTrack(): void {
        if (!this.ctx || !this.gainNode) return;

        const index = this.pickTrackIndex();
        if (index === -1) return; // no tracks available
        this.currentTrackIndex = index;

        const url = this.trackUrl(index);
        console.log(`Playing track: ${url}`);

        // Stop any leftover audio element
        this.stopCurrentAudio();

        const audio = new Audio(url);
        audio.volume = 1; // we control volume via the gain node
        audio.loop = false;

        // Wire into the audio graph for fade control
        const source = this.ctx.createMediaElementSource(audio);
        source.connect(this.gainNode);

        this.currentAudio = audio;
        this.sourceNode = source;

        // Start at silence and fade in (respecting user volume)
        const now = this.ctx.currentTime;
        const targetGain = VOLUME * this._userVolume;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(targetGain, now + FADE_DURATION);

        this.state = 'playing';

        // When the track ends naturally, start the inter-track delay
        audio.addEventListener('ended', () => {
            if (this.state !== 'playing') return;
            this.state = 'idle';
            this.currentAudio = null;
            this.sourceNode = null;

            this.startDelay(() => this.playNextTrack());
        });

        audio.play().catch((err) => {
            // Autoplay policy — should not happen since init() is called after a gesture
            console.error('Failed to play audio track:', err);
            this.dispose();
        });
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
