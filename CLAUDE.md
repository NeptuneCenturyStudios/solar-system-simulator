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

- **ripgrep (`rg`)** is installed via Chocolatey at `C:\ProgramData\chocolatey\bin\rg.exe` and is on the machine PATH.
    - If the Sixth extension's built-in `search_files` tool reports "Could not find ripgrep binary", fix it:
        1. Open VSCode Settings (`Ctrl+,`)
        2. Search for `ripgrep`
        3. Set **Search: Rg Path** to: `C:\ProgramData\chocolatey\bin\rg.exe`
    - CLI example: `rg "class.*Body" src/bodies/` or `rg "TODO|FIXME" src/`

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
- [ ] Phase 3.1: Add hidden planetary attributes (such as average temp, atmospheric composition, soil composition, orbital period, etc...) that will be discoverable by satellites/probes
- [ ] Phase 3.2: Add new probe mission UI modal to select a celestial target where the probe will fly to and gather data. This will mostly be benificial for procedural systems but will work for any system.
- [ ] Phase 3.3: Add a new UI scene display (or use the name box) to display planetary attributes once they are discovered by probes
- **Phase 4**
- [ ] Phase 4: Scenario updates. Add ability for a scenario to disable certain UI features like System Explorer or Flight Control panel or disable operations like delete a body while the scenario is running.
- **Phase 5**
- [ ] Phase 5: New scenario. Defend Earth from an onslaught of ~100 (to be adjusted) ELEs comprised of asteroids and comets. User will get to use the Osiris to take them all down before Earth is destroyed.
- **Phase 6 - Fixes and adjustments**
- [ ] Phase 6.1: Adjust Neptune's orbit to match real orbit (like we did for Pluto)
- [ ] Phase 6.1: Ability to leave weapon fire in scene if paused even when user exits flight mode. Bolts will freeze in space and not tick down their lifetime, and laser will remain persistent in space.
- [ ] Phase 6.2: Smooth camera zoom (ease-in-out)

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
