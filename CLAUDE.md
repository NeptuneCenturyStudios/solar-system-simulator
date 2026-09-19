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
npm run dev          # Start Vite dev server
npm run build        # Production build to dist/
npm run tsc          # Type-check (vue-tsc --noEmit)
npm run lint         # ESLint
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
src/
├── bodies/           # Celestial body classes (planets, stars, moons, asteroids, ships, etc.)
│   └── ships/        # Player/AI spacecraft models
├── camera/           # Camera controllers (surface camera, etc.)
├── drawing/          # HUD rendering, text, orbit prediction, textures
├── effects/          # Visual effects (corona, black hole jets, supernova, lensing, etc.)
├── event-log/        # In-game event logging
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

## Current milestone
- **Working on 1.3.0**
- **Phase 1**
- [x] Phase 1.1: Add atmospheric drag
- [x] Phase 1.2: Tweak visual appearance of entry flame effect to accomodate new atmospheric drag 
- [x] Phase 1.3: Add new shield layer of HP to ships which will gradually recharge over a fixed time for each ship (different shield hp amount and recharge rate per ship type)
- **Phase 2**
- [x] Phase 2: Add satellite station keeping to counter drag
- **Phase 3: Add satellite/probe missions**
- [x] Phase 3.1: Add hidden planetary attributes (such as average temp, atmospheric composition if any, body composition (soild, rock, minerals, types of metal like iron, gold, uranium, etc), liquid composition if any (water, liquid methane, etc), orbital period, etc...) that will be discoverable by satellites/probes
- [x] Phase 3.2: Add new probe mission UI modal to select a celestial target where the probe will fly to and gather data. This will mostly be benificial for procedural systems but will work for any system.
- [x] Phase 3.3: Add a new UI scene display (or use the name box) to display planetary attributes that are discovered by probes, or ones that are known already in the normal solar system
- **Phase 4**
- [x] Phase 4: Scenario updates. Add ability for a scenario to disable certain UI features like System Explorer or Flight Control panel or disable operations like delete a body while the scenario is running.
- **Phase 5**
- [ ] Phase 5: New scenario. Defend Earth from an onslaught of ~100 (to be adjusted) ELEs comprised of asteroids and comets. User will get to use the Osiris to take them all down before Earth is destroyed.
- **Phase 6 - Fixes and adjustments**
- [ ] Phase 6.1: Adjust Neptune's orbit to match real orbit (like we did for Pluto)
- [x] Phase 6.2: Ability to leave weapon fire in scene if paused even when user exits flight mode. Bolts will freeze in space and not tick down their lifetime, and laser will remain persistent in space.
- [x] Phase 6.3: Smooth camera zoom (ease-in-out)
- [x] Phase 6.4: Update the comet/asteroid object assets
- **Phase 7 - More ship AI updates**
- [x] Phase 7.1: Test AI Ship scenario. Start user in ship (Zenith) like the Asteroid Defense scenario (no lockdowns required). NPC ship should approach player ship. Target distance to player is ~500m or about 0.5km / DIST_SCALE. NPC ship should pursue player ship and fire weapons. NPC ship will need an adaptation to aiming since player uses mouse to aim. NPC ship should have same range of aim that a player has (so it cannot fire behind itself and must steer toward player to get into aiming range.) If the player destroyes the NPC ship, then the NPC ship should respawn a distance from the player. All weapon behaviors should be the same (cooldown, rate of fire, heat, etc.)

## UI (Vue)

- **New UI:** `src/vue/` — Vue 3 SFC components, composables, reactive state via `ui-store.ts`
- **Bridge:** `src/vue/sim-bridge.ts` connects Vue components to the Three.js simulation core

**When building new UI features:**

1. Work in `src/vue/` using Vue 3 composition API
2. Use existing composables and `sim-bridge.ts` to interact with the simulation

## Distance, radius, and mass calculations

- All distances and radius should be stored in km and scaled with DIST_SCALE and RADIUS_SCALE consts.
- Mass should be expressed in kg and scaled with MASS_SCALE

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
