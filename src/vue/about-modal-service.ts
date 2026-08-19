/**
 * Non-Vue bridge service for the Vue AboutModal, following the same
 * hook-registry pattern as startup-modal-service.ts. index.ts imports this
 * module directly; AboutModal.vue self-registers its controller on mount.
 */

export interface AboutModalController {
    show(): void;
    hide(): void;
    isVisible(): boolean;
}

let controller: AboutModalController | null = null;

/** Called by AboutModal.vue on mount. */
export function registerAboutModalController(instance: AboutModalController): void {
    controller = instance;
}

function requireController(): AboutModalController | null {
    if (!controller) {
        console.warn('[vue] AboutModal not registered; controller calls are no-ops.');
    }
    return controller;
}

/**
 * Displays the about modal.
 */
export function showAboutModal(): void {
    requireController()?.show();
}

export function hideAboutModal(): void {
    requireController()?.hide();
}

export function aboutModalIsVisible(): boolean {
    return controller?.isVisible() ?? false;
}
