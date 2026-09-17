/**
 * Non-Vue bridge service for the Vue ProbeMissionModal, following the same hook-registry
 * pattern as scenarios-modal-service.ts. index.ts imports this module directly;
 * ProbeMissionModal.vue self-registers its controller on mount.
 */

export interface ProbeMissionModalResult {
    targetId: string;
    altitudeKm: number;
}

export interface ProbeMissionModalController {
    show(): Promise<ProbeMissionModalResult | null>;
    hide(): void;
    isVisible(): boolean;
}

let controller: ProbeMissionModalController | null = null;

/** Called by ProbeMissionModal.vue on mount. */
export function registerProbeMissionModalController(instance: ProbeMissionModalController): void {
    controller = instance;
}

function requireController(): ProbeMissionModalController | null {
    if (!controller) {
        console.warn('[vue] ProbeMissionModal not registered; controller calls are no-ops.');
    }
    return controller;
}

/**
 * Displays the probe mission modal and waits for the user to pick a target and altitude.
 * Resolves with `{ targetId, altitudeKm }` for a launched mission, or `null` on cancel.
 */
export async function showProbeMissionModal(): Promise<ProbeMissionModalResult | null> {
    const instance = requireController();
    if (!instance) return null;
    return instance.show();
}

export function hideProbeMissionModal(): void {
    requireController()?.hide();
}

export function probeMissionModalIsVisible(): boolean {
    return controller?.isVisible() ?? false;
}
