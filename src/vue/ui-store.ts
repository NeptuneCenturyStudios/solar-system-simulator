import { reactive } from 'vue';

export enum ActivePanel {
    None = 'none',
    SystemExplorer = 'systemExplorer',
    Options = 'options',
    FlightControls = 'flightControls',
}

/**
 * Reactive UI-only state shared across Vue components. Unlike `simStore` in
 * sim-bridge.ts this has nothing to do with the simulation itself — it tracks
 * which parts of the Vue overlay are open.
 */
export interface VueUiState {
    explorerVisible: boolean;
    activePanel: ActivePanel;
}

const uiState = reactive<VueUiState>({
    explorerVisible: true,
    activePanel: ActivePanel.None,
});

/** Reactive store consumed by Vue components for overlay visibility. */
export const vueUiState: VueUiState = uiState;
