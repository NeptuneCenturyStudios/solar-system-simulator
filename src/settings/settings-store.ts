// settingsStore.ts
import {
    AI_AUTOPILOT_ORBIT_DISTANCE_DEFAULT_M,
    AI_AUTOPILOT_ORBIT_DISTANCE_MAX_M,
    AI_AUTOPILOT_ORBIT_DISTANCE_MIN_M,
    RENDER_DISTANCE_DEFAULT_AU,
    RENDER_DISTANCE_MAX_AU,
    RENDER_DISTANCE_MIN_AU,
} from '../utilities/consts';

const STORAGE_KEY = 'spaceSimSettings';

export const enum SettingKey {
    ParticleEffectsEnabled = 'particleEffectsEnabled',
    Substeps = 'substeps',
    SfxVolume = 'sfxVolume',
    MusicVolume = 'musicVolume',
    LensflareEnabled = 'lensflareEnabled',
    AuroraEnabled = 'auroraEnabled',
    AuroraDetail = 'auroraDetail',
    FrameRateLimit = 'frameRateLimit',
    ShowAiDebug = 'showAiDebug',
    PhysicsSolver = 'physicsSolver',
    BarnesHutTheta = 'barnesHutTheta',
    SmoothZoomEnabled = 'smoothZoomEnabled',
    HidePanelManagerInFlight = 'hidePanelManagerInFlight',
    ChaseModeEnabled = 'chaseModeEnabled',
    CoastDriftAlignEnabled = 'coastDriftAlignEnabled',
    TargetAssistEnabled = 'targetAssistEnabled',
    RenderDistanceAU = 'renderDistanceAU',
    TextureQuality = 'textureQuality',
    ShowOrbitTrails = 'showOrbitTrails',
    ShowOrbitPrediction = 'showOrbitPrediction',
    ShowPlanetNames = 'showPlanetNames',
    AutopilotMode = 'autopilotMode',
    AutopilotOrbitMode = 'autopilotOrbitMode',
    AutopilotOrbitDistanceM = 'autopilotOrbitDistanceM',
}

/**
 * Which autopilot flies the player's ship.
 *
 * - `classic` — the original phase machine (Spaceship.autopilotStep), which writes the ship's
 *               velocity directly. Bodies only.
 * - `shipAi`  — the Ship AI autopilot (simulation/ai/autopilot-ship-ai.ts), which flies through
 *               the same control inputs as a pilot and can also target ships.
 */
export type AutopilotMode = 'classic' | 'shipAi';

/**
 * How the Ship AI autopilot holds position around a celestial body. Ships are always circled
 * under power ('artificial'), since they have no gravity to orbit.
 */
export type AutopilotOrbitMode = 'natural' | 'artificial';

/**
 * Body-texture quality tier.
 *
 * - `low`  — the 2k assets, always present. The only tier available in a browser.
 * - `high` — the best asset available per texture: 8k, else 4k, else 2k. Desktop only.
 *
 * Declared here rather than in the drawing layer so the settings store stays
 * dependency-free, matching `PhysicsSolverMode` and `AuroraDetailMode`.
 */
export type TextureQuality = 'low' | 'high';

/**
 * Which gravity solver the n-body engine uses.
 *
 * - `direct`     — exact all-pairs O(N²). No interaction dropped, no approximation.
 * - `cutoff`     — exact between significant masses, skips dust-on-dust pairs. O(M² + M·T).
 * - `barnes-hut` — octree multipole approximation. O(N log N) at any mass distribution.
 *
 * Declared here rather than in the physics layer so the settings store stays dependency-free.
 */
export type PhysicsSolverMode = 'direct' | 'cutoff' | 'barnes-hut';

/**
 * How much per-pixel work the aurora curtains are allowed to do.
 *
 * - `static`  — every band still gets its own height, brightness and colour, but they hold
 *               those values forever. The curtain only drifts and writhes, as it always has.
 * - `dynamic` — band heights and brightness breathe independently, and the bright/dim arcs
 *               migrate around the oval. Compiles a larger fragment shader.
 *
 * Declared here rather than in the effects layer so the settings store stays dependency-free.
 */
export type AuroraDetailMode = 'static' | 'dynamic';

export interface SpaceSimSettings {
    particleEffectsEnabled: boolean;
    substeps: number;
    sfxVolume: number;
    musicVolume: number;
    lensflareEnabled: boolean;
    /** Draw aurora curtains around the magnetic poles of bodies that have a field and an atmosphere. */
    auroraEnabled: boolean;
    /** How much per-pixel work the aurora curtains do. Ignored when `auroraEnabled` is false. */
    auroraDetail: AuroraDetailMode;
    /** Maximum frames per second (0 = unlimited). */
    frameRateLimit: number;
    /** Draw the ship-AI obstacle avoidance overlay (lookahead corridor, hazard sphere, heading). */
    showAiDebug: boolean;
    /** Gravity solver used by the n-body engine. */
    physicsSolver: PhysicsSolverMode;
    /** Barnes-Hut opening angle. Lower is more accurate and slower. Ignored by other solvers. */
    barnesHutTheta: number;
    /** Ease camera zoom (wheel + System Explorer buttons) instead of snapping instantly. */
    smoothZoomEnabled: boolean;
    /**
     * Hide the PanelManager (toolbar card + open panel) while the player is in flight mode,
     * restoring it on exit. Bookkeeping lives in vue/ui-store.ts, which owns visibility.
     */
    hidePanelManagerInFlight: boolean;
    /** Holding S with a locked target pursues it instead of braking; Shift+S pursues at boost speed. */
    chaseModeEnabled: boolean;
    /**
     * While coasting (no thrust/boost/brake), rotate sideways drift into the nose axis at the
     * ship's flightPerpDecay rate, preserving speed. Applies to the player and every AI ship.
     * Off restores free inertial drift (needed to free-fall into an orbit).
     */
    coastDriftAlignEnabled: boolean;
    /**
     * While a threat is inside the steering circle, the player's shots aim at its intercept point
     * instead of along the reticle — the Tab-locked target first, else the threat nearest the
     * reticle. The reticle and steering are unaffected.
     */
    targetAssistEnabled: boolean;
    /** Camera far plane in AU. Anything farther from the camera than this is not drawn. */
    renderDistanceAU: number;
    /** Body-texture quality tier. `high` is only honoured on desktop (see texture-quality.ts). */
    textureQuality: TextureQuality;
    /** Draw the orbit trail behind every celestial body (System Explorer). */
    showOrbitTrails: boolean;
    /** Draw the predicted Keplerian orbit line for every orbiting body (System Explorer). */
    showOrbitPrediction: boolean;
    /** Show the name/distance panel above every body (System Explorer, N key). */
    showPlanetNames: boolean;
    /** Which autopilot engages on Hold E / "Fly here". */
    autopilotMode: AutopilotMode;
    /** Ship AI autopilot: natural (gravity) or artificial (powered) orbit around bodies. */
    autopilotOrbitMode: AutopilotOrbitMode;
    /** Ship AI autopilot: artificial orbit distance in meters, surface (or hull) to hull. */
    autopilotOrbitDistanceM: number;
}

const defaultSettings: SpaceSimSettings = {
    particleEffectsEnabled: true,
    substeps: 64,
    sfxVolume: 1.0,
    musicVolume: 0.5,
    lensflareEnabled: true,
    auroraEnabled: true,
    // The ribbons cover few pixels even at close range, so the animated bands are cheap enough
    // to be the default. Static is there for machines where every fragment counts.
    auroraDetail: 'dynamic',
    frameRateLimit: 0,
    showAiDebug: false,
    // Exact for everything that measurably matters, and degrades to all-pairs on its own
    // when every body has comparable mass — so it is safe as the default in any scenario.
    physicsSolver: 'cutoff',
    barnesHutTheta: 0.5,
    smoothZoomEnabled: true,
    // Flight mode has its own HUD, and the panel would otherwise cover the view the player
    // just entered the cockpit to look at.
    hidePanelManagerInFlight: true,
    chaseModeEnabled: true,
    coastDriftAlignEnabled: true,
    targetAssistEnabled: false,
    renderDistanceAU: RENDER_DISTANCE_DEFAULT_AU,
    // Low is the safe default: it is the only tier a browser can use, and installing the
    // desktop build should not silently jump to multi-megabyte textures nobody asked for.
    textureQuality: 'low',
    // Same display defaults the System Explorer has always started with: trails on,
    // prediction and names off.
    showOrbitTrails: true,
    showOrbitPrediction: false,
    showPlanetNames: false,
    // Classic until the Ship AI autopilot has been proven in play.
    autopilotMode: 'classic',
    autopilotOrbitMode: 'natural',
    autopilotOrbitDistanceM: AI_AUTOPILOT_ORBIT_DISTANCE_DEFAULT_M,
};

/** Normalise a stored texture quality, falling back to `low` for anything unrecognised. */
export function normalizeTextureQuality(value: unknown): TextureQuality {
    return value === 'high' ? 'high' : 'low';
}

/** Clamp a render distance to the supported range, falling back to the default for non-finite input. */
export function clampRenderDistanceAU(au: number): number {
    if (!Number.isFinite(au)) return RENDER_DISTANCE_DEFAULT_AU;
    return Math.min(Math.max(au, RENDER_DISTANCE_MIN_AU), RENDER_DISTANCE_MAX_AU);
}

/** Normalise a stored autopilot mode, falling back to `classic` for anything unrecognised. */
export function normalizeAutopilotMode(value: unknown): AutopilotMode {
    return value === 'shipAi' ? 'shipAi' : 'classic';
}

/** Normalise a stored orbit mode, falling back to `natural` for anything unrecognised. */
export function normalizeAutopilotOrbitMode(value: unknown): AutopilotOrbitMode {
    return value === 'artificial' ? 'artificial' : 'natural';
}

/** Clamp an orbit distance to the supported range, falling back to the default for non-finite input. */
export function clampAutopilotOrbitDistanceM(m: number): number {
    if (!Number.isFinite(m)) return AI_AUTOPILOT_ORBIT_DISTANCE_DEFAULT_M;
    return Math.min(
        Math.max(m, AI_AUTOPILOT_ORBIT_DISTANCE_MIN_M),
        AI_AUTOPILOT_ORBIT_DISTANCE_MAX_M
    );
}

class SettingsStore {
    private data: SpaceSimSettings;

    constructor() {
        const raw = localStorage.getItem(STORAGE_KEY);
        this.data = raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
        // A hand-edited or stale save must not be able to put the far plane out of range.
        this.data.renderDistanceAU = clampRenderDistanceAU(this.data.renderDistanceAU);
        this.data.textureQuality = normalizeTextureQuality(this.data.textureQuality);
        this.data.autopilotMode = normalizeAutopilotMode(this.data.autopilotMode);
        this.data.autopilotOrbitMode = normalizeAutopilotOrbitMode(this.data.autopilotOrbitMode);
        this.data.autopilotOrbitDistanceM = clampAutopilotOrbitDistanceM(
            this.data.autopilotOrbitDistanceM
        );
    }

    get settings(): SpaceSimSettings {
        return this.data;
    }

    update<K extends keyof SpaceSimSettings>(key: K, value: SpaceSimSettings[K]) {
        this.data[key] = value;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    }
}

export const settingsStore = new SettingsStore();
