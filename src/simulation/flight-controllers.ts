import * as THREE from 'three';
import { NotificationType } from "../event-log/event-log";
import { FLIGHT_BANK_LERP_SPEED, FLIGHT_BOOST_ACCEL, FLIGHT_BOOST_DECEL, FLIGHT_BOOST_MAX_SPEED, FLIGHT_MAX_BANK_ANGLE, FLIGHT_MAX_BANK_PITCH, FLIGHT_MAX_POINTER_OFFSET, FLIGHT_MAX_SPEED, FLIGHT_MAX_TURN_RATE, FLIGHT_PERP_DECAY, FLIGHT_ROLL_ACCEL, FLIGHT_ROLL_FRICTION, FLIGHT_ROLL_SPEED, FLIGHT_STEER_DEADZONE, FLIGHT_STEER_SMOOTH_RATE, FLIGHT_THRUST_ACCEL, FLIGHT_THRUST_DECEL, FLIGHT_WARP_ACCEL, FLIGHT_WARP_CHARGE_TIME, FLIGHT_WARP_DECEL, FLIGHT_WARP_SPEED, TEXT_SPRITE_Z } from "../utilities/consts";
import { autopilotState, cameraState, flightState, interactionState, simulationState } from "./simulation";
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
        flightState.warpActive = false;
        flightState.warpEffect?.forceHide();
    }

    // Zero all steering state FIRST, before clearing isActive,
    // so that if any deferred event (pointer-lock release mousemove, etc.) sneaks
    // through, it won't find non-zero values to apply.
    flightState.pointerOffsetX = 0;
    flightState.pointerOffsetY = 0;
    flightState.rollLeft = false;
    flightState.rollRight = false;
    flightState.rollVelocity = 0;
    flightState.steerX = 0;
    flightState.steerY = 0;
    flightState.isFiring = false;
    flightState.altOrbitActive = false;
    flightState.altOrbitYaw = 0;
    flightState.altOrbitPitch = 0;
    ctx.shipWeapon.reset();

    // Clear deceleration and warp flags so on re-entry the ship isn't
    // artificially clamped back to FLIGHT_MAX_SPEED.
    flightState.boostDecelerating = false;
    flightState.warpDecelerating = false;
    flightState.warpCharging = false;
    flightState.warpCharge = 0;
    flightState.prevShiftHeld = false;

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
    flightState.warpCharge = 0;
    flightState.warpCharging = false;
    flightState.warpDecelerating = false;
    if (!flightState.warpActive) {
        // Not warping — clean up fully.
        flightState.warpEffect?.stop();
    }
    // If warpActive is true, the ship continues warping autonomously and the
    // background updater (in the animate loop) maintains its velocity and the
    // tunnel animation.  Do NOT zero warpActive or stop the effect here.
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
    //   Phase 1: shed speed from warp → FLIGHT_BOOST_MAX_SPEED using FLIGHT_WARP_DECEL.
    //   Phase 2 (no shift): hand off to boost decel so FLIGHT_BOOST_DECEL carries the
    //             ship the rest of the way down to FLIGHT_MAX_SPEED.
    //   Phase 2 (shift held): end warp decel at boost speed and let the normal boost
    //             logic maintain boost speed until Shift is released.
    if (flightState.warpDecelerating) {
        const fwdSpd = ship.velocity.dot(forward);
        const unclampedWarpSpd = fwdSpd - FLIGHT_WARP_DECEL * simDt;
        if (unclampedWarpSpd > FLIGHT_BOOST_MAX_SPEED) {
            // Phase 1: decel from warp speed to boost max using warp decel rate.
            ship.velocity.copy(forward).multiplyScalar(unclampedWarpSpd);
            flightState.currentSpeed = unclampedWarpSpd;
        } else {
            // Reached boost speed — end the warp decel phase.
            flightState.warpDecelerating = false;
            flightState.warpEffect?.stop();
            // Restore steering HUD now that warp deceleration is complete.
            ctx.flightSteeringLine.visible = true;
            ctx.steeringOriginMarker.visible = true;
            if (keys.shift) {
                // Case 2: shift held — sit at boost speed; normal boost logic takes over.
                flightState.currentSpeed = Math.min(fwdSpd, FLIGHT_BOOST_MAX_SPEED);
            } else {
                // Case 1: no shift — transition to boost decel toward normal max speed.
                flightState.boostDecelerating = true;
                flightState.currentSpeed = fwdSpd;
            }
        }
        flightState.thrustActive = false;
        ctx.flightHUD.hideWarpSprite();
        // Fall through to steering/roll below (no early return)
    }

    // ── Boost deceleration ───────────────────────────────────────────────────
    // When Shift is released above FLIGHT_MAX_SPEED, rapidly decelerate back down.
    if (flightState.boostDecelerating) {
        const fwdSpd = ship.velocity.dot(forward);
        const unclampedBoostSpd = fwdSpd - FLIGHT_BOOST_DECEL * simDt;
        if (unclampedBoostSpd > FLIGHT_MAX_SPEED) {
            // Still above max after this decel step — continue decelerating.
            ship.velocity.copy(forward).multiplyScalar(unclampedBoostSpd);
            flightState.currentSpeed = unclampedBoostSpd;
        } else {
            // This decel step reaches or overshoots FLIGHT_MAX_SPEED — exit.
            // Using the unclamped value (rather than a fixed tolerance) makes this
            // immune to strong gravity re-adding speed above the floor each frame,
            // which caused perpetual braking mode when gravity > tolerance.
            flightState.boostDecelerating = false;
            flightState.currentSpeed = Math.min(fwdSpd, FLIGHT_MAX_SPEED);
        }
        flightState.thrustActive = false;
        // Fall through to steering/roll below
    }

    // ── Warp active ──────────────────────────────────────────────────────────
    if (flightState.warpActive) {
        // Accelerate toward FLIGHT_WARP_SPEED rather than snapping instantly.
        const fwdSpd = ship.velocity.dot(forward);
        if (fwdSpd < FLIGHT_WARP_SPEED) {
            const delta = Math.min(FLIGHT_WARP_ACCEL * simDt, FLIGHT_WARP_SPEED - fwdSpd);
            ship.velocity.addScaledVector(forward, delta);
        } else {
            // Clamp to warp max just in case gravity accelerates beyond it.
            ship.velocity.copy(forward).multiplyScalar(FLIGHT_WARP_SPEED);
        }
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
    if (flightState.warpCharging && !flightState.warpDecelerating && !autopilotState.isWarpActive) {
        flightState.warpCharge = Math.min(flightState.warpCharge + dt, FLIGHT_WARP_CHARGE_TIME);
        const fill = flightState.warpCharge / FLIGHT_WARP_CHARGE_TIME;
        ctx.flightHUD.setWarpCharge(fill);
        if (fill >= 0.99 && !flightState.warpVoicePlayed) {
            flightState.warpVoicePlayed = true;
            playSoundEffect(SoundEffect.WarpDriveActive);
        }
        if (flightState.warpCharge >= FLIGHT_WARP_CHARGE_TIME) {
            // Engage warp!
            flightState.warpActive = true;
            flightState.warpCharging = false;
            flightState.warpCharge = 0;
            flightState.warpEffect?.start();
            triggerScreenFlash(200, 0.01, 2.5);

            ctx.addEvent({
                message: '⚡ Warp engaged! Press Space to disengage.',
                notificationType: NotificationType.Success,
            });
        }
        // Allow normal flight controls while charging (just can't turn on warp mid-turn)
    }

    // ── Thrust ─────────────────────────────────────────────────────────────────────────────
    // Manual controls (WASD / mouse steering) are completely ignored while autopilot is active.
    const manualInput = !autopilotState.isActive;
    const fwdSpeed = ship.velocity.dot(forward);
    // W only counts as active thrust once the ship has decelerated to normal max speed.
    // This prevents W from snapping the ship from boost speed (500) down to normal max (100)
    // in one frame when pressed mid-deceleration.
    const thrustActive = manualInput && (keys.shift || keys.w || keys.s);
    if (manualInput) flightState.thrustActive = thrustActive;

    // Trigger boost decel when Shift is *released* while still above normal max speed.
    // This must only fire on a Shift-release transition (prevShiftHeld was true, now false),
    // not when the ship is simply coasting and gravity accelerated past FLIGHT_MAX_SPEED.
    const shiftJustReleased = flightState.prevShiftHeld && !keys.shift;
    if (
        manualInput &&
        shiftJustReleased &&
        !flightState.boostDecelerating &&
        !flightState.warpActive &&
        !flightState.warpDecelerating
    ) {
        if (fwdSpeed > FLIGHT_MAX_SPEED) {
            flightState.boostDecelerating = true;
        }
    }
    // Re-engaging boost cancels the decel — but only when we're already at or below boost max
    // speed.  Above that threshold the ship is still shedding warp speed and boost should be
    // ignored so it doesn't snap the ship's speed down to FLIGHT_BOOST_MAX_SPEED.
    if (manualInput && keys.shift && fwdSpeed <= FLIGHT_BOOST_MAX_SPEED) {
        flightState.boostDecelerating = false;
    }

    // Skip normal thrust while boost- or warp-decelerating (velocity is managed above).
    // This prevents the thrust block fighting the decel and avoids the S-key else-branch
    // firing incorrectly when Shift is held at warp speeds above FLIGHT_BOOST_MAX_SPEED.
    if (flightState.boostDecelerating || flightState.warpDecelerating) {
        // steering/roll still processed below
    } else if (manualInput && !flightState.isAdvancedMode) {
        // ── Simple mode ──────────────────────────────────────────────────────────
        // While a thrust key is held: forward thrust is ADDED to velocity (like
        // advanced mode) so gravity accumulates freely and is never overwritten.
        // The key difference from advanced mode: perpendicular drift is always decayed
        // while a thrust key is held, giving direct arcade-style feel.
        // When no key is held the ship coasts freely and gravity accumulates.
        if (thrustActive) {
            // Use the real forward speed (includes gravity) for effectiveness checks.
            const shiftEffective = keys.shift && fwdSpeed < FLIGHT_BOOST_MAX_SPEED;
            const wEffective = keys.w && fwdSpeed < FLIGHT_MAX_SPEED;

            if (shiftEffective) {
                // Boost: add forward thrust toward boost max.
                const delta = Math.min(
                    FLIGHT_BOOST_ACCEL * simDt,
                    FLIGHT_BOOST_MAX_SPEED - fwdSpeed
                );
                ship.velocity.addScaledVector(forward, delta);
            } else if (wEffective && !keys.shift) {
                // Normal thrust: add forward thrust toward normal max.
                const delta = Math.min(FLIGHT_THRUST_ACCEL * simDt, FLIGHT_MAX_SPEED - fwdSpeed);
                ship.velocity.addScaledVector(forward, delta);
            } else if (keys.s) {
                // Decelerate.
                // ceiling is always -FLIGHT_MAX_SPEED so decel thrust is applied
                // continuously even when fwdSpeed is 0, preventing flicker when
                // gravity re-accelerates the ship past zero each frame.
                const ceiling = -FLIGHT_MAX_SPEED;
                const decelRate =
                    fwdSpeed > FLIGHT_MAX_SPEED ? FLIGHT_BOOST_DECEL : FLIGHT_THRUST_DECEL;
                const delta = Math.max(-decelRate * simDt, ceiling - fwdSpeed);
                ship.velocity.addScaledVector(forward, delta);
            }
            // else: shift held above boost max, or no effective thrust key → coast.
            // Gravity accumulates naturally since we never overwrite velocity.

            // Decay perpendicular drift when any thrust key is held (even if not effective),
            // giving the direct nose-points-where-you-go feel of simple mode.
            const newFwdSpd = ship.velocity.dot(forward);
            const perpVel = ship.velocity.clone().addScaledVector(forward, -newFwdSpd);
            const decay = Math.max(0, 1 - FLIGHT_PERP_DECAY * simDt);
            perpVel.multiplyScalar(decay);
            ship.velocity.copy(forward).multiplyScalar(newFwdSpd).add(perpVel);

            // Sync display value from real velocity.
            flightState.currentSpeed = ship.velocity.dot(forward);
        } else {
            // Coasting: sync display value from real forward velocity.
            flightState.currentSpeed = fwdSpeed;
        }
    } else if (manualInput) {
        // ── Advanced mode ────────────────────────────────────────────────────────
        // Thrust adds to velocity without removing gravity-accumulated perpendicular
        // components, so orbital mechanics work at all times.
        if (keys.shift) {
            if (fwdSpeed < FLIGHT_BOOST_MAX_SPEED) {
                const delta = Math.min(
                    FLIGHT_BOOST_ACCEL * simDt,
                    FLIGHT_BOOST_MAX_SPEED - fwdSpeed
                );
                ship.velocity.addScaledVector(forward, delta);
            }
        } else if (keys.w) {
            if (fwdSpeed < FLIGHT_MAX_SPEED) {
                const delta = Math.min(FLIGHT_THRUST_ACCEL * simDt, FLIGHT_MAX_SPEED - fwdSpeed);
                ship.velocity.addScaledVector(forward, delta);
            }
        } else if (keys.s) {
            if (fwdSpeed > -FLIGHT_MAX_SPEED) {
                const delta = Math.max(-FLIGHT_THRUST_DECEL * simDt, -FLIGHT_MAX_SPEED - fwdSpeed);
                ship.velocity.addScaledVector(forward, delta);
            }
        }
        // No thrust: ship coasts freely
        flightState.currentSpeed = ship.velocity.dot(forward);
    } else if (!manualInput) {
        // Autopilot: show speed relative to the target body so the HUD reflects what the
        // autopilot is actually controlling.  Absolute forward speed includes the target's
        // orbital velocity, which inflates the reading by however much of that velocity
        // projects onto the approach direction (e.g. ~0.3 u/s for Earth at FLIGHT_MAX_SPEED).
        // ship.velocity already includes gravity, so gravity-driven speed is still shown.
        const apTarget = autopilotState.targetBody;
        if (apTarget?.mesh && !apTarget._isDisposed) {
            const relVel = new THREE.Vector3().subVectors(ship.velocity, apTarget.velocity);
            flightState.currentSpeed = relVel.dot(forward);
        } else {
            flightState.currentSpeed = fwdSpeed;
        }
    }

    // ── Roll with inertia (A/D) ───────────────────────────────────────────────
    // Accelerate rollVelocity toward ±FLIGHT_ROLL_SPEED when key held,
    // then apply friction to bring it back to 0 when released.
    const rollTarget = flightState.rollLeft
        ? -FLIGHT_ROLL_SPEED
        : flightState.rollRight
          ? FLIGHT_ROLL_SPEED
          : 0;
    if (
        manualInput &&
        !flightState.altOrbitActive &&
        (flightState.rollLeft || flightState.rollRight)
    ) {
        // Ramp up toward target
        const dir = rollTarget > 0 ? 1 : -1;
        flightState.rollVelocity += dir * FLIGHT_ROLL_ACCEL * dt;
        flightState.rollVelocity = THREE.MathUtils.clamp(
            flightState.rollVelocity,
            -FLIGHT_ROLL_SPEED,
            FLIGHT_ROLL_SPEED
        );
    } else {
        // No key — apply friction toward zero
        if (Math.abs(flightState.rollVelocity) < FLIGHT_ROLL_FRICTION * dt) {
            flightState.rollVelocity = 0;
        } else {
            flightState.rollVelocity -=
                Math.sign(flightState.rollVelocity) * FLIGHT_ROLL_FRICTION * dt;
        }
    }
    if (flightState.rollVelocity !== 0) {
        // Rotate the camera frame around its local forward (Z) axis so the
        // camera rolls with the ship when A/D is held.
        const dqRoll = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            flightState.rollVelocity * dt
        );
        flightState.flightCameraQuat.multiply(dqRoll);
    }

    // ── Steering with smoothing + dead zone (mouse) ───────────────────────────
    // Raw normalised pointer input
    const rawXFull = THREE.MathUtils.clamp(
        flightState.pointerOffsetX / FLIGHT_MAX_POINTER_OFFSET,
        -1,
        1
    );
    const rawYFull = THREE.MathUtils.clamp(
        flightState.pointerOffsetY / FLIGHT_MAX_POINTER_OFFSET,
        -1,
        1
    );
    // Apply dead zone: values within ±DEADZONE snap to 0, outside rescale to 0-1
    function applyDeadzone(v: number) {
        const d = FLIGHT_STEER_DEADZONE;
        if (Math.abs(v) < d) return 0;
        return (Math.sign(v) * (Math.abs(v) - d)) / (1 - d);
    }
    const rawX = applyDeadzone(rawXFull);
    const rawY = applyDeadzone(rawYFull);
    // Exponential smoothing — frame-rate independent; same feel at any fps.
    // steerAlpha and bankAlpha derived from per-second rates: alpha = 1 - exp(-rate * dt)
    if (manualInput && !flightState.altOrbitActive) {
        const steerAlpha = 1 - Math.exp(-FLIGHT_STEER_SMOOTH_RATE * dt);
        flightState.steerX += (rawX - flightState.steerX) * steerAlpha;
        flightState.steerY += (rawY - flightState.steerY) * steerAlpha;

        // Yaw: rotate around camera's own local Y axis so left/right steering always
        // matches the screen regardless of orientation (including upside-down flight).
        // Using multiply (local space) rather than premultiply (world space) ensures
        // the yaw direction flips with the camera when rolled, keeping it screen-consistent.
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            -flightState.steerX * FLIGHT_MAX_TURN_RATE * dt
        );
        flightState.flightCameraQuat.multiply(yawQuat);

        // Pitch: rotate around camera's own right (X) axis so up/down always matches screen.
        const pitchQuat = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            flightState.steerY * FLIGHT_MAX_TURN_RATE * dt
        );
        flightState.flightCameraQuat.multiply(pitchQuat);

        // Animate visual banking of ship mesh relative to camera frame.
        const bankAlpha = 1 - Math.exp(-FLIGHT_BANK_LERP_SPEED * dt);
        flightState.shipBankRoll +=
            (flightState.steerX * FLIGHT_MAX_BANK_ANGLE - flightState.shipBankRoll) * bankAlpha;
        flightState.shipBankPitch +=
            (flightState.steerY * FLIGHT_MAX_BANK_PITCH - flightState.shipBankPitch) * bankAlpha;

        // Apply banking offset to ship mesh: camera frame * cosmetic bank/pitch rotation.
        const bankQuat = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(flightState.shipBankPitch, 0, flightState.shipBankRoll, 'XYZ')
        );
        ship.mesh.quaternion.copy(flightState.flightCameraQuat).multiply(bankQuat);
        flightState.flightCameraQuat.normalize();
    } else {
        // Autopilot is flying — sync camera frame to the ship's actual orientation
        // so there is no lurch when the player retakes manual control.
        flightState.flightCameraQuat.copy(ship.mesh.quaternion);
        flightState.shipBankRoll = 0;
        flightState.shipBankPitch = 0;
        flightState.steerX = 0;
        flightState.steerY = 0;
    }

    // (currentSpeed is updated in the thrust block above; velocity is
    //  modified in-place there — no override needed here)

    // ── Steering line (uiScene screen-space) ─────────────────────────────────
    // Project a point far ahead in the ship's forward direction onto the screen.
    // This gives the screen-space position of where the ship is AIMING, which sits
    // above screen-centre in 3rd-person view because the camera is elevated behind
    // the ship and looks at its body-centre, not its nose.
    const noseNDC = ship.mesh.position.clone().addScaledVector(forward, 8).project(ctx.camera);
    const noseScreenX = noseNDC.x * (window.innerWidth * 0.5);
    const noseScreenY = noseNDC.y * (window.innerHeight * 0.5);

    // Circularly clamp the pointer offset for display so the indicator line
    // has equal maximum length in all directions (not square-capped).
    const rawMag = Math.sqrt(flightState.pointerOffsetX ** 2 + flightState.pointerOffsetY ** 2);
    const circleScale = rawMag > FLIGHT_MAX_POINTER_OFFSET ? FLIGHT_MAX_POINTER_OFFSET / rawMag : 1;
    const displayOffX = flightState.pointerOffsetX * circleScale;
    const displayOffY = flightState.pointerOffsetY * circleScale;

    ctx.steeringLinePositions[0] = noseScreenX;
    ctx.steeringLinePositions[1] = noseScreenY;
    ctx.steeringLinePositions[2] = TEXT_SPRITE_Z;
    ctx.steeringLinePositions[3] = noseScreenX + displayOffX;
    ctx.steeringLinePositions[4] = noseScreenY - displayOffY;
    ctx.steeringLinePositions[5] = TEXT_SPRITE_Z;
    ctx.steeringLineGeo.attributes.position.needsUpdate = true;

    // Move origin ring and aim reticle to their screen positions.
    ctx.steeringOriginMarker.position.set(noseScreenX, noseScreenY, 0);
    ctx.steeringEndMarker.position.set(noseScreenX + displayOffX, noseScreenY - displayOffY, 0);
    ctx.steeringEndMarker.visible = true;

    // Hide the steering HUD while ALT orbit mode is active (or camera is returning).
    // Restore it once the orbit angles have fully zeroed out (and warp is not decelerating).
    if (
        flightState.altOrbitActive ||
        flightState.altOrbitYaw !== 0 ||
        flightState.altOrbitPitch !== 0
    ) {
        ctx.flightSteeringLine.visible = false;
        ctx.steeringOriginMarker.visible = false;
        ctx.steeringEndMarker.visible = false;
    } else if (!flightState.warpDecelerating) {
        ctx.flightSteeringLine.visible = true;
        ctx.steeringOriginMarker.visible = true;
        // ctx.steeringEndMarker is already set visible above
    }

    // ── Weapon firing ────────────────────────────────────────────────────────
    if (flightState.isFiring && !autopilotState.isActive) {
        // Build world-space aim direction from the aim reticle screen position.
        // Avoid unproject() — with near=0.00001 and far~8.2e9, any mid-NDC z value
        // maps to a point essentially at the camera, causing floating-point errors.
        // Instead, derive the ray directly from perspective FOV math:
        //   view-space dir = (ndcX * tan(hFOV/2), ndcY * tan(vFOV/2), -1), normalised
        // then rotate to world space via the camera world matrix.
        const aimNdcX = (noseScreenX + displayOffX) / (window.innerWidth * 0.5);
        const aimNdcY = (noseScreenY - displayOffY) / (window.innerHeight * 0.5);
        const halfFovY = THREE.MathUtils.degToRad(ctx.camera.fov * 0.5);
        const tanHalfFovY = Math.tan(halfFovY);
        const tanHalfFovX = tanHalfFovY * ctx.camera.aspect;
        const viewSpaceDir = new THREE.Vector3(
            aimNdcX * tanHalfFovX,
            aimNdcY * tanHalfFovY,
            -1 // camera local -Z is forward in OpenGL/Three.js convention
        ).normalize();
        const aimDir = viewSpaceDir.transformDirection(ctx.camera.matrixWorld);

        // Muzzle: slightly ahead of the ship so projectiles clear the hull.
        const muzzlePos = ship.mesh.position.clone().addScaledVector(forward, ship.radius * 4);
        ctx.shipWeapon.tryFire(dt, muzzlePos, aimDir, ship.velocity);
    }

    // ── Track prevShiftHeld for next frame's Shift-release detection ──────
    flightState.prevShiftHeld = keys.shift;
}
