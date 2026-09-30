// Compiles the Electron main-process sources into `electron-dist/`.
//
// The build also drops a `package.json` marker into that directory. The root
// package.json declares `"type": "module"` for the Vite app, so without the
// marker Node would treat the compiled CommonJS main process as ESM and refuse
// to load it. Writing `{"type":"commonjs"}` scopes the CommonJS interpretation
// to just this output directory.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isDirectRun, projectRoot, runPackageBin } from './local-bin.mjs';

const outputDirectory = path.join(projectRoot, 'electron-dist');

/** Type-check and emit the main-process bundle. Throws if `tsc` fails. */
export function compileElectronMain() {
    runPackageBin('typescript', 'tsc', ['-p', 'tsconfig.electron.json']);

    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(
        path.join(outputDirectory, 'package.json'),
        JSON.stringify({ type: 'commonjs' }, null, 4) + '\n'
    );

    console.log('Compiled Electron main process to electron-dist/');
}

// Running this file performs the compile; importing it from another script only
// pulls in the function.
if (isDirectRun(import.meta.url)) {
    compileElectronMain();
}
