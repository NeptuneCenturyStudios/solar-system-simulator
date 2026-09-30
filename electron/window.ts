/**
 * Creation and wiring of the application window.
 *
 * Every window-level concern that differs between a browser tab and a desktop
 * shell lives here: which URL to load, how outbound links behave, and how the
 * page's own close guard is neutralised.
 */

import { BrowserWindow, shell } from 'electron';
import * as path from 'node:path';

import {
    APP_INDEX_URL,
    APP_SCHEME,
    DEV_SERVER_URL_ENV,
    WINDOW_BACKGROUND,
    WINDOW_HEIGHT,
    WINDOW_MIN_HEIGHT,
    WINDOW_MIN_WIDTH,
    WINDOW_TITLE,
    WINDOW_WIDTH,
} from './constants';

/**
 * Renderer URL supplied by the dev script, or `null` when running against the
 * packaged bundle. Callers also use this to decide whether development-only
 * affordances (devtools, a debug menu) should be enabled.
 */
export function devServerUrl(): string | null {
    const url = process.env[DEV_SERVER_URL_ENV];
    return url !== undefined && url.length > 0 ? url : null;
}

/** Create the main window and begin loading the renderer into it. */
export function createMainWindow(): BrowserWindow {
    const window = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        minWidth: WINDOW_MIN_WIDTH,
        minHeight: WINDOW_MIN_HEIGHT,
        title: WINDOW_TITLE,
        backgroundColor: WINDOW_BACKGROUND,
        // Revealed by `ready-to-show` so the user never sees an unpainted frame.
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            // The renderer is a plain web app: it needs no Node access, and the
            // preload surface is small enough to work inside the sandbox.
            sandbox: true,
        },
    });

    wireDiagnostics(window);
    wireExternalLinks(window);
    wireCloseGuardBypass(window);

    const devUrl = devServerUrl();
    if (devUrl !== null) {
        void window.loadURL(devUrl);
        window.webContents.openDevTools({ mode: 'detach' });
    } else {
        void window.loadURL(APP_INDEX_URL);
    }

    window.once('ready-to-show', () => {
        window.show();
    });

    return window;
}

/**
 * Send http(s) links to the user's browser instead of letting Electron open a
 * chrome-less child window, and refuse every other target.
 *
 * The About modal's attribution links and the "Report Issues" button both call
 * `window.open`, so without this they would open a second, unaddressable window
 * with no way to navigate.
 */
function wireExternalLinks(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (isExternalUrl(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });

    // Keep the window pinned to the app itself: any navigation the renderer
    // attempts is either ignored or handed to the browser.
    window.webContents.on('will-navigate', (event, url) => {
        if (isAllowedRendererUrl(url)) return;
        event.preventDefault();
        if (isExternalUrl(url)) void shell.openExternal(url);
    });
}

/**
 * Cancel the page's `beforeunload` block.
 *
 * `src/index.ts` registers a `beforeunload` handler that returns a value, so
 * that a browser tab warns before discarding a running simulation. Electron
 * interprets that as "do not close" and would leave the window — and therefore
 * the app — impossible to quit. Here the close always wins.
 */
function wireCloseGuardBypass(window: BrowserWindow): void {
    window.webContents.on('will-prevent-unload', (event) => {
        event.preventDefault();
    });
}

/** Surface load and preload failures instead of leaving a blank window. */
function wireDiagnostics(window: BrowserWindow): void {
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
        console.error(
            `[window] Failed to load ${validatedUrl} (${errorCode}): ${errorDescription}`
        );
    });

    window.webContents.on('preload-error', (_event, preloadPath, error) => {
        console.error(`[window] Preload failed: ${preloadPath}`, error);
    });
}

function isExternalUrl(url: string): boolean {
    return url.startsWith('https://') || url.startsWith('http://');
}

/** True for the packaged bundle and for the dev server the window was loaded from. */
function isAllowedRendererUrl(url: string): boolean {
    if (url.startsWith(`${APP_SCHEME}://`)) return true;
    const devUrl = devServerUrl();
    return devUrl !== null && url.startsWith(devUrl);
}
