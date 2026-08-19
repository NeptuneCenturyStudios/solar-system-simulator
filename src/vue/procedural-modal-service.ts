/**
 * Non-Vue bridge service for the Vue ProceduralModal, following the same
 * hook-registry pattern as startup-modal-service.ts. index.ts imports this
 * module directly; ProceduralModal.vue self-registers its controller on mount.
 */

import type { IProceduralGeneratorPromptResult } from '../interfaces';
import type { ProceduralGenerationReporter } from '../procedural/procedural-generation-progress';

export interface ProceduralModalPromptOptions {
    title?: string;
}

export interface ProceduralModalProgressOptions {
    title?: string;
}

export interface ProceduralModalController {
    showPrompt(options: ProceduralModalPromptOptions): Promise<IProceduralGeneratorPromptResult | null>;
    showProgress(options: ProceduralModalProgressOptions): ProceduralGenerationReporter;
    hide(): void;
    isVisible(): boolean;
}

let controller: ProceduralModalController | null = null;

/** Called by ProceduralModal.vue on mount. */
export function registerProceduralModalController(instance: ProceduralModalController): void {
    controller = instance;
}

function requireController(): ProceduralModalController | null {
    if (!controller) {
        console.warn('[vue] ProceduralModal not registered; controller calls are no-ops.');
    }
    return controller;
}

/**
 * Shows the seed-entry prompt and waits for the user to click Create or Cancel.
 * Resolves with `{ seed }` when Create is clicked, or `null` on cancel.
 */
export async function showProceduralPrompt(
    options: ProceduralModalPromptOptions = {}
): Promise<IProceduralGeneratorPromptResult | null> {
    const instance = requireController();
    if (!instance) return null;
    return instance.showPrompt(options);
}

/**
 * Switches the modal to progress display mode and returns a
 * ProceduralGenerationReporter that the caller can feed into spawn().
 */
export function showProceduralProgress(
    options: ProceduralModalProgressOptions = {}
): ProceduralGenerationReporter | undefined {
    const instance = requireController();
    if (!instance) return undefined;
    return instance.showProgress(options);
}

export function hideProceduralModal(): void {
    requireController()?.hide();
}

export function proceduralModalIsVisible(): boolean {
    return controller?.isVisible() ?? false;
}
