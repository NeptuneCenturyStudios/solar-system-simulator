/**
 * Weapon sound effects using the Web Audio API.
 *
 * The blaster fire sound uses spaceship-blaster.wav when available, with a
 * synthesized "pew" as an instant fallback for the first shot (while the
 * file is still loading) or if the fetch fails.
 *
 * The AudioContext is created lazily on first use so it is always triggered
 * by a user gesture, satisfying browser autoplay policy.
 */

let ctx: AudioContext | null = null;
/** Decoded PCM buffer for the blaster WAV, null until loaded. */
let blasterBuffer: AudioBuffer | null = null;
/** Prevents re-fetching if the load is already in progress or done. */
let blasterLoadStarted = false;

function getCtx(): AudioContext {
    if (!ctx) {
        ctx = new AudioContext();
    }
    // Resume if the browser suspended it (common on page load).
    if (ctx.state === 'suspended') {
        void ctx.resume();
    }
    return ctx;
}

/** Fetch and decode the blaster WAV into the cache. */
function loadBlasterSound(ac: AudioContext): void {
    if (blasterLoadStarted) return;
    blasterLoadStarted = true;
    // new URL(..., import.meta.url) tells Vite to include the file in the build
    // and gives the correct URL in both dev and production.
    const wavUrl = new URL('../assets/sounds/spaceship-blaster.wav', import.meta.url).href;
    fetch(wavUrl)
        .then((r) => r.arrayBuffer())
        .then((ab) => ac.decodeAudioData(ab))
        .then((buf) => { blasterBuffer = buf; })
        .catch(() => { /* file missing or decode error — synth fallback will be used */ });
}

/** Play the decoded WAV buffer. */
function playBlasterWav(ac: AudioContext): void {
    const t = ac.currentTime;
    const source = ac.createBufferSource();
    source.buffer = blasterBuffer!;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.8, t);
    source.connect(gain);
    gain.connect(ac.destination);
    source.start(t);
}

/** Synthesized fallback "pew" used before the WAV finishes loading. */
function playBlasterSynth(ac: AudioContext): void {
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(780, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.11);
}

/**
 * Play the weapon fire sound.
 * Uses spaceship-blaster.wav once loaded, synth pew otherwise.
 */
export function playWeaponFire(): void {
    try {
        const ac = getCtx();
        loadBlasterSound(ac); // no-op after first call
        if (blasterBuffer) {
            playBlasterWav(ac);
        } else {
            playBlasterSynth(ac);
        }
    } catch {
        // AudioContext unavailable (non-browser / permissions denied)
    }
}

/**
 * Weapon impact "thud + crack" — low-frequency sine sweep with a short
 * white-noise burst layered on top for texture, ~200 ms total.
 */
export function playWeaponImpact(): void {
    try {
        const ac = getCtx();
        const t = ac.currentTime;

        // Low thud: 160 Hz → 35 Hz
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.18);
        gain.gain.setValueAtTime(0.45, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(t);
        osc.stop(t + 0.19);

        // Short noise crack layered over the thud
        const sampleCount = Math.floor(ac.sampleRate * 0.07);
        const buf = ac.createBuffer(1, sampleCount, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < sampleCount; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = ac.createBufferSource();
        noise.buffer = buf;
        const noiseGain = ac.createGain();
        noiseGain.gain.setValueAtTime(0.3, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        noise.connect(noiseGain);
        noiseGain.connect(ac.destination);
        noise.start(t);
    } catch {
        // AudioContext unavailable
    }
}
