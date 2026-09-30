// Helpers for running the project's own tooling from the build scripts.
//
// Scripts invoke each package's real JavaScript entry point through the current
// Node binary rather than the `.cmd`/shebang shims npm generates in
// `node_modules/.bin`. Launching those shims on Windows requires `shell: true`,
// which Node deprecates for the argument-escaping risk it carries (DEP0190).
// Resolving the entry from the package's own `bin` field avoids both the shell
// and the platform-specific shim format.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the repository root (this file lives in `scripts/`). */
export const projectRoot = path.resolve(import.meta.dirname, '..');

/**
 * True when `moduleUrl` is the file Node was asked to run.
 *
 * Lets the scripts double as both commands and importable modules: running a
 * file directly performs its work, while importing it from another script only
 * pulls in the exported functions.
 */
export function isDirectRun(moduleUrl) {
    const entry = process.argv[1];
    return entry !== undefined && path.resolve(entry) === fileURLToPath(moduleUrl);
}

/**
 * Run one of the project's installed CLI tools.
 *
 * @param packageName Installed package holding the tool, e.g. 'typescript'.
 * @param binName     Name the package advertises for it, e.g. 'tsc'.
 * @param args        Arguments to forward.
 */
export function runPackageBin(packageName, binName, args = []) {
    execFileSync(process.execPath, [resolveBinPath(packageName, binName), ...args], {
        cwd: projectRoot,
        stdio: 'inherit',
    });
}

/** Absolute path to `binName` inside the installed `packageName`. */
function resolveBinPath(packageName, binName) {
    const packageDirectory = path.join(projectRoot, 'node_modules', packageName);
    /** @type {{ bin?: string | Record<string, string> }} */
    const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));

    const bin = manifest.bin;
    const relativeBin = typeof bin === 'string' ? bin : bin?.[binName];

    if (typeof relativeBin !== 'string') {
        throw new Error(`Could not find the "${binName}" binary in the ${packageName} package.`);
    }

    return path.resolve(packageDirectory, relativeBin);
}
