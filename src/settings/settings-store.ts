// settingsStore.ts
import {
    AI_AUTOPILOT_ORBIT_DISTANCE_DEFAULT_M,
    AI_AUTOPILOT_ORBIT_DISTANCE_MAX_M,
    AI_AUTOPILOT_ORBIT_DISTANCE_MIN_M,
    EXPOSURE_DEFAULT,
    EXPOSURE_MAX,
    EXPOSURE_MIN,
    EXPOSURE_STEP,
    RENDER_DISTANCE_DEFAULT_AU,
    RENDER_DISTANCE_MAX_AU,
    RENDER_DISTANCE_MIN_AU,
    RENDER_SCALE_DEFAULT,
    RENDER_SCALE_MAX,
    RENDER_SCALE_MIN,
    RENDER_SCALE_STEP,
} from '../utilities/consts';
// Value import is safe: graphics-presets only imports types from this module.
import { matchGraphicsPreset } from './graphics-presets';

const STORAGE_KEY = 'spaceSimSettings';

export const enum SettingKey {
    ParticleEffectsEnabled = 'particleEffectsEnabled',
    Substeps = 'substeps',
    SfxVolume = 'sfxVolume',
    VoiceVolume = 'voiceVolume',
    MusicVolume = 'musicVolume',
    LensflareEnabled = 'lensflareEnabled',
    SunRaysEnabled = 'sunRaysEnabled',
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
    SteeringTimeScaleEnabled = 'steeringTimeScaleEnabled',
    TargetAssistEnabled = 'targetAssistEnabled',
    CockpitView = 'cockpitView',
    SelectedShipTypeId = 'selectedShipTypeId',
    RenderDistanceAU = 'renderDistanceAU',
    RenderScale = 'renderScale',
    TextureQuality = 'textureQuality',
    ShowOrbitTrails = 'showOrbitTrails',
    ShowOrbitPrediction = 'showOrbitPrediction',
    ShowPlanetNames = 'showPlanetNames',
    AutopilotMode = 'autopilotMode',
    AutopilotOrbitMode = 'autopilotOrbitMode',
    AutopilotOrbitDistanceM = 'autopilotOrbitDistanceM',
    CloudQuality = 'cloudQuality',
    ShadowQuality = 'shadowQuality',
    ShipCollisionMode = 'shipCollisionMode',
    HdrEnabled = 'hdrEnabled',
    ToneMapping = 'toneMapping',
    Exposure = 'exposure',
    DistantBodyDetail = 'distantBodyDetail',
    ShowFps = 'showFps',
    ShowRenderInfo = 'showRenderInfo',
    NamePanelUpdateRate = 'namePanelUpdateRate',
}

/**
 * The curve that maps the linear HDR scene onto the screen.
 *
 * - `agx`     — keeps very bright, saturated colours (red dwarfs, blue giants) from skewing
 *               toward white or yellow. Slightly desaturated overall.
 * - `aces`    — ACES Filmic: punchier contrast, but bright colours shift hue.
 * - `neutral` — Khronos PBR Neutral: colours closest to how they were authored; only the
 *               highlights are compressed.
 *
 * Declared here rather than in the effects layer so the settings store stays dependency-free.
 */
export type ToneMappingMode = 'agx' | 'aces' | 'neutral';

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

/**
 * How cloud layers are drawn. All tiers draw the same procedural clouds in the same places.
 *
 * - `low`    — a flat sphere shaded by the cloud coverage. About the cost of a textured sphere.
 * - `medium` — volumetric ray-marched clouds with light self-shadowing.
 * - `high`   — volumetric with twice the samples and detailed self-shadowing.
 *
 * Bodies that are small on screen always use the flat layer.
 * Declared here rather than in the effects layer so the settings store stays dependency-free.
 */
export type CloudQuality = 'low' | 'medium' | 'high';

/**
 * How shadows are drawn.
 * - `off`  — no shadows (identical to having no shadow code at all).
 * - `low`  — analytic eclipse shadows, plus a ship shadow map for the nearest ship.
 * - `high` — eclipses, plus a larger ship shadow map for up to four ships with softer edges.
 */
export type ShadowQuality = 'off' | 'low' | 'high';

/**
 * How two ships' hulls are tested against each other once their bounding spheres overlap.
 * - `triangle` — the models' actual triangles: ships only touch where they are drawn.
 * - `box`      — each hull's oriented bounding box. Much cheaper against very detailed models
 *                (e.g. the World Destroyer), but concave hulls collide with the empty space in
 *                their box.
 *
 * Declared here rather than in the physics layer so the settings store stays dependency-free.
 */
export type ShipCollisionMode = 'triangle' | 'box';

/**
 * How early bodies that are small on screen drop to cheaper rendering (see drawing/body-lod.ts).
 * - `low`    — switches early: bodies become dots and low-poly spheres at twice the usual size.
 * - `medium` — the default thresholds.
 * - `high`   — keeps full detail down to half the usual size.
 *
 * Declared here rather than in the drawing layer so the settings store stays dependency-free.
 */
export type DistantBodyDetail = 'low' | 'medium' | 'high';

/**
 * How often body name panels refresh their distance text (NAME_PANEL_TEXT_INTERVAL_MS). Panel
 * position always follows its body every frame; only the text, and so the canvas repaint and
 * texture upload, is throttled.
 * - `low`    — 4× a second.
 * - `medium` — 10× a second.
 * - `high`   — every frame.
 */
export type NamePanelUpdateRate = 'low' | 'medium' | 'high';

export interface SpaceSimSettings {
    particleEffectsEnabled: boolean;
    substeps: number;
    /** Sound effects volume (0–1): weapons, impacts, explosions, warp loop. */
    sfxVolume: number;
    /** Voice prompt volume (0–1): ship computer and scenario voice lines. */
    voiceVolume: number;
    musicVolume: number;
    lensflareEnabled: boolean;
    /** Screen-space rays streaming from stars that are large on screen. */
    sunRaysEnabled: boolean;
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
     * Ship steering (yaw, pitch, roll, stick smoothing and banking) advances on sim time instead of
     * wall time, so slowing time slows the turn rate and speeding it up raises it. Frame-rate
     * independent either way. Off restores the fixed real-time turn rate at any time scale.
     * Applies to the player and every AI ship.
     */
    steeringTimeScaleEnabled: boolean;
    /**
     * While a threat is inside the steering circle, the player's shots aim at its intercept point
     * instead of along the reticle — the Tab-locked target first, else the threat nearest the
     * reticle. The reticle and steering are unaffected.
     */
    targetAssistEnabled: boolean;
    /** The flight camera starts in the cockpit (true) instead of 3rd person. Saved when C toggles the view. */
    cockpitView: boolean;
    /** Ship type preselected in the Flight Controls dropdown. Validated against the ship registry by the bridge. */
    selectedShipTypeId: string;
    /** Camera far plane in AU. Anything farther from the camera than this is not drawn. */
    renderDistanceAU: number;
    /**
     * Fraction of the window resolution the 3D scene is drawn at (RENDER_SCALE_MIN..MAX). The HUD
     * stays at full resolution.
     */
    renderScale: number;
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
    /** How cloud layers are drawn (flat or volumetric). */
    cloudQuality: CloudQuality;
    /** How shadows (eclipses, ship shadows) are drawn. */
    shadowQuality: ShadowQuality;
    /** How ship-vs-ship contact tests the hulls (triangle mesh or oriented boxes). */
    shipCollisionMode: ShipCollisionMode;
    /**
     * Capture the scene in half-float, so light brighter than white rolls off through the tone
     * curve instead of clipping. Off uses an 8-bit capture (half the bandwidth). Forced off when
     * the GPU can't render to half-float targets.
     */
    hdrEnabled: boolean;
    /** Tone-mapping curve for the final image. */
    toneMapping: ToneMappingMode;
    /** Exposure multiplier applied before tone mapping (EXPOSURE_MIN..MAX). */
    exposure: number;
    /** How early small-on-screen bodies drop to low-poly spheres and dots. */
    distantBodyDetail: DistantBodyDetail;
    /** Show the FPS counter in the top-right corner. */
    showFps: boolean;
    /** Show the render-info readout (frame time, draw calls, triangles, LOD counts) under the FPS counter. */
    showRenderInfo: boolean;
    /** How often body name panels refresh their distance text. */
    namePanelUpdateRate: NamePanelUpdateRate;
}

const defaultSettings: SpaceSimSettings = {
    particleEffectsEnabled: true,
    substeps: 64,
    sfxVolume: 0.5,
    voiceVolume: 1.0,
    musicVolume: 0.5,
    lensflareEnabled: true,
    sunRaysEnabled: true,
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
    steeringTimeScaleEnabled: true,
    targetAssistEnabled: false,
    cockpitView: false,
    selectedShipTypeId: 'zenith',
    renderDistanceAU: RENDER_DISTANCE_DEFAULT_AU,
    renderScale: RENDER_SCALE_DEFAULT,
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
    cloudQuality: 'medium',
    shadowQuality: 'low',
    shipCollisionMode: 'triangle',
    hdrEnabled: true,
    toneMapping: 'neutral',
    exposure: EXPOSURE_DEFAULT,
    distantBodyDetail: 'medium',
    // The counter has always been shown; the detailed readout is for diagnosing performance.
    showFps: true,
    showRenderInfo: false,
    namePanelUpdateRate: 'medium',
};

/** Normalise a stored tone-mapping curve, falling back to `neutral` for anything unrecognised. */
export function normalizeToneMapping(value: unknown): ToneMappingMode {
    return value === 'aces' || value === 'neutral' ? value : 'neutral';
}

/** Clamp an exposure to the supported range and snap it to the slider step. */
export function clampExposure(exposure: number): number {
    if (!Number.isFinite(exposure)) return EXPOSURE_DEFAULT;
    const snapped = Math.round(exposure / EXPOSURE_STEP) * EXPOSURE_STEP;
    return Math.round(Math.min(Math.max(snapped, EXPOSURE_MIN), EXPOSURE_MAX) * 100) / 100;
}

/** Normalise a stored texture quality, falling back to `low` for anything unrecognised. */
export function normalizeTextureQuality(value: unknown): TextureQuality {
    return value === 'high' ? 'high' : 'low';
}

/** Clamp a render distance to the supported range, falling back to the default for non-finite input. */
export function clampRenderDistanceAU(au: number): number {
    if (!Number.isFinite(au)) return RENDER_DISTANCE_DEFAULT_AU;
    return Math.min(Math.max(au, RENDER_DISTANCE_MIN_AU), RENDER_DISTANCE_MAX_AU);
}

/**
 * Clamp a render scale to the supported range and snap it to the slider step, falling back to the
 * default for non-finite input.
 */
export function clampRenderScale(scale: number): number {
    if (!Number.isFinite(scale)) return RENDER_SCALE_DEFAULT;
    const snapped = Math.round(scale / RENDER_SCALE_STEP) * RENDER_SCALE_STEP;
    // Rounded again so the stored value is 0.75, not 0.7500000000000001.
    return Math.round(Math.min(Math.max(snapped, RENDER_SCALE_MIN), RENDER_SCALE_MAX) * 100) / 100;
}

/** Normalise a stored cloud quality, falling back to `medium` for anything unrecognised. */
export function normalizeCloudQuality(value: unknown): CloudQuality {
    return value === 'low' || value === 'high' ? value : 'medium';
}

/** Normalise a stored shadow quality, falling back to `low` for anything unrecognised. */
export function normalizeShadowQuality(value: unknown): ShadowQuality {
    return value === 'off' || value === 'high' ? value : 'low';
}

/** Normalise a stored distant-body detail level, falling back to `medium` for anything unrecognised. */
export function normalizeDistantBodyDetail(value: unknown): DistantBodyDetail {
    return value === 'low' || value === 'high' ? value : 'medium';
}

/** Normalise a stored name-panel update rate, or null when it is missing or unrecognised. */
export function normalizeNamePanelUpdateRate(value: unknown): NamePanelUpdateRate | null {
    return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

/**
 * The name-panel update rate for a save made before the setting existed: the level of the
 * graphics preset the save's other values match, so a Low or High preset still shows as that
 * preset (rather than Custom) now that the rate is part of the presets. Custom gets `medium`.
 */
function namePanelUpdateRateForPreset(data: SpaceSimSettings): NamePanelUpdateRate {
    for (const preset of ['low', 'medium', 'high'] as const) {
        const candidate = { ...data, namePanelUpdateRate: preset };
        if (matchGraphicsPreset(candidate) === preset) return preset;
    }
    return 'medium';
}

/** Normalise a stored ship collision mode, falling back to `triangle` for anything unrecognised. */
export function normalizeShipCollisionMode(value: unknown): ShipCollisionMode {
    return value === 'box' ? 'box' : 'triangle';
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
        this.data.renderScale = clampRenderScale(this.data.renderScale);
        this.data.textureQuality = normalizeTextureQuality(this.data.textureQuality);
        this.data.cockpitView = this.data.cockpitView === true;
        this.data.autopilotMode = normalizeAutopilotMode(this.data.autopilotMode);
        this.data.cloudQuality = normalizeCloudQuality(this.data.cloudQuality);
        this.data.shadowQuality = normalizeShadowQuality(this.data.shadowQuality);
        this.data.shipCollisionMode = normalizeShipCollisionMode(this.data.shipCollisionMode);
        this.data.autopilotOrbitMode = normalizeAutopilotOrbitMode(this.data.autopilotOrbitMode);
        this.data.autopilotOrbitDistanceM = clampAutopilotOrbitDistanceM(
            this.data.autopilotOrbitDistanceM
        );
        this.data.hdrEnabled = this.data.hdrEnabled !== false;
        this.data.toneMapping = normalizeToneMapping(this.data.toneMapping);
        this.data.exposure = clampExposure(this.data.exposure);
        this.data.distantBodyDetail = normalizeDistantBodyDetail(this.data.distantBodyDetail);
        this.data.showFps = this.data.showFps !== false;
        this.data.showRenderInfo = this.data.showRenderInfo === true;
        // Normalised last: the preset fallback compares the other (already normalised) values.
        this.data.namePanelUpdateRate =
            normalizeNamePanelUpdateRate(this.data.namePanelUpdateRate) ??
            namePanelUpdateRateForPreset(this.data);
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
