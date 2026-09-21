import * as THREE from 'three';
import { NotificationType } from '../event-log/event-log';
import { AI_STEER_FULL_DEFLECTION_ANGLE, TEXT_SPRITE_Z } from '../utilities/consts';
import {
    autopilotState,
    cameraState,
    flightState,
    interactionState,
    simulationState,
} from './simulation';
import { IFlightControlContext } from '../interfaces';
import { applyWeaponInput } from './ship-weapon-input';
import { settingsStore } from '../settings/settings-store';
import type { Body } from '../bodies/body';

// Chase-mode scratch — reused every frame so steering toward a locked target allocates nothing.
const _chaseToTarget = new THREE.Vector3();
const _chaseDir = new THREE.Vector3();
const _chaseLocal = new THREE.Vector3();
const _chaseInvFrame = new THREE.Quaternion();

/** How far ahead (seconds) chase steering predicts the aim error from its current closing
 *  rate, so it starts easing off before the nose reaches the target instead of only reacting
 *  once it's there. This is what actually damps the turn-rate "rubberbanding": a pure
 *  proportional-on-angle controller keeps commanding a large deflection right up until the
 *  error hits zero, which — combined with the stick smoothing in applySteering() — overshoots
 *  and swings back. Blending in the predicted error lets it start countering the turn early. */
const CHASE_STEER_LOOKAHEAD = 0.3;
/** Chase-mode error tracking, carried between frames to estimate the error's rate of change.
 *  Reset whenever chase stops or the locked target changes, so a stale derivative from a
 *  different engagement never leaks into a fresh one. */
let _chasePrevYawErr = 0;
let _chasePrevPitchErr = 0;
let _chaseHasPrevError = false;
let _chasePrevTarget: Body | null = null;

/** Exit flight mode and restore normal camera controls. */
export function exitFlightMode(ctx: IFlightControlContext) {
    // Preserve the ship reference so the user can re-enter later.
    // Only keep it if the ship is still alive.
    if (
        flightState.activeShip &&
        !flightState.activeShip._isDisposed &&
        simulationState.bodies.includes(flightState.activeShip)
    ) {
        flightState.knownShip = flightState.activeShip;
    } else {
        // Ship was destroyed — clear the known reference too.
        // Also kill warp state so the background updater doesn't force the
        // respawned ship to warp speed, and hide the frozen tunnel immediately.
        flightState.knownShip = null;
        flightState.activeShip?.resetWarpState();
        flightState.activeShip?.warpEffect.forceHide();
    }

    // Reset ship-local flight control state (roll vel, steer, banking, prevShift).
    const ship = flightState.activeShip ?? flightState.knownShip;
    if (ship && !ship._isDisposed) {
        ship.resetFlightControlState();
    }

    // Zero pointer/camera-level steering state.
    flightState.pointerOffsetX = 0;
    flightState.pointerOffsetY = 0;
    flightState.rollLeft = false;
    flightState.rollRight = false;
    flightState.isFiring = false;
    flightState.altOrbitActive = false;
    flightState.altOrbitYaw = 0;
    flightState.altOrbitPitch = 0;
    flightState.selectedTarget = null;
    // Release the trigger, but don't reset() weapons — any live bolts/beam should
    // stay in the scene and keep decaying naturally (frozen while paused, cleared
    // once the sim resumes) rather than disappearing as a side effect of exiting
    // flight mode. See animation-loop.ts's weapon update block, which keeps running
    // for this ship via flightState.knownShip even after isActive goes false.
    flightState.activeShip?.stopFire();

    // Clear deceleration and warp flags so on re-entry the ship isn't
    // artificially clamped back to FLIGHT_MAX_SPEED.
    if (ship) {
        ship.boostDecelerating = false;
        ship.warpDecelerating = false;
        ship.cancelWarpCharge();
    }

    flightState.isActive = false;
    flightState.activeShip = null;
    flightState.currentSpeed = 0;

    // Reset mouse-look so camera doesn't spin after re-enabling controls
    interactionState.isMouseLookActive = false;

    if (document.pointerLockElement === ctx.renderer.domElement) {
        document.exitPointerLock();
    }

    // Restore camera up so OrbitControls rotation doesn't break (it was set to ship's local up).
    ctx.camera.up.copy(flightState.prevCameraUp);

    // Re-enable controls before moving camera so the orbit anchor is valid.
    ctx.controls.enabled = !cameraState.isFreeCameraMode;

    // If the ship is still alive, orbit around it so the player can see where they left off.
    // Otherwise fall back to the pre-flight camera snapshot.
    if (
        flightState.knownShip &&
        !flightState.knownShip._isDisposed &&
        simulationState.bodies.includes(flightState.knownShip)
    ) {
        const shipPos = flightState.knownShip.mesh.position.clone();
        // Use the current in-flight camera-to-ship distance so the view doesn't
        // jump to the pre-flight zoom level after exit.
        const currentCamDist = ctx.camera.position.distanceTo(shipPos);
        const prevDir = new THREE.Vector3()
            .subVectors(flightState.prevCameraPos, flightState.prevControlsTarget)
            .normalize();
        const dist =
            currentCamDist > 0
                ? currentCamDist
                : flightState.prevCameraPos.distanceTo(flightState.prevControlsTarget);
        ctx.camera.position.copy(shipPos).addScaledVector(prevDir, dist);
        ctx.controls.target.copy(shipPos);
    } else {
        ctx.camera.position.copy(flightState.prevCameraPos);
        ctx.camera.quaternion.copy(flightState.prevCameraQuat);
        ctx.controls.target.copy(flightState.prevControlsTarget);
    }
    ctx.controls.update();

    ctx.flightSteeringLine.visible = false;
    ctx.flightCrosshair.visible = false;
    ctx.steeringEndMarker.visible = false;
    ctx.steeringOriginMarker.visible = false;
    ctx.flightHUD.hideWarpSprite();
    ship?.cancelWarpCharge();
    // warpActive is intentionally NOT cleared here — if the ship is still warping,
    // the background updater continues its velocity and the tunnel animation.
    if (flightState.knownShip && !flightState.knownShip._isDisposed) {
        flightState.knownShip.trail.hide();
    }
    if (ctx.speedSprite) ctx.speedSprite.visible = false;

    ctx.addEvent({
        message: 'Flight mode exited.',
        notificationType: NotificationType.Info,
    });

    // Undo the UI changes flight mode made on entry. Done last so the camera/HUD have
    // already been restored and Vue re-reads a settled state.
    ctx.onFlightModeExited();
}

/**
 * Applies per-frame flight controls to the active spaceship.
 * Called from animate() when flightState.isActive.
 *
 * NOTE: Velocity mutation (thrust) happens per physics substep inside
 * updateSimulation() via ship.applyFlightThrustSubstep().  This function handles
 * frame-level state transitions, steering, roll, and HUD only.
 * Warp/boost deceleration and warp acceleration are also handled here
 * (frame-level velocity steps applied via ship methods).
 * currentSpeed is synced from the ship's actual velocity after the physics
 * loop completes (in animation-loop.ts).
 */
export function updateFlightControls(ctx: IFlightControlContext, dt: number, simDt: number) {
    const ship = flightState.activeShip;
    if (!ship || ship._isDisposed || !ship.mesh) {
        exitFlightMode(ctx);
        return;
    }

    // Pause guard: while paused, do not mutate ship rotation, thrust, roll, or velocity.
    // Keep the active flight state intact so unpausing resumes from the exact same ship state.
    if (simulationState.isPaused || simulationState.timeScale === 0) {
        flightState.thrustActive = false;
        ship.thrustActive = false;
        return;
    }

    const keys = cameraState.keys;

    // The active ship's control frame IS the flight camera frame. Sync it in here
    // and back out after steering, so the ship's own flight-control methods (which
    // read ship.controlFrameQuat) and the camera stay in lockstep.
    ship.controlFrameQuat.copy(flightState.flightCameraQuat);

    const h = ship.handling;

    // ── Translate the player's keys and pointer into the ship's control input ──
    // From here on the player is just one input source among possible others: an
    // AI writes the same struct, and everything downstream is shared.
    const rawXFull = THREE.MathUtils.clamp(
        flightState.pointerOffsetX / h.flightMaxPointerOffset,
        -1,
        1
    );
    const rawYFull = THREE.MathUtils.clamp(
        flightState.pointerOffsetY / h.flightMaxPointerOffset,
        -1,
        1
    );
    function applyDeadzone(v: number) {
        const d = h.flightSteerDeadzone;
        if (Math.abs(v) < d) return 0;
        return (Math.sign(v) * (Math.abs(v) - d)) / (1 - d);
    }
    const rawX = applyDeadzone(rawXFull);
    const rawY = applyDeadzone(rawYFull);

    const playerInput = ship.controlInput;

    // ── Chase mode ───────────────────────────────────────────────────────────
    // With a locked target and the setting enabled, holding S no longer brakes: it pursues
    // instead — aim the nose at the target (same yaw/pitch-error steering FollowShipAI uses
    // for NPC pursuit, see ai/follow-ship-ai.ts) and thrust in, boosting if Shift is also
    // held. The mouse reticle keeps driving weapon aim independently (see the aim block
    // below), so the player can chase with the nose while aiming the gun elsewhere.
    const chaseTarget = flightState.selectedTarget;
    const chaseActive =
        keys.s &&
        !!chaseTarget &&
        !autopilotState.isActive &&
        settingsStore.settings.chaseModeEnabled;

    if (chaseActive && chaseTarget) {
        if (chaseTarget !== _chasePrevTarget) {
            // Switched targets (or just engaged) — the last frame's error belongs to a
            // different geometry, so don't derive a rate from it.
            _chaseHasPrevError = false;
            _chasePrevTarget = chaseTarget;
        }

        _chaseToTarget.subVectors(chaseTarget.mesh.position, ship.mesh.position);
        const chaseDist = _chaseToTarget.length();
        if (chaseDist > 1e-6) {
            _chaseDir.copy(_chaseToTarget).divideScalar(chaseDist);
            _chaseInvFrame.copy(ship.controlFrameQuat).invert();
            _chaseLocal.copy(_chaseDir).applyQuaternion(_chaseInvFrame);
            const yawErr = Math.atan2(_chaseLocal.x, _chaseLocal.z);
            const pitchErr = Math.atan2(_chaseLocal.y, Math.hypot(_chaseLocal.x, _chaseLocal.z));

            // Predict where the error will be a short moment ahead, from how fast it's
            // currently closing, and steer toward that instead of the raw instantaneous
            // error — the earlier countersteer this buys is what tames the overshoot.
            let yawTerm = yawErr;
            let pitchTerm = pitchErr;
            if (_chaseHasPrevError && dt > 1e-4) {
                const yawErrRate = (yawErr - _chasePrevYawErr) / dt;
                const pitchErrRate = (pitchErr - _chasePrevPitchErr) / dt;
                yawTerm += yawErrRate * CHASE_STEER_LOOKAHEAD;
                pitchTerm += pitchErrRate * CHASE_STEER_LOOKAHEAD;
            }
            _chasePrevYawErr = yawErr;
            _chasePrevPitchErr = pitchErr;
            _chaseHasPrevError = true;

            playerInput.steerX = THREE.MathUtils.clamp(
                -yawTerm / AI_STEER_FULL_DEFLECTION_ANGLE,
                -1,
                1
            );
            playerInput.steerY = THREE.MathUtils.clamp(
                -pitchTerm / AI_STEER_FULL_DEFLECTION_ANGLE,
                -1,
                1
            );
        }
        playerInput.thrust = true;
        playerInput.boost = keys.shift;
        playerInput.brake = false;
    } else {
        _chaseHasPrevError = false;
        _chasePrevTarget = null;
        playerInput.thrust = keys.w;
        playerInput.boost = keys.shift;
        playerInput.brake = keys.s;
        playerInput.steerX = rawX;
        playerInput.steerY = rawY;
    }

    playerInput.rollLeft = flightState.rollLeft;
    playerInput.rollRight = flightState.rollRight;
    // The autopilot flies the ship, so the trigger is dead while it is engaged.
    playerInput.fire = flightState.isFiring && !autopilotState.isActive;

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.controlFrameQuat);

    // ── Warp/boost speed management (unified) ──────────────────────────────
    // Handles warp-active acceleration, warp decel → boost, and boost decel → idle
    // via the single ship.advanceWarpSpeed() method, replacing three separate
    // duplicated blocks that existed for flight mode and background mode.
    if (ship.warpActive || ship.warpDecelerating || ship.boostDecelerating || ship.stopBraking) {
        const result = ship.advanceWarpSpeed(simDt, forward);
        flightState.currentSpeed = result.forwardSpeed;

        if (result.phase === 'warp_active') {
            // Warp active: accelerate, hide steering HUD, show warp-active overlay.
            flightState.thrustActive = true;
            ctx.flightSteeringLine.visible = false;
            ctx.flightCrosshair.visible = false;
            ctx.steeringEndMarker.visible = false;
            ctx.steeringOriginMarker.visible = false;
            ctx.flightHUD.updateWarpHUD(false, true, 0);
            return; // Skip all flight controls below
        }

        // Warp deceleration or boost deceleration
        flightState.thrustActive = false;
        ctx.flightHUD.hideWarpSprite();

        if (result.phase === 'warp_decel') {
            // Still shedding warp speed — keep steering hidden.
            ctx.flightSteeringLine.visible = false;
            ctx.steeringOriginMarker.visible = false;
        }

        if (result.decelDone) {
            // A deceleration phase just completed.
            if (result.phase === 'boost_decel') {
                // Warp decel finished (auto-started boost decel internally).
                ctx.flightSteeringLine.visible = true;
                ctx.steeringOriginMarker.visible = true;
                if (keys.shift) {
                    // Shift held: abort the auto boost decel, sit at boost speed.
                    flightState.currentSpeed = Math.min(
                        flightState.currentSpeed,
                        ship.handling.flightBoostMaxSpeed
                    );
                    ship.boostDecelerating = false;
                }
            }
            // If result.phase === 'idle', boost decel finished — nothing extra needed.
        }

        // Fall through to steering/roll below (no early return)
    } else {
        // ── Warp charging ──────────────────────────────────────────────────
        // Autopilot has its own WARP_CHARGING phase that advances ship.warpChargeTimer
        // inside autopilotStep().  We still need to show the charge bar in both cases.
        if (ship.warpCharging) {
            if (!autopilotState.isActive) {
                // Manual warp charging — advance the timer here.
                const fill = ship.updateWarpCharge(dt);
                ctx.flightHUD.updateWarpHUD(true, false, fill);
                if (fill >= 1) {
                    // Engage warp!
                    ship.engageWarp();

                    ctx.addEvent({
                        message: '⚡ Warp engaged! Press Space to disengage.',
                        notificationType: NotificationType.Success,
                    });
                }
            } else {
                // Autopilot warp charging — timer is advanced by autopilotStep();
                // just display the current progress.
                const fill = ship.warpChargeTimer / ship.handling.flightWarpChargeTime;
                ctx.flightHUD.updateWarpHUD(true, false, fill);
            }
            // Allow normal flight controls while charging (just can't turn on warp mid-turn)
        }
    }

    // ── Thrust state transitions (velocity mutation is in applyFlightThrustSubstep) ──
    const manualInput = !autopilotState.isActive;
    const fwdSpeed = ship.velocity.dot(forward);

    // Sync thrustActive flag for trail / HUD (key state, not physics).
    const thrustActive =
        manualInput && (playerInput.boost || playerInput.thrust || playerInput.brake);
    if (manualInput) flightState.thrustActive = thrustActive;
    ship.thrustActive = thrustActive;

    // Boost decel on release / cancel on re-engage — shared with AI ships.
    // (This also advances prevShiftHeld for next frame's release detection.)
    if (manualInput) {
        ship.updateBoostDecelState();
    } else {
        // Under autopilot the player's boost key must not touch decel state, but
        // still track it so re-taking control doesn't see a stale "just released".
        ship.prevShiftHeld = playerInput.boost;
    }

    // Autopilot speed display (velocity is managed by the autopilot subsystem).
    if (!manualInput) {
        const apTarget = autopilotState.targetBody;
        if (apTarget?.mesh && !apTarget._isDisposed) {
            const relVel = new THREE.Vector3().subVectors(ship.velocity, apTarget.velocity);
            flightState.currentSpeed = relVel.dot(forward);
        } else {
            flightState.currentSpeed = fwdSpeed;
        }
    }

    // ── Roll + steering with smoothing — delegated to the ship ────────────────
    // applyFrameOrientation() folds roll and steering into ship.controlFrameQuat
    // and writes mesh.quaternion (frame × bank). NPC ships call the same method,
    // so player and AI orientation handling cannot drift apart.
    if (manualInput && !flightState.altOrbitActive) {
        ship.applyFrameOrientation(dt);
        flightState.flightCameraQuat.copy(ship.controlFrameQuat);
    } else {
        flightState.flightCameraQuat.copy(ship.mesh.quaternion);
        ship.controlFrameQuat.copy(ship.mesh.quaternion);
        ship.shipBankRoll = 0;
        ship.shipBankPitch = 0;
        ship.steerX = 0;
        ship.steerY = 0;
    }

    // ── Steering line (uiScene screen-space) ─────────────────────────────────
    const noseNDC = ship.mesh.position.clone().addScaledVector(forward, 8).project(ctx.camera);
    const noseScreenX = noseNDC.x * (window.innerWidth * 0.5);
    const noseScreenY = noseNDC.y * (window.innerHeight * 0.5);

    const rawMag = Math.sqrt(flightState.pointerOffsetX ** 2 + flightState.pointerOffsetY ** 2);
    const circleScale = rawMag > h.flightMaxPointerOffset ? h.flightMaxPointerOffset / rawMag : 1;
    const displayOffX = flightState.pointerOffsetX * circleScale;
    const displayOffY = flightState.pointerOffsetY * circleScale;

    ctx.steeringLinePositions[0] = noseScreenX;
    ctx.steeringLinePositions[1] = noseScreenY;
    ctx.steeringLinePositions[2] = TEXT_SPRITE_Z;
    ctx.steeringLinePositions[3] = noseScreenX + displayOffX;
    ctx.steeringLinePositions[4] = noseScreenY - displayOffY;
    ctx.steeringLinePositions[5] = TEXT_SPRITE_Z;
    ctx.steeringLineGeo.attributes.position.needsUpdate = true;

    ctx.steeringOriginMarker.position.set(noseScreenX, noseScreenY, 0);
    ctx.steeringEndMarker.position.set(noseScreenX + displayOffX, noseScreenY - displayOffY, 0);
    ctx.steeringEndMarker.visible = true;

    // Hidden while the autopilot is flying (the player isn't steering), during ALT-orbit,
    // and while shedding speed in a warp/boost/stop-brake deceleration.
    if (
        autopilotState.isActive ||
        flightState.altOrbitActive ||
        flightState.altOrbitYaw !== 0 ||
        flightState.altOrbitPitch !== 0
    ) {
        ctx.flightSteeringLine.visible = false;
        ctx.steeringOriginMarker.visible = false;
        ctx.steeringEndMarker.visible = false;
    } else if (!ship.warpDecelerating && !ship.stopBraking) {
        ctx.flightSteeringLine.visible = true;
        ctx.steeringOriginMarker.visible = true;
    }

    // ── Weapon aim ───────────────────────────────────────────────────────────
    // The player aims with the reticle: cast a ray from the camera through the steering line's
    // end marker and hand the resulting world bearing to the ship's control input. Clamping the
    // pointer to flightMaxPointerOffset above is therefore also what limits how far off the nose
    // the player can shoot — the aim cone an AI pilot has to live inside too.
    //
    // Only refreshed while the trigger is held; applyWeaponInput() ignores aimDir otherwise.
    if (playerInput.fire) {
        const aimNdcX = (noseScreenX + displayOffX) / (window.innerWidth * 0.5);
        const aimNdcY = (noseScreenY - displayOffY) / (window.innerHeight * 0.5);
        const tanHalfFovY = Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov * 0.5));
        const tanHalfFovX = tanHalfFovY * ctx.camera.aspect;
        playerInput.aimDir
            .set(aimNdcX * tanHalfFovX, aimNdcY * tanHalfFovY, -1)
            .transformDirection(ctx.camera.matrixWorld);
    }

    // Shared with the AI firing path, so muzzle placement, rate of fire, heat and beam
    // termination stay identical between a player-flown ship and an AI-flown one.
    applyWeaponInput(ship, dt);

    // ── Warp sprite catch-all ──────────────────────────────────────────────
    // When the ship exits warp (e.g. autopilot transitions WARP → APPROACH)
    // without going through warpDecelerating, the warp sprite stays visible.
    // Hide it whenever no warp state is active.
    if (!ship.warpActive && !ship.warpDecelerating && !ship.warpCharging) {
        ctx.flightHUD.hideWarpSprite();
    }

    // prevShiftHeld for the next frame's boost-release detection is tracked by
    // ship.updateBoostDecelState(), called above.
}
