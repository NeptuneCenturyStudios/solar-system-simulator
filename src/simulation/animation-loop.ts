import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { Body } from '../bodies/body';
import { CelestialBody } from '../bodies/celestial-body';
import { Supernova } from '../effects/supernova';
import { PlanetaryNebula } from '../effects/planetary-nebula';
import { GravitationalLensingEffect } from '../effects/gravitational-lensing';
import { CoordinateGizmo } from '../gizmos/coordinate-gizmo';
import { VelocityArcManager } from '../drawing/velocity-arc';
import { OrbitPredictionManager } from '../drawing/orbit-prediction';
import { PositionIndicatorManager } from '../gizmos/position-indicator';
import { GridHelperManager } from '../gizmos/grid-helper';
import { AiAvoidanceGizmo } from '../gizmos/ai-avoidance-gizmo';
import { FlightHUD } from '../drawing/flight-hud';
import { AutopilotTargetIndicator } from '../drawing/autopilot-target-indicator';
import { PlanetNameIndicator, IPlanetNameFlightContext } from '../drawing/planet-name-indicator';
import { SurfaceCameraManager } from '../camera/surface-camera';
import { Comet } from '../bodies/comet';
import { Wormhole } from '../bodies/wormhole';
import { processWormholeInteractions } from '../physics/wormhole-collision';
import { updateWormholeBridges } from '../effects/wormhole-link-bridge';
import { BodyTypeEnum } from '../bodies/body-enums';
import { settingsStore } from '../settings/settings-store';
import { UIManager } from '../ui/ui-manager';
import {
    absorbBody,
    chooseCollisionWinner,
    destroyBody,
    updateSimulation,
} from '../physics/physics';
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
    WARP_FADE_DIST,
    WARP_FULL_VIS_DIST,
    WARP_SHAKE_MAG,
    FLIGHT_ALT_ORBIT_RETURN_SPEED,
    FREE_CAM_NORMAL_SPEED,
    FREE_CAM_BOOST_SPEED,
    FLIGHT_AUTOPILOT_CHARGE_TIME,
} from '../utilities/consts';
import {
    createFPSTexture,
    createSpeedTexture,
    createStatsTexture,
} from '../drawing/text-rendering';
import { interactionState, simulationState, cameraState } from './simulation';
import { exitFlightMode, updateFlightControls } from './flight-controllers';
import { stepNpcShips } from './ai/npc-manager';
import type { Spaceship } from '../bodies/ships/spaceship';

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
    gizmo: CoordinateGizmo;
    velArc: VelocityArcManager;
    orbitPrediction: OrbitPredictionManager;
    posIndicator: PositionIndicatorManager;
    gridHelperManager: GridHelperManager;
    aiAvoidanceGizmo: AiAvoidanceGizmo;
    flightHUD: FlightHUD;
    targetIndicator: AutopilotTargetIndicator;
    planetNameIndicator: PlanetNameIndicator;
    surfaceCam: SurfaceCameraManager;

    // Sprites
    fpsSprite: { value: THREE.Sprite | null };
    statsSprite: { value: THREE.Sprite | null };
    speedSprite: { value: THREE.Sprite | null };

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
    uiManager: UIManager;
}

// Scratch vectors for updateShipTrail (called once per ship per frame).
const _trailNozzle = new THREE.Vector3();
const _trailExhaustDir = new THREE.Vector3();

/**
 * Update one ship's engine trail.  Shared by the player's ship and every
 * AI-piloted ship so they render identically.
 *
 * @param ship     The ship whose trail to update.
 * @param speed    Speed to drive the trail intensity with (u/s).
 * @param boosting True when the ship is at or shedding boost speed — selects the
 *                 boost ceiling for intensity normalisation.
 * @param dtTotal  Sim-time seconds advanced this frame.
 * @param cameraPos Camera world position, for distance-based trail detail.
 */
function updateShipTrail(
    ship: Spaceship,
    speed: number,
    boosting: boolean,
    dtTotal: number,
    cameraPos: THREE.Vector3
): void {
    _trailNozzle
        .copy(ship.thrusterOffset)
        .applyQuaternion(ship.mesh.quaternion)
        .add(ship.mesh.position);
    _trailExhaustDir.set(0, 0, -1).applyQuaternion(ship.mesh.quaternion);
    const trailMax = boosting ? ship.handling.flightBoostMaxSpeed : ship.handling.flightMaxSpeed;
    ship.trail.update(
        _trailNozzle,
        speed,
        trailMax,
        true,
        ship.velocity,
        _trailExhaustDir,
        dtTotal,
        cameraPos
    );
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
    // Pre-substep position snapshot, used for the swept wormhole-entrance test.
    const _wormholePrevPositions = new Map<string, THREE.Vector3>();

    let fpsLastUpdate = 0;
    let lastT = performance.now();
    // Prevents an E-hold that triggered autopilot engagement from immediately cancelling it.
    let _eBlockedForCancel = false;

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
        const steps = Math.min(
            Math.max(1, Math.ceil(baseSubsteps * frameRatio)),
            MAX_SUBSTEPS_PER_FRAME
        );
        const dt = (wallDt * TIME_SCALE * tScale) / steps;
        const dtTotal = dt * steps;

        // ── Surface camera ───────────────────────────────────────────────
        const isSurfaceModeActive = !!ctx.surfaceCam.isActive;
        if (isSurfaceModeActive) {
            ctx.surfaceCam.updateTransform();
        }

        // ── Flight mode ──────────────────────────────────────────────────
        const isFlightModeActive =
            ctx.flightState.isActive &&
            !!ctx.flightState.activeShip &&
            !ctx.flightState.activeShip._isDisposed;

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

        if (isFlightModeActive) {
            updateFlightControls(flightCtx, wallDt, dtTotal);
        }

        // ── AI-piloted ships ─────────────────────────────────────────────
        // Runs whether or not the player is in flight mode: NPC ships fly on
        // regardless. Frame-level only (decisions + steering/roll); their thrust
        // is applied per physics substep inside updateSimulation().
        stepNpcShips(wallDt, dtTotal);

        // Draw what those controllers just decided. After the step, so the overlay shows the
        // heading the ships are flying this frame rather than the previous one's.
        ctx.aiAvoidanceGizmo.update();

        // ── Background warp/boost speed (unified) ────────────────────────
        const bgShip = ctx.flightState.knownShip;
        if (!isFlightModeActive && bgShip && !bgShip._isDisposed && bgShip.mesh) {
            const bgWarpActive = bgShip.warpActive;
            const bgWarpDecel = bgShip.warpDecelerating;
            const bgBoostDecel = bgShip.boostDecelerating;
            const bgStopBrake = bgShip.stopBraking;

            if (bgWarpActive || bgWarpDecel || bgBoostDecel || bgStopBrake) {
                const bgFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bgShip.mesh.quaternion);
                bgShip.advanceWarpSpeed(dtTotal, bgFwd);
                ctx.flightState.currentSpeed = bgShip.velocity.dot(bgFwd);
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

        // ── Warp effect ──────────────────────────────────────────────────
        const _warpShip = ctx.flightState.activeShip ?? ctx.flightState.knownShip;
        if (_warpShip && !_warpShip._isDisposed && _warpShip.mesh) {
            _warpShip.updateWarpEffect(dtTotal, _warpShip.handling.flightWarpSpeed);
        }

        // ── WASD camera movement ─────────────────────────────────────────
        if (!isFlightModeActive) {
            const speed = ctx.keys.shift ? FREE_CAM_BOOST_SPEED : FREE_CAM_NORMAL_SPEED;
            ctx.camera.getWorldDirection(_animCamDirection);
            _animCamRight.crossVectors(ctx.camera.up, _animCamDirection).normalize();

            _animCamMovement.set(0, 0, 0);
            if (ctx.keys.w) _animCamMovement.addScaledVector(_animCamDirection, speed);
            if (ctx.keys.s) _animCamMovement.addScaledVector(_animCamDirection, -speed);
            if (ctx.keys.a) _animCamMovement.addScaledVector(_animCamRight, speed);
            if (ctx.keys.d) _animCamMovement.addScaledVector(_animCamRight, -speed);
            if (ctx.keys.space) _animCamMovement.y += speed;
            if (ctx.keys.c) _animCamMovement.y -= speed;

            if (_animCamMovement.lengthSq() > 0) {
                ctx.camera.position.add(_animCamMovement);
                if (
                    !cameraState.isFreeCameraMode &&
                    (cameraState.focusBody !== null || cameraState.frozenFocusPosition !== null)
                ) {
                    ctx.controls.target.add(_animCamMovement);
                }

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
        // Snapshot positions before the physics step so wormhole entrance detection can
        // sweep each body's path across the frame instead of a static end-of-frame test
        // (needed since a ship in warp can cross a thin wormhole mouth within one frame).
        for (const b of ctx.simulationState.bodies) {
            if (!b || b._isDisposed || !b.mesh) continue;
            let snapshot = _wormholePrevPositions.get(b.id);
            if (!snapshot) {
                snapshot = new THREE.Vector3();
                _wormholePrevPositions.set(b.id, snapshot);
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
            ctx.flightState.currentSpeed = _ship?.velocity.dot(_forward) ?? 0;
        }

        // ── Collision & post-physics updates ─────────────────────────────
        if (!ctx.interactionState.isRepositioning) {
            for (let j = 0; j < ctx.simulationState.bodies.length; j++) {
                const b1 = ctx.simulationState.bodies[j];
                if (!b1) continue;

                if (b1 instanceof CelestialBody) b1.updateTrail(ctx.camera.position);
                if (b1 instanceof CelestialBody) b1.updateVisuals(dtTotal, ctx.camera.position);
                if (b1 instanceof Comet) b1.updateTail(dtTotal, ctx.camera.position);
                if (b1 instanceof Wormhole) b1.funnelEffect.update(dtTotal);

                if (b1._isDisposed || !b1.mesh) continue;

                for (let k = j + 1; k < ctx.simulationState.bodies.length; k++) {
                    const b2 = ctx.simulationState.bodies[k];
                    if (!b2 || b2._isDisposed || !b2.mesh) continue;

                    // Wormholes are indestructible and never absorb/destroy via the normal
                    // mass-based rules — entrance/teleport is handled by a dedicated pass below.
                    if (b1 instanceof Wormhole || b2 instanceof Wormhole) continue;

                    const dx = b1.mesh.position.x - b2.mesh.position.x;
                    const dy = b1.mesh.position.y - b2.mesh.position.y;
                    const dz = b1.mesh.position.z - b2.mesh.position.z;
                    const maxDist = b1.radius + b2.radius;
                    if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist || Math.abs(dz) > maxDist)
                        continue;

                    if (dx * dx + dy * dy + dz * dz < maxDist * maxDist) {
                        const outcome = chooseCollisionWinner(b1, b2);

                        if (outcome.type === 'destroy-both') {
                            // Comparable-mass bodies: no winner — both are destroyed.
                            // The camera focus (if it was one of these bodies) is frozen at
                            // the body's last position by handleBodyBecameInvalid (via the
                            // body:dead event fired inside victim.die()).
                            destroyBody(null, outcome.victims);

                            for (const victim of outcome.victims) {
                                victim.die();
                                ctx.simulationState.bodies = ctx.simulationState.bodies.filter(
                                    (b) => b !== victim
                                );
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
                        victim.die();
                        ctx.simulationState.bodies = ctx.simulationState.bodies.filter(
                            (b) => b !== victim
                        );

                        // b1 may be the victim — stop colliding it against remaining bodies.
                        if (b1._isDisposed) break;
                    }
                }
            }

            processWormholeInteractions(ctx.simulationState.bodies, _wormholePrevPositions);

            // Bezier particle streams between linked wormholes (once per frame, not per body).
            updateWormholeBridges(dtTotal);
        }

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
        // flight mode.  Weapons also self-hide when not firing.
        if (ctx.flightState.isActive && ctx.flightState.activeShip) {
            const ship = ctx.flightState.activeShip;
            for (const weapon of ship.weapons) {
                weapon.update(
                    wallDt,
                    dtTotal,
                    ctx.simulationState.bodies,
                    ctx.camera.position,
                    ship
                );
            }
        }

        // ── Thermal load gauge ───────────────────────────────────────────────
        // Anchored beside the gray steering-origin ring; hides together with it.
        if (
            ctx.flightState.isActive &&
            ctx.flightState.activeShip &&
            ctx.flightState.activeShip.weapons.length > 0 &&
            ctx.steeringOriginMarker.visible
        ) {
            const weapon = ctx.flightState.activeShip.weapons[0];
            ctx.flightHUD.updateThermalHUD(
                weapon.thermalLoad,
                weapon.isOverheated,
                ctx.steeringOriginMarker.position
            );
        } else {
            ctx.flightHUD.hideThermalSprite();
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

        // ── Planet name indicators (replaces old text labels) ───────────
        const _flightHoverCtx: IPlanetNameFlightContext | undefined = isFlightModeActive
            ? {
                  isActive: true,
                  steeringLineVisible: ctx.flightSteeringLine.visible,
                  steeringTipX: ctx.steeringLinePositions[3],
                  steeringTipY: ctx.steeringLinePositions[4],
                  autopilotCharge: ctx.flightState.autopilotCharge,
                  chargeTime: FLIGHT_AUTOPILOT_CHARGE_TIME,
                  activeShip: ctx.flightState.activeShip,
              }
            : undefined;
        ctx.planetNameIndicator.update(
            ctx.camera,
            _cameraVel,
            false,
            ctx.autopilotState,
            _flightHoverCtx
        );

        // ── E-key autopilot charge accumulation ──────────────────────────
        if (isFlightModeActive) {
            const _hovered = ctx.planetNameIndicator.steeringHoveredBody;
            const _eHeld = ctx.keys.e;
            const _autopilotCanCancel = ctx.autopilotState.isActive;

            // Clear the block as soon as E is released
            if (!_eHeld) _eBlockedForCancel = false;

            if (_eHeld && _autopilotCanCancel && !_eBlockedForCancel) {
                // Cancel autopilot on any E press — no hover or charge required
                ctx.cancelAutopilot('Autopilot disengaged.');
            } else if (_hovered && _eHeld && !_autopilotCanCancel) {
                ctx.flightState.autopilotCharge = Math.min(
                    ctx.flightState.autopilotCharge + wallDt,
                    FLIGHT_AUTOPILOT_CHARGE_TIME
                );
                if (ctx.flightState.autopilotCharge >= FLIGHT_AUTOPILOT_CHARGE_TIME) {
                    ctx.engageAutopilot(_hovered);
                    ctx.flightState.autopilotCharge = 0;
                    // Prevent cancelling immediately if E is still held after engagement
                    _eBlockedForCancel = true;
                }
            } else {
                ctx.flightState.autopilotCharge = 0;
            }
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
            updateShipTrail(playerTrailShip, trailSpd, boosting, dtTotal, ctx.camera.position);
        }

        for (const npc of ctx.simulationState.npcShips) {
            if (!npc || npc._isDisposed || !npc.mesh) continue;
            // Skip the ship the player is flying — it was already handled above.
            if (npc === playerTrailShip) continue;
            if (npc.warpActive) continue;
            const boosting = npc.controlInput.boost || npc.boostDecelerating;
            updateShipTrail(npc, npc.velocity.length(), boosting, dtTotal, ctx.camera.position);
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
                // instead of snapping back to the scene center.
                ctx.controls.target.copy(ctx.cameraState.frozenFocusPosition);
            } else {
                ctx.controls.target.copy(ctx.NONE_FOCUS_POSITION);
            }
        }
        if (!isSurfaceModeActive && !cameraState.isFreeCameraMode && !isFlightModeActive)
            ctx.controls.update();

        // ── HUD ──────────────────────────────────────────────────────────────
        ctx.flightHUD.updateHintSprite();

        // ── Warp distance fade ─────────────────────────────────────────────
        const visShip = ctx.flightState.activeShip ?? ctx.flightState.knownShip;
        let wdf: number;
        if (visShip && !visShip._isDisposed && visShip.mesh) {
            if (isFlightModeActive) {
                wdf = 1;
                visShip.setWarpEffectOpacity(1);
            } else {
                const isLook =
                    ctx.cameraState.isLookAtMode && ctx.cameraState.focusBody === visShip;
                if (isLook) {
                    const d = ctx.camera.position.distanceTo(visShip.mesh.position);
                    if (d >= WARP_FADE_DIST) {
                        wdf = 0;
                        visShip.setWarpEffectOpacity(0);
                    } else {
                        const t = Math.max(
                            0,
                            (d - WARP_FULL_VIS_DIST) / (WARP_FADE_DIST - WARP_FULL_VIS_DIST)
                        );
                        wdf = 1 - t;
                        visShip.setWarpEffectOpacity(1 - t);
                    }
                } else {
                    wdf = 0;
                    visShip.setWarpEffectOpacity(0);
                }
            }
        } else {
            wdf = 0;
            visShip?.setWarpEffectOpacity(0);
        }

        if (visShip && !visShip._isDisposed && visShip.mesh) {
            const vol = Math.min(
                visShip.velocity.length() / (visShip.handling.flightWarpSpeed / 33.33),
                1
            );
            visShip.updateWarpSound(vol, wdf);
        }

        // ── Render ──────────────────────────────────────────────────────────
        ctx.lensingEffect.beginCapture(ctx.renderer);
        try {
            ctx.renderer.render(ctx.scene, ctx.camera);
        } catch (e) {
            console.error('Error during rendering:', e);
        }
        const activeBHs = ctx.simulationState.bodies.filter(
            (b) => !b._isDisposed && !!(b.bodyType & BodyTypeEnum.BlackHole)
        );
        ctx.lensingEffect.applyLensing(
            ctx.renderer,
            ctx.camera,
            activeBHs.map((b) => ({ position: b.mesh.position, radius: b.radius }))
        );
        ctx.renderer.autoClear = false;
        ctx.renderer.clearDepth();
        ctx.renderer.render(ctx.uiScene, ctx.uiCamera);
        ctx.renderer.autoClear = true;

        // ── HUD sprites (FPS / stats / speed) ──────────────────────────────
        if (now - fpsLastUpdate > 100) {
            const fps = Math.round(1000 / (now - lastT));
            if (ctx.fpsSprite.value) {
                ctx.fpsSprite.value.material.map?.dispose();
                ctx.fpsSprite.value.material.map = createFPSTexture(fps);
                ctx.fpsSprite.value.material.needsUpdate = true;
            }

            const spd = ctx.speedSprite.value;
            if (spd && spd.visible && ctx.flightState.isActive) {
                const ship = ctx.flightState.activeShip;
                const h = ship?.handling;
                const hWarp =
                    ship?.warpActive ||
                    ship?.warpDecelerating ||
                    ctx.autopilotState.phase === 'WARP' ||
                    ctx.autopilotState.phase === 'WARP_CHARGING';
                const hBoost =
                    !!h &&
                    !hWarp &&
                    ((!ctx.autopilotState.isActive && ctx.keys.shift) ||
                        (ctx.autopilotState.phase === 'APPROACH' &&
                            ctx.autopilotState.isBoostActive) ||
                        (ctx.autopilotState.phase === 'BRAKE' &&
                            (ctx.flightState.activeShip?.velocity?.length() ?? 0) >
                                h.flightMaxSpeed));
                const hBrake =
                    !hWarp &&
                    (ship?.boostDecelerating ||
                        ship?.warpDecelerating ||
                        ship?.stopBraking ||
                        ctx.autopilotState.phase === 'BRAKE' ||
                        ctx.keys.s);
                const thrustRate: number = (() => {
                    if (!h) return 0;
                    if (ship?.warpDecelerating) return h.flightWarpDecel;
                    if (ship?.boostDecelerating) return h.flightBoostDecel;
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
                    if (ctx.autopilotState.isActive && ctx.autopilotState.phase === 'BRAKE')
                        return h.flightThrustDecel;
                    if (
                        ctx.autopilotState.isActive &&
                        (ctx.autopilotState.phase === 'APPROACH' ||
                            ctx.autopilotState.phase === 'CIRCULARIZE' ||
                            ctx.autopilotState.phase === 'TIDAL_LOCK')
                    )
                        return h.flightThrustAccel;
                    return 0;
                })();
                const gRate = ship?.tempAcc?.length() ?? 0;
                spd.material.map?.dispose();
                spd.material.map = createSpeedTexture(
                    ctx.flightState.currentSpeed,
                    hBoost,
                    ship?.mesh?.position,
                    ship?.velocity,
                    hWarp,
                    hBrake,
                    thrustRate,
                    gRate
                );
                spd.material.needsUpdate = true;
            }

            const sel = ctx.selectedBody.value;
            if (
                sel &&
                ctx.simulationState.bodies.includes(sel) &&
                !sel._isDisposed &&
                ctx.statsSprite.value
            ) {
                ctx.statsSprite.value.material.map?.dispose();
                ctx.statsSprite.value.material.map = createStatsTexture(sel);
                ctx.statsSprite.value.material.needsUpdate = true;
                ctx.statsSprite.value.visible = true;
            } else if (ctx.statsSprite.value) {
                ctx.statsSprite.value.visible = false;
            }

            ctx.flightHUD.updateAutopilotHUD((now - lastT) / 1000);

            fpsLastUpdate = now;
        }

        // Updates done per frame (for certain indicators that track objects or for other reasons)
        ctx.targetIndicator.update(ctx.camera);

        lastT = now;
    }

    animate();
}
