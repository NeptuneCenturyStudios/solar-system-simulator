/**
 * Scenario music helpers.
 *
 * A scenario declares its own track via `scenarioMusic(filename, loop)` and exposes
 * it as {@link IScenario}.music. The scenario manager plays it (replacing the ambient
 * playlist) while the scenario runs, then fades back to ambient when it ends.
 *
 * Tracks are resolved from the same `assets/sounds/music/` folder as the ambient
 * playlist, so any audio file dropped there can back a scenario.
 */

import type { IScenarioMusic } from '../interfaces';

/**
 * Build an {@link IScenarioMusic} entry for a file in `src/assets/sounds/music/`.
 *
 * @param filename Music file name, e.g. `'my-track.mp3'`.
 * @param loop     When true the track repeats for the whole scenario.
 */
export function scenarioMusic(filename: string, loop: boolean): IScenarioMusic {
    return {
        url: new URL('../assets/sounds/music/' + filename, import.meta.url).href,
        loop,
    };
}
