/**
 * Electron main-process entry point.
 *
 * Lifecycle only: it declares the custom scheme before startup, serves the
 * built bundle once the app is ready, and keeps a single window alive in the
 * usual platform-specific way. Window construction lives in `window.ts` and
 * the menu policy in `menu.ts`, so this file stays readable.
 *
 * The same `dist/` output the web deployment uses is what gets packaged, so
 * there is exactly one renderer build to keep working.
 */

import { app, BrowserWindow } from 'electron';

import { installApplicationMenu } from './menu';
import { registerAppProtocolHandler, registerAppScheme } from './protocol';
import { createMainWindow, devServerUrl } from './window';

// Privileged schemes can only be registered before the app becomes ready.
registerAppScheme();

const isDevelopment = devServerUrl() !== null;

/**
 * Held at module scope so the window is not garbage collected while open.
 * A closed window resets this to null.
 */
let mainWindow: BrowserWindow | null = null;

/** Bring the existing window forward, or create one if there is none. */
function focusOrCreateWindow(): void {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        return;
    }

    mainWindow = createMainWindow();
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// A second launch should surface the running instance rather than start a rival
// copy of the simulator against the same userData directory.
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        focusOrCreateWindow();
    });

    void app.whenReady().then(() => {
        registerAppProtocolHandler();
        installApplicationMenu(isDevelopment);
        focusOrCreateWindow();

        // macOS keeps the process alive with no windows open; clicking the dock
        // icon is expected to bring the simulator back.
        app.on('activate', () => {
            focusOrCreateWindow();
        });
    });

    app.on('window-all-closed', () => {
        // macOS apps conventionally stay running until explicitly quit.
        if (process.platform !== 'darwin') app.quit();
    });
}
