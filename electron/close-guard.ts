/**
 * Asks the renderer before the window closes, so the user can save the running system.
 *
 * Closing the window (title bar, Alt+F4, Cmd+Q, ...) is held back and the renderer is asked
 * through CLOSE_CHANNELS.requested. It shows its exit prompt and answers with
 * CLOSE_CHANNELS.response: true closes (and quits, if a quit started this), false stays.
 *
 * The guard only engages once the renderer has said it is listening (CLOSE_CHANNELS.ready).
 * Before that, or after the page starts a new document load or its process dies, the window closes
 * straight away, so a broken renderer can never leave the app impossible to quit.
 */

import { app, ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron';

import { CLOSE_CHANNELS } from './constants';

export function wireCloseGuard(window: BrowserWindow): void {
    const contents = window.webContents;
    /** The renderer has registered a close handler on the current page. */
    let rendererListening = false;
    /** Set once the renderer agreed, so the next close goes through. */
    let closeConfirmed = false;
    /** The close came from a quit (Cmd+Q, app.quit), which should resume once confirmed. */
    let quitRequested = false;

    const onBeforeQuit = (): void => {
        quitRequested = true;
    };
    app.on('before-quit', onBeforeQuit);

    const fromThisWindow = (event: IpcMainEvent): boolean => event.sender === contents;

    const onReady = (event: IpcMainEvent): void => {
        if (fromThisWindow(event)) rendererListening = true;
    };
    const onResponse = (event: IpcMainEvent, allowClose: unknown): void => {
        if (!fromThisWindow(event)) return;
        if (allowClose !== true) {
            quitRequested = false;
            return;
        }
        closeConfirmed = true;
        if (quitRequested) {
            app.quit();
        } else {
            window.close();
        }
    };
    ipcMain.on(CLOSE_CHANNELS.ready, onReady);
    ipcMain.on(CLOSE_CHANNELS.response, onResponse);

    // A new page has not registered its handler yet; a dead one never will. Only a real
    // document load counts: launching a system rewrites the URL with history.pushState, a
    // same-document navigation that also fires 'did-start-loading' but keeps the page (and
    // its handler) alive.
    contents.on('did-start-navigation', (event) => {
        if (event.isMainFrame && !event.isSameDocument) rendererListening = false;
    });
    contents.on('render-process-gone', () => {
        rendererListening = false;
    });

    window.on('close', (event) => {
        if (closeConfirmed || !rendererListening || contents.isCrashed()) return;
        event.preventDefault();
        contents.send(CLOSE_CHANNELS.requested);
    });

    window.on('closed', () => {
        app.removeListener('before-quit', onBeforeQuit);
        ipcMain.removeListener(CLOSE_CHANNELS.ready, onReady);
        ipcMain.removeListener(CLOSE_CHANNELS.response, onResponse);
    });
}
