/**
 * Generic scenario outcome reporting.
 *
 * A scenario (which lives under src/scenarios and must stay free of any Vue or
 * DOM-UI import) reports that it has ended here. The composition root in
 * index.ts registers the single handler and turns the report into whatever UI
 * it likes — currently a themed outcome modal with restart / new-scenario
 * actions. This mirrors the module-level-registry pattern used by
 * screen-flash.ts and the Vue modal service bridges, and keeps a scenario
 * decoupled from the UI layer and from every other scenario.
 *
 * The report is deliberately scenario-agnostic: it carries no asteroid- or
 * Earth-specific wording, only a neutral shape plus a free-form `stats` list a
 * scenario can fill in with its own progress figures. Any future scenario can
 * reuse it unchanged.
 */

/** Whether a scenario ended in the player succeeding or failing. */
export type ScenarioOutcome = 'succeeded' | 'failed';

/** A single labelled figure shown alongside the outcome message. */
export interface ScenarioOutcomeStat {
    /** Short label, e.g. "Waves survived". */
    label: string;
    /** Pre-formatted value, e.g. "6 / 10". */
    value: string;
}

/**
 * A scenario's final report. `scenarioName` and `stats` come from the scenario;
 * the UI supplies generic headline/body copy so the wording stays reusable
 * across scenarios, with `message` available as an optional, scenario-authored
 * one-line override.
 */
export interface ScenarioOutcomeReport {
    outcome: ScenarioOutcome;
    /** Display name of the scenario that ended, e.g. "Asteroid Defense". */
    scenarioName: string;
    /** Optional override for the generic body line. */
    message?: string;
    /** Optional labelled figures (waves survived, asteroids destroyed, ...). */
    stats?: ScenarioOutcomeStat[];
}

/** Receives the report when a scenario ends. */
export type ScenarioOutcomeHandler = (report: ScenarioOutcomeReport) => void;

let handler: ScenarioOutcomeHandler | null = null;

/** Register (or clear) the single outcome handler. Called once by index.ts. */
export function registerScenarioOutcomeHandler(next: ScenarioOutcomeHandler | null): void {
    handler = next;
}

/**
 * Report that the running scenario has ended. Silently dropped when no handler
 * is registered, so a scenario can never throw because the UI is not wired.
 */
export function reportScenarioOutcome(report: ScenarioOutcomeReport): void {
    handler?.(report);
}
