/**
 * Weapon and warp sound effects using the Web Audio API.
 * Audio files are loaded and decoded once on first use, then cached.
 * The AudioContext is created lazily so it is always triggered by a user
 * gesture, satisfying browser autoplay policy.
 */

let ctx: AudioContext | null = null;
let blasterBuffer: AudioBuffer | null = null;
let blasterLoadStarted = false;
/** One entry per impact file; fills in as each decodes. */
const impactBuffers: AudioBuffer[] = [];
let impactLoadStarted = false;
let warpBuffer: AudioBuffer | null = null;
let warpLoadStarted = false;

const IMPACT_FILES = [
    '../assets/sounds/weapon-blast-1.mp3',
    '../assets/sounds/weapon-blast-2.mp3',
    '../assets/sounds/weapon-blast-3.mp3',
] as const;

function getCtx(): AudioContext {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
}

function loadAndCache(
    ac: AudioContext,
    url: string,
    onReady: (buf: AudioBuffer) => void
): void {
    fetch(url)
        .then((r) => r.arrayBuffer())
        .then((ab) => ac.decodeAudioData(ab))
        .then(onReady)
        .catch(() => {});
}

function playBuffer(ac: AudioContext, buffer: AudioBuffer, gain = 0.8): void {
    const t = ac.currentTime;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const gainNode = ac.createGain();
    gainNode.gain.setValueAtTime(gain, t);
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
            loadAndCache(ac, url, (buf) => { blasterBuffer = buf; });
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
                loadAndCache(ac, url, (buf) => { impactBuffers.push(buf); });
            }
        }
        if (impactBuffers.length === 0) return;
        const buf = impactBuffers[Math.floor(Math.random() * impactBuffers.length)];
        playBuffer(ac, buf);
    } catch {
        console.error('Error playing weapon impact sound');
    }
}

// ── Warp loop sound ──────────────────────────────────────────────────────────

/** Default volume for the warp loop (0–1). */
const WARP_VOLUME = 0.6;
/** Fade-out duration in seconds when warp ends. */
const WARP_FADE_DURATION = 1.5;

/**
 * Controller returned by `playWarpLoop()` for managing a looping warp sound.
 */
export interface WarpSoundController {
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

/**
 * Start playing the warp-loop sound on a continuous loop.
 * Returns a controller or `null` if loading fails.
 *
 * The first call triggers a fetch+decode; subsequent calls use the cached buffer.
 * Each call creates a new source + gain node pair so multiple ships can warp
 * simultaneously (though only one ship exists in practice).
 */
export function playWarpLoop(): WarpSoundController | null {
    try {
        const ac = getCtx();

        // Kick off loading on first call
        if (!warpLoadStarted) {
            warpLoadStarted = true;
            const url = new URL('../assets/sounds/warp-loop-1.mp3', import.meta.url).href;
            loadAndCache(ac, url, (buf) => { warpBuffer = buf; });
        }

        // If the buffer isn't loaded yet, the caller should retry next frame
        if (!warpBuffer) return null;

        const t = ac.currentTime;
        const source = ac.createBufferSource();
        source.buffer = warpBuffer;
        source.loop = true;

        const gainNode = ac.createGain();
        gainNode.gain.setValueAtTime(WARP_VOLUME, t);

        source.connect(gainNode);
        gainNode.connect(ac.destination);
        source.start(t);

        let _isFadingOut = false;
        let _disposed = false;

        const controller: WarpSoundController = {
            get isFadingOut(): boolean {
                return _isFadingOut;
            },

            setVolume(vol: number): void {
                if (_disposed || _isFadingOut) return;
                gainNode.gain.setValueAtTime(vol * WARP_VOLUME, ac.currentTime);
            },

            stop(duration: number = WARP_FADE_DURATION): void {
                if (_disposed) return;
                _isFadingOut = true;
                const now = ac.currentTime;
                // Schedule a linear ramp to 0, then stop + disconnect on completion.
                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                gainNode.gain.linearRampToValueAtTime(0, now + duration);
                // Schedule cleanup after the ramp completes.
                source.stop(now + duration + 0.05);
                setTimeout(() => {
                    if (_disposed) return;
                    _disposed = true;
                    source.disconnect();
                    gainNode.disconnect();
                }, (duration + 0.1) * 1000);
            },

            dispose(): void {
                if (_disposed) return;
                _disposed = true;
                _isFadingOut = true;
                try { source.stop(); } catch { /* already stopped */ }
                source.disconnect();
                gainNode.disconnect();
            },
        };

        return controller;
    } catch {
        console.error('Error playing warp loop sound');
        return null;
    }
}
