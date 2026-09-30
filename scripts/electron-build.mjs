// Builds the web bundle, compiles the Electron main process, then packages the
// desktop app.
//
// The renderer is built with the very same `vite build` the web deployment
// uses — there is one renderer bundle, not two. An optional platform argument
// ('win', 'mac' or 'linux') limits electron-builder to that target; without it
// the host platform is used.
//
// Cross-platform limits worth knowing: macOS artifacts can only be produced on
// macOS, and Linux targets need Docker when building from Windows. The release
// workflow under .github/workflows builds each platform on its own runner.

import { compileElectronMain } from './electron-compile.mjs';
import { runPackageBin } from './local-bin.mjs';

const SUPPORTED_PLATFORMS = ['win', 'mac', 'linux'];

const requestedPlatform = process.argv[2];
if (requestedPlatform !== undefined && !SUPPORTED_PLATFORMS.includes(requestedPlatform)) {
    console.error(
        `Unknown platform "${requestedPlatform}". Expected one of: ${SUPPORTED_PLATFORMS.join(', ')}.`
    );
    process.exit(1);
}

// Exactly the web build, so the packaged renderer can never drift from the
// deployed one.
runPackageBin('vite', 'vite', ['build']);
compileElectronMain();

const builderArguments = ['--config', 'electron-builder.yml'];
if (requestedPlatform !== undefined) {
    builderArguments.push(`--${requestedPlatform}`);
}

runPackageBin('electron-builder', 'electron-builder', builderArguments);
