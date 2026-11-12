/**
 * Native open/save dialogs for saved solar systems.
 *
 * The renderer is sandboxed and has no filesystem access, so it sends the file's text here
 * (save) or receives it from here (open). Only files the user picks in a native dialog are
 * ever read or written, and only with the save-file extension.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';

import { SAVE_FILE_CHANNELS, SYSTEM_FILE_EXTENSION } from './constants';

/** Largest save file accepted, so a mis-picked huge file can't stall the renderer. */
const MAX_SAVE_FILE_BYTES = 50 * 1024 * 1024;

const FILE_FILTERS = [
    { name: 'Solar System', extensions: [SYSTEM_FILE_EXTENSION] },
    { name: 'All Files', extensions: ['*'] },
];

export interface IOpenedSystemFile {
    name: string;
    contents: string;
}

function ownerWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
    return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

/** Ensures the chosen path ends with the save-file extension. */
function withExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase() === `.${SYSTEM_FILE_EXTENSION}`
        ? filePath
        : `${filePath}.${SYSTEM_FILE_EXTENSION}`;
}

async function saveSystemFile(
    event: IpcMainInvokeEvent,
    defaultName: unknown,
    contents: unknown
): Promise<boolean> {
    if (typeof defaultName !== 'string' || typeof contents !== 'string') return false;

    const options = {
        title: 'Save Solar System',
        defaultPath: path.basename(defaultName),
        filters: FILE_FILTERS,
    };
    const owner = ownerWindow(event);
    const result = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;

    await fs.writeFile(withExtension(result.filePath), contents, 'utf8');
    return true;
}

async function openSystemFile(event: IpcMainInvokeEvent): Promise<IOpenedSystemFile | null> {
    const options: Electron.OpenDialogOptions = {
        title: 'Open Solar System',
        properties: ['openFile'],
        filters: FILE_FILTERS,
    };
    const owner = ownerWindow(event);
    const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return null;

    const stat = await fs.stat(filePath);
    if (stat.size > MAX_SAVE_FILE_BYTES) {
        throw new Error('The file is too large to be a solar system save.');
    }
    return { name: path.basename(filePath), contents: await fs.readFile(filePath, 'utf8') };
}

/** Registers the IPC handlers. Call once, after the app is ready. */
export function registerFileDialogHandlers(): void {
    ipcMain.handle(SAVE_FILE_CHANNELS.save, saveSystemFile);
    ipcMain.handle(SAVE_FILE_CHANNELS.open, openSystemFile);
}
