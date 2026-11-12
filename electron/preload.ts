/**
 * Preload bridge.
 *
 * Exposes a deliberately tiny surface: the renderer only needs to know that it
 * is running inside the desktop shell, plus native dialogs for saved systems. Anything more (filesystem access,
 * hi-res asset selection, window controls) should be added here alongside the
 * feature that consumes it, rather than opening a general-purpose channel.
 *
 * Runs sandboxed, so it may only use `contextBridge` and the sandboxed
 * `process` shim — which is all this file needs.
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * IPC channels for saved solar systems. Duplicated from `constants.ts` on purpose: a
 * sandboxed preload can only require 'electron', not sibling modules.
 */
const SAVE_CHANNEL = 'system-file:save';
const OPEN_CHANNEL = 'system-file:open';

export interface OpenedSystemFile {
    name: string;
    contents: string;
}

export interface DesktopEnvironment {
    /** True when the app is running inside Electron rather than a browser tab. */
    readonly isElectron: true;
    /** Node's platform id, e.g. 'win32', 'darwin', 'linux'. */
    readonly platform: string;
    /** Electron runtime version, useful in diagnostics. */
    readonly electronVersion: string;
    /** Shows a native save dialog and writes `contents`; false when cancelled. */
    saveSystemFile(defaultName: string, contents: string): Promise<boolean>;
    /** Shows a native open dialog and reads the picked file; null when cancelled. */
    openSystemFile(): Promise<OpenedSystemFile | null>;
}

const desktopEnvironment: DesktopEnvironment = {
    isElectron: true,
    platform: process.platform,
    electronVersion: process.versions.electron,
    saveSystemFile: (defaultName, contents) =>
        ipcRenderer.invoke(SAVE_CHANNEL, defaultName, contents) as Promise<boolean>,
    openSystemFile: () => ipcRenderer.invoke(OPEN_CHANNEL) as Promise<OpenedSystemFile | null>,
};

contextBridge.exposeInMainWorld('desktop', desktopEnvironment);
