/**
 * Non-Vue bridge service for the Vue StartupModal, following the same
 * hook-registry pattern as sim-bridge.ts. index.ts imports this module
 * directly; StartupModal.vue self-registers its controller on mount.
 */

export type StartupModalAction = 'launchDefault' | 'launchEmpty' | 'generate' | 'scenarios';

export interface StartupModalResult {
    action: StartupModalAction;
}

export interface StartupModalOptions {
    /** Shows the Cancel button (true when re-launching an existing system). */
    allowCancel?: boolean;
}

export interface StartupModalController {
    show(options: StartupModalOptions): Promise<StartupModalResult | null>;
    hide(): void;
    isVisible(): boolean;
    getGMultiplier(): number;
    isAllowCancel(): boolean;
}

let controller: StartupModalController | null = null;

/** Called by StartupModal.vue on mount. */
export function registerStartupModalController(instance: StartupModalController): void {
    controller = instance;
}

function requireController(): StartupModalController | null {
    if (!controller) {
        console.warn('[vue] StartupModal not registered; controller calls are no-ops.');
    }
    return controller;
}

/**
 * Displays the startup modal and waits for the user to pick an action.
 * Resolves with `{ action }` for a chosen launch mode, or `null` on cancel.
 */
export async function showStartupModal(
    options: StartupModalOptions = {}
): Promise<StartupModalResult | null> {
    const instance = requireController();
    if (!instance) return null;
    return instance.show(options);
}

export function hideStartupModal(): void {
    requireController()?.hide();
}

export function startupModalIsVisible(): boolean {
    return controller?.isVisible() ?? false;
}

export function getStartupGMultiplier(): number {
    return controller?.getGMultiplier() ?? 1;
}

export function startupModalAllowsCancel(): boolean {
    return controller?.isAllowCancel() ?? false;
}
