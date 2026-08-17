import { reactive } from 'vue';

import { cameraState, simulationState } from '../simulation/simulation';
import { Body } from '../bodies/body';
import { getBodyTypeLabel } from '../utilities/utilities';

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
    isPaused: boolean;
    gMultiplier: number;
    inFlight: boolean;
}

const state = reactive<VueSimStore>({
    bodies: [] as BodySnapshot[],
    selectedId: null as string | null,
    timeScale: 1,
    isPaused: false,
    gMultiplier: 1,
    inFlight: false,
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
        }));
}

function refreshScalarState(): void {
    state.timeScale = simulationState.timeScale;
    state.isPaused = simulationState.isPaused;
    state.gMultiplier = simulationState.gMultiplier;
}

function refreshAll(): void {
    refreshScalarState();
    snapshotBodies();
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
    if (state.isPaused) return '0.0x (PAUSED)';
    if (value < 0) return `${Math.abs(value).toFixed(1)}x REVERSE`;
    return `${value.toFixed(1)}x`;
}
