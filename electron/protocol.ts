/**
 * Serves the built web bundle over the privileged `app://` scheme.
 *
 * Why a custom scheme instead of `loadFile`:
 *
 *  - Chromium refuses `fetch()` for `file://` URLs. three.js's `FileLoader`
 *    uses `fetch` for every OBJ/MTL/GLTF model, and the sound-effect bank
 *    fetches audio before decoding it, so a `file://` app would load planets
 *    but silently lose every model and every sound effect.
 *  - Disabling `webSecurity` would "fix" it by removing the same-origin policy
 *    for the whole app, which is not a trade worth making.
 *
 * Registering the scheme as standard + secure + fetch-capable makes it behave
 * like http(s) for the renderer while keeping the security defaults intact.
 */

import { protocol } from 'electron';
import * as fs from 'node:fs';

import { resolveBundleFile, resolveWebRoot } from './asset-root';
import { APP_SCHEME } from './constants';
import { mimeTypeForPath } from './mime-types';

/**
 * Declare the `app://` scheme and its privileges.
 *
 * Must be called before the app is ready; Electron locks the privileged-scheme
 * list once startup begins.
 */
export function registerAppScheme(): void {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: APP_SCHEME,
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                corsEnabled: true,
                stream: true,
            },
        },
    ]);
}

/** Begin answering `app://` requests from the bundle directory. */
export function registerAppProtocolHandler(): void {
    const webRoot = resolveWebRoot();

    protocol.handle(APP_SCHEME, async (request) => {
        const filePath = resolveBundleFile(webRoot, request.url);
        if (filePath === null) {
            return new Response(`Not found: ${request.url}`, { status: 404 });
        }

        try {
            const body = await fs.promises.readFile(filePath);
            return new Response(toBodyInit(body), {
                status: 200,
                headers: {
                    'Content-Type': mimeTypeForPath(filePath),
                    'Content-Length': String(body.byteLength),
                },
            });
        } catch (error) {
            console.error(`[protocol] Failed to read ${filePath}`, error);
            return new Response('Failed to read bundle file', { status: 500 });
        }
    });
}

/**
 * View the loaded bytes as a `Uint8Array` without copying them.
 *
 * `Buffer` shares its backing store with a pooled allocation, so the whole
 * `ArrayBuffer` must not be handed over directly — the offset and length carry
 * the actual file contents.
 */
function toBodyInit(body: Buffer): Uint8Array {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}
