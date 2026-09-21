import { reactive } from 'vue';

export enum ActivePanel {
    None = 'none',
    SystemExplorer = 'systemExplorer',
    Options = 'options',
    FlightControls = 'flightControls',
    BodyEditor = 'bodyEditor',
    /** Solar System Management panel (environment settings: kuiper belt, skydome, star death, gravity). */
    SolarManagement = 'solarManagement',
    /** Music Playlist panel (view/control the shuffled background-music playlist). */
    Playlist = 'playlist',
    /** Procedural planet texture generator (dev tool, not part of normal gameplay). */
    TextureGenerator = 'textureGenerator',
}

export interface BodyEditorState {
    mode: 'add' | 'edit';
    /** Id of the body being edited, or null in add mode. */
    bodyId: string | null;
}

/**
 * Reactive UI-only state shared across Vue components. Unlike `simStore` in
 * sim-bridge.ts this has nothing to do with the simulation itself — it tracks
 * which parts of the Vue overlay are open.
 */
export interface VueUiState {
    activePanel: ActivePanel;
    /**
     * Whether the PanelManager card (toolbar + panels) is shown at all.
     * Independent of `activePanel`: hiding it via the menu toggle keeps the
     * active panel so re-showing restores exactly what was open before.
     *
     * Written only through this module's helpers, which also record *who* hid it
     * (see `PanelManagerHiddenBy`) so an automatic hide can be undone without
     * overriding a deliberate one.
     */
    panelManagerVisible: boolean;
    /**
     * When set, the System Explorer body list is replaced by the add/edit body
     * panel. `null` means the explorer list is shown.
     */
    bodyEditor: BodyEditorState | null;
    /**
     * Whether the first system has finished loading. Latches to `true` once
     * set and is never reset, so later re-launches don't re-hide the UI.
     */
    systemReady: boolean;
}

/**
 * Who currently holds the PanelManager hidden.
 *
 * - `user`     — the player closed it (menu toggle or a panel's close button).
 * - `scenario` — a running scenario hid it for its run and reveals it again in `dispose()`;
 *                nothing else may override that hold while it lasts.
 * - `flight`   — flight mode hid it; leaving flight mode reveals it again.
 *
 * Tracked so flight mode can auto-restore the panel without ever revealing one the player
 * or a scenario deliberately took away.
 */
export type PanelManagerHiddenBy = 'user' | 'scenario' | 'flight';

const uiState = reactive<VueUiState>({
    activePanel: ActivePanel.SystemExplorer,
    panelManagerVisible: true,
    bodyEditor: null,
    systemReady: false,
});

/**
 * Why the panel is hidden, or null while it is visible. Module-private and deliberately not
 * reactive: `vueUiState.panelManagerVisible` is the single value components read, this only
 * decides who is allowed to reveal it again.
 */
let hiddenBy: PanelManagerHiddenBy | null = null;

/** Reactive store consumed by Vue components for overlay visibility. */
export const vueUiState: VueUiState = uiState;

/** Marks the initial system load as complete, revealing the toolbar/panels. */
export function setSystemReady(ready: boolean): void {
    uiState.systemReady = ready;
}

/** Reveal the whole PanelManager and release whatever was holding it hidden. */
export function showPanelManager(): void {
    uiState.panelManagerVisible = true;
    hiddenBy = null;
}

/** Hide the whole PanelManager because the player asked for it (menu toggle, panel close
 *  button). Records the reason so flight mode leaves it alone. */
export function hidePanelManager(): void {
    uiState.panelManagerVisible = false;
    hiddenBy = 'user';
}

/** Activate a panel and make sure the PanelManager showing it is visible
 *  (activating a panel implies wanting to see it). */
export function setActivePanel(panel: ActivePanel): void {
    uiState.activePanel = panel;
    showPanelManager();
}

/** Show/hide the whole PanelManager without changing the active panel —
 *  re-showing restores whatever panel was open when it was hidden. */
export function togglePanelManager(): void {
    if (uiState.panelManagerVisible) {
        hidePanelManager();
    } else {
        showPanelManager();
    }
}

/** Show or hide the whole PanelManager (toolbar + panels), independent of
 *  the toolbar's own toggle button. Scenarios drive this: their hide outranks a
 *  flight-mode hide, and `true` reveals the panel regardless of who hid it. */
export function setPanelManagerVisible(visible: boolean): void {
    if (visible) {
        showPanelManager();
        return;
    }
    uiState.panelManagerVisible = false;
    hiddenBy = 'scenario';
}

/**
 * Hide the PanelManager because the player just entered flight mode.
 * Only claims the panel while it is still visible: one the player or a scenario already
 * hid keeps its owner, so leaving flight mode cannot reveal it.
 */
export function hidePanelManagerForFlight(): void {
    if (!uiState.panelManagerVisible) return;
    uiState.panelManagerVisible = false;
    hiddenBy = 'flight';
}

/**
 * Reveal the PanelManager again now that flight mode has ended — but only when flight mode is
 * what hid it. A scenario's hold (or a manual hide) survives untouched.
 */
export function restorePanelManagerAfterFlight(): void {
    if (hiddenBy !== 'flight') return;
    showPanelManager();
}

/** Open the add/edit body panel. Add mode defaults the orbit parent to the
 *  currently selected body (handled by the editor via simStore.selectedId). */
export function openBodyEditor(mode: 'add' | 'edit', bodyId: string | null = null): void {
    setActivePanel(ActivePanel.BodyEditor);
    uiState.bodyEditor = { mode, bodyId };
}

/** Close the add/edit body panel and return to the explorer list. */
export function closeBodyEditor(): void {
    uiState.bodyEditor = null;
    uiState.activePanel = ActivePanel.SystemExplorer;
}
