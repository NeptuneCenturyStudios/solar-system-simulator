import { reactive } from 'vue';

import { BodyTypeEnum } from '../bodies/body-enums';
import { Body } from '../bodies/body';
import { probeScanStatusLabel } from '../bodies/probe-scan-status';
import type { IBodyAttributeRow } from '../bodies/body-attribute-display';
import { SHIP_TYPES } from '../bodies/ships/ship-registry';
import { generateRandomCustomBodyName } from '../procedural/custom-body-naming';
import {
    autopilotState,
    cameraState,
    flightState,
    simulationState,
} from '../simulation/simulation';
import { getBodyTypeLabel } from '../utilities/utilities';
import type { IMagneticFieldOptions, ISimStateSnapshot } from '../interfaces';
import type { IAtmosphereProfile } from '../procedural/atmosphere-profile';
import { ScenarioLock } from '../interfaces';
import { scenarioManager } from '../scenarios/scenario-manager';
import { environmentState } from '../simulation/environment-state';
import {
    AuroraDetailMode,
    PhysicsSolverMode,
    SettingKey,
    settingsStore,
} from '../settings/settings-store';
import type { PlaylistEntry } from '../utilities/playlist';

/**
 * Plain, serialisable snapshot of a simulation body. Vue reactivity cannot
 * track the live `Body` objects (they are non-reactive Three.js objects mutated
 * in place), so the bridge copies the interesting fields into reactive plain
 * objects on a poll interval and on the documented window events.
 */
export interface BodySnapshot {
    id: string;
    name: string;
    typeLabel: string;
    mass: number;
    radius: number;
    speed: number;
    isShip: boolean;
    /** True for "real" celestial bodies — excludes ships, satellites, and probes. Drives both
     *  the probe-mission target dropdown and the System Explorer's attributes (info) button,
     *  since "can be probed" and "can be scanned" are the same set. */
    isProbeTarget: boolean;
    /** Probe scan status — "Scanning… 12s", "Scan complete", or "Out of scan range" — or
     *  null for every non-probe body. Drives the System Explorer status line, and is derived
     *  from the same helper as the HUD name panel so the two can never disagree. */
    scanStatusLabel: string | null;
}

export interface SurfaceCameraSnapshot {
    isActive: boolean;
    /** True when the currently selected body is eligible for surface view. */
    isEnabled: boolean;
}

/** Rich snapshot of a body for the edit form. This crosses the sim boundary so
 *  Vue never touches live Three.js `Body` objects directly. */
export interface BodyEditSnapshot {
    id: string;
    name: string;
    isStar: boolean;
    isAsteroid: boolean;
    isComet: boolean;
    /** True when the body has a `rotation.tilt` (CelestialBody-derived). */
    hasTilt: boolean;
    mass: number;
    radius: number;
    /** Star-only surface temperature (K). */
    temperature: number | null;
    /** Star-only light intensity. */
    lightIntensity: number | null;
    /** Current speed magnitude (u/s). */
    velocity: number;
    /** Orbital direction angle in the XZ plane (degrees, 0–360). */
    orbitalAngle: number;
    /** Inclination above the XZ plane (degrees). */
    inclination: number;
    tilt: number;
    azimuth: number;
    /** True when this body type can carry a magnetic field (star/planet/dwarf/moon). */
    canHaveMagneticField: boolean;
    /** The body's dipole magnetic field, or null when it has none. */
    magneticField: IMagneticFieldOptions | null;
    /** The body's atmosphere (radius relative to the body, pressure in bar), or null when it
     *  has none. Edit mode can tune an existing atmosphere but never add or remove one. */
    atmosphere: IAtmosphereProfile | null;
    /** True for gas/ice giants, whose "surface" pressure is the cloud-top pressure. */
    atmosphereIsCloudTop: boolean;
    /** Comet tail main color as a hex string (comets only). */
    tailColorHex: string | null;
    /** Readable type label e.g. "Planet". */
    typeLabel: string;
}

/** Rich snapshot backng the Phase 3.3 attributes modal. Built on the sim side (which owns the
 *  body classes and the live orbital/rotation periods) and handed to Vue as plain rows. */
export interface BodyAttributesSnapshot {
    bodyId: string;
    bodyName: string;
    typeLabel: string;
    /** Always-known physical data: type, sub type, mass, radius, star temperature. */
    basicRows: IBodyAttributeRow[];
    /** Discoverable science rows; undiscovered entries carry the "???" placeholder. */
    scienceRows: IBodyAttributeRow[];
    /** False when the body carries no science payload at all (stars, black holes, wormholes). */
    hasScienceData: boolean;
}

/** Payload for creating a custom body from the add form. Mirrors the old
 *  management panel's `createBody` event exactly. */
export interface CreateBodyPayload {
    bodyType: string;
    /**
     * Name typed/edited in the add form. Null/empty means "generate one procedurally"
     * (the sim falls back to a deterministic name seeded by the new body's id).
     */
    customName?: string | null;
    planetType: string;
    orbitType: string;
    inclination: number;
    /** Atmosphere for planets/moons, or null for none. Temperate and gas/ice giants always get
     *  one (a null is ignored for them). */
    atmosphere: IAtmosphereProfile | null;
    hasRings: boolean;
    customMass: number | null;
    customTemperature: number | null;
    customLightIntensity: number | null;
    customRadius: number | null;
    /** Parent body id for orbit (moon parent / custom orbit parent). */
    orbitParentId: string | null;
    createTilt: number | null;
    createAzimuth: number | null;
    /** Dipole magnetic field, or null when the checkbox is unchecked / not applicable. */
    magneticField: IMagneticFieldOptions | null;
    /** Comet tail main color as a hex string (comets only). */
    tailColor?: string | null;
}

/** Payload for applying an edit. Mirrors the old panel's `applyEdit` event. */
export interface ApplyBodyEditPayload {
    name: string;
    mass: number;
    temperature: number | null;
    lightIntensity: number | null;
    radius: number | null;
    velocity: number | null;
    orbitalAngle: number | null;
    inclination: number | null;
    /** Comet tail main color as a hex string (comets only). */
    tailColor: string | null;
    /** Star-flag mirrors the old panel's isStarBody; radius cap differs for stars. */
    isStarBody: boolean;
    editTilt: number | null;
    editAzimuth: number | null;
    /** Dipole magnetic field, or null to clear it. Undefined leaves it untouched. */
    magneticField?: IMagneticFieldOptions | null;
    /** New radius/pressure for an existing atmosphere. Undefined leaves it untouched; a body
     *  without an atmosphere ignores it. */
    atmosphere?: IAtmosphereProfile;
}

/** Freshly-randomized preview values for the add-custom form, keyed by `bodyType`. Mirrors the
 *  old panel's `randomizeCreateBodyInputs()`/`randomizeCustomStarValues()` output. */
export interface RandomizedCreateDefaults {
    mass: number | null;
    radius: number | null;
    temperature: number | null;
    lightIntensity: number | null;
    tilt: number | null;
    azimuth: number | null;
    inclination: number | null;
    hasAtmosphere: boolean;
    /** Rolled atmosphere values, pre-filled into the atmosphere controls (used when
     *  hasAtmosphere is on, or always for subtypes that force an atmosphere). Null for body
     *  types that never have one. */
    atmosphere: IAtmosphereProfile | null;
    hasRings: boolean;
    /** Randomized field, or null when this body type never has one (checkbox comes up unchecked). */
    magneticField: IMagneticFieldOptions | null;
    planetType: string | null;
    moonType: string | null;
}

export interface VueSimHooks {
    /** Toggle sim pause (flips the same state the P key / bottom toolbar uses). */
    togglePause?: () => void;
    /** Set the simulation time scale (same path as the bottom toolbar speed buttons). */
    setTimeScale?: (value: number) => void;
    /** Set the gravity multiplier G (same path as the Management panel slider). */
    setGMultiplier?: (value: number) => void;
    /** Select & focus a body (same path as clicking a row in the old Bodies table). */
    selectBody?: (body: Body) => void;

    // ── System Explorer (same event paths as the old panel) ────────────────
    /** Toggle camera Target mode (gizmo visibility). */
    toggleTargetMode?: () => void;
    /** Toggle camera Look At mode (orbit around the selected body). */
    toggleLookAtMode?: () => void;
    /** Toggle free camera mode. */
    toggleFreeCameraMode?: () => void;
    /** Toggle surface camera mode; no-op when the selection is ineligible. */
    toggleSurfaceCamera?: () => void;
    zoomIn?: () => void;
    zoomOut?: () => void;
    setLockToSun?: (checked: boolean) => void;
    setShowTrails?: (checked: boolean) => void;
    setShowOrbitPrediction?: (checked: boolean) => void;
    setShowNames?: (checked: boolean) => void;
    /** Autopilot ("Fly here") to the given body; re-firing on the target cancels. */
    flyToBody?: (body: Body) => void;
    /** Re-enter the given spaceship. */
    enterShip?: (body: Body) => void;
    /** Surface camera enablement depends on the current selection. */
    getSurfaceCameraState?: () => SurfaceCameraSnapshot;

    // ── Flight Controls (same event paths as the old panel) ────────────────
    /** Spawn (or re-enter) a spaceship of the currently selected type. */
    spawnShip?: () => void;
    /** Engage autopilot toward the current selection, or cancel if already active. */
    toggleAutopilot?: () => void;
    /** Exit flight mode (restores normal camera controls). */
    exitFlightMode?: () => void;
    /** Re-launch the system by showing the StartupModal with Cancel enabled. */
    relaunch?: () => void;

    // ── Add/Edit Body (same sim paths as the old management panel) ─────────
    /** Load a rich edit snapshot for the given body (used in edit mode). */
    getBodyEditSnapshot?: (bodyId: string) => BodyEditSnapshot | null;
    /** Resolve a body's basic + discoverable science rows for the attributes modal. */
    getBodyAttributesSnapshot?: (bodyId: string) => BodyAttributesSnapshot | null;
    /** Create a custom body from the add-form payload; resolves to the new body id. */
    createBody?: (payload: CreateBodyPayload) => string | null;
    /** Create a preset body (presets like Sun/Mercury/Earth); resolves to the new body id. */
    createPresetBody?: (presetKey: string) => string | null;
    /** Launch a probe mission toward targetId at the given altitude (km); resolves to the new probe's id. */
    launchProbeMission?: (targetId: string, altitudeKm: number) => string | null;
    /** Apply an edit to an existing body (same behavior as the old Apply button). */
    applyBodyEdit?: (bodyId: string, payload: ApplyBodyEditPayload) => void;
    /** Delete a body by id (same behavior as the old Delete button). */
    deleteBodyById?: (bodyId: string) => void;
    /** Re-roll add-custom form preview values for the given body type (old Randomize button). */
    getRandomizedCreateDefaults?: (bodyType: string) => RandomizedCreateDefaults;

    // ── Solar System Management (same sim paths as the old management panel) ─
    /** Toggle Kuiper belt point-cloud visibility. */
    setKuiperBeltVisible?: (checked: boolean) => void;
    /** Show/hide the skydome background texture. */
    setSpaceBackgroundVisible?: (checked: boolean) => void;
    /** Load & apply a new skydome background texture by filename. */
    setSpaceTexture?: (texturePath: string) => void;
    /** Toggle natural star death (fuel burn → stellar remnants). */
    setStarDeathEnabled?: (checked: boolean) => void;

    // ── Options (persisted user settings; same paths as the old panel) ──────
    /** Toggle particle effects (persisted via settingsStore). */
    setParticleEffectsEnabled?: (checked: boolean) => void;
    /** Toggle lens flares (persisted via settingsStore). */
    setLensflareEnabled?: (checked: boolean) => void;
    /** Toggle polar aurorae (persisted via settingsStore). */
    setAuroraEnabled?: (checked: boolean) => void;
    /** Select how much per-pixel work the aurora curtains do (persisted via settingsStore). */
    setAuroraDetail?: (mode: AuroraDetailMode) => void;
    /** Set physics substeps per frame (persisted via settingsStore). */
    setSubsteps?: (value: number) => void;
    /** Select the gravity solver (persisted via settingsStore). */
    setPhysicsSolver?: (mode: PhysicsSolverMode) => void;
    /** Set the Barnes-Hut opening angle (persisted via settingsStore). */
    setBarnesHutTheta?: (value: number) => void;
    /** Set sound effects volume, 0–100 percent (persisted via settingsStore). */
    setSfxVolume?: (percent: number) => void;
    /** Set background music volume, 0–100 percent. Also applied to the live
     *  AmbientSoundManager, which only picks up changes via setVolume(). */
    setMusicVolume?: (percent: number) => void;
    /** Set the maximum frames per second (0 = unlimited). */
    setFrameRateLimit?: (value: number) => void;
    /** Toggle the ship-AI obstacle avoidance debug overlay (persisted via settingsStore). */
    setShowAiDebug?: (checked: boolean) => void;
    /** Toggle eased/smooth camera zoom vs. instant (persisted via settingsStore). */
    setSmoothZoomEnabled?: (checked: boolean) => void;
    /** Toggle hiding the PanelManager while in flight mode (persisted via settingsStore). */
    setHidePanelManagerInFlight?: (checked: boolean) => void;
    /** Toggle S-key chase mode when a target is locked (persisted via settingsStore). */
    setChaseModeEnabled?: (checked: boolean) => void;

    // ── Playlist (same sim paths as the old playlist panel) ─────────────────
    /** Snapshot of the shuffled playlist + current playback state. */
    getPlaylistSnapshot?: () => PlaylistSnapshot;
    /** Skip to the previous track. */
    playlistPrev?: () => void;
    /** Skip to the next track. */
    playlistNext?: () => void;
    /** Pause the current track, or resume if paused. */
    playlistTogglePlayPause?: () => void;
    /** Immediately play the track at the given shuffled-playlist index. */
    playlistSelectTrack?: (index: number) => void;
}

/** Snapshot of the background-music playlist state, mirrored into
 *  `playlistStore` for the Vue PlaylistPanel. */
export interface PlaylistSnapshot {
    /** Shuffled playlist entries (same order as the legacy panel). */
    entries: PlaylistEntry[];
    /** Index of the current track in the shuffled list, or -1 if none. */
    currentIndex: number;
    /** True when a track is actively playing (not paused). */
    isPlaying: boolean;
}

const SNAPSHOT_INTERVAL_MS = 100;

const hookRegistry: VueSimHooks = {};

/** Called once from index.ts after the sim UI is initialised. */
export function registerVueSimHooks(hooks: VueSimHooks): void {
    Object.assign(hookRegistry, hooks);
}

/** Shape of the reactive store exposed to Vue components. */
export interface VueSimStore {
    bodies: BodySnapshot[];
    selectedId: string | null;
    timeScale: number;
    /** Speed used when paused (timeScale is 0 while paused); also the base the
     *  toolbar halve/double buttons operate on, matching the old UI. */
    savedTimeScale: number;
    isPaused: boolean;
    gMultiplier: number;
    inFlight: boolean;

    // ── Camera modes (mirror cameraState) ──────────────────────────────────
    isTargetMode: boolean;
    isLookAtMode: boolean;
    isFreeCameraMode: boolean;
    lockToSun: boolean;
    surfaceActive: boolean;
    surfaceEnabled: boolean;

    // ── Display options ────────────────────────────────────────────────────
    showNames: boolean;
    showTrails: boolean;
    showOrbitPrediction: boolean;

    // ── Solar System Management (environment settings) ─────────────────────
    kuiperBeltVisible: boolean;
    spaceBackgroundVisible: boolean;
    spaceTextureFilename: string | null;
    starDeathEnabled: boolean;

    // ── Options (persisted user settings, mirrored from settingsStore) ─────
    particleEffectsEnabled: boolean;
    lensflareEnabled: boolean;
    auroraEnabled: boolean;
    /** How much per-pixel work the aurora curtains do. */
    auroraDetail: AuroraDetailMode;
    /** Physics substeps per frame. */
    substeps: number;
    /** Gravity solver used by the n-body engine. */
    physicsSolver: PhysicsSolverMode;
    /** Barnes-Hut opening angle; only meaningful when physicsSolver is 'barnes-hut'. */
    barnesHutTheta: number;
    /** Sound effects volume as 0–100 percent. */
    sfxVolumePercent: number;
    /** Background music volume as 0–100 percent. */
    musicVolumePercent: number;
    /** Maximum frames per second (0 = unlimited). */
    frameRateLimit: number;
    /** Draw the ship-AI obstacle avoidance debug overlay. */
    showAiDebug: boolean;
    /** Ease camera zoom instead of snapping instantly. */
    smoothZoomEnabled: boolean;
    /** Hide the PanelManager while in flight mode, restoring it on exit. */
    hidePanelManagerInFlight: boolean;
    /** Holding S with a locked target pursues it instead of braking; Shift+S pursues at boost speed. */
    chaseModeEnabled: boolean;

    /** Id of the autopilot target body, or null when autopilot is off. */
    autopilotTargetId: string | null;

    // ── Flight Controls ─────────────────────────────────────────────────────
    /** Registry id of the ship type currently chosen in the dropdown. */
    selectedShipTypeId: string;
    /** True when a spawned ship still exists in the simulation (spawn/enter/autopilot enablement). */
    hasKnownShip: boolean;
    /** Registry id of the known ship's type, or null if none exists. */
    knownShipTypeId: string | null;

    /** Actions the active scenario (if any) has locked. Mirrors scenarioManager.activeLocks. */
    lockedActions: Set<ScenarioLock>;
}

const state = reactive<VueSimStore>({
    bodies: [] as BodySnapshot[],
    selectedId: null as string | null,
    timeScale: 1,
    savedTimeScale: 1,
    isPaused: false,
    gMultiplier: 1,
    inFlight: false,
    isTargetMode: false,
    isLookAtMode: false,
    isFreeCameraMode: false,
    lockToSun: false,
    surfaceActive: false,
    surfaceEnabled: false,
    showNames: false,
    // Same display defaults as the old panel's HTML checkboxes.
    showTrails: true,
    showOrbitPrediction: false,
    // Environment defaults mirror environmentState's initial values.
    kuiperBeltVisible: false,
    spaceBackgroundVisible: true,
    spaceTextureFilename: null as string | null,
    starDeathEnabled: false,
    // Options mirror settingsStore (persisted in localStorage) at startup; the
    // Vue Options panel is the only live writer afterwards.
    particleEffectsEnabled: settingsStore.settings.particleEffectsEnabled,
    lensflareEnabled: settingsStore.settings.lensflareEnabled,
    auroraEnabled: settingsStore.settings.auroraEnabled,
    auroraDetail: settingsStore.settings.auroraDetail,
    substeps: settingsStore.settings.substeps,
    physicsSolver: settingsStore.settings.physicsSolver,
    barnesHutTheta: settingsStore.settings.barnesHutTheta,
    sfxVolumePercent: Math.round(settingsStore.settings.sfxVolume * 100),
    musicVolumePercent: Math.round(settingsStore.settings.musicVolume * 100),
    frameRateLimit: settingsStore.settings.frameRateLimit,
    showAiDebug: settingsStore.settings.showAiDebug,
    smoothZoomEnabled: settingsStore.settings.smoothZoomEnabled,
    hidePanelManagerInFlight: settingsStore.settings.hidePanelManagerInFlight,
    chaseModeEnabled: settingsStore.settings.chaseModeEnabled,
    autopilotTargetId: null as string | null,
    selectedShipTypeId: SHIP_TYPES[0].id,
    hasKnownShip: false,
    knownShipTypeId: null as string | null,
    lockedActions: new Set<ScenarioLock>(),
});

/**
 * Reactive store consumed by the Vue UI. Mutations are confined to this module;
 * components only read it.
 */
export const simStore: VueSimStore = state;

/** Reactive store backing the add/edit body panel. `snapshot` is loaded by the
 *  bridge when edit mode opens; create/edit actions are forwarded to index.ts
 *  hooks so the Vue layer never touches live `Body` objects. */
export interface BodyEditorStore {
    snapshot: BodyEditSnapshot | null;
}

const bodyEditorState = reactive<BodyEditorStore>({
    snapshot: null,
});

/** Reactive store consumed by AddEditBodyPanel. */
export const bodyEditorStore: BodyEditorStore = bodyEditorState;

/** Reactive store backing the Phase 3.3 attributes modal. `snapshot` is re-read on every poll
 *  tick while the modal is open, so a probe scan completing mid-view flips "???" to real
 *  values without the user reopening it. */
export interface BodyAttributesStore {
    snapshot: BodyAttributesSnapshot | null;
}

const bodyAttributesState = reactive<BodyAttributesStore>({
    snapshot: null,
});

/** Reactive store consumed by BodyAttributesModal. */
export const bodyAttributesStore: BodyAttributesStore = bodyAttributesState;

/** Id of the body whose attributes modal is open, or null when it is closed. */
let openAttributesBodyId: string | null = null;

/** Open the attributes modal for `bodyId`, seeding the snapshot immediately so the first
 *  render is populated rather than waiting up to one poll tick. */
export function openBodyAttributes(bodyId: string): void {
    openAttributesBodyId = bodyId;
    bodyAttributesState.snapshot = hookRegistry.getBodyAttributesSnapshot?.(bodyId) ?? null;
}

/** Close the attributes modal and stop live-refreshing its snapshot. */
export function closeBodyAttributes(): void {
    openAttributesBodyId = null;
    bodyAttributesState.snapshot = null;
}

/** Re-read the open modal's snapshot, closing it if the body no longer exists. */
function refreshAttributesSnapshot(): void {
    if (!openAttributesBodyId) return;
    const snapshot = hookRegistry.getBodyAttributesSnapshot?.(openAttributesBodyId) ?? null;
    if (!snapshot) {
        closeBodyAttributes();
        return;
    }
    bodyAttributesState.snapshot = snapshot;
}

/** Reactive store backing the Playlist panel. Mirrors the live
 *  AmbientSoundManager state (shuffled entries + current track + playing). */
export interface PlaylistStore {
    entries: PlaylistEntry[];
    currentIndex: number;
    isPlaying: boolean;
}

const playlistState = reactive<PlaylistStore>({
    entries: [] as PlaylistEntry[],
    currentIndex: -1,
    isPlaying: false,
});

/** Reactive store consumed by PlaylistPanel. */
export const playlistStore: PlaylistStore = playlistState;

function snapshotBodies(): void {
    const selected = (() => {
        const focus = cameraState.focusBody;
        if (focus && !focus._isDisposed && simulationState.bodies.some((b) => b === focus)) {
            return focus;
        }
        return null;
    })();

    state.selectedId = selected ? selected.id : null;

    state.bodies = simulationState.bodies
        .filter((b) => b && !b._isDisposed && b.mesh)
        .map((b) => ({
            id: b.id,
            name: b.name || 'Unnamed',
            typeLabel: getBodyTypeLabel(b),
            mass: b.mass,
            radius: b.radius,
            speed: b.velocity ? b.velocity.length() : 0,
            isShip: b.bodyType === BodyTypeEnum.SpaceShip,
            isProbeTarget: !(
                b.bodyType &
                (BodyTypeEnum.SpaceShip | BodyTypeEnum.Satellite | BodyTypeEnum.Probe)
            ),
            scanStatusLabel: probeScanStatusLabel(b),
        }));
}

function refreshScalarState(): void {
    state.timeScale = simulationState.timeScale;
    state.savedTimeScale = simulationState.savedTimeScale;
    state.isPaused = simulationState.isPaused;
    state.gMultiplier = simulationState.gMultiplier;
}

function refreshCameraState(): void {
    state.isTargetMode = cameraState.isTargetMode;
    state.isLookAtMode = cameraState.isLookAtMode;
    state.isFreeCameraMode = cameraState.isFreeCameraMode;
    state.lockToSun = cameraState.lockToSun;
    state.showNames = simulationState.showNames;
    state.inFlight = flightState.isActive;
    state.autopilotTargetId = autopilotState.targetBody ? autopilotState.targetBody.id : null;

    const surface = hookRegistry.getSurfaceCameraState?.();
    state.surfaceActive = surface?.isActive ?? false;
    state.surfaceEnabled = surface?.isEnabled ?? false;

    const ship = flightState.knownShip;
    state.hasKnownShip = !!(ship && !ship._isDisposed && simulationState.bodies.includes(ship));
    state.knownShipTypeId = state.hasKnownShip ? (ship?.shipTypeId ?? null) : null;
}

/** Mirrors the active scenario's locked actions so components can disable
 *  buttons without importing scenarioManager directly. */
function refreshScenarioLockState(): void {
    state.lockedActions = new Set(scenarioManager.activeLocks);
}

/** Whether the active scenario (if any) has locked the given action. */
export function isActionLocked(lock: ScenarioLock): boolean {
    return state.lockedActions.has(lock);
}

/** Copy environment settings into the reactive store for the Vue UI. */
function refreshEnvironmentState(): void {
    state.kuiperBeltVisible = environmentState.kuiperBeltVisible;
    state.spaceBackgroundVisible = environmentState.spaceBackgroundVisible;
    state.spaceTextureFilename = environmentState.spaceTextureFilename;
    state.starDeathEnabled = environmentState.starDeathEnabled;
}

/** Copy the ambient-music playlist state into the reactive store for the
 *  Vue PlaylistPanel. */
function refreshPlaylistState(): void {
    const snapshot = hookRegistry.getPlaylistSnapshot?.();
    if (!snapshot) return;
    // Copy entries only when the shuffled list actually changes (once per
    // session) so Vue doesn't re-render the whole list every poll tick.
    if (snapshot.entries.length !== playlistState.entries.length) {
        playlistState.entries = snapshot.entries;
    }
    playlistState.currentIndex = snapshot.currentIndex;
    playlistState.isPlaying = snapshot.isPlaying;
}

function refreshAll(): void {
    refreshScalarState();
    snapshotBodies();
    refreshCameraState();
    refreshEnvironmentState();
    refreshPlaylistState();
    refreshAttributesSnapshot();
    refreshScenarioLockState();
}

let intervalId: number | null = null;

function ensurePolling(): void {
    if (intervalId !== null) return;
    refreshAll();
    intervalId = window.setInterval(refreshAll, SNAPSHOT_INTERVAL_MS);
}

let refreshScheduled = false;

/**
 * Coalesces bursts of body:added/removed/dead/reset events (e.g. dozens of asteroids dying in
 * the same animation frame) into a single refreshAll() per frame, instead of one full — and,
 * while System Explorer is open, Vue-re-rendering — refresh per individual event.
 */
function scheduleRefresh(): void {
    if (refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => {
        refreshScheduled = false;
        refreshAll();
    });
}

/**
 * Initialise the bridge: start polling and subscribe to the documented window
 * events so the snapshot refreshes instantly on changes (no 100ms lag).
 */
export function initSimBridge(): void {
    ensurePolling();

    window.addEventListener('body:added', scheduleRefresh);
    window.addEventListener('body:removed', scheduleRefresh);
    window.addEventListener('body:dead', scheduleRefresh);
    window.addEventListener('bodies:reset', scheduleRefresh);
    // Instant scalar sync: index.ts dispatches this on every pause / time-scale
    // / gravity change (P key, old toolbar, auto-pause during drags), so the
    // Vue UI mirrors the sim with zero 100ms poll lag.
    window.addEventListener('sim:stateChange', (e: Event) => {
        const detail = (e as CustomEvent<ISimStateSnapshot>).detail;
        if (!detail) return;
        state.timeScale = detail.timeScale;
        state.savedTimeScale = detail.savedTimeScale;
        state.isPaused = detail.isPaused;
        state.gMultiplier = detail.gMultiplier;
    });
}

// ── Actions (called from Vue components) ─────────────────────────────────

export function togglePause(): void {
    if (hookRegistry.togglePause) {
        hookRegistry.togglePause();
    } else {
        // Fallback: flip the singleton directly. The sim loop reads isPaused
        // live; note this bypasses the savedTimeScale bookkeeping in index.ts.
        simulationState.isPaused = !simulationState.isPaused;
        refreshScalarState();
    }
}

export function setTimeScale(value: number): void {
    // Unpause if paused
    if (state.isPaused) {
        togglePause();
    }

    if (hookRegistry.setTimeScale) {
        hookRegistry.setTimeScale(value);
    } else {
        simulationState.timeScale = value;
        refreshScalarState();
    }
}

// Same bounds the old bottom toolbar used (ui-manager.ts).
const MIN_TIME_SCALE = 0.01;
const MAX_TIME_SCALE = 2 ** 12;

/**
 * Multiply the time scale by `factor` (e.g. 0.5 / 2), clamped to the toolbar's bounds.
 * While paused the sim's active scale is 0, so this operates on `savedTimeScale` (the speed
 * that will be restored on resume), and — like every speed change — resumes the sim.
 */
export function stepTimeScale(factor: number): void {
    const base = state.isPaused ? state.savedTimeScale : state.timeScale;
    const next = base * factor;
    setTimeScale(factor < 1 ? Math.max(MIN_TIME_SCALE, next) : Math.min(MAX_TIME_SCALE, next));
}

export function setGMultiplier(value: number): void {
    if (hookRegistry.setGMultiplier) {
        hookRegistry.setGMultiplier(value);
    } else {
        simulationState.gMultiplier = value;
        refreshScalarState();
    }
}

export function selectBodyById(id: string): void {
    const body = simulationState.bodies.find((b) => b && b.id === id && !b._isDisposed);
    if (!body) return;
    if (hookRegistry.selectBody) {
        hookRegistry.selectBody(body);
    } else {
        // Fallback: direct state write; index.ts hook provides full parity.
        cameraState.focusBody = body;
        snapshotBodies();
    }
}

// ── System Explorer actions ──────────────────────────────────────────────

export function toggleTargetMode(): void {
    if (hookRegistry.toggleTargetMode) {
        hookRegistry.toggleTargetMode();
    } else {
        cameraState.isTargetMode = !cameraState.isTargetMode;
        refreshCameraState();
    }
}

export function toggleLookAtMode(): void {
    if (hookRegistry.toggleLookAtMode) {
        hookRegistry.toggleLookAtMode();
    } else {
        cameraState.isLookAtMode = !cameraState.isLookAtMode;
        refreshCameraState();
    }
}

export function toggleFreeCameraMode(): void {
    if (hookRegistry.toggleFreeCameraMode) {
        hookRegistry.toggleFreeCameraMode();
    } else {
        cameraState.isFreeCameraMode = !cameraState.isFreeCameraMode;
        refreshCameraState();
    }
}

export function toggleSurfaceCamera(): void {
    if (!hookRegistry.toggleSurfaceCamera) return;
    hookRegistry.toggleSurfaceCamera();
}

export function zoomCameraIn(): void {
    if (hookRegistry.zoomIn) hookRegistry.zoomIn();
}

export function zoomCameraOut(): void {
    if (hookRegistry.zoomOut) hookRegistry.zoomOut();
}

export function setLockToSun(checked: boolean): void {
    if (hookRegistry.setLockToSun) {
        hookRegistry.setLockToSun(checked);
    } else {
        cameraState.lockToSun = checked;
        refreshCameraState();
    }
}

/** Partial display-flag update pushed TO the store (used by index.ts). */
export interface VueDisplayState {
    showTrails?: boolean;
    showOrbitPrediction?: boolean;
}

export function setDisplayState(partial: VueDisplayState): void {
    if (partial.showTrails !== undefined) state.showTrails = partial.showTrails;
    if (partial.showOrbitPrediction !== undefined) {
        state.showOrbitPrediction = partial.showOrbitPrediction;
    }
}

export function setShowTrails(checked: boolean): void {
    if (hookRegistry.setShowTrails) {
        hookRegistry.setShowTrails(checked);
    } else {
        setDisplayState({ showTrails: checked });
    }
}

export function setShowOrbitPrediction(checked: boolean): void {
    if (hookRegistry.setShowOrbitPrediction) {
        hookRegistry.setShowOrbitPrediction(checked);
    } else {
        setDisplayState({ showOrbitPrediction: checked });
    }
}

export function setShowNames(checked: boolean): void {
    if (hookRegistry.setShowNames) {
        hookRegistry.setShowNames(checked);
    } else {
        simulationState.showNames = checked;
        refreshCameraState();
    }
}

export function flyToBody(bodyId: string): void {
    const body = simulationState.bodies.find((b) => b && b.id === bodyId && !b._isDisposed);
    if (!body) return;
    if (hookRegistry.flyToBody) hookRegistry.flyToBody(body);
}

export function enterShipById(bodyId: string): void {
    const body = simulationState.bodies.find((b) => b && b.id === bodyId && !b._isDisposed);
    if (!body) return;
    if (hookRegistry.enterShip) hookRegistry.enterShip(body);
}

// ── Add/Edit Body actions ────────────────────────────────────────────────

/** Load the edit snapshot for `bodyId` into the store (called on edit-mode open). */
export function loadBodyEditSnapshot(bodyId: string): void {
    const snapshot = hookRegistry.getBodyEditSnapshot?.(bodyId) ?? null;
    bodyEditorState.snapshot = snapshot;
}

/** Clear the edit snapshot when the editor closes. */
export function clearBodyEditSnapshot(): void {
    bodyEditorState.snapshot = null;
}

/** Resolve an orbit-parent id to a valid body id (or null). */
export function resolveOrbitParentId(parentId: string | null): string | null {
    if (!parentId) return null;
    return simulationState.bodies.some((b) => b && b.id === parentId && !b._isDisposed)
        ? parentId
        : null;
}

/** Create a custom body; returns the new body's id (null on failure). */
export function createCustomBody(payload: CreateBodyPayload): string | null {
    return hookRegistry.createBody?.(payload) ?? null;
}

/** Create a preset body; returns the new body's id (null on failure). */
export function createPresetBodyByKey(presetKey: string): string | null {
    return hookRegistry.createPresetBody?.(presetKey) ?? null;
}

/** Launch a probe mission toward targetId at the given altitude (km); returns the new probe's id. */
export function launchProbeMission(targetId: string, altitudeKm: number): string | null {
    return hookRegistry.launchProbeMission?.(targetId, altitudeKm) ?? null;
}

/** Apply an edit to an existing body. */
export function applyBodyEdit(bodyId: string, payload: ApplyBodyEditPayload): void {
    hookRegistry.applyBodyEdit?.(bodyId, payload);
}

/** Delete a body by id. */
export function deleteBodyById(bodyId: string): void {
    hookRegistry.deleteBodyById?.(bodyId);
}

/** Get freshly-randomized preview values for the add-custom form. */
export function getRandomizedCreateDefaults(bodyType: string): RandomizedCreateDefaults | null {
    return hookRegistry.getRandomizedCreateDefaults?.(bodyType) ?? null;
}

/**
 * Next Roman-numeral ordinal for a new moon, derived from how many existing bodies already
 * carry the parent's name as their first token. Returns undefined when the parent is unknown,
 * which lets the name generator fall back to its own deterministic ordinal.
 */
function resolveMoonSequenceNumber(parentName: string): number | undefined {
    if (!parentName) return undefined;
    const prefix = `${parentName} `;
    const existing = simulationState.bodies.filter(
        (b) => b && !b._isDisposed && typeof b.name === 'string' && b.name.startsWith(prefix)
    ).length;
    return existing + 1;
}

/**
 * Fresh procedural name for the add form's Name box. Moons are named relative to their
 * orbit parent (the current selection), matching how the sim names them at creation.
 */
export function generateAddFormBodyName(bodyType: string): string {
    if (bodyType !== 'moon') return generateRandomCustomBodyName(bodyType);

    const parentId = resolveOrbitParentId(state.selectedId);
    const parent = parentId
        ? simulationState.bodies.find((b) => b && b.id === parentId && !b._isDisposed)
        : undefined;
    const parentName = parent?.name;

    return generateRandomCustomBodyName(bodyType, {
        parentName,
        sequenceNumber: parentName ? resolveMoonSequenceNumber(parentName) : undefined,
    });
}

// ── Solar System Management actions ──────────────────────────────────────

/** Toggle Kuiper belt visibility (old panel's kuiperBeltChange event path). */
export function setKuiperBeltVisible(checked: boolean): void {
    if (hookRegistry.setKuiperBeltVisible) {
        hookRegistry.setKuiperBeltVisible(checked);
    } else {
        environmentState.kuiperBeltVisible = checked;
        refreshEnvironmentState();
    }
}

/** Show/hide the skydome background texture (old enableSkydome checkbox path). */
export function setSpaceBackgroundVisible(checked: boolean): void {
    if (hookRegistry.setSpaceBackgroundVisible) {
        hookRegistry.setSpaceBackgroundVisible(checked);
    } else {
        environmentState.spaceBackgroundVisible = checked;
        refreshEnvironmentState();
    }
}

/** Load & apply a skydome background texture by filename (old spaceTextureChange path). */
export function setSpaceTexture(texturePath: string): void {
    if (hookRegistry.setSpaceTexture) {
        hookRegistry.setSpaceTexture(texturePath);
    } else {
        environmentState.spaceTextureFilename = texturePath;
        refreshEnvironmentState();
    }
}

/** Toggle natural star death (old enableStarDeath checkbox path). */
export function setStarDeathEnabled(checked: boolean): void {
    if (hookRegistry.setStarDeathEnabled) {
        hookRegistry.setStarDeathEnabled(checked);
    } else {
        environmentState.starDeathEnabled = checked;
        refreshEnvironmentState();
    }
}

// ── Options actions (persisted user settings) ────────────────────────────

/** Toggle particle effects (old panel's particleEffectsChange path). */
export function setParticleEffectsEnabled(checked: boolean): void {
    if (hookRegistry.setParticleEffectsEnabled) {
        hookRegistry.setParticleEffectsEnabled(checked);
    } else {
        settingsStore.update(SettingKey.ParticleEffectsEnabled, checked);
    }
    state.particleEffectsEnabled = checked;
}

/** Toggle lens flares (old panel's lensflare path). */
export function setLensflareEnabled(checked: boolean): void {
    if (hookRegistry.setLensflareEnabled) {
        hookRegistry.setLensflareEnabled(checked);
    } else {
        settingsStore.update(SettingKey.LensflareEnabled, checked);
    }
    state.lensflareEnabled = checked;
}

/** Toggle eased/smooth camera zoom (Options panel). */
export function setSmoothZoomEnabled(checked: boolean): void {
    if (hookRegistry.setSmoothZoomEnabled) {
        hookRegistry.setSmoothZoomEnabled(checked);
    } else {
        settingsStore.update(SettingKey.SmoothZoomEnabled, checked);
    }
    state.smoothZoomEnabled = checked;
}

/** Toggle hiding the PanelManager while in flight mode (Flight Controls panel). */
export function setHidePanelManagerInFlight(checked: boolean): void {
    if (hookRegistry.setHidePanelManagerInFlight) {
        hookRegistry.setHidePanelManagerInFlight(checked);
    } else {
        settingsStore.update(SettingKey.HidePanelManagerInFlight, checked);
    }
    state.hidePanelManagerInFlight = checked;
}

/** Toggle S-key chase mode when a target is locked (Flight Controls panel). */
export function setChaseModeEnabled(checked: boolean): void {
    if (hookRegistry.setChaseModeEnabled) {
        hookRegistry.setChaseModeEnabled(checked);
    } else {
        settingsStore.update(SettingKey.ChaseModeEnabled, checked);
    }
    state.chaseModeEnabled = checked;
}

/** Toggle polar aurorae. */
export function setAuroraEnabled(checked: boolean): void {
    if (hookRegistry.setAuroraEnabled) {
        hookRegistry.setAuroraEnabled(checked);
    } else {
        settingsStore.update(SettingKey.AuroraEnabled, checked);
    }
    state.auroraEnabled = checked;
}

/**
 * Select how much per-pixel work the aurora curtains do.
 * Takes effect on the next frame — the effect reads the setting each tick and recompiles its
 * materials in place, so there is no need to rebuild the bodies or restart the simulation.
 */
export function setAuroraDetail(mode: AuroraDetailMode): void {
    if (hookRegistry.setAuroraDetail) {
        hookRegistry.setAuroraDetail(mode);
    } else {
        settingsStore.update(SettingKey.AuroraDetail, mode);
    }
    state.auroraDetail = mode;
}

/** Toggle the ship-AI obstacle avoidance debug overlay. */
export function setShowAiDebug(checked: boolean): void {
    if (hookRegistry.setShowAiDebug) {
        hookRegistry.setShowAiDebug(checked);
    } else {
        settingsStore.update(SettingKey.ShowAiDebug, checked);
    }
    state.showAiDebug = checked;
}

/** Set physics substeps per frame (old panel's substepsChange path). */
export function setSubsteps(value: number): void {
    if (hookRegistry.setSubsteps) {
        hookRegistry.setSubsteps(value);
    } else {
        settingsStore.update(SettingKey.Substeps, value);
    }
    state.substeps = value;
}

/**
 * Select the gravity solver used by the n-body engine.
 * Takes effect on the next frame — the engine reads the setting each step, so there is no
 * need to restart the simulation or rebuild the world.
 */
export function setPhysicsSolver(mode: PhysicsSolverMode): void {
    if (hookRegistry.setPhysicsSolver) {
        hookRegistry.setPhysicsSolver(mode);
    } else {
        settingsStore.update(SettingKey.PhysicsSolver, mode);
    }
    state.physicsSolver = mode;
}

/** Set the Barnes-Hut opening angle. Lower is more accurate and slower. */
export function setBarnesHutTheta(value: number): void {
    const clamped = Math.min(Math.max(value, 0.1), 1.5);
    if (hookRegistry.setBarnesHutTheta) {
        hookRegistry.setBarnesHutTheta(clamped);
    } else {
        settingsStore.update(SettingKey.BarnesHutTheta, clamped);
    }
    state.barnesHutTheta = clamped;
}

/** Set sound effects volume, 0–100 percent (old panel's sfxVolumeChange path). */
export function setSfxVolume(percent: number): void {
    if (hookRegistry.setSfxVolume) {
        hookRegistry.setSfxVolume(percent);
    } else {
        settingsStore.update(SettingKey.SfxVolume, percent / 100);
    }
    state.sfxVolumePercent = percent;
}

/** Set background music volume, 0–100 percent (old panel's musicVolumeChange
 *  path; the registered hook also applies it to the live AmbientSoundManager). */
export function setMusicVolume(percent: number): void {
    if (hookRegistry.setMusicVolume) {
        hookRegistry.setMusicVolume(percent);
    } else {
        settingsStore.update(SettingKey.MusicVolume, percent / 100);
    }
    state.musicVolumePercent = percent;
}

/** Set the maximum frames per second (0 = unlimited). */
export function setFrameRateLimit(value: number): void {
    if (hookRegistry.setFrameRateLimit) {
        hookRegistry.setFrameRateLimit(value);
    } else {
        settingsStore.update(SettingKey.FrameRateLimit, value);
    }
    state.frameRateLimit = value;
}

// ── Playlist actions (same event paths as the old playlist panel) ────────

/** Skip to the previous track. */
export function playlistPrev(): void {
    hookRegistry.playlistPrev?.();
}

/** Skip to the next track. */
export function playlistNext(): void {
    hookRegistry.playlistNext?.();
}

/** Pause the current track, or resume if paused. */
export function playlistTogglePlayPause(): void {
    hookRegistry.playlistTogglePlayPause?.();
}

/** Immediately play the track at the given shuffled-playlist index. */
export function playlistSelectTrack(index: number): void {
    hookRegistry.playlistSelectTrack?.(index);
}

// ── Flight Controls actions ───────────────────────────────────────────────

/** Update the ship type selected in the Flight Controls dropdown (pure UI state). */
export function setSelectedShipTypeId(id: string): void {
    state.selectedShipTypeId = id;
}

/** Spawn (or re-enter) a spaceship of the currently selected type. */
export function requestSpawnShip(): void {
    hookRegistry.spawnShip?.();
}

/** Engage autopilot toward the current selection, or cancel if already active. */
export function requestToggleAutopilot(): void {
    hookRegistry.toggleAutopilot?.();
}

/** Exit flight mode (restores normal camera controls). */
export function requestExitFlightMode(): void {
    hookRegistry.exitFlightMode?.();
}

/** Re-launch the system by showing the StartupModal with Cancel enabled. */
export function requestRelaunch(): void {
    hookRegistry.relaunch?.();
}

// ── Formatting helpers shared by components ──────────────────────────────

/** Compact scientific/large number formatting, e.g. 1.23e+27. */
export function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    if (abs === 0) return '0';
    if (abs >= 1e6 || abs < 1e-3) return value.toExponential(2);
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
    }).format(value);
}

export function formatTimeScale(value: number): string {
    if (state.isPaused) {
        return `PAUSED`;
    }
    if (value < 0) return `${Math.abs(value).toFixed(2)}x REVERSE`;
    return `${value.toFixed(2)}x`;
}
