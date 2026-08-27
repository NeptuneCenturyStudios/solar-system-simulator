import { reactive } from 'vue';

import { BodyTypeEnum } from '../bodies/body-enums';
import { Body } from '../bodies/body';
import { SHIP_TYPES } from '../bodies/ships/ship-registry';
import {
    autopilotState,
    cameraState,
    flightState,
    simulationState,
} from '../simulation/simulation';
import { getBodyTypeLabel } from '../utilities/utilities';
import type { ISimStateSnapshot } from '../interfaces';
import { environmentState } from '../simulation/environment-state';
import { SettingKey, settingsStore } from '../settings/settings-store';
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
    /** Hex color string for the color picker (asteroids/comets only). */
    colorHex: string | null;
    /** Readable type label e.g. "Planet". */
    typeLabel: string;
}

/** Payload for creating a custom body from the add form. Mirrors the old
 *  management panel's `createBody` event exactly. */
export interface CreateBodyPayload {
    bodyType: string;
    planetType: string;
    orbitType: string;
    inclination: number;
    hasAtmosphere: boolean;
    hasRings: boolean;
    customMass: number | null;
    customTemperature: number | null;
    customLightIntensity: number | null;
    customRadius: number | null;
    /** Parent body id for orbit (moon parent / custom orbit parent). */
    orbitParentId: string | null;
    createTilt: number | null;
    createAzimuth: number | null;
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
    color: string | null;
    /** Star-flag mirrors the old panel's isStarBody; radius cap differs for stars. */
    isStarBody: boolean;
    editTilt: number | null;
    editAzimuth: number | null;
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
    hasRings: boolean;
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
    /** Re-launch the system by showing the StartupModal with Cancel enabled. */
    relaunch?: () => void;

    // ── Add/Edit Body (same sim paths as the old management panel) ─────────
    /** Load a rich edit snapshot for the given body (used in edit mode). */
    getBodyEditSnapshot?: (bodyId: string) => BodyEditSnapshot | null;
    /** Create a custom body from the add-form payload; resolves to the new body id. */
    createBody?: (payload: CreateBodyPayload) => string | null;
    /** Create a preset body (presets like Sun/Mercury/Earth); resolves to the new body id. */
    createPresetBody?: (presetKey: string) => string | null;
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
    /** Set physics substeps per frame (persisted via settingsStore). */
    setSubsteps?: (value: number) => void;
    /** Set sound effects volume, 0–100 percent (persisted via settingsStore). */
    setSfxVolume?: (percent: number) => void;
    /** Set background music volume, 0–100 percent. Also applied to the live
     *  AmbientSoundManager, which only picks up changes via setVolume(). */
    setMusicVolume?: (percent: number) => void;

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
    /** Physics substeps per frame. */
    substeps: number;
    /** Sound effects volume as 0–100 percent. */
    sfxVolumePercent: number;
    /** Background music volume as 0–100 percent. */
    musicVolumePercent: number;

    /** Id of the autopilot target body, or null when autopilot is off. */
    autopilotTargetId: string | null;

    // ── Flight Controls ─────────────────────────────────────────────────────
    /** Registry id of the ship type currently chosen in the dropdown. */
    selectedShipTypeId: string;
    /** True when a spawned ship still exists in the simulation (spawn/enter/autopilot enablement). */
    hasKnownShip: boolean;
    /** Registry id of the known ship's type, or null if none exists. */
    knownShipTypeId: string | null;
    /** Whether advanced (additive) flight physics are enabled. */
    isAdvancedMode: boolean;
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
    substeps: settingsStore.settings.substeps,
    sfxVolumePercent: Math.round(settingsStore.settings.sfxVolume * 100),
    musicVolumePercent: Math.round(settingsStore.settings.musicVolume * 100),
    autopilotTargetId: null as string | null,
    selectedShipTypeId: SHIP_TYPES[0].id,
    hasKnownShip: false,
    knownShipTypeId: null as string | null,
    isAdvancedMode: false,
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
    state.isAdvancedMode = flightState.isAdvancedMode;
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
}

let intervalId: number | null = null;

function ensurePolling(): void {
    if (intervalId !== null) return;
    refreshAll();
    intervalId = window.setInterval(refreshAll, SNAPSHOT_INTERVAL_MS);
}

/**
 * Initialise the bridge: start polling and subscribe to the documented window
 * events so the snapshot refreshes instantly on changes (no 100ms lag).
 */
export function initSimBridge(): void {
    ensurePolling();

    window.addEventListener('body:added', refreshAll);
    window.addEventListener('body:removed', refreshAll);
    window.addEventListener('body:dead', refreshAll);
    window.addEventListener('bodies:reset', refreshAll);
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
    if (state.isPaused)
    {
        togglePause();
    }

    if (hookRegistry.setTimeScale) {
        hookRegistry.setTimeScale(value);
    } else {
        simulationState.timeScale = value;
        refreshScalarState();
    }
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

/** Set physics substeps per frame (old panel's substepsChange path). */
export function setSubsteps(value: number): void {
    if (hookRegistry.setSubsteps) {
        hookRegistry.setSubsteps(value);
    } else {
        settingsStore.update(SettingKey.Substeps, value);
    }
    state.substeps = value;
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

export function setAdvancedMode(checked: boolean): void {
    flightState.isAdvancedMode = checked;
    state.isAdvancedMode = checked;
}

/** Spawn (or re-enter) a spaceship of the currently selected type. */
export function requestSpawnShip(): void {
    hookRegistry.spawnShip?.();
}

/** Engage autopilot toward the current selection, or cancel if already active. */
export function requestToggleAutopilot(): void {
    hookRegistry.toggleAutopilot?.();
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
