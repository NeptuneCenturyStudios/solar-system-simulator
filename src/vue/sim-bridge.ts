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

function snapshotBodies(): void {
    const selected = (() => {
        const focus = cameraState.focusBody;
        if (
            focus &&
            !focus._isDisposed &&
            simulationState.bodies.some((b) => b === focus)
        ) {
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
    state.hasKnownShip = !!(
        ship &&
        !ship._isDisposed &&
        simulationState.bodies.includes(ship)
    );
    state.knownShipTypeId = state.hasKnownShip ? (ship?.shipTypeId ?? null) : null;
    state.isAdvancedMode = flightState.isAdvancedMode;
}

function refreshAll(): void {
    refreshScalarState();
    snapshotBodies();
    refreshCameraState();
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
        const next = Math.abs(state.savedTimeScale).toFixed(1);
        const direction = state.savedTimeScale < 0 ? ' REVERSE' : '';
        return `0.0x (PAUSED - next: ${next}x${direction})`;
    }
    if (value < 0) return `${Math.abs(value).toFixed(1)}x REVERSE`;
    return `${value.toFixed(1)}x`;
}
