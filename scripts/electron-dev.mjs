// Runs the simulator as a desktop app against the live Vite dev server.
//
// Electron loads the dev server URL rather than `dist/`, so the renderer keeps
// hot-module reload while the main process runs the real desktop shell — the
// same protocol handler, window wiring and menu policy a packaged build uses.

import { spawn } from 'node:child_process';
import path from 'node:path';

import electronPath from 'electron';
import { createServer } from 'vite';

import { compileElectronMain } from './electron-compile.mjs';
import { projectRoot } from './local-bin.mjs';

const DEV_SERVER_PORT = 5173;

// Electron cannot start until the main process exists.
compileElectronMain();

const server = await createServer({
    configFile: path.join(projectRoot, 'vite.config.ts'),
    // Pinned so the URL handed to Electron is the one the server actually uses.
    // Letting Vite fall back to a spare port would leave the window loading nothing.
    server: { port: DEV_SERVER_PORT, strictPort: true },
});
await server.listen();

const rendererUrl = server.resolvedUrls?.local?.[0];
if (rendererUrl === undefined) {
    await server.close();
    throw new Error('Vite did not report a local dev server URL.');
}

console.log(`Launching Electron against ${rendererUrl}`);

const electronProcess = spawn(electronPath, ['.'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl },
});

let isShuttingDown = false;

/** Close the dev server exactly once, then exit with the given code. */
async function shutdown(exitCode) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    await server.close();
    process.exit(exitCode);
}

electronProcess.on('close', (code) => {
    void shutdown(code ?? 0);
});

electronProcess.on('error', (error) => {
    console.error('Failed to launch Electron:', error);
    void shutdown(1);
});

// Ctrl+C in the terminal closes Electron, whose `close` event then tears the
// dev server down through the normal path above.
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        electronProcess.kill();
    });
}
