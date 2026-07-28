import * as THREE from 'three';
import { LogMethods, NotificationType } from '../event-log/event-log';
import {
    FLIGHT_BOOST_ACCEL,
    FLIGHT_BOOST_MAX_SPEED,
    FLIGHT_MAX_SPEED,
    FLIGHT_MAX_TURN_RATE,
    FLIGHT_WARP_CHARGE_TIME,
    FLIGHT_WARP_SPEED,
    G,
    SCALE_FACTOR,
    AUTOPILOT_ACCEL,
    AUTOPILOT_APPROACH_MIN_DISTANCE,
    AUTOPILOT_APPROACH_SPEED,
    AUTOPILOT_BLOCKED_NOTIFY_DURATION,
    AUTOPILOT_BOOST_DECEL,
    AUTOPILOT_BRAKE_ARC_DIST,
    AUTOPILOT_BRAKE_DONE_SPEED,
    AUTOPILOT_BRAKE_PAD,
    AUTOPILOT_CIRCULARIZE_GRAVITY_MARGIN,
    AUTOPILOT_CIRCULARIZE_RATE,
    AUTOPILOT_DECEL,
    AUTOPILOT_ORBIT_ALTITUDE_FACTOR,
    AUTOPILOT_ORBIT_NOTIFY_DURATION,
    AUTOPILOT_WARP_ACCEL,
    AUTOPILOT_WARP_DECEL,
    AUTOPILOT_WARP_THRESHOLD,
} from '../utilities/consts';
import { triggerScreenFlash } from '../effects/screen-flash';
import { playSoundEffect, SoundEffect } from '../utilities/audio';
import { IAutopilotContext } from '../interfaces';
import { Body } from '../bodies/body';
import { autopilotState, flightState, simulationState } from './simulation';

// ── Private helper ────────────────────────────────────────────────────────────

/**
 * Build a quaternion that orients the ship with its +Y (top) toward the target body
 * and its +Z (forward) in the given direction.  This provides a "tidal lock" look
 * where the ship's belly/side faces the planet instead of pointing its nose at it.
 */
function computeTopTowardBodyQuat(
    shipPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    fwdDir: THREE.Vector3
): THREE.Quaternion {
    const radial = new THREE.Vector3().subVectors(targetPos, shipPos);
    if (radial.lengthSq() < 1e-10) return new THREE.Quaternion();
    radial.normalize();

    const fwdLen = fwdDir.length();
    if (fwdLen < 1e-10) return new THREE.Quaternion();
    const fwdNorm = fwdDir.clone().normalize();

    // Use Matrix4.lookAt to build the orientation:
    //   eye    = shipPos + fwdNorm
    //   target = shipPos
    //   up     = radial (toward the body centre)
    const m = new THREE.Matrix4().lookAt(shipPos.clone().add(fwdNorm), shipPos, radial);

    return new THREE.Quaternion().setFromRotationMatrix(m);
}

// ── Exported functions ────────────────────────────────────────────────────────

/** Reflect autopilot state back to buttons after any state change. */
export function updateAutopilotUI(ctx: IAutopilotContext): void {
    const ship = flightState.knownShip;
    const shipExists = !!(ship && !ship._isDisposed && simulationState.bodies.includes(ship));
    ctx.setAutopilotState(
        autopilotState.isActive,
        (shipExists && !!autopilotState.targetBody) || autopilotState.isActive
    );
    ctx.refreshBodiesTable();
}

/** Cancel the autopilot with an optional log message. */
export function cancelAutopilot(ctx: IAutopilotContext, message?: string): void {
    if (!autopilotState.isActive) return;

    playSoundEffect(SoundEffect.AutopilotDisengaged);

    if (autopilotState.isWarpActive) {
        autopilotState.isWarpActive = false;
        flightState.warpEffect?.stop();
        // If the player cancelled mid-warp while not in the cockpit, trigger
        // background deceleration so the ship slows down normally instead of
        // continuing at warp speed indefinitely.
        if (!flightState.isActive) {
            flightState.warpDecelerating = true;
        }
    }
    // Hide the charge bar if it was showing.
    if (autopilotState.phase === 'WARP_CHARGING') {
        ctx.flightHUD.hideWarpSprite();
        autopilotState.warpChargeTimer = 0;
    }
    autopilotState.isActive = false;
    autopilotState.isBoostActive = false;
    autopilotState.phase = null;
    autopilotState.targetBody = null;
    flightState.thrustActive = false;
    if (message) {
        ctx.addEvent({ message, notificationType: NotificationType.Info });
    }
    // Defer DOM update — this may be called from inside the physics substep loop.
    setTimeout(() => updateAutopilotUI(ctx), 0);
}

/** Engage the autopilot toward a specific target body. */
export function engageAutopilot(ctx: IAutopilotContext, target: Body): void {
    if (!target || target._isDisposed) return;

    const ship = flightState.knownShip;
    if (!ship || ship._isDisposed || !simulationState.bodies.includes(ship)) {
        ctx.addEvent({
            message: 'Autopilot: no ship found. Spawn a spaceship first.',
            notificationType: NotificationType.Warning,
            logMethod: LogMethods.Alert | LogMethods.Console,
        });
        return;
    }

    // If already engaged on the same target, cancel (toggle)
    if (autopilotState.isActive && autopilotState.targetBody === target) {
        cancelAutopilot(ctx, 'Autopilot disengaged.');
        return;
    }

    // Guard: refuse to engage while manual warp is live.
    if (
        autopilotState.isWarpActive ||
        flightState.warpActive ||
        flightState.warpDecelerating ||
        flightState.warpCharging
    ) {
        ctx.addEvent({
            message: 'Autopilot: disengage warp before engaging autopilot.',
            notificationType: NotificationType.Warning,
            logMethod: LogMethods.Alert | LogMethods.Console,
        });
        return;
    }

    // Clean up any prior autopilot warp when switching targets.
    if (autopilotState.isWarpActive) {
        autopilotState.isWarpActive = false;
        flightState.warpEffect?.stop();
    }

    // Choose initial phase based on distance.
    const dist0 =
        ship.mesh && target.mesh ? ship.mesh.position.distanceTo(target.mesh.position) : Infinity;
    const orbitRadius0 = (target.radius ?? 10) * AUTOPILOT_ORBIT_ALTITUDE_FACTOR;
    // Dynamic warp threshold: the static AUTOPILOT_WARP_THRESHOLD is the stopping
    // distance from full warp speed to zero, but it doesn't account for the target
    // body's orbit radius.  For large bodies (e.g. radius ~80k), the braking runway
    // shrinks below zero, causing the autopilot to enter BRAKE already inside the
    // body's surface.  Adding orbitRadius ensures the ship stops *at* the orbit
    // radius, not at the target centre.
    const dynamicWarpThreshold0 = AUTOPILOT_WARP_THRESHOLD + orbitRadius0;
    const startWithWarp = dist0 > dynamicWarpThreshold0;

    // ── Autopilot obstruction gate (compute once at engagement) ─────────────
    // If something lies between the ship and the destination, block autopilot.
    const ship0 = flightState.knownShip;
    if (!ship0 || ship0._isDisposed || !ship0.mesh || !target.mesh) return;

    const shipPos0 = ship0.mesh.position;
    const targetPos0 = target.mesh.position;
    const segVec0 = new THREE.Vector3().subVectors(targetPos0, shipPos0);
    const segLen0 = segVec0.length();

    if (segLen0 > 1e-6) {
        const segDir0 = segVec0.clone().divideScalar(segLen0);

        let nearestT01 = Infinity;
        let nearestObstruction: Body | null = null;

        const shipRadius0 =
            typeof ship0.radius === 'number' && isFinite(ship0.radius) ? ship0.radius : 0;
        const padding0 = 0.5 * SCALE_FACTOR;

        for (const other of simulationState.bodies) {
            if (!other || other._isDisposed) continue;
            if (other === ship0 || other === target) continue;
            if (!other.mesh) continue;

            const r = typeof other.radius === 'number' && isFinite(other.radius) ? other.radius : 0;

            // Closest point on segment [0..1] to other.center
            const toOther = new THREE.Vector3().subVectors(other.mesh.position, shipPos0);
            const tUnclamped = toOther.dot(segDir0) / segLen0; // roughly 0..1
            const t = Math.max(0, Math.min(1, tUnclamped));

            const closest = shipPos0.clone().add(segDir0.clone().multiplyScalar(t * segLen0));
            const d = new THREE.Vector3().subVectors(other.mesh.position, closest);

            const hitRadius = r + shipRadius0 + padding0;
            if (d.lengthSq() <= hitRadius * hitRadius) {
                if (t < nearestT01) {
                    nearestT01 = t;
                    nearestObstruction = other;
                }
            }
        }

        if (nearestObstruction) {
            ctx.flightHUD.autopilotBlockedNotifyTimer = AUTOPILOT_BLOCKED_NOTIFY_DURATION;
            ctx.flightHUD.autopilotBlockedByName = nearestObstruction.name || 'obstruction';

            ctx.addEvent({
                message: `⚠ Autopilot blocked: ${nearestObstruction.name || 'obstruction'} is in the path to ${
                    target.name || 'target'
                }.`,
                notificationType: NotificationType.Warning,
                logMethod: LogMethods.Alert | LogMethods.Console,
            });
            return;
        }
    }
    // Skip APPROACH when the available braking room is shorter than the stopping distance
    // from full normal speed — e.g. Moon → Earth (110 u) where APPROACH would need ~1,200 u.
    const startInBrake = !startWithWarp && dist0 <= orbitRadius0 + AUTOPILOT_APPROACH_MIN_DISTANCE;

    autopilotState.isActive = true;
    autopilotState.targetBody = target;
    autopilotState.isWarpActive = false;
    autopilotState.warpChargeTimer = 0;
    playSoundEffect(SoundEffect.AutopilotEngaged);
    // Always start with ALIGN — rotate toward the target before applying any thrust.
    // The ALIGN phase will transition to WARP_CHARGING, APPROACH, or BRAKE once the
    // ship is facing the target, using the same distance thresholds.
    autopilotState.phase = 'ALIGN';
    // Pre‑compute the brake‑entry distance in case ALIGN hands off to BRAKE.
    autopilotState.brakeEntryDistance = dist0;
    flightState.thrustActive = false;

    if (startWithWarp) {
        ctx.addEvent({
            message: `Autopilot engaged: aligning to ${target.name || 'target'}.`,
            notificationType: NotificationType.Info,
        });
    } else if (startInBrake) {
        ctx.addEvent({
            message: `Autopilot engaged: direct approach to ${target.name || 'target'}.`,
            notificationType: NotificationType.Info,
        });
    } else {
        ctx.addEvent({
            message: `Autopilot engaged: flying to ${target.name || 'target'}.`,
            notificationType: NotificationType.Info,
        });
    }
    updateAutopilotUI(ctx);
}

/**
 * Autopilot: steers the ship through phases to reach a target body and enter a circular orbit.
 * Phase 1 — ALIGN:         Rotate toward the target.
 * Phase 2 — WARP_CHARGING: Charge warp drive.
 * Phase 3 — WARP:          Accelerate toward target at warp speed.
 * Phase 4 — APPROACH:      Drive toward target at boost/normal speed.
 * Phase 5 — BRAKE:         Trajectory-blend orbital insertion.
 * Phase 6 — CIRCULARIZE:   Lock into circular orbit.
 * Phase 7 — TIDAL_LOCK:    Coast in orbit with +Y toward body.
 *
 * This runs per physics substep regardless of whether flight mode is active.
 */
export function updateAutopilot(ctx: IAutopilotContext, dt: number): void {
    if (!autopilotState.isActive) return;

    // ── Safety guards ────────────────────────────────────────────────────────
    const ship = flightState.knownShip;
    const target = autopilotState.targetBody;

    const shipAlive =
        ship && !ship._isDisposed && ship.mesh && simulationState.bodies.includes(ship);
    const targetAlive =
        target && !target._isDisposed && target.mesh && simulationState.bodies.includes(target);

    if (!shipAlive || !targetAlive) {
        cancelAutopilot(ctx, 'Autopilot disengaged: target or ship no longer exists.');
        return;
    }

    // ── Derived values ───────────────────────────────────────────────────────
    const shipPos = ship.mesh.position; // live reference — no clone needed for reading
    const targetPos = target.mesh.position;

    const toTarget = new THREE.Vector3().subVectors(targetPos, shipPos);
    const distance = toTarget.length();

    const orbitRadius = (target.radius ?? 10) * AUTOPILOT_ORBIT_ALTITUDE_FACTOR;
    const relVel = new THREE.Vector3().subVectors(ship.velocity, target.velocity);
    const approachSpeed = relVel.length();

    // ── Phase transitions ────────────────────────────────────────────────────
    const toTargetDir = toTarget.clone().normalize();

    // Three-phase stopping distance: shed warp→boost at AUTOPILOT_WARP_DECEL, then
    // boost→normal at AUTOPILOT_BOOST_DECEL, then normal→stop at AUTOPILOT_DECEL.
    const effectiveStopDist =
        approachSpeed > FLIGHT_BOOST_MAX_SPEED
            ? (approachSpeed * approachSpeed - FLIGHT_BOOST_MAX_SPEED * FLIGHT_BOOST_MAX_SPEED) /
                  (2 * AUTOPILOT_WARP_DECEL) +
              (FLIGHT_BOOST_MAX_SPEED * FLIGHT_BOOST_MAX_SPEED -
                  AUTOPILOT_APPROACH_SPEED * AUTOPILOT_APPROACH_SPEED) /
                  (2 * AUTOPILOT_BOOST_DECEL) +
              (AUTOPILOT_APPROACH_SPEED * AUTOPILOT_APPROACH_SPEED) / (2 * AUTOPILOT_DECEL)
            : approachSpeed > AUTOPILOT_APPROACH_SPEED
              ? (approachSpeed * approachSpeed -
                    AUTOPILOT_APPROACH_SPEED * AUTOPILOT_APPROACH_SPEED) /
                    (2 * AUTOPILOT_BOOST_DECEL) +
                (AUTOPILOT_APPROACH_SPEED * AUTOPILOT_APPROACH_SPEED) / (2 * AUTOPILOT_DECEL)
              : Math.max(approachSpeed, AUTOPILOT_APPROACH_SPEED) ** 2 / (2 * AUTOPILOT_DECEL);
    const brakeDistance = effectiveStopDist * AUTOPILOT_BRAKE_PAD;

    // Dynamic warp threshold: adds orbitRadius so the ship stops at the
    // desired orbit altitude, not at the target centre.  Without this,
    // large bodies (radius ~80k) leave no room for the BRAKE smoothstep.
    const dynamicWarpThreshold = AUTOPILOT_WARP_THRESHOLD + orbitRadius;

    if (autopilotState.phase === 'WARP') {
        // Transition to APPROACH once close enough for boost/normal to finish the journey.
        if (distance <= dynamicWarpThreshold) {
            autopilotState.isWarpActive = false;
            flightState.warpEffect?.stop();
            autopilotState.phase = 'APPROACH';
        }
    }

    if (autopilotState.phase === 'APPROACH') {
        const nearApproachSpeed =
            approachSpeed <= AUTOPILOT_APPROACH_SPEED + AUTOPILOT_BRAKE_DONE_SPEED;
        const brakeEntryTrigger = orbitRadius + Math.max(brakeDistance, AUTOPILOT_BRAKE_ARC_DIST);
        if (nearApproachSpeed && distance <= brakeEntryTrigger) {
            autopilotState.phase = 'BRAKE';
            autopilotState.brakeEntryDistance = distance;
        }
    }

    if (autopilotState.phase === 'BRAKE') {
        const radialClosingSpeed = -relVel.dot(toTargetDir); // positive = closing on target
        const withinOrbit = distance <= orbitRadius * 1.02;
        const driftedToOrbit = distance <= orbitRadius * 1.1 && radialClosingSpeed < 1;
        if (withinOrbit || driftedToOrbit) {
            autopilotState.phase = 'CIRCULARIZE';
        }
    }

    // ── Phase execution ──────────────────────────────────────────────────────

    if (autopilotState.phase === 'ALIGN') {
        // Rotate toward the target without applying any thrust.
        flightState.thrustActive = false;
        const alignQuat = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(targetPos, shipPos, new THREE.Vector3(0, 1, 0))
        );
        ship.mesh.quaternion.rotateTowards(alignQuat, FLIGHT_MAX_TURN_RATE * dt);

        const shipForward = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.mesh.quaternion);
        if (shipForward.dot(toTargetDir) >= Math.cos(THREE.MathUtils.degToRad(3))) {
            if (distance > dynamicWarpThreshold) {
                autopilotState.phase = 'WARP_CHARGING';
                autopilotState.warpVoicePlayed = false;
            } else if (distance <= orbitRadius + AUTOPILOT_APPROACH_MIN_DISTANCE) {
                autopilotState.phase = 'BRAKE';
            } else {
                autopilotState.phase = 'APPROACH';
            }
        }
    } else if (autopilotState.phase === 'WARP_CHARGING') {
        // Reuse the same charge progress bar shown during manual warp.
        autopilotState.warpChargeTimer = Math.min(
            autopilotState.warpChargeTimer + dt,
            FLIGHT_WARP_CHARGE_TIME
        );
        const fill = autopilotState.warpChargeTimer / FLIGHT_WARP_CHARGE_TIME;
        ctx.flightHUD.setWarpCharge(fill);
        if (fill >= 0.99 && !autopilotState.warpVoicePlayed) {
            autopilotState.warpVoicePlayed = true;
            playSoundEffect(SoundEffect.WarpDriveActive);
        }
        // Point toward target while charging.
        const chargeQuat = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(targetPos, shipPos, new THREE.Vector3(0, 1, 0))
        );
        ship.mesh.quaternion.rotateTowards(chargeQuat, FLIGHT_MAX_TURN_RATE * dt);
        flightState.thrustActive = false;

        if (autopilotState.warpChargeTimer >= FLIGHT_WARP_CHARGE_TIME) {
            autopilotState.warpChargeTimer = 0;
            autopilotState.isWarpActive = true;
            autopilotState.phase = 'WARP';
            ctx.flightHUD.hideWarpSprite();
            flightState.warpEffect?.start();
            triggerScreenFlash(200, 0.01, 2.5);
            ctx.addEvent({
                message: '⚡ Autopilot warp engaged.',
                notificationType: NotificationType.Success,
            });
        }
    } else if (autopilotState.phase === 'WARP') {
        // Accelerate toward FLIGHT_WARP_SPEED in the target's frame.
        const relVel = new THREE.Vector3().subVectors(ship.velocity, target.velocity);
        const curSpeed = relVel.dot(toTargetDir);
        let newSpeed: number;
        if (curSpeed < FLIGHT_WARP_SPEED) {
            newSpeed = Math.min(curSpeed + AUTOPILOT_WARP_ACCEL * dt, FLIGHT_WARP_SPEED);
        } else {
            newSpeed = FLIGHT_WARP_SPEED;
        }
        ship.velocity.copy(target.velocity).addScaledVector(toTargetDir, newSpeed);
        flightState.currentSpeed = newSpeed;
        flightState.thrustActive = true;

        // Keep ship visually pointed toward the target.
        const warpQuat = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(targetPos, shipPos, new THREE.Vector3(0, 1, 0))
        );
        ship.mesh.quaternion.rotateTowards(warpQuat, FLIGHT_MAX_TURN_RATE * dt);
    } else if (autopilotState.phase === 'APPROACH') {
        const boostDecelDist =
            (FLIGHT_BOOST_MAX_SPEED * FLIGHT_BOOST_MAX_SPEED -
                FLIGHT_MAX_SPEED * FLIGHT_MAX_SPEED) /
            (2 * AUTOPILOT_BOOST_DECEL);
        const effectiveBoostThreshold =
            orbitRadius + AUTOPILOT_APPROACH_MIN_DISTANCE + boostDecelDist;

        const useBoost = distance > effectiveBoostThreshold;
        autopilotState.isBoostActive = useBoost;
        const targetSpeed = useBoost ? FLIGHT_BOOST_MAX_SPEED : AUTOPILOT_APPROACH_SPEED;

        const desiredVel = new THREE.Vector3()
            .copy(target.velocity)
            .addScaledVector(toTargetDir, targetSpeed);

        const velDelta = new THREE.Vector3().subVectors(desiredVel, ship.velocity);
        const deltaLen = velDelta.length();

        if (deltaLen > 1e-6) {
            const accelDir = velDelta.clone().normalize();

            const relFwd = relVel.dot(toTargetDir);
            if (relFwd >= targetSpeed) {
                const fwdComp = accelDir.dot(toTargetDir);
                if (fwdComp > 0) {
                    accelDir.addScaledVector(toTargetDir, -fwdComp);
                    const len = accelDir.length();
                    if (len > 1e-6) accelDir.divideScalar(len);
                }
            }
            const needsDecel = approachSpeed > targetSpeed + AUTOPILOT_BRAKE_DONE_SPEED;
            const rate = needsDecel
                ? approachSpeed > FLIGHT_BOOST_MAX_SPEED
                    ? AUTOPILOT_WARP_DECEL
                    : approachSpeed > AUTOPILOT_APPROACH_SPEED
                      ? AUTOPILOT_BOOST_DECEL
                      : AUTOPILOT_DECEL
                : useBoost
                  ? FLIGHT_BOOST_ACCEL
                  : AUTOPILOT_ACCEL;
            const accelMag = Math.min(rate * dt, deltaLen);
            ship.velocity.addScaledVector(accelDir, accelMag);
        }

        const approachQuat = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(targetPos, shipPos, new THREE.Vector3(0, 1, 0))
        );
        ship.mesh.quaternion.rotateTowards(approachQuat, FLIGHT_MAX_TURN_RATE * dt);
        flightState.thrustActive = deltaLen > 1e-6;
    } else if (autopilotState.phase === 'BRAKE' && G * simulationState.gMultiplier > 0) {
        const radial = new THREE.Vector3().subVectors(shipPos, targetPos);
        if (radial.lengthSq() < 1e-10) return;
        const r = radial.length();
        radial.normalize();

        const worldUp = new THREE.Vector3(0, 1, 0);
        const tangential = new THREE.Vector3().crossVectors(radial, worldUp).normalize();
        if (tangential.lengthSq() < 1e-10) {
            tangential.crossVectors(radial, new THREE.Vector3(0, 0, 1)).normalize();
        }

        const vOrbit = Math.sqrt((G * simulationState.gMultiplier * target.mass) / r);

        const brakeSpan = Math.max(autopilotState.brakeEntryDistance - orbitRadius, 1);
        const rawT = 1 - (distance - orbitRadius) / brakeSpan;
        const t = Math.max(0, Math.min(1, rawT));
        const alpha = t * t * (3 - 2 * t); // smoothstep

        const brakeApproachSpeed = relVel.length();
        const brakeDecel =
            brakeApproachSpeed > FLIGHT_BOOST_MAX_SPEED
                ? AUTOPILOT_WARP_DECEL
                : brakeApproachSpeed > FLIGHT_MAX_SPEED
                  ? AUTOPILOT_BOOST_DECEL
                  : AUTOPILOT_DECEL;
        const maxInwardForSpan = Math.sqrt(2 * brakeDecel * brakeSpan);
        const inwardSpeed = Math.min(FLIGHT_MAX_SPEED, maxInwardForSpan) * (1 - alpha);
        const desiredVel = new THREE.Vector3()
            .copy(target.velocity)
            .addScaledVector(tangential, vOrbit * alpha)
            .addScaledVector(toTargetDir, inwardSpeed);

        // Explicit gravity compensation.
        const gravAccel = (G * simulationState.gMultiplier * target.mass) / (r * r);
        const tangentialSpeed = relVel.dot(tangential);
        const speedRatio = Math.max(0, Math.min(1, tangentialSpeed / vOrbit));
        const gravCompFraction = 1 - speedRatio * speedRatio;
        ship.velocity.addScaledVector(radial, gravAccel * gravCompFraction * dt);

        const velDelta = new THREE.Vector3().subVectors(desiredVel, ship.velocity);
        const deltaLen = velDelta.length();

        if (deltaLen > 1e-6) {
            const thrustDir = velDelta.clone().normalize();
            const brakeMag = Math.min(brakeDecel * dt, deltaLen);
            ship.velocity.addScaledVector(thrustDir, brakeMag);

            const targetQuat = computeTopTowardBodyQuat(shipPos, targetPos, thrustDir);
            ship.mesh.quaternion.rotateTowards(targetQuat, FLIGHT_MAX_TURN_RATE * dt);
            flightState.thrustActive = deltaLen > 1;
        } else {
            flightState.thrustActive = false;
        }
    } else if (autopilotState.phase === 'CIRCULARIZE' && G * simulationState.gMultiplier > 0) {
        const radial = new THREE.Vector3().subVectors(shipPos, targetPos);
        if (radial.lengthSq() < 1e-10) {
            ship.mesh.position.addScaledVector(new THREE.Vector3(1, 0, 0), orbitRadius);
            return;
        }

        const r = radial.length();
        radial.normalize();

        const worldUp = new THREE.Vector3(0, 1, 0);
        const tangential = new THREE.Vector3().crossVectors(radial, worldUp).normalize();
        if (tangential.lengthSq() < 1e-10) {
            tangential.crossVectors(radial, new THREE.Vector3(0, 0, 1)).normalize();
        }

        const vOrbit = Math.sqrt((G * simulationState.gMultiplier * target.mass) / r);

        const bodyRadius = target.radius ?? 10;
        const altitude = Math.max(r - bodyRadius, 1);
        const gravAccel = (G * simulationState.gMultiplier * target.mass) / (r * r);
        const safeRate =
            AUTOPILOT_CIRCULARIZE_GRAVITY_MARGIN * vOrbit * Math.sqrt(gravAccel / altitude);
        const effectiveRate = Math.max(AUTOPILOT_CIRCULARIZE_RATE, safeRate);

        const tangentialSpeed = relVel.dot(tangential);
        const speedRatio = Math.max(0, Math.min(1, tangentialSpeed / vOrbit));
        const gravCompFraction = 1 - speedRatio * speedRatio;
        ship.velocity.addScaledVector(radial, gravAccel * gravCompFraction * dt);

        const desiredVel = new THREE.Vector3()
            .copy(target.velocity)
            .addScaledVector(tangential, vOrbit);

        const velDelta = new THREE.Vector3().subVectors(desiredVel, ship.velocity);
        const deltaLen = velDelta.length();

        if (deltaLen < AUTOPILOT_BRAKE_DONE_SPEED) {
            // Close enough — snap the residual and complete.
            ship.velocity.copy(desiredVel);
            flightState.thrustActive = false;

            const targetName = target.name || 'the body';
            ctx.addEvent({
                message: `✓ Autopilot: Stable orbit around ${targetName} achieved. Tidal lock engaged.`,
                notificationType: NotificationType.Success,
            });
            autopilotState.orbitNotifyTimer = AUTOPILOT_ORBIT_NOTIFY_DURATION;
            ctx.flightHUD.showOrbitNotify();

            autopilotState.phase = 'TIDAL_LOCK';
            setTimeout(() => updateAutopilotUI(ctx), 0);
        } else {
            const thrustDir = velDelta.clone().normalize();
            const mag = Math.min(effectiveRate * dt, deltaLen);
            ship.velocity.addScaledVector(thrustDir, mag);

            const targetQuat = computeTopTowardBodyQuat(shipPos, targetPos, thrustDir);
            ship.mesh.quaternion.rotateTowards(targetQuat, FLIGHT_MAX_TURN_RATE * dt);
            flightState.thrustActive = true;
        }
    } else if (autopilotState.phase === 'TIDAL_LOCK' && G * simulationState.gMultiplier > 0) {
        const radial = new THREE.Vector3().subVectors(shipPos, targetPos);
        if (radial.lengthSq() < 1e-10) return;
        radial.normalize();

        const worldUp = new THREE.Vector3(0, 1, 0);
        const tangential = new THREE.Vector3().crossVectors(radial, worldUp).normalize();
        if (tangential.lengthSq() < 1e-10) {
            tangential.crossVectors(radial, new THREE.Vector3(0, 0, 1)).normalize();
        }

        // Use the relative velocity direction as forward, falling back to the
        // tangential orbit direction if the ship's velocity is negligible.
        const relVel = new THREE.Vector3().subVectors(ship.velocity, target.velocity);
        const fwdDir = relVel.lengthSq() > 1e-6 ? relVel.clone().normalize() : tangential;

        const lockQuat = computeTopTowardBodyQuat(shipPos, targetPos, fwdDir);
        ship.mesh.quaternion.rotateTowards(lockQuat, FLIGHT_MAX_TURN_RATE * dt);
        flightState.thrustActive = false;
    }
}
