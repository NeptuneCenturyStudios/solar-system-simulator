/**
 * Non-Vue bridge service for the Vue ScenariosModal, following the same
 * hook-registry pattern as startup-modal-service.ts. index.ts imports this
 * module directly; ScenariosModal.vue self-registers its controller on mount.
 */

export type ScenarioAction = 'blackHole';

export interface ScenariosModalResult {
    scenario: ScenarioAction;
}

export interface ScenariosModalController {
    show(): Promise<ScenariosModalResult | null>;
    hide(): void;
    isVisible(): boolean;
}

let controller: ScenariosModalController | null = null;

/** Called by ScenariosModal.vue on mount. */
export function registerScenariosModalController(instance: ScenariosModalController): void {
    controller = instance;
}

function requireController(): ScenariosModalController | null {
    if (!controller) {
        console.warn('[vue] ScenariosModal not registered; controller calls are no-ops.');
    }
    return controller;
}

/**
 * Displays the scenarios modal and waits for the user to pick a scenario.
 * Resolves with `{ scenario }` for a chosen scenario, or `null` on cancel.
 */
export async function showScenariosModal(): Promise<ScenariosModalResult | null> {
    const instance = requireController();
    if (!instance) return null;
    return instance.show();
}

export function hideScenariosModal(): void {
    requireController()?.hide();
}

export function scenariosModalIsVisible(): boolean {
    return controller?.isVisible() ?? false;
}
