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

const uiState = reactive<VueUiState>({
    activePanel: ActivePanel.SystemExplorer,
    panelManagerVisible: true,
    bodyEditor: null,
    systemReady: false,
});

/** Reactive store consumed by Vue components for overlay visibility. */
export const vueUiState: VueUiState = uiState;

/** Marks the initial system load as complete, revealing the toolbar/panels. */
export function setSystemReady(ready: boolean): void {
    uiState.systemReady = ready;
}

/** Activate a panel and make sure the PanelManager showing it is visible
 *  (activating a panel implies wanting to see it). */
export function setActivePanel(panel: ActivePanel): void {
    uiState.activePanel = panel;
    uiState.panelManagerVisible = true;
}

/** Show/hide the whole PanelManager without changing the active panel —
 *  re-showing restores whatever panel was open when it was hidden. */
export function togglePanelManager(): void {
    uiState.panelManagerVisible = !uiState.panelManagerVisible;
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
