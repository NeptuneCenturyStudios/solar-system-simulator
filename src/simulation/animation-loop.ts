import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { Body } from '../bodies/body';
import { CelestialBody } from '../bodies/celestial-body';
import { Supernova } from '../effects/supernova';
import { ScreenFlashEffect } from '../effects/screen-flash';
import { ScenarioMessageHud } from '../drawing/scenario-message-hud';
import { PlanetaryNebula } from '../effects/planetary-nebula';
import { GravitationalLensingEffect } from '../effects/gravitational-lensing';
import { SunRaysEffect } from '../effects/sun-rays';
import { LensFlareEffect } from '../effects/lens-flare';
import { beginStarLightingFrame } from '../effects/star-illumination';
import { SkyBackgroundDimmer } from '../effects/sky-background';
import { SurfacePrecisionPatch } from '../effects/surface-precision-patch';
import { CoordinateGizmo } from '../gizmos/coordinate-gizmo';
import { VelocityArcManager } from '../drawing/velocity-arc';
import { OrbitPredictionManager } from '../drawing/orbit-prediction';
import { PositionIndicatorManager } from '../gizmos/position-indicator';
import { GridHelperManager } from '../gizmos/grid-helper';
import { AiAvoidanceGizmo } from '../gizmos/ai-avoidance-gizmo';
import { FlightHUD } from '../drawing/flight-hud';
import type { CockpitView } from '../camera/cockpit-view';
import { AutopilotTargetIndicator } from '../drawing/autopilot-target-indicator';
import { PlanetNameIndicator, IPlanetNameFlightContext } from '../drawing/planet-name-indicator';
import { HealthBarIndicator } from '../drawing/health-bar-indicator';
import { AiDebugIndicator } from '../drawing/ai-debug-indicator';
import { ThreatIndicator } from '../drawing/threat-indicator';
import { MissileTrackerIndicator } from '../drawing/missile-tracker-indicator';
import { TargetLockIndicator } from '../drawing/target-lock-indicator';
import { LeadAimIndicator } from '../drawing/lead-aim-indicator';
import { SurfaceCameraManager } from '../camera/surface-camera';
import { Comet } from '../bodies/comet';
import { Wormhole } from '../bodies/wormhole';
import { processWormholeInteractions } from '../physics/wormhole-collision';
import { updateWormholeBridges } from '../effects/wormhole-link-bridge';
import { BodyTypeEnum } from '../bodies/body-enums';
import { settingsStore, type ToneMappingMode } from '../settings/settings-store';
import { absorbBody, destroyBody, updateSimulation } from '../physics/physics';
import { resolveCollision } from '../physics/collision';
import { updateGroundAlignment } from '../physics/ground-alignment';
import { updatePlayerRigFrame } from '../physics/player-rig-physics';
import { NotificationType } from '../event-log/event-log';
import { steeringDt } from './steering-clock';
import { findNearestSurface } from '../physics/nearest-surface';
import { surfaceVelocityAt } from '../physics/collision';
import { SoundEffect, playSoundEffect } from '../utilities/audio';
import { updateAudioListener } from '../utilities/spatial-audio';
import {
    applyLandingAttitudes,
    beginLanding,
    canBeginLanding,
    cancelLanding,
    findLandingSurface,
    updateLandings,
} from './ship-landing';
import { computeAtmosphericDensity } from '../physics/atmosphere-density';
import { resolveAtmosphericPassage } from '../physics/atmospheric-drag';
import { computeAtmosphereFrameVelocity } from '../physics/atmosphere-frame';
import { isBodyType } from '../utilities/utilities';
import { EntryFlameEffect } from '../effects/entry-flame';

import {
    ISimulationState,
    IFlightState,
    IInteractionState,
    ICameraState,
    IAutopilotState,
    IFlightControlContext,
} from '../interfaces';

import {
    BASE_FRAME_DT,
    MAX_SUBSTEPS_PER_FRAME,
    WALL_DT_SMOOTHING,
    GIZMO_TUNING,
    TIME_SCALE,
    TEXT_SPRITE_Z,
    WARP_SHAKE_MAG,
    FLIGHT_ALT_ORBIT_RETURN_SPEED,
    FREE_CAM_NORMAL_SPEED,
    FREE_CAM_BOOST_SPEED,
    FLIGHT_AUTOPILOT_CHARGE_TIME,
    HUD_ALTIMETER_MAX_ALTITUDE,
} from '../utilities/consts';
import {
    paintFPS,
    paintRenderInfo,
    renderInfoKey,
    type IRenderInfoStats,
    type SpeedHudParams,
} from '../drawing/text-rendering';
import type { BodyLodSystem } from '../drawing/body-lod';
import type { HudSprite } from '../drawing/hud/hud-sprite';
import type { ScreenProjector } from '../drawing/hud/screen-projection';
import { interactionState, simulationState, cameraState } from './simulation';
import { exitFlightMode, updateFlightControls } from './flight-controllers';
import { stepNpcShips } from './ai/npc-manager';
import { stepShipAiAutopilot } from './autopilot';
import { scenarioManager } from '../scenarios/scenario-manager';
import type { Spaceship } from '../bodies/ships/spaceship';
import { updateHillSpheres } from '../physics/sphere-of-influence';
import { updateShadows } from '../effects/shadows/shadow-system';
import { renderWithScaledPoints } from '../effects/render-scale-points';

/** The three.js curve for each tone-mapping setting. */
const TONE_MAPPING_CURVES: Readonly<Record<ToneMappingMode, THREE.ToneMapping>> = {
    agx: THREE.AgXToneMapping,
    aces: THREE.ACESFilmicToneMapping,
    neutral: THREE.NeutralToneMapping,
};

/** Scratch for the warp-sound speed lookup. */
const _warpSoundVel = new THREE.Vector3();
/** Scratch for the altimeter: local vertical and the surface frame velocity under the ship. */
const _altUp = new THREE.Vector3();
const _altFrameVel = new THREE.Vector3();
/** Scratch: this frame's drift of a destroyed focus body's frozen orbit point. */
const _frozenDriftDelta = new THREE.Vector3();

// ── Context interface ───────────────────────────────────────────────────────

/**
 * All the module-level bindings and objects from `index.ts` that `animate()`
 * reads or writes.  Mutable `let` variables are wrapped in a small `{ value }`
 * container so the extracted function can modify them through the context.
 */
export interface AnimationContext {
    // Three.js essentials
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    uiScene: THREE.Scene;
    uiCamera: THREE.OrthographicCamera;
    controls: OrbitControls;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;

    // State singletons (shared mutable objects – passed directly)
    autopilotState: IAutopilotState;
    cameraState: ICameraState;
    flightState: IFlightState;
    interactionState: IInteractionState;
    simulationState: ISimulationState;

    // Module-level `let` aliases — wrapped so the extracted code can assign through them.
    // index.ts sets ctx.xxx.value and reads ctx.xxx.value.
    selectedBody: { value: Body | null };
    manuallySelectedBody: { value: Body | null };
    NONE_FOCUS_POSITION: THREE.Vector3;
    supernovas: { value: Supernova[] };
    planetaryNebulae: { value: PlanetaryNebula[] };

    // Managers & effects
    lensingEffect: GravitationalLensingEffect;
    sunRaysEffect: SunRaysEffect;
    /** Whether the GPU can render to half-float targets (HDR capture). */
    hdrSupported: boolean;
    lensFlareEffect: LensFlareEffect;
    gizmo: CoordinateGizmo;
    velArc: VelocityArcManager;
    orbitPrediction: OrbitPredictionManager;
    posIndicator: PositionIndicatorManager;
    gridHelperManager: GridHelperManager;
    aiAvoidanceGizmo: AiAvoidanceGizmo;
    flightHUD: FlightHUD;
    cockpitView: CockpitView;
    targetIndicator: AutopilotTargetIndicator;
    planetNameIndicator: PlanetNameIndicator;
    healthBarIndicator: HealthBarIndicator;
    aiDebugIndicator: AiDebugIndicator;
    threatIndicator: ThreatIndicator;
    missileTrackerIndicator: MissileTrackerIndicator;
    targetLockIndicator: TargetLockIndicator;
    leadAimIndicator: LeadAimIndicator;
    surfaceCam: SurfaceCameraManager;
    screenFlash: ScreenFlashEffect;
    scenarioMessageHud: ScenarioMessageHud;

    // Overlay HUD
    /** Shared body→screen projector for the overlay indicators; primed once per frame. */
    screenProjector: ScreenProjector;
    /** Screen-size LOD: low-poly proxies and dots for bodies small on screen. */
    bodyLod: BodyLodSystem;
    fpsSprite: HudSprite;
    /** Render-info readout under the FPS counter (Options → Show Render Info). */
    renderInfoSprite: HudSprite;
    /** Moves the selected-body stats panel below the render-info readout while it is shown. */
    setStatsBelowRenderInfo: (below: boolean) => void;
    statsSprite: HudSprite;
    refreshStatsSprite: (body: Body) => void;
    speedSprite: HudSprite;
    refreshSpeedSprite: (params: SpeedHudParams) => void;

    // Keyboard state (from cameraState.keys)
    keys: {
        w: boolean;
        a: boolean;
        s: boolean;
        d: boolean;
        space: boolean;
        c: boolean;
        e: boolean;
        shift: boolean;
    };

    // Steering / flight UI geometry (mutable buffer / meshes created once in index.ts)
    flightSteeringLine: THREE.Line;
    steeringLinePositions: Float32Array;
    steeringEndMarker: THREE.Mesh;
    steeringOriginMarker: THREE.Mesh;

    // Callbacks that live in index.ts
    getFocusObject: () => Body | null;
    setFocusBody: (bodyOrNull: Body | null, opts?: { zoom?: boolean }) => void;
    updateAutopilotStep: (dt: number) => void;
    cancelAutopilot: (message?: string) => void;
    engageAutopilot: (target: Body) => void;
    triggerZoomToBody: (body: Body | null) => void;
    /** Per-frame Smooth Zoom easing step; owns all zoom math (lives in index.ts). */
    stepSmoothZoom: (
        isSurfaceModeActive: boolean,
        isFlightModeActive: boolean,
        wallDt: number
    ) => void;
}

// Scratch vectors for updateShipTrail (called once per ship per frame).
const _trailNozzle = new THREE.Vector3();
const _trailExhaustDir = new THREE.Vector3();
/** Dims the starfield under a daytime sky (see effects/sky-background.ts). */
const _skyBackground = new SkyBackgroundDimmer();
const _surfacePatch = new SurfacePrecisionPatch();

/**
 * Whether a ship's main engine is firing this frame — the signal that drives the
 * exhaust plume. Reads the ship's own control surface, so only forward thrust and
 * boost light it: coasting, drifting, braking and decelerating all leave the nozzle
 * dark. Because it reads the shared control surface, a player holding W/Shift, a
 * Chase-mode pilot (where S is forward thrust) and an AI ship all report identically.
 */
function isEngineFiring(ship: Spaceship): boolean {
    return ship.controlInput.thrust || ship.controlInput.boost;
}

/**
 * Update one ship's engine flames, one per engine nozzle.  Shared by the player's ship and every
 * AI-piloted ship so they render identically.
 *
 * @param ship      The ship whose trail to update.
 * @param speed     Speed to drive the trail intensity with (u/s).
 * @param boosting  True when the ship is at or shedding boost speed — selects the
 *                  boost ceiling for intensity normalisation.
 * @param thrusting True while the ship's engine is firing. When false the plume
 *                  stops emitting and its existing particles fade out over their
 *                  lifetime instead of being cut off dead.
 * @param dtTotal   Sim-time seconds advanced this frame.
 * @param cameraPos Camera world position, for distance-based trail detail.
 */
function updateShipTrail(
    ship: Spaceship,
    speed: number,
    boosting: boolean,
    thrusting: boolean,
    dtTotal: number,
    cameraPos: THREE.Vector3
): void {
    _trailExhaustDir.set(0, 0, -1).applyQuaternion(ship.mesh.quaternion);
    const h = ship.classicAutopilotActive ? ship.autopilotHandling : ship.handling;
    const trailMax = boosting ? h.flightBoostMaxSpeed : h.flightMaxSpeed;
    for (const nozzle of ship.engineNozzles) {
        _trailNozzle
            .copy(nozzle.offset)
            .applyQuaternion(ship.mesh.quaternion)
            .add(ship.mesh.position);
        nozzle.flame.update(
            _trailNozzle,
            speed,
            trailMax,
            boosting,
            thrusting,
            ship.velocity,
            _trailExhaustDir,
            dtTotal,
            cameraPos
        );
    }
}

/**
 * Per-frame guidance update for every ship that can fly with guidance: the player's active and
 * known ship plus all NPCs. Each ship de-duplicates nothing itself, so a ship listed twice simply
 * recomputes the same frame.
 */
function updateShipGuidanceFrames(active: Spaceship | null, known: Spaceship | null): void {
    active?.updateGuidanceFrame();
    if (known && known !== active) known.updateGuidanceFrame();
    for (const npc of simulationState.npcShips) {
        if (npc !== active && npc !== known) npc.updateGuidanceFrame();
    }
}

/**
 * Checks one body pair for atmospheric-entry containment: creates / fades out an
 * `EntryFlameEffect` on the small body, and applies one frame's worth of atmospheric drag and
 * heat damage. A no-op unless one side is an Asteroid/Comet/Satellite/SpaceShip and the other
 * is a `CelestialBody` with an atmosphere.
 *
 * Leaving the atmosphere calls `stop()` rather than `dispose()` so the flame can fade out; the
 * per-frame update in the collision pass disposes the effect once it reports `active === false`.
 *
 * @param dtTotal This frame's total sim-time, used to apply drag/damage at the same
 *   once-per-frame cadence `EntryFlameEffect.update()` and collision damage already use.
 * @returns The small body, if atmospheric heat damage destroyed it this frame — the caller is
 *   responsible for `destroyBody()`/`.die()`/bodies-array cleanup, mirroring how this function
 *   never calls `.die()` itself, same as `resolveCollision`.
 */
function checkAtmosphericEntry(a: Body, b: Body, scene: THREE.Scene, dtTotal: number): Body | null {
    const isSmallBody = (body: Body) =>
        isBodyType(
            body,
            BodyTypeEnum.Asteroid |
                BodyTypeEnum.Comet |
                BodyTypeEnum.Satellite |
                BodyTypeEnum.SpaceShip |
                BodyTypeEnum.Probe
        );

    let small: Body | null = null;
    let planet: Body | null = null;
    if (isSmallBody(a)) {
        small = a;
        planet = b;
    } else if (isSmallBody(b)) {
        small = b;
        planet = a;
    }
    if (!small || !planet) return null;
    if (!(planet instanceof CelestialBody) || planet.atmosphereRadius == null) return null;

    // Compare the asteroid/comet's *leading edge* (not its center) against the
    // atmosphere shell, so the entry window is the shell's actual thickness
    // (atmosphereRadius - planet.radius) regardless of the small body's own size.
    // Comparing raw center-to-center distance to atmosphereRadius would make large
    // bodies reach hard-surface-contact distance before their center ever crosses
    // into the (thin) atmosphere radius, so the flame would never appear for them.
    const distance = small.mesh.position.distanceTo(planet.mesh.position);
    const leadingEdgeDistance = distance - small.radius;

    if (leadingEdgeDistance < planet.atmosphereRadius) {
        if (!small.entryFlame) {
            small.entryFlame = new EntryFlameEffect(scene, small, planet);
        } else if (small.entryFlame.planet === planet) {
            // Still inside (or back inside) — cancel any pending fade-out.
            small.entryFlame.start();
        }

        // Capture the body into the planet's co-rotating atmosphere frame. The atmosphere
        // travels with the planet — its translation *and* its spin — so the frame velocity is
        // recomputed each frame from the body's current position (ω × r moves as it does). This
        // is the reference the drag pulls toward, and (for a ship) the frame its flight controls
        // work in, so a craft co-moving with the air stays put over the ground.
        if (!small.atmosphereFrameVel) small.atmosphereFrameVel = new THREE.Vector3();
        computeAtmosphereFrameVelocity(planet, small.mesh.position, small.atmosphereFrameVel);

        const density = computeAtmosphericDensity(distance, planet);
        if (small.entryFlame && small.entryFlame.planet === planet) {
            // Visual brightness follows depth into the shell (leading edge, matching the entry
            // test above), not the physical density — see EntryFlameEffect.setAtmosphereDepth.
            const thickness = planet.atmosphereRadius - planet.radius;
            const depthFraction =
                thickness > 0 ? (planet.atmosphereRadius - leadingEdgeDistance) / thickness : 1;
            small.entryFlame.setAtmosphereDepth(depthFraction, planet.atmosphereSurfaceDensity);
        }

        // Continuous drag + heat/ablation damage, applied at the same once-per-frame (dtTotal)
        // cadence as the flame's intensity update and collision damage. The drag now pulls toward
        // the co-rotating frame, not just the planet's translation, so a captured body is carried
        // around by the planet's spin as well.
        if (resolveAtmosphericPassage(small, small.atmosphereFrameVel, density, dtTotal)) {
            return small;
        }
    } else if (small.entryFlame && small.entryFlame.planet === planet) {
        // Release the captured frame — the body is no longer in this planet's air.
        small.atmosphereFrameVel = null;
        // Only stop the flame when leaving the specific planet it was created for — this
        // function runs once per (small body, atmosphere-bearing planet) pair every frame,
        // so a small body near Earth would otherwise have its just-created flame immediately
        // torn down by the very next pair checked against some unrelated planet (e.g. Mars,
        // Jupiter) that it obviously isn't inside.
        //
        // stop() only begins the fade-out: the flame keeps rendering (and dimming) and the
        // per-frame update below disposes it once it reports itself inactive.
        small.entryFlame.stop();
    }

    return null;
}

/**
 * Run the main animation loop.  Spawns a `requestAnimationFrame` chain
 * that continues until the page is closed.
 */
export function runAnimationLoop(ctx: AnimationContext, flightCtx: IFlightControlContext): void {
    // Pre-allocated scratch vectors (eliminate per-frame GC pressure)
    const _lastFrameTime = { value: performance.now() };
    // EMA-smoothed frame delta — raw rAF timing has small frame-to-frame jitter even at a
    // stable refresh rate, which is invisible at fixed dt but shows up as stutter in fast
    // per-frame motion (e.g. warp tunnel streaks) once dt tracks real elapsed time.
    const _smoothedWallDt = { value: BASE_FRAME_DT };
    const _animCamDirection = new THREE.Vector3();
    const _animCamRight = new THREE.Vector3();
    const _animCamMovement = new THREE.Vector3();
    const _animOldPos = new THREE.Vector3();
    const _prevCamPos = new THREE.Vector3();
    const _cameraVel = new THREE.Vector3();
    // Pre-substep position snapshot, used for the swept wormhole-entrance test and the
    // ship-vs-ship collision sweep.
    const _framePrevPositions = new Map<string, THREE.Vector3>();
    // Flight hover context for the name indicator; fields are overwritten each frame.
    const _flightHoverCtx: IPlanetNameFlightContext = {
        isActive: true,
        steeringLineVisible: false,
        steeringTipX: 0,
        steeringTipY: 0,
        autopilotCharge: 0,
        chargeTime: FLIGHT_AUTOPILOT_CHARGE_TIME,
        activeShip: null,
    };

    let fpsLastUpdate = 0;
    let lastT = performance.now();
    // The frame renders several passes (scene capture, lensing, flare, cockpit, HUD). Counters are
    // reset once per frame instead of per render() call, so they add up the whole frame.
    ctx.renderer.info.autoReset = false;
    // Last complete frame's counters, shown by the render-info readout.
    const _renderInfo: IRenderInfoStats = {
        frameMs: 0,
        calls: 0,
        triangles: 0,
        points: 0,
        lines: 0,
        geometries: 0,
        textures: 0,
        programs: 0,
        lodFull: 0,
        lodReduced: 0,
        lodDot: 0,
        labels: 0,
    };
    // Set once an E press has done something (engaged or cancelled the autopilot, started or
    // aborted a landing), so holding E on afterwards does nothing more until it is released.
    let _ePressConsumed = false;
    // E's state last frame, so a landing starts or aborts on the press, not while held.
    let _ePrevHeld = false;

    function animate(): void {
        const now = performance.now();
        const rawWallDt = Math.min((now - _lastFrameTime.value) / 1000, 0.1);

        // Frame-rate limiter: when the user sets a max FPS, hold each frame until
        // enough wall time has elapsed. The limit is read live from settings so
        // changes apply immediately, like substeps. 0 = unlimited.
        const frameRateLimit = settingsStore.settings.frameRateLimit;
        const frameIntervalMs = frameRateLimit > 0 ? 1000 / frameRateLimit : 0;
        if (frameIntervalMs > 0 && rawWallDt * 1000 < frameIntervalMs) {
            requestAnimationFrame(animate);
            return;
        }

        _lastFrameTime.value = now;
        requestAnimationFrame(animate);

        // Smooth toward the raw delta rather than using it directly (see comment above).
        _smoothedWallDt.value += (rawWallDt - _smoothedWallDt.value) * WALL_DT_SMOOTHING;
        const wallDt = _smoothedWallDt.value;

        // ── Camera velocity (frame-to-frame delta for labels / ETA) ────
        _cameraVel.subVectors(ctx.camera.position, _prevCamPos);
        // On the very first frame _prevCamPos is (0,0,0) which produces a huge
        // false velocity spike.  Guard against that by zeroing when length > 10×
        // the simulation scale would reasonably allow (|v| >> 1e6 is a bootstrap spike).
        if (_cameraVel.length() > 1_000_000) {
            _cameraVel.set(0, 0, 0);
        } else if (wallDt > 1e-8) {
            _cameraVel.divideScalar(wallDt);
        }
        _prevCamPos.copy(ctx.camera.position);

        const tScale = simulationState.timeScale;
        // Substep count scales with how much real time this frame represents, so each
        // substep's dt stays bounded (keeps orbits stable and autopilot brake zones from
        // being skipped) regardless of framerate or time-warp. dtTotal is always exactly
        // wallDt * TIME_SCALE * tScale, so total sim-time advanced stays wall-clock accurate
        // even if the cap below is hit (only per-substep accuracy is reduced in that case).
        const baseSubsteps = settingsStore.settings.substeps;
        const frameRatio = wallDt / BASE_FRAME_DT;
        // When the sim is paused (tScale === 0) every substep advances by dt = 0, so the
        // whole loop is a no-op that still pays the full force-solve cost. One step is
        // enough to keep dtTotal at exactly 0 while costing a single solve instead of 64+.
        const steps =
            tScale === 0
                ? 1
                : Math.min(
                      Math.max(1, Math.ceil(baseSubsteps * frameRatio)),
                      MAX_SUBSTEPS_PER_FRAME
                  );
        const dt = (wallDt * TIME_SCALE * tScale) / steps;
        const dtTotal = dt * steps;

        // ── Surface camera ───────────────────────────────────────────────
        // updateTransform() runs later in the frame, after physics advances
        // the world (see the post-physics surface-camera block below), so the
        // cam anchors to the body's end-of-frame transform.
        const isSurfaceModeActive = !!ctx.surfaceCam.isActive;

        // ── Flight mode ──────────────────────────────────────────────────
        const isFlightModeActive =
            ctx.flightState.isActive &&
            !!ctx.flightState.activeShip &&
            !ctx.flightState.activeShip._isDisposed;

        // In cockpit view the dashboard displays carry speed, vitals, weapon heat and warp,
        // so the 2D panels that duplicate them are hidden. Aiming aids, target markers,
        // autopilot prompts and the controls hint stay on the 2D overlay.
        const cockpitDisplaysActive = isFlightModeActive && ctx.flightState.isCockpitView;
        ctx.flightHUD.setCockpitDisplaysActive(cockpitDisplaysActive);
        if (ctx.flightState.isActive) ctx.speedSprite.visible = !cockpitDisplaysActive;

        if (
            ctx.flightState.isActive &&
            ctx.flightState.activeShip &&
            (ctx.flightState.activeShip._isDisposed ||
                !ctx.simulationState.bodies.includes(ctx.flightState.activeShip))
        ) {
            exitFlightMode(flightCtx);
        }

        if (ctx.autopilotState.isActive) {
            // Guard 1: the autopilot ship must still exist.
            const apShip = ctx.flightState.knownShip;
            if (!apShip || apShip._isDisposed || !ctx.simulationState.bodies.includes(apShip)) {
                ctx.cancelAutopilot();
            }
            // Guard 2: the autopilot target must still exist.  This covers
            // target deaths that happen while physics is not advancing
            // (e.g. the sim is paused and the user deletes the target).
            const apTarget = ctx.autopilotState.targetBody;
            if (
                ctx.autopilotState.isActive &&
                (!apTarget ||
                    apTarget._isDisposed ||
                    !apTarget.mesh ||
                    !ctx.simulationState.bodies.includes(apTarget))
            ) {
                ctx.cancelAutopilot('Autopilot disengaged: target destroyed.');
            }
        }

        // Guard: the locked target (TAB/Shift+TAB cycling) must still be a live threat.
        // Covers the target dying or losing isThreat while the sim isn't advancing too.
        const lockTarget = ctx.flightState.selectedTarget;
        if (
            lockTarget &&
            (lockTarget._isDisposed ||
                !lockTarget.isThreat ||
                !ctx.simulationState.bodies.includes(lockTarget))
        ) {
            ctx.flightState.selectedTarget = null;
        }

        if (isFlightModeActive) {
            updateFlightControls(flightCtx, wallDt, dtTotal);
        }

        // ── AI-piloted ships ─────────────────────────────────────────────
        // Runs whether or not the player is in flight mode: NPC ships fly on
        // regardless. Frame-level only (decisions + steering/roll); their thrust
        // is applied per physics substep inside updateSimulation().
        stepNpcShips(wallDt, dtTotal, flightCtx.addEvent);

        // Landing ships the flight controls above didn't steer (NPCs, or the player's ship while
        // out of flight mode) still level themselves over the ground. Not while paused.
        if (dtTotal > 0) {
            applyLandingAttitudes(
                steeringDt(wallDt, dtTotal),
                isFlightModeActive ? ctx.flightState.activeShip : null
            );
        }

        // ── Guidance reference frames ────────────────────────────────────
        // Refresh every body's Hill sphere once, then let each ship with guidance on pick the
        // body whose velocity its flight frame tracks. Before the physics step, so this frame's
        // thrust substeps are governed in the up-to-date frame.
        updateHillSpheres(ctx.simulationState.bodies);
        updateShipGuidanceFrames(ctx.flightState.activeShip, ctx.flightState.knownShip);

        // Draw what those controllers just decided. After the step, so the overlay shows the
        // heading the ships are flying this frame rather than the previous one's.
        ctx.aiAvoidanceGizmo.update();

        // ── Background warp/boost speed (unified) ────────────────────────
        const bgShip = ctx.flightState.knownShip;
        if (!isFlightModeActive && bgShip && !bgShip._isDisposed && bgShip.mesh) {
            if (bgShip.autopilotAI) {
                // The Ship AI autopilot flies on while the player watches from outside. Its
                // pipeline advances warp/boost/stop decel itself.
                stepShipAiAutopilot(bgShip, wallDt, dtTotal);
            } else {
                const bgWarpActive = bgShip.warpActive;
                const bgWarpDecel = bgShip.warpDecelerating;
                const bgBoostDecel = bgShip.boostDecelerating;
                const bgStopBrake = bgShip.stopBraking;

                if (bgWarpActive || bgWarpDecel || bgBoostDecel || bgStopBrake) {
                    const bgFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(
                        bgShip.mesh.quaternion
                    );
                    bgShip.advanceWarpSpeed(dtTotal, bgFwd);
                    ctx.flightState.currentSpeed = bgShip.forwardSpeedInFrame(bgFwd);
                }
            }

            // Background warp HUD — use the unified method for all three states.
            ctx.flightHUD.updateWarpHUD(
                bgShip.warpCharging,
                bgShip.warpActive,
                bgShip.warpCharging
                    ? bgShip.warpChargeTimer / bgShip.handling.flightWarpChargeTime
                    : 0
            );
        }

        // ── Shield effect + model part animation ─────────────────────────
        // (The warp effect is updated post-physics — see "Warp effect" below.)
        for (const body of ctx.simulationState.bodies) {
            if (!body || body.bodyType !== BodyTypeEnum.SpaceShip) continue;
            if (body._isDisposed || !body.mesh) continue;
            const ship = body as Spaceship;
            // Wall-clock so the shield glow fades (and model parts spin) at the same pace at any
            // time-warp, but held while paused.
            const shipWallDt = simulationState.timeScale === 0 ? 0 : wallDt;
            ship.updateShieldEffect(shipWallDt);
            ship.updateModelAnimation(shipWallDt);
        }

        // ── On foot: WASD / Shift / Space drive the player rig ───────────
        // Before the physics step, so this frame's substeps walk and jump with them.
        if (isSurfaceModeActive) {
            ctx.surfaceCam.updateInput(ctx.keys);
        }

        // ── WASD camera movement ─────────────────────────────────────────
        // Not on foot: the same keys walk the player rig instead (above).
        // Free Cam only; Look At and the plain orbit camera ignore these keys.
        if (!isFlightModeActive && !isSurfaceModeActive && cameraState.isFreeCameraMode) {
            const speed = ctx.keys.shift ? FREE_CAM_BOOST_SPEED : FREE_CAM_NORMAL_SPEED;
            ctx.camera.getWorldDirection(_animCamDirection);
            _animCamRight.crossVectors(ctx.camera.up, _animCamDirection).normalize();

            _animCamMovement.set(0, 0, 0);
            if (ctx.keys.w) _animCamMovement.addScaledVector(_animCamDirection, speed);
            if (ctx.keys.s) _animCamMovement.addScaledVector(_animCamDirection, -speed);
            if (ctx.keys.a) _animCamMovement.addScaledVector(_animCamRight, speed);
            if (ctx.keys.d) _animCamMovement.addScaledVector(_animCamRight, -speed);
            // Rise/sink along the camera's up (ecliptic north outside flight/surface modes).
            if (ctx.keys.space) _animCamMovement.addScaledVector(ctx.camera.up, speed);
            if (ctx.keys.c) _animCamMovement.addScaledVector(ctx.camera.up, -speed);

            if (_animCamMovement.lengthSq() > 0) {
                ctx.camera.position.add(_animCamMovement);

                if (
                    ctx.interactionState.isRepositioning &&
                    ctx.gizmo.target &&
                    interactionState.activeAxis
                ) {
                    const axis = interactionState.activeAxis;
                    if (axis === 'x') ctx.gizmo.target.mesh.position.x += _animCamMovement.x;
                    else if (axis === 'y') ctx.gizmo.target.mesh.position.y += _animCamMovement.y;
                    else if (axis === 'z') ctx.gizmo.target.mesh.position.z += _animCamMovement.z;
                }

                if (interactionState.isChangingVelocity && ctx.gizmo.target) {
                    const origin = ctx.gizmo.target.mesh.position;
                    const vEdit = ctx.interactionState.velocityEditMode;
                    if (vEdit === 'y') {
                        const v = ctx.gizmo.target.velocity.clone();
                        v.y = 0;
                        const hDir =
                            v.lengthSq() > 1e-10 ? v.normalize() : new THREE.Vector3(1, 0, 0);
                        const up = new THREE.Vector3(0, 1, 0);
                        const pn = new THREE.Vector3().crossVectors(hDir, up).normalize();
                        interactionState.dragPlane.setFromNormalAndCoplanarPoint(pn, origin);
                    } else {
                        interactionState.dragPlane.setFromNormalAndCoplanarPoint(
                            new THREE.Vector3(0, 1, 0),
                            origin
                        );
                    }

                    const tm = new THREE.Vector2(
                        document.pointerLockElement === ctx.renderer.domElement ? 0 : ctx.mouse.x,
                        document.pointerLockElement === ctx.renderer.domElement ? 0 : ctx.mouse.y
                    );
                    ctx.raycaster.setFromCamera(tm, ctx.camera);
                    const intersection = new THREE.Vector3();
                    if (
                        ctx.raycaster.ray.intersectPlane(interactionState.dragPlane, intersection)
                    ) {
                        const vNow = ctx.gizmo.target.velocity.clone();
                        const tipDelta = new THREE.Vector3().subVectors(intersection, origin);
                        if (tipDelta.lengthSq() < 1e-10) tipDelta.set(1, 0, 0);

                        if (vEdit === 'xz') {
                            const nv = tipDelta.divideScalar(GIZMO_TUNING.VELOCITY_ARROW_SCALE);
                            nv.y = vNow.y;
                            ctx.gizmo.target.velocity.copy(nv);
                        } else {
                            const vFlat = vNow.clone();
                            vFlat.y = 0;
                            const hd =
                                vFlat.lengthSq() > 1e-10
                                    ? vFlat.normalize()
                                    : new THREE.Vector3(1, 0, 0);
                            const up = new THREE.Vector3(0, 1, 0);
                            const tipH = tipDelta.dot(hd);
                            const tipY = tipDelta.dot(up);
                            const hs = tipH / GIZMO_TUNING.VELOCITY_ARROW_SCALE;
                            const vs = tipY / GIZMO_TUNING.VELOCITY_ARROW_SCALE;
                            const nv = new THREE.Vector3()
                                .addScaledVector(hd, hs)
                                .addScaledVector(up, vs);
                            ctx.gizmo.target.velocity.copy(nv);
                        }
                    }
                }
            }
        }

        // ── Focus-object old position ────────────────────────────────────
        const focusObj = ctx.getFocusObject();
        if (focusObj?.mesh) {
            _animOldPos.copy(focusObj.mesh.position);
        } else {
            _animOldPos.set(0, 0, 0);
        }
        const oldPos = _animOldPos;

        // ── Physics ──────────────────────────────────────────────────────
        // Snapshot positions before the physics step so wormhole entrance detection and the
        // ship-vs-ship collision sweep can follow each body's path across the frame instead of a
        // static end-of-frame test (a ship in warp can cross a thin wormhole mouth, or a fast
        // fighter another ship's hull, within one frame).
        for (const b of ctx.simulationState.bodies) {
            if (!b || b._isDisposed || !b.mesh) continue;
            let snapshot = _framePrevPositions.get(b.id);
            if (!snapshot) {
                snapshot = new THREE.Vector3();
                _framePrevPositions.set(b.id, snapshot);
            }
            snapshot.copy(b.mesh.position);
        }

        // Manual thrust (WASD) is applied per substep via applyFlightThrustSubstep
        // so it interleaves correctly with gravity at any time scale.
        // flightState param kept for signature compatibility with updateSimulation
        const _dummyFlightState = ctx.flightState;
        updateSimulation(
            ctx.simulationState,
            ctx.autopilotState,
            _dummyFlightState,
            steps,
            dt,
            ctx.updateAutopilotStep
        );

        // Sync currentSpeed from the ship's real velocity after the physics loop
        // so HUD/labels reflect the true combined result of thrust + gravity.
        if (isFlightModeActive) {
            const _ship = ctx.flightState.activeShip;
            const _forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
                ctx.flightState.flightCameraQuat
            );
            ctx.flightState.currentSpeed = _ship?.forwardSpeedInFrame(_forward) ?? 0;
        }

        // ── Collision & post-physics updates ─────────────────────────────
        // Gather the live stars once, for every body's star lighting (atmospheres, Earth).
        beginStarLightingFrame(ctx.simulationState.bodies);
        if (!ctx.interactionState.isRepositioning) {
            for (let j = 0; j < ctx.simulationState.bodies.length; j++) {
                const b1 = ctx.simulationState.bodies[j];
                if (!b1) continue;

                if (b1 instanceof CelestialBody) b1.updateTrail(ctx.camera.position);
                if (b1 instanceof CelestialBody) b1.updateVisuals(dtTotal, ctx.camera.position);
                if (b1 instanceof Comet) b1.updateTail(dtTotal, ctx.camera.position);
                if (b1 instanceof Wormhole) b1.funnelEffect.update(dtTotal);
                // Shield recharge runs on sim time, so it halts while paused.
                if (b1.bodyType === BodyTypeEnum.SpaceShip)
                    (b1 as Spaceship).updateShields(dtTotal);
                const entryFlame = b1.entryFlame;
                if (entryFlame) {
                    entryFlame.update(dtTotal, ctx.camera.position);
                    // A stopped flame keeps rendering while it fades out; once it's fully
                    // dissolved it reports inactive and is safe to dispose.
                    if (!entryFlame.active) {
                        entryFlame.dispose();
                        b1.entryFlame = null;
                    }
                }

                if (b1._isDisposed || !b1.mesh) continue;

                for (let k = j + 1; k < ctx.simulationState.bodies.length; k++) {
                    const b2 = ctx.simulationState.bodies[k];
                    if (!b2 || b2._isDisposed || !b2.mesh) continue;

                    // Wormholes are indestructible and never take collision damage —
                    // entrance/teleport is handled by a dedicated pass below.
                    if (b1 instanceof Wormhole || b2 instanceof Wormhole) continue;

                    const atmosphereVictim = checkAtmosphericEntry(b1, b2, ctx.scene, dtTotal);
                    if (atmosphereVictim) {
                        const other = atmosphereVictim === b1 ? b2 : b1;
                        destroyBody(other, [atmosphereVictim]);

                        const impactSpeed = atmosphereVictim.velocity.distanceTo(other.velocity);
                        // die() dispatches body:dead synchronously, and its listener already
                        // removes this body from ctx.simulationState.bodies (same array) before
                        // this line runs — no need to filter it out again here.
                        atmosphereVictim.die({ impactSpeed });

                        // small could be either b1 or b2 — if b1 burned up, stop colliding it
                        // against the rest of the row (mirrors the `if (b1._isDisposed) break;`
                        // pattern below); if only b2 burned up, this pair is done but b1
                        // survives to check against the remaining bodies.
                        if (atmosphereVictim === b1) break;
                        continue;
                    }

                    const dx = b1.mesh.position.x - b2.mesh.position.x;
                    const dy = b1.mesh.position.y - b2.mesh.position.y;
                    const dz = b1.mesh.position.z - b2.mesh.position.z;
                    // Ship contact measures the drawn surface, which on a model body (an
                    // irregular rock) can reach a little past its radius; widen the sphere test
                    // to match so that rock is never skipped. Other pairs keep their radii.
                    const shipPair = ((b1.bodyType | b2.bodyType) & BodyTypeEnum.SpaceShip) !== 0;
                    const maxDist = shipPair
                        ? b1.contactRadius + b2.contactRadius
                        : b1.radius + b2.radius;
                    if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist || Math.abs(dz) > maxDist)
                        continue;

                    if (dx * dx + dy * dy + dz * dz < maxDist * maxDist) {
                        // Applies impact damage to both bodies (and bounces them apart if
                        // both survive); deaths are carried out below from the outcome.
                        const outcome = resolveCollision(b1, b2, dtTotal, _framePrevPositions);

                        // Both survived (or were only nudged out of overlap) — nothing dies.
                        if (outcome.type === 'bounce' || outcome.type === 'none') continue;

                        // Captured before absorbBody() runs below, which mutates the winner's
                        // velocity in place — this must reflect the pre-impact closing speed.
                        const impactSpeed = b1.velocity.distanceTo(b2.velocity);

                        if (outcome.type === 'destroy-both') {
                            // The impact destroyed both bodies — no winner.
                            // The camera focus (if it was one of these bodies) is frozen at
                            // the body's last position by handleBodyBecameInvalid (via the
                            // body:dead event fired inside victim.die()).
                            destroyBody(null, outcome.victims);

                            // die() dispatches body:dead synchronously, and its listener already
                            // removes each victim from ctx.simulationState.bodies (same array) —
                            // no need to filter it out again here.
                            for (const victim of outcome.victims) {
                                victim.die({ impactSpeed });
                            }
                            // b1 is always destroyed here — stop colliding it against the rest.
                            break;
                        }

                        const { winner, victims } = outcome;
                        const victim = victims[0];

                        if (outcome.type === 'absorb') {
                            absorbBody(winner, victim);
                        } else {
                            destroyBody(winner, victims);
                        }

                        // If the camera was focused on the destroyed victim, its focus is
                        // frozen at the victim's last position by handleBodyBecameInvalid
                        // (via the body:dead event fired inside victim.die()).
                        // die() dispatches body:dead synchronously, and its listener already
                        // removes this body from ctx.simulationState.bodies (same array) before
                        // this line runs — no need to filter it out again here.
                        victim.die({ impactSpeed });

                        // b1 may be the victim — stop colliding it against remaining bodies.
                        if (b1._isDisposed) break;
                    }
                }
            }

            // Grounded ships turn with the ground and settle flat onto it. After the collision
            // pass, which records what each ship is touching this frame.
            updateGroundAlignment(ctx.simulationState.bodies, dtTotal);

            // The player on foot: parking, ship hulls in the way, final ground snap.
            updatePlayerRigFrame(ctx.simulationState.bodies, dtTotal);

            // Landings end here: a ship grounded this frame has touched down, and one whose
            // surface was destroyed mid-landing is cancelled with its controls handed back.
            for (const { ship, body, outcome } of updateLandings()) {
                if (ship !== ctx.flightState.activeShip) continue;
                playSoundEffect(
                    outcome === 'touchdown'
                        ? SoundEffect.LandingComplete
                        : SoundEffect.LandingCanceled
                );
                flightCtx.addEvent(
                    outcome === 'touchdown'
                        ? {
                              message: `🛬 Touchdown${body ? ` on ${body.name}` : ''}. Hold W to launch.`,
                              notificationType: NotificationType.Success,
                          }
                        : {
                              message:
                                  'Landing canceled: the surface was destroyed. Flight controls restored.',
                              notificationType: NotificationType.Warning,
                          }
                );
            }

            processWormholeInteractions(ctx.simulationState.bodies, _framePrevPositions);

            // Bezier particle streams between linked wormholes (once per frame, not per body).
            updateWormholeBridges(dtTotal);
        }

        // ── Scenario logic ───────────────────────────────────────────────
        // After the collision pass, so bodies that died this frame are already disposed when
        // the active scenario checks on them. Driven by sim time, so it freezes while paused.
        scenarioManager.update(dtTotal);

        // ── Gizmo / vel arc / orbit prediction ──────────────────────────
        ctx.gizmo.update();
        ctx.velArc.update();
        ctx.orbitPrediction.update(ctx.simulationState.bodies, ctx.simulationState.gMultiplier);

        // ── Grid / indicators while dragging ─────────────────────────────
        const isDraggingVel =
            ctx.interactionState.isRepositioning ||
            interactionState.isChangingVelocity ||
            interactionState.isMiddleMouseVelocity;
        if (
            isDraggingVel &&
            ctx.gizmo.target &&
            !ctx.gizmo.target._isDisposed &&
            ctx.gizmo.target.mesh
        ) {
            ctx.gridHelperManager.ensure(ctx.gizmo.target, true);
            const pi = ctx.posIndicator;
            if (pi.yAxisIndicator && pi.yAxisRing) {
                pi.updateIndicator(pi.yAxisIndicator, pi.yAxisRing, ctx.gizmo.target.mesh.position);
            }
            if (
                (interactionState.isChangingVelocity || interactionState.isMiddleMouseVelocity) &&
                pi.velocityTipIndicator &&
                pi.velocityTipRing
            ) {
                const spd = ctx.gizmo.target.velocity.length();
                const dir =
                    spd > 0
                        ? ctx.gizmo.target.velocity.clone().normalize()
                        : new THREE.Vector3(1, 0, 0);
                const tip = ctx.gizmo.target.mesh.position
                    .clone()
                    .add(dir.multiplyScalar(spd * 50));
                pi.updateIndicator(pi.velocityTipIndicator, pi.velocityTipRing, tip);
            }
        }

        // ── Steering markers ─────────────────────────────────────────────
        if (ctx.flightState.isActive && ctx.flightSteeringLine.visible) {
            const sl = ctx.steeringLinePositions;
            ctx.steeringEndMarker.position.set(sl[3], sl[4], TEXT_SPRITE_Z);
            ctx.steeringEndMarker.visible = true;
            ctx.steeringOriginMarker.position.set(sl[0], sl[1], TEXT_SPRITE_Z);
            ctx.steeringOriginMarker.visible = true;
        } else {
            ctx.steeringEndMarker.visible = false;
            ctx.steeringOriginMarker.visible = false;
        }

        // ── Weapon systems ─────────────────────────────────────────────────
        // Advance every mounted weapon (bolts fly, laser beams cast) while in
        // flight mode, and keep advancing them via knownShip after flight exit
        // so any bolts/beam already in flight persist and decay/hide naturally —
        // they only freeze while the sim is paused, never as a side effect of
        // pausing or of leaving flight mode. Weapons also self-hide when not firing.
        const weaponShip = ctx.flightState.activeShip ?? ctx.flightState.knownShip;
        if (weaponShip && !weaponShip._isDisposed) {
            for (const weapon of weaponShip.weapons) {
                weapon.update(
                    wallDt,
                    dtTotal,
                    ctx.simulationState.bodies,
                    ctx.camera.position,
                    weaponShip,
                    tScale === 0
                );
            }
        }

        // AI ships shoot too, and their bolts are the same objects the player's are — without
        // this they would spawn and then sit still forever, never moving, colliding or
        // rendering.
        //
        // Iterated backwards by index because this loop can shorten the list it is walking: a
        // weapon:hit dispatched from inside weapon.update() runs body.die() synchronously, whose
        // body:dead handler splices the victim out of npcShips. Skips whichever ship the block
        // above already advanced, so no weapon is stepped twice.
        const npcShips = ctx.simulationState.npcShips;
        for (let i = npcShips.length - 1; i >= 0; i--) {
            const npc = npcShips[i];
            if (!npc || npc === weaponShip || npc._isDisposed) continue;
            for (const weapon of npc.weapons) {
                weapon.update(
                    wallDt,
                    dtTotal,
                    ctx.simulationState.bodies,
                    ctx.camera.position,
                    npc,
                    tScale === 0
                );
            }
        }

        // Weapons whose ship died with rounds still in flight (see Spaceship.die): keep their
        // bolts/missiles flying until the last one hits or expires, then release them.
        // Backwards for the same reason as above — a hit can kill another ship mid-loop, which
        // appends to this list; appended entries sit past `i` and wait for next frame.
        const orphans = ctx.simulationState.orphanedWeapons;
        for (let i = orphans.length - 1; i >= 0; i--) {
            const { weapon, owner } = orphans[i];
            weapon.update(
                wallDt,
                dtTotal,
                ctx.simulationState.bodies,
                ctx.camera.position,
                owner,
                tScale === 0
            );
            if (!weapon.hasLiveProjectiles) {
                weapon.dispose();
                orphans.splice(i, 1);
            }
        }

        // ── Thermal gauge + weapon selector ──────────────────────────────────
        // Both anchored beside the gray steering-origin ring and both driven by the
        // ship's currently selected weapon (cycled with G), so the gauge and the name
        // always describe the same mount. Hides together with the ring.
        const hudShip = ctx.flightState.activeShip;
        const hudWeapon = hudShip?.activeWeaponGroup ?? null;
        if (ctx.flightState.isActive && hudShip && hudWeapon && ctx.steeringOriginMarker.visible) {
            ctx.flightHUD.updateThermalHUD(
                hudWeapon.thermalLoad,
                hudWeapon.isOverheated,
                ctx.steeringOriginMarker.position
            );
            ctx.flightHUD.updateWeaponHUD(
                hudWeapon.displayName,
                hudShip.activeWeaponGroupIndex + 1,
                hudShip.weaponGroups.length,
                hudWeapon.isOverheated,
                ctx.steeringOriginMarker.position
            );
        } else {
            ctx.flightHUD.hideThermalSprite();
            ctx.flightHUD.hideWeaponSprite();
        }

        // ── Landing status ─────────────────────────────────────────────────
        // Pulsing text in the autopilot-message slot while the flown ship is landing.
        const landingShip = ctx.flightState.isActive ? hudShip : null;
        ctx.flightHUD.updateLandingHUD(
            landingShip && !landingShip._isDisposed ? landingShip.landingPhase : 'idle',
            landingShip?.landingBody?.name ?? ''
        );

        // ── Altimeter ──────────────────────────────────────────────────────
        // Left of the steering ring, mirroring the heat gauge, within HUD_ALTIMETER_MAX_ALTITUDE
        // of the nearest surface. Unlike the heat gauge it stays up while the ring is hidden —
        // landing, grounded and autopilot are exactly when altitude matters. The ring's position
        // is still updated every frame while it is hidden, so it remains a valid anchor.
        const altSurface =
            ctx.flightState.isActive && hudShip && !hudShip._isDisposed && hudShip.mesh
                ? findNearestSurface(hudShip, ctx.simulationState.bodies)
                : null;
        if (hudShip && altSurface && altSurface.clearance <= HUD_ALTIMETER_MAX_ALTITUDE) {
            const altBody = altSurface.body;
            _altUp.subVectors(hudShip.mesh.position, altBody.mesh.position);
            const altDist = _altUp.length();
            let verticalSpeed = 0;
            if (altDist > 1e-12) {
                _altUp.divideScalar(altDist);
                surfaceVelocityAt(altBody, hudShip.mesh.position, _altFrameVel);
                verticalSpeed = _altFrameVel.subVectors(hudShip.velocity, _altFrameVel).dot(_altUp);
            }
            ctx.flightHUD.updateAltimeterHUD(
                altSurface.clearance,
                verticalSpeed,
                altBody.name,
                ctx.steeringOriginMarker.position
            );
        } else {
            ctx.flightHUD.hideAltimeterSprite();
        }

        // ── Explosions / impacts / supernovas / nebulae ──────────────────
        ctx.simulationState.explosions = ctx.simulationState.explosions.filter((e) => {
            e.update(dtTotal, ctx.camera.position);
            return e.active;
        });
        ctx.simulationState.impacts = ctx.simulationState.impacts.filter((i) => {
            i.update(dtTotal);
            return i.active;
        });

        for (let i = ctx.supernovas.value.length - 1; i >= 0; i--) {
            const sn = ctx.supernovas.value[i];
            sn.update(dtTotal);
            if (!sn.active) {
                sn.dispose();
                ctx.supernovas.value.splice(i, 1);
            }
        }
        for (let i = ctx.planetaryNebulae.value.length - 1; i >= 0; i--) {
            const nb = ctx.planetaryNebulae.value[i];
            nb.update(dtTotal);
            if (!nb.active) {
                nb.dispose();
                ctx.planetaryNebulae.value.splice(i, 1);
            }
        }

        // ── Velocity arrow indicators ─────────────────────────────────────
        const gv = ctx.gizmo.velocityArrow;
        if (
            ctx.gizmo.target &&
            !ctx.gizmo.target._isDisposed &&
            ctx.gizmo.target.mesh &&
            gv &&
            gv.visible &&
            (interactionState.isChangingVelocity || interactionState.isMiddleMouseVelocity)
        ) {
            const pi = ctx.posIndicator;
            const spd = ctx.gizmo.target.velocity.length();
            const dir =
                spd > 0
                    ? ctx.gizmo.target.velocity.clone().normalize()
                    : new THREE.Vector3(1, 0, 0);
            const tip = ctx.gizmo.target.mesh.position.clone().add(dir.multiplyScalar(spd * 50));
            if (pi.velocityTipIndicator && pi.velocityTipRing)
                pi.updateIndicator(pi.velocityTipIndicator, pi.velocityTipRing, tip);
            if (pi.yAxisIndicator && pi.yAxisRing)
                pi.updateIndicator(pi.yAxisIndicator, pi.yAxisRing, ctx.gizmo.target.mesh.position);
        }

        // Ship vitals panel: shown with the rest of the flight HUD whenever the player is
        // flying, hidden otherwise (so it disappears the moment flight mode ends).
        if (isFlightModeActive && ctx.flightState.activeShip) {
            ctx.flightHUD.updateShipStatusHUD(ctx.flightState.activeShip);
        } else {
            ctx.flightHUD.hideShipStatus();
        }

        // ── Flight camera ──────────────────────────────────────────────────
        if (isFlightModeActive) {
            const ship = ctx.flightState.activeShip;
            if (ship && !ship._isDisposed && ship.mesh) {
                if (!ctx.flightState.altOrbitActive) {
                    const step = FLIGHT_ALT_ORBIT_RETURN_SPEED * wallDt;
                    if (Math.abs(ctx.flightState.altOrbitYaw) < step) {
                        ctx.flightState.altOrbitYaw = 0;
                    } else {
                        ctx.flightState.altOrbitYaw -=
                            Math.sign(ctx.flightState.altOrbitYaw) * step;
                    }
                    if (Math.abs(ctx.flightState.altOrbitPitch) < step) {
                        ctx.flightState.altOrbitPitch = 0;
                    } else {
                        ctx.flightState.altOrbitPitch -=
                            Math.sign(ctx.flightState.altOrbitPitch) * step;
                    }
                }
                const hasOrbit =
                    ctx.flightState.altOrbitYaw !== 0 || ctx.flightState.altOrbitPitch !== 0;

                if (ctx.flightState.isCockpitView) {
                    const cw = ship.cockpitOffset
                        .clone()
                        .applyQuaternion(ship.mesh.quaternion)
                        .add(ship.mesh.position);
                    ctx.camera.position.copy(cw);
                    let lq = ship.mesh.quaternion;
                    if (hasOrbit) {
                        const oq = new THREE.Quaternion().setFromEuler(
                            new THREE.Euler(
                                ctx.flightState.altOrbitPitch,
                                ctx.flightState.altOrbitYaw,
                                0,
                                'YXZ'
                            )
                        );
                        lq = ship.mesh.quaternion.clone().multiply(oq);
                    }
                    ctx.camera.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(lq));
                    ctx.camera.lookAt(
                        cw
                            .clone()
                            .add(
                                new THREE.Vector3(0, 0, 1).applyQuaternion(lq).multiplyScalar(1000)
                            )
                    );
                } else {
                    let eq = ctx.flightState.flightCameraQuat;
                    if (hasOrbit) {
                        const oq = new THREE.Quaternion().setFromEuler(
                            new THREE.Euler(
                                ctx.flightState.altOrbitPitch,
                                ctx.flightState.altOrbitYaw,
                                0,
                                'YXZ'
                            )
                        );
                        eq = ctx.flightState.flightCameraQuat.clone().multiply(oq);
                    }
                    const off = ship.thirdPersonOffset.clone().applyQuaternion(eq);
                    ctx.camera.position.copy(ship.mesh.position).add(off);
                    ctx.camera.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(eq));
                    ctx.camera.lookAt(ship.mesh.position);
                    ctx.controls.target.copy(ship.mesh.position);
                }
            }
        }

        // ── Cockpit interior ───────────────────────────────────────────────
        // Called every frame (not only in flight) so it can restore the hull it hid
        // when the player leaves cockpit view or flight mode.
        ctx.cockpitView.update(
            isFlightModeActive && ctx.flightState.isCockpitView,
            ctx.camera,
            wallDt
        );

        // ── Warp shake ─────────────────────────────────────────────────────
        const _shakeShip = ctx.flightState.activeShip ?? ctx.flightState.knownShip;
        if (!simulationState.isPaused && _shakeShip?.warpActive) {
            if (isFlightModeActive || _shakeShip.warpEffect.lines.visible) {
                const cf = new THREE.Vector3();
                ctx.camera.getWorldDirection(cf);
                const cr = new THREE.Vector3().crossVectors(cf, ctx.camera.up).normalize();
                ctx.camera.position.addScaledVector(
                    cr,
                    (Math.random() - 0.5) * WARP_SHAKE_MAG * _shakeShip.radius
                );
                ctx.camera.position.addScaledVector(
                    ctx.camera.up,
                    (Math.random() - 0.5) * WARP_SHAKE_MAG * _shakeShip.radius
                );
            }
        }

        // ── Surface camera (post-physics) ──────────────────────────────────
        // Must run AFTER physics so it anchors to the body's end-of-frame
        // position/quaternion — the exact transform the renderer draws. Running
        // it before physics left the camera one frame behind; at high time-warp
        // that gap is many planet radii, so the planet drifted away and the cam
        // jittered trying to catch up. Placed after warp shake so a warping ship
        // cannot shake the surface view.
        if (isSurfaceModeActive) {
            ctx.surfaceCam.updateTransform(dtTotal, wallDt);
        }

        // ── Positional audio listener ──────────────────────────────────────
        // Cache the camera's final pose for this frame so positional sound effects
        // (weapons, impacts, explosions) fade, muffle and pan relative to what the
        // player is looking at. Sounds triggered earlier in the frame use last
        // frame's pose, which is inaudible.
        updateAudioListener(ctx.camera);

        // ── Ship trails ─────────────────────────────────────────────────────
        // The player's ship, plus every AI-piloted ship.
        const playerTrailShip = !_shakeShip?.warpActive
            ? (ctx.flightState.activeShip ?? ctx.flightState.knownShip)
            : null;
        if (playerTrailShip && playerTrailShip.mesh) {
            const trailSpd = isFlightModeActive
                ? ctx.flightState.currentSpeed
                : playerTrailShip.velocity.length();
            const boosting =
                ctx.keys.shift ||
                playerTrailShip.boostDecelerating ||
                ctx.autopilotState.isBoostActive;
            // Fire the plume only while the engine is actually working — coasting must stay dark.
            // Manually that is W (thrust) or Shift (boost), read off the ship's control surface so
            // Chase mode (where S becomes forward thrust) reports through the same channel. Under
            // the autopilot the player's keys are ignored, so trust the flag the autopilot's own
            // phase machine writes each substep — WARP / APPROACH / BRAKE / CIRCULARIZE while it
            // is thrusting — plus its boost flag, so a steady boost cruise still shows. Aligning,
            // holding a stable orbit, warp-charging and drifting all leave the nozzle dark.
            const thrusting = ctx.autopilotState.isActive
                ? ctx.flightState.thrustActive || ctx.autopilotState.isBoostActive
                : isEngineFiring(playerTrailShip);
            updateShipTrail(
                playerTrailShip,
                trailSpd,
                boosting,
                thrusting,
                dtTotal,
                ctx.camera.position
            );
        }

        for (const npc of ctx.simulationState.npcShips) {
            if (!npc || npc._isDisposed || !npc.mesh) continue;
            // Skip the ship the player is flying — it was already handled above.
            if (npc === playerTrailShip) continue;
            if (npc.warpActive) continue;
            const boosting = npc.controlInput.boost || npc.boostDecelerating;
            updateShipTrail(
                npc,
                npc.velocity.length(),
                boosting,
                isEngineFiring(npc),
                dtTotal,
                ctx.camera.position
            );
        }

        // ── Frozen focus drift ──────────────────────────────────────────────
        // A destroyed focus body's explosion inherits the body's velocity, so its frozen orbit
        // point drifts along the same velocity. Advanced every frame (whatever the camera mode)
        // so it never goes stale; the camera only rides along in the follow block below.
        _frozenDriftDelta.set(0, 0, 0);
        if (ctx.cameraState.frozenFocusPosition && ctx.cameraState.frozenFocusVelocity) {
            _frozenDriftDelta.copy(ctx.cameraState.frozenFocusVelocity).multiplyScalar(dtTotal);
            ctx.cameraState.frozenFocusPosition.add(_frozenDriftDelta);
        }

        // ── Camera follow (non-flight) ──────────────────────────────────────
        if (!isSurfaceModeActive && !cameraState.isFreeCameraMode && !isFlightModeActive) {
            if (
                ctx.cameraState.isLookAtMode &&
                focusObj &&
                ctx.simulationState.bodies.includes(focusObj) &&
                !focusObj._isDisposed &&
                focusObj.mesh
            ) {
                const delta = new THREE.Vector3().subVectors(focusObj.mesh.position, oldPos);
                if (ctx.cameraState.lockToSun) {
                    ctx.camera.position.add(delta);
                    ctx.controls.target.set(0, 0, 0);
                    ctx.camera.lookAt(0, 0, 0);
                } else if (
                    !ctx.interactionState.isRepositioning &&
                    !interactionState.isChangingVelocity
                ) {
                    ctx.camera.position.add(delta);
                    ctx.controls.target.copy(focusObj.mesh.position);
                }
            } else if (ctx.cameraState.isLookAtMode && ctx.cameraState.frozenFocusPosition) {
                // The focused body was destroyed; keep orbiting the frozen last position
                // instead of snapping back to the scene center. The camera rides along with
                // the frozen point's drift, as it would with a live focus body.
                if (!ctx.interactionState.isRepositioning && !interactionState.isChangingVelocity) {
                    ctx.camera.position.add(_frozenDriftDelta);
                }
                ctx.controls.target.copy(ctx.cameraState.frozenFocusPosition);
            } else {
                ctx.controls.target.copy(ctx.NONE_FOCUS_POSITION);
            }
        }
        // ── Smooth zoom easing ───────────────────────────────────────────────
        // Runs after the follow block above (which tracked pivot movement this
        // frame) and before the controls.update() below, so this frame's eased
        // position/target is what controls.update() finalizes.
        ctx.stepSmoothZoom(isSurfaceModeActive, isFlightModeActive, wallDt);

        if (!isSurfaceModeActive && !cameraState.isFreeCameraMode && !isFlightModeActive)
            ctx.controls.update();

        // ── HUD ──────────────────────────────────────────────────────────────
        ctx.flightHUD.updateHintSprite();

        // ── Warp effect ──────────────────────────────────────────────────
        // Driven for every ship in the system, not just the player's current one and the NPCs.
        // A ship belonging to neither group is easy to create — spawn one, leave it, then enter
        // a different ship — and it used to have nothing advancing or hiding its tunnel, so the
        // streaks froze in the scene at whatever opacity they last held. The effect is
        // speed-driven and self-hiding, so running it on everything is safe: a ship that isn't
        // moving simply stays invisible.
        //
        // Must run after physics: the tunnel is anchored to the ship's position, and at warp
        // the ship moves tens of units per frame. Anchoring to the pre-physics position left
        // the (ship-sized, at low warp) tunnel entirely behind the camera until ~2c.
        for (const body of ctx.simulationState.bodies) {
            if (!body || body.bodyType !== BodyTypeEnum.SpaceShip) continue;
            if (body._isDisposed || !body.mesh) continue;
            (body as Spaceship).updateWarpEffect(dtTotal);
        }

        // ── Warp tunnel visibility ─────────────────────────────────────────
        // One rule for every ship in the system:
        //
        //   * the ship you are flying always shows its tunnel — it is part of the view out of
        //     the cockpit;
        //   * any other ship shows its tunnel only while you are actually *observing* it, i.e.
        //     it is the look-at focus target and you are zoomed close enough for the distance
        //     fade to reach it;
        //   * everything else is hidden outright.
        //
        // The focus test is what keeps other ships out of your eyeline: the tunnel is driven by
        // raw speed, and the opacity curve is steep enough that merely coasting along an orbit
        // renders a visible streak — so without it, every ship in the system would be streaking
        // away in the corner of the screen the whole time you were flying.
        const visShip = ctx.flightState.activeShip ?? ctx.flightState.knownShip;
        /** Distance fade applied to the player's own ship; also drives its warp sound. */
        let wdf = 0;

        for (const body of ctx.simulationState.bodies) {
            if (!body || body.bodyType !== BodyTypeEnum.SpaceShip) continue;
            if (body._isDisposed || !body.mesh) continue;
            const ship = body as Spaceship;

            let fade: number;
            if (isFlightModeActive && ship === ctx.flightState.activeShip) {
                fade = 1;
            } else if (
                !isFlightModeActive &&
                ctx.cameraState.isLookAtMode &&
                ctx.cameraState.focusBody === ship
            ) {
                // The fade distances scale with the tunnel's current size.
                fade = ship.warpEffect.distanceFadeFor(
                    ctx.camera.position.distanceTo(ship.mesh.position)
                );
            } else {
                fade = 0;
            }

            ship.setWarpEffectOpacity(fade);
            if (ship === visShip) wdf = fade;
        }

        // Warp sound follows the player's own ship alone — several ships warping at once would
        // stack the loop on top of itself.
        if (visShip && !visShip._isDisposed && visShip.mesh) {
            // Same velocity the streaks follow, so under guidance or inside an atmosphere the
            // warp hum tracks speed relative to that frame rather than the planet's orbital motion.
            const vol = visShip.warpEffect.warpOpacity(
                visShip.effectVelocity(_warpSoundVel).length(),
                visShip.handling.flightWarpSpeed
            );
            visShip.updateWarpSound(vol, wdf);
        }

        // ── Render ──────────────────────────────────────────────────────────
        // The screen flash and scenario message banner are advanced by simulation time
        // (dtTotal) so they scale with the time-warp setting and freeze while the
        // simulation is paused.
        ctx.screenFlash.update(dtTotal);
        ctx.scenarioMessageHud.update(dtTotal);

        // ── HUD sprites (FPS / stats / speed) ──────────────────────────────
        // Updated BEFORE the overlay render below. This block used to run after it,
        // so every HUD readout showed the previous frame's values.
        const hudSettings = settingsStore.settings;
        ctx.fpsSprite.visible = hudSettings.showFps;
        ctx.renderInfoSprite.visible = hudSettings.showRenderInfo;
        ctx.setStatsBelowRenderInfo(hudSettings.showRenderInfo);
        if (now - fpsLastUpdate > 100) {
            const frameMs = now - lastT;
            if (hudSettings.showFps) {
                const fps = Math.round(1000 / frameMs);
                ctx.fpsSprite.draw(String(fps), (c) => paintFPS(c, fps));
            }
            if (hudSettings.showRenderInfo) {
                _renderInfo.frameMs = frameMs;
                ctx.renderInfoSprite.draw(renderInfoKey(_renderInfo), (c) =>
                    paintRenderInfo(c, _renderInfo)
                );
            }

            const spd = ctx.speedSprite;
            if (spd.visible && ctx.flightState.isActive) {
                const ship = ctx.flightState.activeShip;
                // The classic autopilot flies on its own tier and phases; the Ship AI autopilot
                // flies on the ship's selected tier through its control input, like a pilot.
                const classicAp = !!ship?.classicAutopilotActive;
                const aiInput = ship?.autopilotAI ? ship.controlInput : null;
                // Report the tier the ship is actually flying on: the classic autopilot has its own.
                const h = classicAp ? ship?.autopilotHandling : ship?.handling;
                // Ship AI: braking means holding brake above the setpoint.
                const aiBraking =
                    !!ship &&
                    !!aiInput &&
                    ship.thrustActive &&
                    aiInput.brake &&
                    aiInput.speedSetpoint !== null &&
                    ship.velocity.dot(
                        new THREE.Vector3(0, 0, 1).applyQuaternion(ship.controlFrameQuat)
                    ) > aiInput.speedSetpoint;
                const hWarp =
                    ship?.warpActive ||
                    ship?.warpDecelerating ||
                    ctx.autopilotState.phase === 'WARP' ||
                    ctx.autopilotState.phase === 'WARP_CHARGING';
                const hBoost =
                    !!h &&
                    !hWarp &&
                    ((!ctx.autopilotState.isActive && ctx.keys.shift) ||
                        (!!aiInput && aiInput.boost && !!ship?.thrustActive && !aiBraking) ||
                        (classicAp &&
                            ctx.autopilotState.phase === 'APPROACH' &&
                            ctx.autopilotState.isBoostActive) ||
                        (classicAp &&
                            ctx.autopilotState.phase === 'BRAKE' &&
                            (ctx.flightState.activeShip?.velocity?.length() ?? 0) >
                                h.flightMaxSpeed));
                const hBrake =
                    !hWarp &&
                    (ship?.boostDecelerating ||
                        ship?.warpDecelerating ||
                        ship?.stopBraking ||
                        aiBraking ||
                        (classicAp && ctx.autopilotState.phase === 'BRAKE') ||
                        (!aiInput && ctx.keys.s));
                const thrustRate: number = (() => {
                    if (!h) return 0;
                    if (ship?.warpDecelerating) return h.flightWarpDecel;
                    if (ship?.boostDecelerating)
                        return ship.boostDecelRateAt(ctx.flightState.currentSpeed);
                    if (ship?.stopBraking)
                        return ctx.flightState.currentSpeed > h.flightBoostMaxSpeed
                            ? h.flightWarpDecel
                            : ctx.flightState.currentSpeed > h.flightMaxSpeed
                              ? h.flightBoostDecel
                              : h.flightThrustDecel;
                    if (hWarp) return 0;
                    if (hBoost) return h.flightBoostAccel;
                    if (hBrake)
                        return ctx.flightState.currentSpeed > h.flightMaxSpeed
                            ? h.flightBoostDecel
                            : h.flightThrustDecel;
                    if (!ctx.autopilotState.isActive && ctx.keys.w) return h.flightThrustAccel;
                    if (aiInput && ship?.thrustActive) return h.flightThrustAccel;
                    if (classicAp && ctx.autopilotState.phase === 'BRAKE')
                        return h.flightThrustDecel;
                    if (
                        classicAp &&
                        (ctx.autopilotState.phase === 'APPROACH' ||
                            ctx.autopilotState.phase === 'CIRCULARIZE' ||
                            ctx.autopilotState.phase === 'TIDAL_LOCK')
                    )
                        return h.flightThrustAccel;
                    return 0;
                })();

                const gRate = ship?.tempAcc?.length() ?? 0;

                ctx.refreshSpeedSprite({
                    speed: ctx.flightState.currentSpeed,
                    isBoosting: hBoost,
                    pos: ship?.mesh?.position,
                    vel: ship?.velocity,
                    isWarp: !!hWarp,
                    isBraking: !!hBrake,
                    shipThrustRate: thrustRate,
                    gravRate: gRate,
                    speedMode: classicAp || ship?.highSpeedMode ? 'HIGH' : 'LOW',
                    guidance: ship?.guidanceStatus ?? 'off',
                });
            }

            const sel = ctx.selectedBody.value;
            if (sel && ctx.simulationState.bodies.includes(sel) && !sel._isDisposed) {
                ctx.refreshStatsSprite(sel);
                ctx.statsSprite.visible = true;
            } else {
                ctx.statsSprite.visible = false;
            }

            ctx.flightHUD.updateAutopilotHUD((now - lastT) / 1000);

            fpsLastUpdate = now;
        }

        // Every screen-projected indicator runs here, after the camera's final move (flight
        // camera, follow-focus, orbit controls) and before the overlay render. Projecting
        // earlier pairs this frame's body positions with last frame's camera, so at high
        // timewarp or warp speed the panels drift a whole frame of motion away from their
        // bodies. Refresh the camera matrices and prime the projector once for all of them.
        ctx.camera.updateMatrixWorld();
        // Tan(fov/2) and the viewport half-sizes are computed once here for all indicators.
        ctx.screenProjector.beginFrame(ctx.camera);

        // Screen-size LOD, from the camera's final pose: small bodies drop to low-poly proxies,
        // tiny ones to dots. Before the indicators and the render, after the last camera move.
        ctx.bodyLod.update(
            ctx.camera,
            ctx.screenProjector,
            ctx.simulationState.bodies,
            settingsStore.settings.distantBodyDetail,
            isFlightModeActive ? ctx.flightState.activeShip : null,
            // Last frame's eased value: the dimmer updates later in the frame.
            _skyBackground.skyBrightness
        );

        // ── Planet name indicators (replaces old text labels) ───────────
        // One reused context object instead of a fresh literal every frame.
        let flightHoverCtx: IPlanetNameFlightContext | undefined;
        if (isFlightModeActive) {
            _flightHoverCtx.steeringLineVisible = ctx.flightSteeringLine.visible;
            _flightHoverCtx.steeringTipX = ctx.steeringLinePositions[3];
            _flightHoverCtx.steeringTipY = ctx.steeringLinePositions[4];
            _flightHoverCtx.autopilotCharge = ctx.flightState.autopilotCharge;
            _flightHoverCtx.activeShip = ctx.flightState.activeShip;
            flightHoverCtx = _flightHoverCtx;
        }

        ctx.planetNameIndicator.update(ctx.screenProjector, ctx.autopilotState, flightHoverCtx);
        // While flying, the ship's shield/hull are shown in the flight HUD (above the speed
        // readout), so suppress the world-space bar that would otherwise float over its own hull.
        // Every other body — including other ships — keeps its bar.
        ctx.healthBarIndicator.update(
            ctx.screenProjector,
            isFlightModeActive ? ctx.flightState.activeShip : null
        );
        ctx.threatIndicator.update(ctx.screenProjector);
        ctx.aiDebugIndicator.update(ctx.screenProjector);

        // ── E-key autopilot charge accumulation ──────────────────────────
        if (isFlightModeActive) {
            const _hovered = ctx.planetNameIndicator.steeringHoveredBody;
            const _eHeld = ctx.keys.e;
            const _ePressed = _eHeld && !_ePrevHeld;
            _ePrevHeld = _eHeld;
            const _autopilotCanCancel = ctx.autopilotState.isActive;
            const _ship = ctx.flightState.activeShip;

            // Clear the block as soon as E is released
            if (!_eHeld) _ePressConsumed = false;

            // Landing (see simulation/ship-landing.ts): E aborts one in progress, or — within
            // range of a surface — starts one. Out of range E keeps its autopilot role below.
            let _landingSurface: Body | null = null;
            if (_ePressed && !_autopilotCanCancel && _ship && !_ship._isDisposed) {
                if (_ship.landingPhase === 'idle' && !_ship.isGrounded) {
                    _landingSurface = findLandingSurface(_ship, ctx.simulationState.bodies);
                }
            }

            if (_eHeld && _autopilotCanCancel && !_ePressConsumed) {
                // Cancel autopilot on any E press — no hover or charge required
                ctx.cancelAutopilot('Autopilot disengaged.');
            } else if (_ePressed && _ship && _ship.landingPhase !== 'idle') {
                cancelLanding(_ship);
                _ePressConsumed = true;
                playSoundEffect(SoundEffect.LandingCanceled);
                flightCtx.addEvent({
                    message: 'Landing aborted. Flight controls restored.',
                    notificationType: NotificationType.Info,
                });
            } else if (_ePressed && _ship && _landingSurface) {
                _ePressConsumed = true;
                if (canBeginLanding(_ship) && beginLanding(_ship, _landingSurface)) {
                    ctx.flightState.autopilotCharge = 0;
                    playSoundEffect(SoundEffect.LandingInitiated);
                    flightCtx.addEvent({
                        message: `🛬 Landing on ${_landingSurface.name}. Press E to abort.`,
                        notificationType: NotificationType.Info,
                    });
                } else {
                    flightCtx.addEvent({
                        message: 'Drop out of warp before landing.',
                        notificationType: NotificationType.Warning,
                    });
                }
            } else if (_ePressConsumed || (_ship && _ship.landingPhase !== 'idle')) {
                // This press already did its job (or a landing owns the ship): no charging.
                ctx.flightState.autopilotCharge = 0;
            } else if (_hovered && _eHeld && !_autopilotCanCancel) {
                ctx.flightState.autopilotCharge = Math.min(
                    ctx.flightState.autopilotCharge + wallDt,
                    FLIGHT_AUTOPILOT_CHARGE_TIME
                );
                if (ctx.flightState.autopilotCharge >= FLIGHT_AUTOPILOT_CHARGE_TIME) {
                    ctx.engageAutopilot(_hovered);
                    ctx.flightState.autopilotCharge = 0;
                    // Prevent cancelling immediately if E is still held after engagement
                    _ePressConsumed = true;
                }
            } else {
                ctx.flightState.autopilotCharge = 0;
            }
        }

        ctx.targetIndicator.update(ctx.screenProjector);
        ctx.targetLockIndicator.update(ctx.screenProjector);
        ctx.leadAimIndicator.update(ctx.screenProjector);
        // Missiles are fast and often chased by the flight camera, so they're tracked here, after
        // the camera's final move, rather than with the other indicators above.
        ctx.missileTrackerIndicator.update(ctx.screenProjector);

        // ── Render ──────────────────────────────────────────────────────────
        // Everything from here to the HUD render counts toward this frame's render info.
        ctx.renderer.info.reset();
        // Redraw the ground under the camera in camera-local precision, so the nearest body's
        // float32-rounded surface doesn't jitter against ships resting on it.
        _surfacePatch.update(ctx.camera, ctx.simulationState.bodies);
        // A daytime sky around the camera hides the starfield behind it.
        _skyBackground.update(ctx.scene, ctx.camera.position, ctx.simulationState.bodies, wallDt);
        // Eclipse occluders and the ship shadow atlas, from the camera's final pose this frame.
        updateShadows(
            ctx.renderer,
            ctx.scene,
            ctx.camera,
            ctx.simulationState.bodies,
            ctx.flightState.activeShip
        );
        // Output settings. All cheap to set every frame: the targets are only rebuilt when HDR
        // actually toggles, and three recompiles the screen passes when the curve changes.
        const settings = settingsStore.settings;
        const hdr = ctx.hdrSupported && settings.hdrEnabled;
        ctx.lensingEffect.setHdr(hdr);
        ctx.sunRaysEffect.setHdr(hdr);
        ctx.renderer.toneMapping = TONE_MAPPING_CURVES[settings.toneMapping];
        ctx.renderer.toneMappingExposure = settings.exposure;
        // The scene is captured at the render scale; applyLensing stretches it to the canvas.
        const renderScale = settings.renderScale;
        ctx.lensingEffect.setRenderScale(renderScale);
        ctx.lensingEffect.beginCapture(ctx.renderer);
        try {
            renderWithScaledPoints(ctx.renderer, ctx.scene, ctx.camera, renderScale);
        } catch (e) {
            console.error('Error during rendering:', e);
        }
        // Sun rays read the captured scene; the output pass adds them before tone mapping.
        const rays = settings.sunRaysEnabled
            ? ctx.sunRaysEffect.computeRays(
                  ctx.renderer,
                  ctx.camera,
                  ctx.lensingEffect.sceneTexture,
                  ctx.simulationState.bodies
              )
            : null;
        const activeBHs = ctx.simulationState.bodies.filter(
            (b) => !b._isDisposed && !!(b.bodyType & BodyTypeEnum.BlackHole)
        );
        // Lensing, tone mapping and the sRGB conversion, drawn to the screen.
        ctx.lensingEffect.applyLensing(
            ctx.renderer,
            ctx.camera,
            activeBHs.map((b) => ({ position: b.mesh.position, radius: b.radius })),
            rays
        );
        // Lens flare goes on last, straight to the screen, so the rays don't smear it and the
        // lensing doesn't warp it. Its shimmer runs on real time but freezes while paused.
        if (settingsStore.settings.lensflareEnabled) {
            ctx.lensFlareEffect.render(
                ctx.renderer,
                ctx.camera,
                ctx.simulationState.bodies,
                dtTotal > 0 ? wallDt : 0,
                wallDt
            );
        }
        // Cockpit interior overlay: after the world (and lensing), before the 2D HUD.
        ctx.cockpitView.render(ctx.renderer);
        ctx.renderer.autoClear = false;
        ctx.renderer.clearDepth();
        // The HUD is flat UI art, not scene light: drawn untouched by the tone curve, so its
        // colours are exactly as painted whichever curve and exposure are selected. Its
        // materials always compile against NoToneMapping, so this switch never recompiles.
        const sceneToneMapping = ctx.renderer.toneMapping;
        ctx.renderer.toneMapping = THREE.NoToneMapping;
        ctx.renderer.render(ctx.uiScene, ctx.uiCamera);
        ctx.renderer.toneMapping = sceneToneMapping;
        ctx.renderer.autoClear = true;

        // Snapshot this frame's counters for the render-info readout (painted next frame).
        const info = ctx.renderer.info;
        _renderInfo.calls = info.render.calls;
        _renderInfo.triangles = info.render.triangles;
        _renderInfo.points = info.render.points;
        _renderInfo.lines = info.render.lines;
        _renderInfo.geometries = info.memory.geometries;
        _renderInfo.textures = info.memory.textures;
        _renderInfo.programs = info.programs?.length ?? 0;
        _renderInfo.lodFull = ctx.bodyLod.counts.full;
        _renderInfo.lodReduced = ctx.bodyLod.counts.reduced;
        _renderInfo.lodDot = ctx.bodyLod.counts.dot;
        _renderInfo.labels = ctx.planetNameIndicator.visibleCount;

        lastT = now;
    }

    animate();
}
