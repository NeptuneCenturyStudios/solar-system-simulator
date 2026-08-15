import * as THREE from 'three';
import { LogMethods, NotificationType } from '../event-log/event-log';
import {
    SCALE_FACTOR,
    AUTOPILOT_ORBIT_ALTITUDE_FACTOR,
    AUTOPILOT_BLOCKED_NOTIFY_DURATION,
    AUTOPILOT_ORBIT_NOTIFY_DURATION,
} from '../utilities/consts';
import { playSoundEffect, SoundEffect } from '../utilities/audio';
import { IAutopilotContext } from '../interfaces';
import { Body } from '../bodies/body';
import { autopilotState, flightState, simulationState } from './simulation';

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
    const ship = flightState.knownShip;
    if (!ship || !ship.autopilotActive) return;

    playSoundEffect(SoundEffect.AutopilotDisengaged);

    if (ship) {
        // Brake to a complete stop from whatever speed the ship is at (warp,
        // boost, or normal approach).  Runs through advanceWarpSpeed() so the
        // decel continues in flight mode AND in the background updater.
        ship.beginStopBrake();
    }
    // Clear any in-progress warp charge.
    if (autopilotState.phase === 'WARP_CHARGING') {
        ctx.flightHUD.hideWarpSprite();
        ship?.cancelWarpCharge();
    }

    // Clear ship-local autopilot state
    ship.resetAutopilotState();

    // Sync global state
    autopilotState.isActive = false;
    autopilotState.isBoostActive = false;
    autopilotState.phase = null;
    autopilotState.targetBody = null;
    flightState.thrustActive = false;
    // Zero stale steering offsets so the ship doesn't lurch once the player
    // regains control after the stop-brake completes.
    flightState.pointerOffsetX = 0;
    flightState.pointerOffsetY = 0;
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
    if (ship.autopilotActive && ship.autopilotTarget === target) {
        cancelAutopilot(ctx, 'Autopilot disengaged.');
        return;
    }

    // Guard: refuse to engage while warp/stop-brake is live.
    if (
        ship.warpActive ||
        ship.warpDecelerating ||
        ship.warpCharging ||
        ship.stopBraking
    ) {
        ctx.addEvent({
            message: 'Autopilot: disengage warp before engaging autopilot.',
            notificationType: NotificationType.Warning,
            logMethod: LogMethods.Alert | LogMethods.Console,
        });
        return;
    }

    // Clean up any prior autopilot warp when switching targets.
    if (ship.warpActive) {
        ship.warpActive = false;
    }

    // Choose initial phase based on distance.
    const dist0 =
        ship.mesh && target.mesh ? ship.mesh.position.distanceTo(target.mesh.position) : Infinity;
    const orbitRadius0 = (target.radius ?? 10) * AUTOPILOT_ORBIT_ALTITUDE_FACTOR;
    // Dynamic warp threshold: the ship's autopilotWarpThreshold is the stopping
    // distance from full warp speed to zero, derived from the ship's own handling.
    // It doesn't account for the target body's orbit radius, so adding orbitRadius
    // ensures the ship stops *at* the orbit radius, not at the target centre.
    const dynamicWarpThreshold0 = ship.autopilotWarpThreshold + orbitRadius0;
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
    const startInBrake = !startWithWarp && dist0 <= orbitRadius0 + ship.autopilotApproachMinDistance;

    // Set ship-local autopilot state
    ship.autopilotActive = true;
    ship.autopilotTarget = target;
    ship.autopilotPhase = 'ALIGN';
    ship.autopilotBoostActive = false;
    ship.autopilotBrakeEntryDistance = dist0;
    ship.autopilotEventMessages = [];
    ship.warpActive = false;

    // Sync global state
    autopilotState.isActive = true;
    autopilotState.targetBody = target;
    autopilotState.phase = 'ALIGN';
    autopilotState.brakeEntryDistance = dist0;
    autopilotState.isBoostActive = false;
    flightState.thrustActive = false;

    playSoundEffect(SoundEffect.AutopilotEngaged);

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
 * Drain autopilot event messages from the ship, firing one-shot effects.
 * Called after autopilotStep() in the physics loop.
 */
export function drainAutopilotEvents(ctx: IAutopilotContext): void {
    const ship = flightState.knownShip;
    if (!ship) return;

    const messages = ship.autopilotEventMessages;
    if (messages.length === 0) return;

    for (const msg of messages) {
        if (msg.isOrbitNotify) {
            autopilotState.orbitNotifyTimer = AUTOPILOT_ORBIT_NOTIFY_DURATION;
            ctx.flightHUD.showOrbitNotify();
        }
        ctx.addEvent({
            message: msg.message,
            notificationType: msg.isOrbitNotify ? NotificationType.Success : NotificationType.Success,
        });
    }

    ship.autopilotEventMessages = [];
    setTimeout(() => updateAutopilotUI(ctx), 0);
}
