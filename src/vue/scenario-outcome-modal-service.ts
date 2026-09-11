/**
 * Non-Vue bridge service for the Vue ScenarioOutcomeModal, following the same
 * hook-registry pattern as startup-modal-service.ts and scenarios-modal-service.ts.
 * index.ts imports this module directly and reacts to a scenario outcome by
 * showing the dialog; ScenarioOutcomeModal.vue self-registers its controller on
 * mount.
 *
 * The dialog is deliberately generic: it renders a title, a body line, an
 * optional list of labelled stats, and an arbitrary set of action buttons. The
 * outcome helpers below (showScenarioOutcomeModal / showScenarioInfoModal) build
 * that request so scenario code never has to know about UI wording.
 */

import type { ScenarioOutcomeReport } from '../scenarios/scenario-outcome';

/** Visual treatment of the dialog. 'info' uses the normal UI colours. */
export type ScenarioDialogVariant = 'danger' | 'success' | 'info';

/** A labelled figure shown in the dialog body. */
export interface ScenarioDialogStat {
    label: string;
    value: string;
}

/** Identifier of a dialog button; resolved back to the caller via the result. */
export type ScenarioDialogActionId = 'restart' | 'newScenario' | 'ok';

/** One button in the dialog footer. */
export interface ScenarioDialogAction {
    id: ScenarioDialogActionId;
    /** Button text, e.g. "RESTART". */
    label: string;
    /** Material Symbols icon name, e.g. "restart_alt". */
    icon: string;
    /** Renders the button with the danger (red) styling. */
    danger?: boolean;
}

/** Everything the modal needs to render one dialog. */
export interface ScenarioDialogRequest {
    variant: ScenarioDialogVariant;
    title: string;
    message: string;
    stats?: ScenarioDialogStat[];
    actions: ScenarioDialogAction[];
}

export interface ScenarioDialogResult {
    action: ScenarioDialogActionId;
}

export interface ScenarioOutcomeModalController {
    show(request: ScenarioDialogRequest): Promise<ScenarioDialogResult | null>;
    hide(): void;
    isVisible(): boolean;
}

let controller: ScenarioOutcomeModalController | null = null;

/** Called by ScenarioOutcomeModal.vue on mount. */
export function registerScenarioOutcomeModalController(
    instance: ScenarioOutcomeModalController
): void {
    controller = instance;
}

function requireController(): ScenarioOutcomeModalController | null {
    if (!controller) {
        console.warn('[vue] ScenarioOutcomeModal not registered; controller calls are no-ops.');
    }
    return controller;
}

/** The two actions every scenario end offers: play it again, or pick something else. */
function outcomeActions(): ScenarioDialogAction[] {
    return [
        { id: 'restart', label: 'RESTART', icon: 'restart_alt' },
        { id: 'newScenario', label: 'NEW SCENARIO', icon: 'rocket_launch' },
    ];
}

/**
 * Shows the dialog for a scenario that has ended. Generic headline and body copy
 * are chosen from the outcome so the wording is reusable across scenarios; the
 * report's own `message` (if any) overrides the body line, and its `stats` drive
 * the figures shown beneath it.
 */
export function showScenarioOutcomeModal(
    report: ScenarioOutcomeReport
): Promise<ScenarioDialogResult | null> {
    const succeeded = report.outcome === 'succeeded';
    const request: ScenarioDialogRequest = {
        variant: succeeded ? 'success' : 'danger',
        title: succeeded ? 'Scenario Complete' : 'Scenario Failed',
        message:
            report.message ??
            (succeeded
                ? 'You completed the scenario successfully.'
                : 'The scenario has ended in failure.'),
        stats: report.stats,
        actions: outcomeActions(),
    };
    const instance = requireController();
    if (!instance) return Promise.resolve(null);
    return instance.show(request);
}

/**
 * Shows a plain informational dialog in the normal UI colours. Resolves with
 * `{ action: 'ok' }` once dismissed, or `null` if the modal is not registered.
 */
export function showScenarioInfoModal(options: {
    title: string;
    message: string;
    stats?: ScenarioDialogStat[];
}): Promise<ScenarioDialogResult | null> {
    const request: ScenarioDialogRequest = {
        variant: 'info',
        title: options.title,
        message: options.message,
        stats: options.stats,
        actions: [{ id: 'ok', label: 'OK', icon: 'check' }],
    };
    const instance = requireController();
    if (!instance) return Promise.resolve(null);
    return instance.show(request);
}

export function hideScenarioOutcomeModal(): void {
    requireController()?.hide();
}

export function scenarioOutcomeModalIsVisible(): boolean {
    return controller?.isVisible() ?? false;
}
