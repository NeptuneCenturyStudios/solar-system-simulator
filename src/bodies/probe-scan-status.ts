import { Body } from './body';
import { Probe } from './probe';

/**
 * Human-readable status of a probe's scan, or null for any non-probe body.
 *
 * Shared by the HUD name panel (drawing/planet-name-indicator.ts) and the Vue
 * System Explorer body list (vue/sim-bridge.ts) so the two displays can never
 * drift apart: the HUD countdown and the list line are always the same string.
 *
 * Three states, in the order a probe experiences them:
 *  - scanning:   "Scanning… 12s" (seconds remaining, rounded up)
 *  - finished:   "Scan complete"
 *  - not begun:  "Out of scan range" (still traveling to the target)
 */
export function probeScanStatusLabel(body: Body): string | null {
    if (!(body instanceof Probe)) return null;
    if (body.activeScan) return `Scanning… ${Math.ceil(body.activeScan.remainingSeconds)}s`;
    if (body.scanComplete) return 'Scan complete';
    return 'Out of scan range';
}
