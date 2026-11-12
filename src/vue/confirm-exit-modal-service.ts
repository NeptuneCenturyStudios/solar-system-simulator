/**
 * Non-Vue bridge for the exit prompt shown before leaving a saveable system, following the
 * same controller pattern as about-modal-service.ts. ConfirmExitModal.vue registers itself
 * on mount; index.ts awaits `showConfirmExitModal`.
 */

export enum ExitPromptChoice {
    /** Leave without saving. */
    Exit = 'exit',
    /** Save first, then leave. */
    SaveAndExit = 'saveAndExit',
    /** Stay in the current system. */
    Stay = 'stay',
}

export interface ConfirmExitRequest {
    message: string;
}

export interface ConfirmExitResult {
    choice: ExitPromptChoice;
    /** The "Always close without asking" checkbox, as it was when a button was pressed. */
    alwaysCloseWithoutAsking: boolean;
}

export interface ConfirmExitModalController {
    show(request: ConfirmExitRequest): Promise<ConfirmExitResult | null>;
    hide(): void;
    isVisible(): boolean;
}

let controller: ConfirmExitModalController | null = null;

/** Called by ConfirmExitModal.vue on mount. */
export function registerConfirmExitModalController(instance: ConfirmExitModalController): void {
    controller = instance;
}

/** Shows the prompt. Resolves null when dismissed, or when the modal isn't mounted. */
export function showConfirmExitModal(
    request: ConfirmExitRequest
): Promise<ConfirmExitResult | null> {
    if (!controller) {
        console.warn('[vue] ConfirmExitModal not registered; treating the prompt as dismissed.');
        return Promise.resolve(null);
    }
    return controller.show(request);
}

export function confirmExitModalIsVisible(): boolean {
    return controller?.isVisible() ?? false;
}

/** "1 second", "12 minutes", "3 hours": the largest unit that fits, rounded down. */
export function formatElapsed(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const [value, unit] =
        seconds < 60
            ? [seconds, 'second']
            : seconds < 3600
              ? [Math.floor(seconds / 60), 'minute']
              : [Math.floor(seconds / 3600), 'hour'];
    return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/** The prompt text for a system last saved (or, if never, launched) `elapsedMs` ago. */
export function buildExitPromptMessage(elapsedMs: number, hasSaved: boolean): string {
    const elapsed = formatElapsed(elapsedMs);
    return hasSaved
        ? `It has been ${elapsed} since your last save. Do you want to exit?`
        : `This system hasn't been saved. It has been ${elapsed} since it was loaded. Do you want to exit?`;
}
