# Alien Invasion — prerequisites plan (Phase 2 groundwork)

## Context

`designs/scenarios/alien-invasion.md` describes a fleet battle (1 capital + 20 fighters per team) near Earth. The Harbinger, Wraith and Stinger ships now exist (`src/bodies/ships/`). The doc lists four prerequisites that must be built **and user-tested before** the scenario itself. This plan covers only those prerequisites. The scenario (Phase 2.3: Mars start, unlinked wormhole, distress calls, team stat bar, spectate option) gets its own plan afterwards.

What the code has today:

- No team, faction or ship-role concept exists; only `shipTypeId` and a cosmetic `isThreat`.
- Every AI attacks only the player (`FollowShipAI.getTarget()`, `src/simulation/ai/follow-ship-ai.ts:93`).
- Weapons hit every body except their shooter.
- Ship velocity is heliocentric. The only moving reference frame is `Body.atmosphereFrameVel`, inside atmospheres.

Decisions made with you:

- Prerequisites only.
- The sphere of influence is decided by the Hill sphere.
- Friendly fire stays on, but AI ships hold fire when a friendly is in the line of fire.
- The guidance toggle key is **V**.

The work is split into four stages, each testable on its own.

---

## Stage A — Ship role + team data model

1. **`src/types.ts`:**
    - Add `enum ShipRole { Fighter, Capital }`.
    - Add a `ShipTeam` string type with constants `TEAM_EARTH = 'earth'` and `TEAM_ALIEN = 'alien'`. `null` means no team, i.e. the legacy behaviour.
2. **`src/bodies/ships/ship-registry.ts` (`IShipType`):** add `role: ShipRole` and `defaultTeam: ShipTeam | null`.
    - Zenith and Dart: Fighter, earth.
    - Osiris: Capital, earth.
    - Harbinger: Capital, alien.
    - Wraith and Stinger: Fighter, alien.
3. **`ISpaceshipCreationOptions` (`src/interfaces.ts:593`) and `Spaceship`:**
    - Add a readonly `role`, set from the registry.
    - Add a mutable `team`. It defaults to `null`, so existing scenarios keep working unchanged; scenarios set it explicitly.
    - Thread `team?` through `ICreateNpcShipOptions` / `createNpcShip` (`src/simulation/ai/npc-manager.ts:85`).
4. **New `src/simulation/teams.ts`:**
    - `areHostile(a, b)`: both teams are set and they differ.
    - `areFriendly(a, b)`.
    - `refreshThreatFlags()`: sets `isThreat` on team-tagged NPCs to whether they are hostile to the player's team. Call it from `registerNpcShip` and whenever the player ship or player team changes.
    - Ships with no team keep the existing `isThreat` behaviour, so target lock (`target-lock.ts`), the red HUD theme and the threat indicators work with no further changes.
5. **Kill attribution:**
    - Add `shooter: Body | null` to the `'weapon:hit'` detail (type at `src/index.ts:18`; dispatch sites in `bolt-weapon.ts:333`, `laser-weapon.ts:351`, `missile-weapon.ts:541`).
    - In the hit listener (`src/events/custom-event-listeners.ts:79`), record `lastDamagedBy` on the body.
    - On death, dispatch a new `'ship:destroyed'` event `{ship, team, role, killer}` from the `'body:dead'` listener (`custom-event-listeners.ts:107`).
    - The scenario's team stat bar will use this event later.

**Test:** `npm run tsc` and `npm run lint`. Existing scenarios (Osiris Ambush, Test AI Ships) behave exactly as before.

## Stage B — Velocity reference frame ("guidance")

**Doc intent:** in **high mode**, inside a non-star body's sphere of influence, the ship's base velocity tracks the reference body's velocity, and the pilot's thrust applies only low-mode speeds and accelerations relative to it. Thrust is refused once the speed relative to the reference body reaches the low-mode normal or boost max.

1. **New `src/physics/sphere-of-influence.ts`:**
    - `findReferenceBody(position)` walks the `CelestialBody.orbitParent` tree (`celestial-body.ts:143`). It returns the deepest non-star body whose Hill sphere contains the point, using r_H = a·∛(m / 3M), with a = current distance to the parent. Otherwise it returns `null`.
    - Hill radii are computed once per frame and cached, since they are ratios and need no unit conversion.
2. **`Spaceship` (`src/bodies/ships/spaceship.ts`):**
    - Add `guidanceEnabled`, `guidanceLocked` (a scenario forces it on and the player can't turn it off), `guidanceRefBody: CelestialBody | null` and `guidanceFrameVel: Vector3 | null`.
    - Generalise `relativeVelocity()`, `setRelativeVelocity()` and `forwardSpeedInFrame()` (`:639-665`) to use one `activeFrameVel` getter: `atmosphereFrameVel ?? guidanceFrameVel`. The atmosphere frame is more specific, so it wins.
    - The `handling` getter (`:103`) returns `lowSpeedHandling` whenever the guidance frame is active, even in high mode. Thrust, brake, boost and drift decay then all run on low-mode values relative to the body, with no other changes to `applyFlightThrustSubstep`.
    - **Relative speed cap:** in `applyFlightThrustSubstep`, while the guidance frame is active, refuse thrust once the ship's relative speed to the reference body reaches the low-mode cap. That is `flightMaxSpeed` (500 m/s) for normal thrust and `flightBoostMaxSpeed` (2.5 km/s) for boost. The check uses the full relative speed `rel.length()`, not just the forward component, so diagonal drift can't stack past the cap. Brake and drift decay still work above the cap. No absolute (world-speed) cap is applied.
    - **Continuous velocity tracking:** each frame, add the change in the reference body's velocity since last frame to the ship's velocity. This lets the ship follow Earth's orbital acceleration around the Sun. The reference body's own gravity still acts, so ships can fall toward a planet; the ship velocity is not overwritten.
    - When the reference body changes, re-base only the frame (the ship's world velocity is unchanged), so there is no jolt.
    - Warp, warp charge and the classic autopilot disengage the frame for their duration.
3. **`src/simulation/animation-loop.ts`:** add a per-frame `updateGuidanceFrame(ship)` for the player and every NPC, next to `checkAtmosphericEntry` (`:251`). It sets `guidanceFrameVel` from the reference body's `velocity`. It applies only when `highSpeedMode && guidanceEnabled && ref`, and is cleared otherwise.
4. **Toggle:**
    - Add `toggleGuidance` in `src/simulation/keyboard-controls.ts` on **V**, using `pressOnce` with `inFlight`. It is refused, with a short HUD message, when `guidanceLocked`.
    - Add a row to the Flight Mode section of `src/vue/help-content.ts:62-83`.
    - Default off.
5. **Cockpit and HUD:**
    - Add `guidance: 'OFF' | 'STANDBY' | 'LOCKED <BODY>'` to `ICockpitTelemetry` (`src/drawing/cockpit-dashboard.ts:8-44`) and fill it in `CockpitView.gatherTelemetry()` (`src/camera/cockpit-view.ts:231-321`).
    - Draw it in `paintSpeedScreen`, beside the `FLIGHT · HIGH TIER` title at `:235`. NAV's `REL V` already shows speed relative to the body. No model change is needed unless the text doesn't fit.
    - Third-person HUD: extend `refreshSpeedSprite({speedMode})` (`src/drawing/text-rendering.ts:49-95`) with a `GUIDE` tag.

**Test:** fly a Zenith near Earth in high mode and press V. W tops out at 500 m/s relative and Shift at 2.5 km/s relative, while REL V stays near 0 with no input. Turning V off restores normal high-mode behaviour. Away from planets (Sun only), guidance shows STANDBY and normal high mode applies.

**Consequence to be aware of:** while guidance is on, leaving a planet's Hill sphere (about 1.5 million km for Earth) at 2.5 km/s is slow. Either turn guidance off, or use warp, which disengages it.

## Stage C — Team-aware AI

1. **New `src/simulation/ai/target-selector.ts`:** `selectTarget(self, profile)` scores every hostile, non-disposed `Spaceship` in `simulationState.npcShips` plus the player ship.
    - **Role priority:**
        - Fighters target enemy fighters first, then capitals.
        - Capitals target enemy capitals first, then either fighters or a fallback `Body` that the profile supplies. The alien scenario will pass Earth.
    - **Load-balancing:** a score penalty per attacker already engaging a target. The player gets an extra large penalty, so they are chosen only when no other target exists.
    - Re-evaluate every few sim-seconds, with hysteresis so ships don't flip between targets.
    - `ITargetingProfile` lives on the AI. Its default is derived from `role`.
2. **`FollowShipAI.getTarget()` (`follow-ship-ai.ts:93`):**
    - If `ship.team` is null, keep the current "attack the player" path, so legacy scenarios are untouched.
    - Otherwise use the selector.
    - Widen the return type from `Spaceship` to `Body` so a capital can attack a planet. Check the uses in `combat-ship-ai.ts` (lines 889, 967, 1044) and `hullRadius()`.
3. **Friendly-fire avoidance:** in `CombatShipAI.updateGunnery()` (`combat-ship-ai.ts:954`), just before `fire = true` (`:1024`), test the shot ray against the bounding spheres of friendly ships closer than the target. If a friendly is in the way, hold fire.
4. **AI in the guidance frame:**
    - NPCs in a team scenario get `guidanceEnabled` set.
    - Update `selectSpeedTier` (`ai/navigation/speed-tier.ts:32`) and `ai/navigation/velocity-control.ts:36-64` to measure velocity error in the ship's active frame, using the now-public `activeFrameVel`, instead of the world frame. This lets AI dogfight in high mode plus guidance.
5. **Formation spacing:** check that the existing avoidance keeps teammates from stacking. If it doesn't, add a light separation term against friendlies.

## Stage D — Test harness

Extend `src/scenarios/test-ai-ships-scenario.ts`, or add a sibling "Team Skirmish" test entry using the same wiring (`SimulationStartMode`, `spawn()`, the scenarios modal). It runs near Earth with a small fleet on each side:

- Team Earth: Osiris + 3 Dart/Zenith + the player.
- Team Alien: Harbinger + 3 Wraith/Stinger.

All ships have guidance on and locked. Spawn ships with Earth's velocity plus an offset, following `ExtinctionEventGenerator.createPlayerShip()` (`src/procedural/extinction-event-generator.ts:54-90`). Log `'ship:destroyed'` events to the event log. This lets you check Stages A–C at small scale before the 20-vs-20 scenario.

---

## Verification

- `npm run tsc`, `npm run lint` and `npm run format` after each stage.
- Per CLAUDE.md, you verify runtime behaviour manually. The per-stage checks are listed above, plus:
    - Osiris Ambush is unchanged.
    - In the skirmish, fighters engage enemy fighters before capitals, and the motherships duel each other.
    - The player is not swarmed while other targets remain.
    - AI ships rarely shoot teammates.
- Commit at the end of each stage only when you ask.

---

## As built (deviations from the plan above)

- **Ship role** is set in each ship class's creation options (`role: ShipRole.Fighter | Capital`), not in the registry. The registry holds only `defaultTeam`. The enums live in `src/bodies/ships/ship-team.ts`, not `types.ts`.
- **Guidance applies in both speed tiers**, not only high mode. Dropping to low mode while flying next to Earth would otherwise throw the ship back into the 30 km/s heliocentric frame.
- **No per-frame "add Earth's velocity change" step.** The Sun pulls on the ship and on Earth almost equally, so that step would count the Sun's pull twice. Guidance instead cancels the reference body's own gravity on the ship, so relative velocity stays near 0 with no input. It also bleeds off any relative speed above the low-tier boost cap ("MATCH").
- **Hill-sphere parents** are resolved hierarchically: the explicit `orbitParent` if set, otherwise the smallest containing Hill sphere. Many generators leave `orbitParent` unset.
- **Planet targeting** (the Harbinger attacking Earth once the Osiris is gone) is deferred to the scenario. The AI target type stays `Spaceship`.
- **`speed-tier.ts` / `velocity-control.ts` are unchanged.** They only run under autopilot, which disengages guidance. The dogfight and follow AI already measure in-frame, and the follow AI's `outruns` check is now frame-relative.
- **Teammate separation steering** was added (`ai/navigation/friendly-separation.ts`), because obstacle avoidance ignores ships entirely.
- **Test harness:** Scenarios → TEAM SKIRMISH (TEST) (`TeamSkirmishGenerator` / `TeamSkirmishScenario`).
