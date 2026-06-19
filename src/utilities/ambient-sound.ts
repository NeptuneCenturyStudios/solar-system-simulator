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
 */

const FADE_DURATION = 1.5; // seconds
const DELAY_MIN = 60; // seconds
const DELAY_MAX = 180; // seconds
const VOLUME = 0.4;

type ManagerState = 'idle' | 'fading-out' | 'playing' | 'delaying';

export class AmbientSoundManager {
    private ctx: AudioContext | null = null;
    private gainNode: GainNode | null = null;
    private currentAudio: HTMLAudioElement | null = null;
    private sourceNode: MediaElementAudioSourceNode | null = null;

    private state: ManagerState = 'idle';
    /** Which track index number is currently loaded/playing. */
    private currentTrackIndex: number | null = null;
    /** Timer handle for the between-track delay. */
    private delayTimer: ReturnType<typeof setTimeout> | null = null;
    /** True once init() has been called. */
    private initialized = false;
    /** Array of track URLs, initialized once. */
    private playlist: string[] = [];

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
     * Called when the player enters flight mode.
     * If nothing is currently playing or we're in the inter-track delay,
     * a new track starts right away.  If a track is already playing, it
     * continues uninterrupted.
     */
    enterFlightMode(): void {
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
        return  `${base}/${filename}`;
    }

    private initializePlaylist(): void {
        if (!this.initialized) return;
        this.setupAudioContext();

        // Initialize the playlist with track URLs
        this.playlist = [];

        this.playlist.push(this.buildTrackUrl('alex-morgan-underwater-dreamscape-537486.mp3'));
        this.playlist.push(this.buildTrackUrl('cfl_turningpages-submerged-pulse-523340.mp3'));
        this.playlist.push(this.buildTrackUrl('delosound-space-ambient-cinematic-442834.mp3'));
        this.playlist.push(this.buildTrackUrl('freemusicforvideo-space-ambient-495614.mp3'));
        this.playlist.push(this.buildTrackUrl('leberch-space-440026.mp3'));
        this.playlist.push(this.buildTrackUrl('leberch-space-ambient-509783.mp3'));
        this.playlist.push(this.buildTrackUrl('monume-space-ambient-498030.mp3'));
        this.playlist.push(this.buildTrackUrl('shadowsandechoes-deep-quest-dark-driving-tension-394142.mp3'));
        this.playlist.push(this.buildTrackUrl('sigmamusicart-tension-background-music-460023.mp3'));
        this.playlist.push(this.buildTrackUrl('slimeyfox-hydrostatic-drones-479105.mp3'));
        this.playlist.push(this.buildTrackUrl('the_mountain-spaceship-155569.mp3'));
        this.playlist.push(this.buildTrackUrl('universfield-haunting-music-box-289437.mp3'));
        this.playlist.push(this.buildTrackUrl('musheran-low-rumbling-176033.mp3'));
        this.playlist.push(this.buildTrackUrl('nickpanekaiassets-drones-of-dread-dark-cinematic-industrial-ambient-497226.mp3'));
        this.playlist.push(this.buildTrackUrl('vjgalaxy-melodic-techno-09-513318.mp3'));
        this.playlist.push(this.buildTrackUrl('slimeyfox-hyperwoofer-tremormorph-541638.mp3'));
        this.playlist.push(this.buildTrackUrl('pwlpl-progressive-techno-cinematic-tension-arc-543153.mp3'));
        this.playlist.push(this.buildTrackUrl('absolutesound-cinematic-guitar-adventure-505779.mp3'));
        this.playlist.push(this.buildTrackUrl('leberch-mysterious-cinematic-255712.mp3'));

    }

    private setupAudioContext(): void {
        if (this.ctx) return;
        this.ctx = new AudioContext();
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = 0; // silence until first track starts
        this.gainNode.connect(this.ctx.destination);
    }

    /**
     * Pick a random track index that differs from the one currently (or last) playing.
     */
    private pickTrackIndex(): number {
        if (!this.playlist.length) return -1;

        let idx: number;
        do {
            idx = Math.floor(Math.random() * this.playlist.length);
        } while (idx === this.currentTrackIndex);
        return idx;
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
    private playNextTrack(): void {
        if (!this.ctx || !this.gainNode) return;

        const index = this.pickTrackIndex();
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

        // Start at silence and fade in
        const now = this.ctx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(VOLUME, now + FADE_DURATION);

        this.state = 'playing';

        // When the track ends naturally, start the inter-track delay
        audio.addEventListener('ended', () => {
            if (this.state !== 'playing') return;
            this.state = 'idle';
            this.currentAudio = null;
            this.sourceNode = null;

            this.startDelay(() => this.playNextTrack());
        });

        audio.play().catch(() => {
            // Autoplay policy — should not happen since init() is called after a gesture
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
