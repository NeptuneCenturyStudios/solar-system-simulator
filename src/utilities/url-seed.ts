// ── URL seed parameter helpers ──────────────────────────────────────────────

export const SEED_TYPE_NORMAL = 'normal';
export const SEED_TYPE_BLACKHOLE = 'blackhole';

/** Current seed value (with type prefix) that was last pushed to the URL. */
let _lastPushedSeedValue: string | null = null;

/** Returns the last pushed seed value (with type prefix), or null if none. */
export function getLastPushedSeed(): string | null {
    return _lastPushedSeedValue;
}

/** Set the last-pushed-seed tracking (e.g. when navigating forward to a new seed). */
export function setLastPushedSeed(value: string): void {
    _lastPushedSeedValue = value;
}

/** Reset the last-pushed-seed tracking (e.g. when navigating back to no-seed state). */
export function resetLastPushedSeed(): void {
    _lastPushedSeedValue = null;
}

export interface ParsedSeed {
    type: 'normal' | 'blackhole';
    seed: string;
}

export function parseSeedFromURL(): ParsedSeed | null {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('seed');
    if (!raw) return null;

    const underscoreIdx = raw.indexOf('_');
    if (underscoreIdx <= 0) return null;

    const type = raw.substring(0, underscoreIdx);
    const seed = raw.substring(underscoreIdx + 1);
    if (!seed) return null;

    if (type === SEED_TYPE_NORMAL) {
        return { type: 'normal', seed };
    }
    if (type === SEED_TYPE_BLACKHOLE) {
        return { type: 'blackhole', seed };
    }
    return null;
}

export function buildSeedValue(type: 'normal' | 'blackhole', seed: string): string {
    return `${type}_${seed}`;
}

export function updateURLWithSeed(type: 'normal' | 'blackhole', seed: string): void {
    const value = buildSeedValue(type, seed);
    if (value === _lastPushedSeedValue) return;
    _lastPushedSeedValue = value;
    const url = new URL(window.location.href);
    url.searchParams.set('seed', value);
    window.history.pushState({ seed: value }, '', url.toString());
}

export function clearURLSeed(): void {
    _lastPushedSeedValue = null;
    const url = new URL(window.location.href);
    if (url.searchParams.has('seed')) {
        url.searchParams.delete('seed');
        window.history.replaceState({ seed: null }, '', url.toString());
    }
}
