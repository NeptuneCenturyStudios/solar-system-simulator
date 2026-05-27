/**
 * Weapon sound effects using the Web Audio API.
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
    } catch {}
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
    } catch {}
}
