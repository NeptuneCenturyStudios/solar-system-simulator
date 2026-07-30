import * as THREE from 'three';
import { NotificationType } from '../event-log/event-log';
import {
    FLIGHT_BOOST_MAX_SPEED,
    FLIGHT_MAX_SPEED,
    TEXT_SPRITE_Z,
} from '../utilities/consts';
import {
    autopilotState,
    cameraState,
    flightState,
    interactionState,
    simulationState,
} from './simulation';
import { triggerScreenFlash } from '../effects/screen-flash';
import { IFlightControlContext } from '../interfaces';
import { playSoundEffect, SoundEffect } from '../utilities/audio';

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
    ctx.shipWeapon.reset();

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
    ctx.uiManager.flightControlsPanel.setFlightActive(false);
    // Keep autopilot button enabled as long as the known ship still exists
    const _exitShip = flightState.knownShip;
    const _exitShipAlive = !!(
        _exitShip &&
        !_exitShip._isDisposed &&
        simulationState.bodies.includes(_exitShip)
    );
    ctx.uiManager.flightControlsPanel.setAutopilotState(autopilotState.isActive, _exitShipAlive);
    ctx.refreshBodiesTable();
    // updateFlightSpawnBtnLabel is defined after this function; call via a timeout
    // to avoid forward-reference issues in the module execution order.
    setTimeout(() => {
        try {
            ctx.uiManager.flightControlsPanel.updateFlightSpawnBtnLabel(
                flightState.knownShip,
                simulationState.bodies
            );
        } catch {
            // Empty
        }
    }, 0);

    ctx.addEvent({
        message: 'Flight mode exited.',
        notificationType: NotificationType.Info,
    });
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
        return;
    }

    const keys = cameraState.keys;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(flightState.flightCameraQuat);

    // ── Warp deceleration ────────────────────────────────────────────────────
    // After warp ends, decelerate in two phases:
    //   Phase 1: shed speed from warp → FLIGHT_BOOST_MAX_SPEED using warp decel.
    //   Phase 2 (no shift): hand off to boost decel until normal max speed.
    //   Phase 2 (shift held): end warp decel at boost speed.
    if (ship.warpDecelerating) {
        const stillDecel = ship.applyWarpDecelerationStep(simDt, forward);
        flightState.currentSpeed = ship.velocity.dot(forward);
        if (!stillDecel) {
            // Reached boost speed — end the warp decel phase.
            ship.warpDecelerating = false;
            // Restore steering HUD now that warp deceleration is complete.
            ctx.flightSteeringLine.visible = true;
            ctx.steeringOriginMarker.visible = true;
            if (keys.shift) {
                // Case 2: shift held — sit at boost speed; normal boost logic takes over.
                flightState.currentSpeed = Math.min(flightState.currentSpeed, FLIGHT_BOOST_MAX_SPEED);
            } else {
                // Case 1: no shift — transition to boost decel toward normal max speed.
                ship.boostDecelerating = true;
            }
        }
        flightState.thrustActive = false;
        ctx.flightHUD.hideWarpSprite();
        // Fall through to steering/roll below (no early return)
    }

    // ── Boost deceleration ───────────────────────────────────────────────────
    // When Shift is released above FLIGHT_MAX_SPEED, rapidly decelerate back down.
    if (ship.boostDecelerating) {
        const stillDecel = ship.applyBoostDecelerationStep(simDt, forward);
        flightState.currentSpeed = ship.velocity.dot(forward);
        if (!stillDecel) {
            ship.boostDecelerating = false;
            // Clamp to max speed (currentSpeed already clamped by the ship method)
        }
        flightState.thrustActive = false;
        // Fall through to steering/roll below
    }

    // ── Warp active ──────────────────────────────────────────────────────────
    if (ship.warpActive) {
        ship.applyWarpAccelerationStep(simDt, forward);
        flightState.currentSpeed = ship.velocity.dot(forward);
        flightState.thrustActive = true;
        // (warpEffect.update is called centrally in the animate loop each frame)
        // Hide steering HUD during warp (no manual steering available).
        ctx.flightSteeringLine.visible = false;
        ctx.flightCrosshair.visible = false;
        ctx.steeringEndMarker.visible = false;
        ctx.steeringOriginMarker.visible = false;
        // Pulsing warp-active text (update every call is cheap since canvas is small)
        const pulse = (Math.sin(Date.now() * 0.005) + 1) * 0.5;
        ctx.flightHUD.setWarpActive(pulse);
        return; // Skip all flight controls below
    }

    // ── Warp charging ────────────────────────────────────────────────────────
    // Only process manual warp charging when autopilot is not active — autopilot
    // has its own WARP_CHARGING phase that advances the same ship.warpChargeTimer.
    if (ship.warpCharging && !ship.warpDecelerating && !ship.warpActive && !autopilotState.isActive) {
        const fill = ship.updateWarpCharge(dt);
        ctx.flightHUD.setWarpCharge(fill);
        if (fill >= 0.99 && !ship.warpVoicePlayed) {
            ship.warpVoicePlayed = true;
            playSoundEffect(SoundEffect.WarpDriveActive);
        }
        if (fill >= 1) {
            // Engage warp!
            ship.engageWarp();
            triggerScreenFlash(200, 0.01, 2.5);

            ctx.addEvent({
                message: '⚡ Warp engaged! Press Space to disengage.',
                notificationType: NotificationType.Success,
            });
        }
        // Allow normal flight controls while charging (just can't turn on warp mid-turn)
    }

    // ── Thrust state transitions (velocity mutation is in applyFlightThrustSubstep) ──
    const manualInput = !autopilotState.isActive;
    const fwdSpeed = ship.velocity.dot(forward);

    // Sync thrustActive flag for trail / HUD (key state, not physics).
    const thrustActive = manualInput && (keys.shift || keys.w || keys.s);
    if (manualInput) flightState.thrustActive = thrustActive;

    // Trigger boost decel when Shift is *released* while still above normal max speed.
    const shiftJustReleased = ship.prevShiftHeld && !keys.shift;
    if (
        manualInput &&
        shiftJustReleased &&
        !ship.boostDecelerating &&
        !ship.warpActive &&
        !ship.warpDecelerating
    ) {
        if (fwdSpeed > FLIGHT_MAX_SPEED) {
            ship.boostDecelerating = true;
        }
    }
    // Re-engaging boost cancels the decel — but only when we're already at or below boost max speed.
    if (manualInput && keys.shift && fwdSpeed <= FLIGHT_BOOST_MAX_SPEED) {
        ship.boostDecelerating = false;
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

    // ── Roll with inertia (A/D) — delegated to ship ──────────────────────────
    if (
        manualInput &&
        !flightState.altOrbitActive
    ) {
        const rollDelta = ship.applyRoll(dt, flightState.rollLeft, flightState.rollRight);
        // Apply the roll delta (from key input OR friction decay) to the camera quaternion.
        if (rollDelta !== 0) {
            const dqRoll = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 0, 1),
                rollDelta
            );
            flightState.flightCameraQuat.multiply(dqRoll);
        }
    }

    // ── Steering with smoothing + dead zone (mouse) ───────────────────────────
    const h = ship.handling;
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

    if (manualInput && !flightState.altOrbitActive) {
        const { yawDelta, pitchDelta, bankQuat } = ship.applySteering(dt, rawX, rawY);

        if (yawDelta !== 0) {
            const yawQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                yawDelta
            );
            flightState.flightCameraQuat.multiply(yawQuat);
        }
        if (pitchDelta !== 0) {
            const pitchQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0),
                pitchDelta
            );
            flightState.flightCameraQuat.multiply(pitchQuat);
        }

        ship.mesh.quaternion.copy(flightState.flightCameraQuat).multiply(bankQuat);
        flightState.flightCameraQuat.normalize();
    } else {
        flightState.flightCameraQuat.copy(ship.mesh.quaternion);
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

    if (
        flightState.altOrbitActive ||
        flightState.altOrbitYaw !== 0 ||
        flightState.altOrbitPitch !== 0
    ) {
        ctx.flightSteeringLine.visible = false;
        ctx.steeringOriginMarker.visible = false;
        ctx.steeringEndMarker.visible = false;
    } else if (!ship.warpDecelerating) {
        ctx.flightSteeringLine.visible = true;
        ctx.steeringOriginMarker.visible = true;
    }

    // ── Weapon firing ────────────────────────────────────────────────────────
    if (flightState.isFiring && !autopilotState.isActive) {
        const aimNdcX = (noseScreenX + displayOffX) / (window.innerWidth * 0.5);
        const aimNdcY = (noseScreenY - displayOffY) / (window.innerHeight * 0.5);
        const halfFovY = THREE.MathUtils.degToRad(ctx.camera.fov * 0.5);
        const tanHalfFovY = Math.tan(halfFovY);
        const tanHalfFovX = tanHalfFovY * ctx.camera.aspect;
        const viewSpaceDir = new THREE.Vector3(
            aimNdcX * tanHalfFovX,
            aimNdcY * tanHalfFovY,
            -1
        ).normalize();
        const aimDir = viewSpaceDir.transformDirection(ctx.camera.matrixWorld);
        const muzzlePos = ship.mesh.position.clone().addScaledVector(forward, ship.radius * 4);
        ctx.shipWeapon.tryFire(dt, muzzlePos, aimDir, ship.velocity);
    }

    // ── Track prevShiftHeld for next frame's Shift-release detection ──────
    ship.prevShiftHeld = keys.shift;
}
