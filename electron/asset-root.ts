/**
 * Locates the built web bundle inside the app and maps `app://` request paths
 * onto files within it.
 *
 * The compiled main process always sits one directory below the app root —
 * `<project>/electron-dist` in development and `app.asar/electron-dist` once
 * packaged — so a single relative lookup resolves correctly in both cases.
 *
 * Reads go through `fs`, which Electron transparently redirects inside an asar
 * archive. That keeps asset loading working whether the bundle ships packed or
 * unpacked, without depending on Chromium's own `file://` handling of archives.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { WEB_ROOT_DIRECTORY } from './constants';

/** Absolute path to the Vite build output. */
export function resolveWebRoot(): string {
    return path.resolve(__dirname, '..', WEB_ROOT_DIRECTORY);
}

/**
 * Map a request URL onto a file inside `webRoot`.
 *
 * Returns `null` when the request escapes `webRoot` (path traversal), or when
 * it does not resolve to a readable file, so callers can answer with a 404.
 * A request for the root path falls back to `index.html`, which lets the
 * window load `app://bundle/` and still reach the entry document.
 */
export function resolveBundleFile(webRoot: string, requestUrl: string): string | null {
    const requestPath = readRequestPath(requestUrl);
    if (requestPath === null) return null;

    const relativePath = requestPath.replace(/^\/+/, '') || 'index.html';
    const candidate = path.resolve(webRoot, relativePath);

    // Reject anything that climbs out of the bundle root (e.g. "../../secrets").
    const rootPrefix = webRoot.endsWith(path.sep) ? webRoot : webRoot + path.sep;
    if (candidate !== webRoot && !candidate.startsWith(rootPrefix)) return null;

    return isReadableFile(candidate) ? candidate : null;
}

/** Decoded pathname of `requestUrl`, or `null` when the URL cannot be parsed. */
function readRequestPath(requestUrl: string): string | null {
    try {
        return decodeURIComponent(new URL(requestUrl).pathname);
    } catch {
        return null;
    }
}

function isReadableFile(candidate: string): boolean {
    try {
        return fs.statSync(candidate).isFile();
    } catch {
        return false;
    }
}
