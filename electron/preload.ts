/**
 * Preload bridge.
 *
 * Exposes a deliberately tiny surface: the renderer only needs to know that it
 * is running inside the desktop shell. Anything more (filesystem access,
 * hi-res asset selection, window controls) should be added here alongside the
 * feature that consumes it, rather than opening a general-purpose channel.
 *
 * Runs sandboxed, so it may only use `contextBridge` and the sandboxed
 * `process` shim — which is all this file needs.
 */

import { contextBridge } from 'electron';

export interface DesktopEnvironment {
    /** True when the app is running inside Electron rather than a browser tab. */
    readonly isElectron: true;
    /** Node's platform id, e.g. 'win32', 'darwin', 'linux'. */
    readonly platform: string;
    /** Electron runtime version, useful in diagnostics. */
    readonly electronVersion: string;
}

const desktopEnvironment: DesktopEnvironment = {
    isElectron: true,
    platform: process.platform,
    electronVersion: process.versions.electron,
};

contextBridge.exposeInMainWorld('desktop', desktopEnvironment);
