import { reactive } from 'vue';

export enum ActivePanel {
    None = 'none',
    SystemExplorer = 'systemExplorer',
    Options = 'options',
    FlightControls = 'flightControls',
    BodyEditor = 'bodyEditor',
    /** Solar System Management panel (environment settings: kuiper belt, skydome, star death, gravity). */
    SolarManagement = 'solarManagement',
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
     * When set, the System Explorer body list is replaced by the add/edit body
     * panel. `null` means the explorer list is shown.
     */
    bodyEditor: BodyEditorState | null;
}

const uiState = reactive<VueUiState>({
    activePanel: ActivePanel.SystemExplorer,
    bodyEditor: null,
});

/** Reactive store consumed by Vue components for overlay visibility. */
export const vueUiState: VueUiState = uiState;

/** Open the add/edit body panel. Add mode defaults the orbit parent to the
 *  currently selected body (handled by the editor via simStore.selectedId). */
export function openBodyEditor(mode: 'add' | 'edit', bodyId: string | null = null): void {
    uiState.activePanel = ActivePanel.BodyEditor;
    uiState.bodyEditor = { mode, bodyId };
}

/** Close the add/edit body panel and return to the explorer list. */
export function closeBodyEditor(): void {
    uiState.bodyEditor = null;
    uiState.activePanel = ActivePanel.SystemExplorer;
}
