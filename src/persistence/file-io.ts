import { SAVE_FILE_EXTENSION } from './save-file';

/** A file the user picked to open. */
export interface IOpenedFile {
    name: string;
    contents: string;
}

/** Reads and writes saved systems: native dialogs on desktop, downloads and a file input on the web. */
export interface ISystemFileIO {
    /** Asks where to save and writes `contents`. False when the user cancelled. */
    save(defaultName: string, contents: string): Promise<boolean>;
    /** Asks for a file and reads it. Null when the user cancelled. */
    open(): Promise<IOpenedFile | null>;
}

const MIME_TYPE = 'application/json';
const ACCEPT = `.${SAVE_FILE_EXTENSION},.json`;

/**
 * Saves through a regular browser download. The web build always saves this way: Chrome's
 * File System Access picker can refuse to write the picked file (NotAllowedError), and a
 * fallback after the picker would show a second save dialog.
 */
function downloadFile(fileName: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a file through a hidden file input. */
function pickFile(): Promise<IOpenedFile | null> {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ACCEPT;
        input.style.display = 'none';

        const cleanUp = () => input.remove();
        input.addEventListener('cancel', () => {
            cleanUp();
            resolve(null);
        });
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            cleanUp();
            if (!file) {
                resolve(null);
                return;
            }
            file.text().then(
                (contents) => resolve({ name: file.name, contents }),
                (e: unknown) => reject(e instanceof Error ? e : new Error(String(e)))
            );
        });

        document.body.appendChild(input);
        input.click();
    });
}

const webFileIO: ISystemFileIO = {
    save(defaultName, contents) {
        downloadFile(defaultName, new Blob([contents], { type: MIME_TYPE }));
        return Promise.resolve(true);
    },
    open: pickFile,
};

/** The file I/O for the shell the app is running in. */
export function getSystemFileIO(): ISystemFileIO {
    const desktop = window.desktop;
    if (desktop) {
        return {
            save: (defaultName, contents) => desktop.saveSystemFile(defaultName, contents),
            open: () => desktop.openSystemFile(),
        };
    }
    return webFileIO;
}
