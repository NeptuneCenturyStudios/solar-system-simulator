/**
 * Non-Vue bridge service for the Vue WhatsNewModal, following the same
 * hook-registry pattern as startup-modal-service.ts. index.ts imports this
 * module directly; WhatsNewModal.vue self-registers its controller on mount.
 */

/** localStorage key holding the last "What's New" version the user saw. */
export const WHATSNEW_STORAGE_KEY = 'spaceSimWhatsNewVersion';

/**
 * The current "What's New" version. Bump this (e.g. to a new date stamp or a
 * random string on each release) so the modal is shown again on the next app
 * start, until the user dismisses it and the key is recorded in localStorage.
 */
export const WHATSNEW_VERSION = '2026-08-26';

export interface WhatsNewModalController {
    /** Shows the modal and resolves once the user dismisses it (null = cancelled). */
    show(): Promise<void | null>;
    hide(): void;
    isVisible(): boolean;
}

let controller: WhatsNewModalController | null = null;

/** Called by WhatsNewModal.vue on mount. */
export function registerWhatsNewModalController(instance: WhatsNewModalController): void {
    controller = instance;
}

function requireController(): WhatsNewModalController | null {
    if (!controller) {
        console.warn('[vue] WhatsNewModal not registered; controller calls are no-ops.');
    }
    return controller;
}

/** Displays the What's New modal and resolves when it is dismissed. */
export function showWhatsNewModal(): Promise<void | null> {
    const instance = requireController();
    if (!instance) return Promise.resolve(null);
    return instance.show();
}

export function hideWhatsNewModal(): void {
    requireController()?.hide();
}

export function whatsNewModalIsVisible(): boolean {
    return controller?.isVisible() ?? false;
}

/** True when the stored marker is stale, i.e. the modal should be shown. */
export function isWhatsNewDue(): boolean {
    return localStorage.getItem(WHATSNEW_STORAGE_KEY) !== WHATSNEW_VERSION;
}

/**
 * Shows the What's New modal when the version marker has changed, then records
 * the current version in localStorage once the modal is dismissed (so it
 * doesn't reappear until the version is bumped again). Resolves immediately if
 * the modal isn't due.
 */
export async function showWhatsNewModalIfNeeded(): Promise<void> {
    if (!isWhatsNewDue()) return;
    await showWhatsNewModal();
    localStorage.setItem(WHATSNEW_STORAGE_KEY, WHATSNEW_VERSION);
}
