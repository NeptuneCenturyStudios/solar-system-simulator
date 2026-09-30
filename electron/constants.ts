/**
 * Shared constants for the Electron main process.
 *
 * The packaged app serves its own Vite build output over a custom `app://`
 * scheme rather than `file://`. Chromium blocks `fetch()` for `file://` URLs,
 * and the simulation loads OBJ/MTL/GLTF models through three.js's `FileLoader`
 * (which uses `fetch`) as well as decoding sound effects with `fetch()`. A
 * privileged custom scheme keeps those loaders working with `webSecurity` left
 * on, instead of disabling it or running a local HTTP server.
 */

/** Custom URL scheme the built web bundle is served from. */
export const APP_SCHEME = 'app';

/**
 * Host component of the `app://` URL. Requests are resolved relative to the
 * bundle root, so the host exists only to keep URLs well-formed and same-origin.
 */
export const APP_HOST = 'bundle';

/** Entry document the production window loads. */
export const APP_INDEX_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

/**
 * Environment variable the dev script sets to the Vite dev server URL. When
 * present the window loads that URL (with HMR) instead of the built bundle.
 */
export const DEV_SERVER_URL_ENV = 'ELECTRON_RENDERER_URL';

/** Directory holding the Vite build output, relative to the app root. */
export const WEB_ROOT_DIRECTORY = 'dist';

/** Window/presentation defaults. */
export const WINDOW_TITLE = 'Solar System Simulator';
export const WINDOW_BACKGROUND = '#000000';
export const WINDOW_WIDTH = 1600;
export const WINDOW_HEIGHT = 900;
export const WINDOW_MIN_WIDTH = 1024;
export const WINDOW_MIN_HEIGHT = 640;
