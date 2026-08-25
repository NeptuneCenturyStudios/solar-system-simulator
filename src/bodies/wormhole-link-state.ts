import type { Wormhole } from './wormhole';

/**
 * Tracks the wormhole awaiting a partner to link with. Deliberately independent of the
 * app's general body-selection state so selecting something else in between doesn't
 * cancel a pending link.
 */
let pendingLink: Wormhole | null = null;

export function getPendingWormholeLink(): Wormhole | null {
    return pendingLink && !pendingLink._isDisposed ? pendingLink : null;
}

export function setPendingWormholeLink(wormhole: Wormhole | null): void {
    pendingLink = wormhole;
}

export function clearPendingWormholeLink(): void {
    pendingLink = null;
}

window.addEventListener('bodies:reset', () => {
    pendingLink = null;
});
