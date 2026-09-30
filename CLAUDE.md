# CLAUDE.md — Solar System Simulator

## Project Overview

An interactive 3D solar system simulator built with Three.js and Vue 3. Features procedural solar system generation, orbital mechanics, spacecraft flight controls, celestial body rendering with atmospheric/stellar effects, and a modding system.

**Repo:** `NeptuneCenturyStudios/solar-system-simulator`

## Tech Stack

- **Language:** TypeScript 6 (strict mode)
- **UI Framework:** Vue 3.5 (transitioning from legacy HTML — see UI Migration below)
- **Rendering:** Three.js 0.184
- **Build:** Vite 8 (root: `src/`)
- **Linting:** ESLint 10 + eslint-plugin-vue
- **Formatting:** Prettier
- **Type Checking:** vue-tsc --noEmit

## Commands

```bash
# Web (unchanged deploy path)
npm run dev                  # Start Vite dev server
npm run build                # Production build to dist/
npm run tsc                  # Type-check (vue-tsc --noEmit)
npm run lint                 # ESLint

# Desktop (Electron)
npm run electron:dev         # Vite dev server + Electron, with HMR
npm run electron:compile     # Compile electron/ -> electron-dist/
npm run electron:build       # Build + package for the host platform
npm run electron:build:win   # ...for Windows (NSIS installer + portable)
npm run electron:build:mac   # ...for macOS (dmg + zip) - macOS host only
npm run electron:build:linux # ...for Linux (AppImage + deb)
```

## Tooling

- **ripgrep (`rg`)** is installed via a package manager, and each install places its binary on that machine's PATH. The absolute path differs per machine:
    - **Chocolatey machine:** `C:\ProgramData\chocolatey\bin\rg.exe` (added to the *machine* PATH by Chocolatey)
    - **WinGet machine:** `C:\Users\ebutler\AppData\Local\Microsoft\WinGet\Packages\BurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe\ripgrep-15.2.0-x86_64-pc-windows-msvc\rg.exe` (added to the *user* PATH by WinGet)
        - This path is version-pinned: the `ripgrep-<version>-x86_64-pc-windows-msvc` folder name changes on `winget upgrade`.
        - WinGet's stable, version-independent shim is `C:\Users\ebutler\AppData\Local\Microsoft\WinGet\Links\rg.exe`. It exists only when Developer Mode is enabled (WinGet creates it as a symlink), and that folder is not on PATH by default.
    - A terminal opened *before* the install will not see `rg` — open a new terminal to pick up the PATH change.
    - CLI example: `rg "class.*Body" src/bodies/` or `rg "TODO|FIXME" src/`
    - Note: `choco install ripgrep` requires an elevated (Administrator) shell; without one it fails with `Access to the path 'C:\ProgramData\chocolatey\lib\ripgrep\tools' is denied`.

### `search_files` reports "Could not find ripgrep binary"

**Setting `Search: Rg Path` does not fix this.** Verified against `sixth.sixth-ai-0.3.2`: the string `rgPath` appears nowhere in `dist/extension.js`, and the extension contributes no ripgrep setting (its only `contributes.configuration` keys are `sixth.telegram.*`). Its resolver looks *only* inside the VS Code install directory — never at `PATH`, and never at `search.rgPath`:

```
<vscode.env.appRoot>/node_modules/@vscode/ripgrep/bin/rg.exe
<vscode.env.appRoot>/node_modules/vscode-ripgrep/bin/rg.exe
<vscode.env.appRoot>/node_modules.asar.unpacked/vscode-ripgrep/bin/rg.exe
<vscode.env.appRoot>/node_modules.asar.unpacked/@vscode/ripgrep/bin/rg.exe
```

The cause is VS Code layout drift — recent VS Code ships ripgrep under a different package name and a nested platform folder:

- expected by the extension: `<appRoot>\node_modules.asar.unpacked\@vscode\ripgrep\bin\rg.exe`
- shipped by VS Code: `<appRoot>\node_modules.asar.unpacked\@vscode\ripgrep-universal\bin\win32-x64\rg.exe`

`appRoot` is versioned and not user-writable — on this machine it is `C:\Program Files\Microsoft VS Code\645f29cc31\resources\app` — so the fix needs an **elevated (Administrator) shell** and must be redone after every VS Code update (the `<build-id>` folder changes). This fix has been verified working: once the binary is in place, `search_files` returns results.

Run in an Administrator PowerShell:

```powershell
$root  = 'C:\Program Files\Microsoft VS Code'
$build = Get-ChildItem $root -Directory |
         Where-Object { $_.Name -match '^[0-9a-f]{10}$' } |
         Sort-Object Name -Descending | Select-Object -First 1
$app = Join-Path $build.FullName 'resources\app'
$dst = Join-Path $app 'node_modules.asar.unpacked\@vscode\ripgrep\bin'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Force -Path (Join-Path $app 'node_modules.asar.unpacked\@vscode\ripgrep-universal\bin\win32-x64\rg.exe') -Destination (Join-Path $dst 'rg.exe')
```

No VS Code restart is required — the extension resolves the binary on every call, so search works immediately.

The durable fix belongs upstream: the extension should also probe `@vscode/ripgrep-universal/bin/<platform>/`, and ideally fall back to `rg` on `PATH`.

## Architecture

```
electron/               # Electron main process (compiled separately to electron-dist/)
├── main.ts             # App lifecycle: single instance, window, menu
├── window.ts           # BrowserWindow wiring: load URL, links, close guard
├── protocol.ts         # Serves the web bundle over the app:// scheme
├── asset-root.ts       # Resolves the bundle root + guards path traversal
├── mime-types.ts       # Content types for the served files
├── menu.ts             # Menu policy (menuless, except macOS / dev)
└── preload.ts          # Minimal contextBridge surface (window.desktop)
scripts/                # Node build scripts (compile / dev / package)
src/
├── bodies/           # Celestial body classes (planets, stars, moons, asteroids, ships, etc.)
│   └── ships/        # Player/AI spacecraft models
├── camera/           # Camera controllers (surface camera, etc.)
├── drawing/          # HUD rendering, text, orbit prediction, textures
├── effects/          # Visual effects (corona, black hole jets, supernova, lensing, etc.)
├── event-log/        # In-game event logging
├── features/         # Solar system features returned by generators (Kuiper belt, etc.; non-body parts of a system)
├── events/           # Custom event listeners
├── gizmos/           # Debug gizmos (coordinate axes, grid, position indicator)
├── physics/          # Orbital mechanics and physics engine
├── procedural/       # Procedural generation (solar systems, planets, stars, moons, etc.)
│   └── desert/, frozen/, gas-giant/, ocean/, temperate/, terrestrial/, volcanic/
├── settings/         # Settings store
├── ship-effects/     # Ship visuals (flames, trails, weapons)
├── simulation/       # Animation loop, autopilot, flight controllers, simulation core
├── utilities/        # Audio, PRNG, constants, URL seed parsing, helpers
├── vue/              # ✅ NEW — Vue 3 UI layer
│   ├── components/   # Vue components (modals, panels)
│   ├── composables/  # Vue composables
│   ├── App.vue       # Root Vue component
│   ├── main.ts       # Vue app bootstrap
│   └── sim-bridge.ts # Bridge between Vue UI and simulation core
├── assets/           # Static assets (textures/, models/, sounds/)
├── index.html        # Entry HTML (Vite root)
├── index.ts          # Application entry point
├── style.css         # Global styles
├── interfaces.ts     # Core interfaces
├── types.ts          # Core type definitions
└── global.d.ts       # Global type declarations
```

## Previous milestones
For previous milestone info, see milestones.md

## Current milestone
- **Version 1.4.0**
- **Phase 1**
- [x] Phase 1.1: Make codebase buildable to web and electron
- ** Phase 2
- [ ] Phase 2.1: Add 8k assets
- [ ] Phase 2.2: Add option to pick low or high res (if a high res texture exists). Also increases the segement count for sphere meshes. Available only for electron app.
- [ ] Phase 2.3: Add more skydome textures.
- ** Phase 3
- [x] Phase 3.1: Convert Keiper belt into a solar system "feature" instead of being a static object in all systems. (Also ground work for future solar system features and procedurally generated features). Also allow farther zoom out than it currently so full keiper belt can be viewed.
- [ ] Phase 3.2: Procedural ring systems for planets
- [ ] Phase 3.3: Graphics option for render distance to help with performance.
- ** Phase 4
- [ ] Phase 4.1: Improve gizmo. It currently doesn't scale to body size well and is still a pain to use.
- [ ] Phase 4.2: Improve orbital data for all other planets. Pluto and Nepture already done.
- [ ] Phase 4.3: More work on ship AI.

## UI (Vue)

- **New UI:** `src/vue/` — Vue 3 SFC components, composables, reactive state via `ui-store.ts`
- **Bridge:** `src/vue/sim-bridge.ts` connects Vue components to the Three.js simulation core

**When building new UI features:**

1. Work in `src/vue/` using Vue 3 composition API
2. Use existing composables and `sim-bridge.ts` to interact with the simulation

## Desktop builds (Electron)

One renderer, two shells. `npm run build` still produces the web deploy; the desktop build runs the *same* `dist/` output inside Electron, so a fix in the web build is a fix in both.

- **Main process:** `electron/` (TypeScript), compiled to `electron-dist/` by `npm run electron:compile`. `tsconfig.electron.json` targets CommonJS; `electron/package.json` marks that folder CommonJS so the `node16` resolver emits `require()` despite the repo's `"type": "module"`.
- **No code signing** anywhere. macOS uses `identity: null`; CI sets `CSC_IDENTITY_AUTO_DISCOVERY=false`.
- **Cross-building limits:** Windows artifacts build on Windows. Linux targets need Docker when building from Windows. **macOS artifacts can only be built on macOS** — that is what `.github/workflows/release.yml` is for; it builds all three on their native runners.

### The bundle is served over `app://`, never `file://`

`electron/protocol.ts` registers `app://` as a standard, secure, CORS/fetch-capable scheme and serves `dist/` from it. This is not decoration:

- Chromium **refuses `fetch()` for `file://` URLs**. three.js's `FileLoader` uses `fetch` for every OBJ/MTL/GLTF model, and `src/utilities/audio.ts` fetches audio before decoding it. Under `file://` the sim would load planets but lose every model and every sound effect — a partial failure that is confusing to diagnose.
- The alternative, disabling `webSecurity`, removes the same-origin policy for the whole app.

`resolveBundleFile` rejects anything that escapes the bundle root, so `app://bundle/../../…` 404s.

### Packaging gotcha: `.obj` models are dropped by default

`electron-builder` appends a default `!**/*.{…,obj,…}` exclusion to every **string** pattern in `files`, because it reads `.obj` as a compiled C/C++ object file. That silently deletes all 13 Wavefront models (asteroids, comets, ISS, ships) while leaving their textures in place.

`electron-builder.yml` therefore ships `dist` through an explicit `from`/`to` mapping, which uses a matcher that does not receive those defaults. **If you ever add another asset type that goes missing from a packaged build, check `excludedExts` in `node_modules/app-builder-lib/out/fileMatcher.js` first** — the same trap applies to `.o`, `.a`, `.mk`, `.cc`, `.iml`, `.pyc` and friends.

To verify a packaged build actually contains what the app loads:

```bash
node -e "console.log(require('@electron/asar').listPackage('release/win-unpacked/resources/app.asar').filter(e=>e.includes('models')).join('\n'))"
```

### Renderer differences

- `index.html` only injects the Google Analytics tag over `http(s)`, so the desktop build never reports into the site's property.
- `src/index.ts` registers its `beforeunload` warning only when `window.desktop` is undefined. In Electron the window must always be closable; `electron/window.ts` additionally cancels any such block via `will-prevent-unload`.
- Outbound links (`AboutModal` credits, "Report Issues") open in the OS browser — `setWindowOpenHandler` denies in-app child windows.
- `window.desktop` (typed in `src/global.d.ts`) is the feature-detect for "running in the desktop shell".

## Distance, radius, and mass calculations

- All distances and radius should be stored in km and scaled with DIST_SCALE and RADIUS_SCALE consts.
- Mass should be expressed in kg and scaled with MASS_SCALE

## Keyboard Shortcuts
- When adding a keyboard shortcut, the new shortcut shoud be listed in the HelpPanel as well.

## Code Conventions

- **Strict TypeScript** — no `any`. Use explicit types everywhere.
- **ES modules** — all files use `import`/`export`
- **One file per component/class** — keep files focused
- **Vite root is `src/`** — imports are relative to `src/`, not the project root
- **Static assets** (textures, models, sounds) are copied to dist via `vite-plugin-static-copy`
- Run `npm run tsc` before committing to catch type errors
- Run `npm run lint` and `npm run format` to keep code clean

## Debugging and Verification

- User will verify runtime manually
