import * as THREE from 'three';

import { Body } from '../bodies/body';
import { Wormhole } from '../bodies/wormhole';
import { clearPendingWormholeLink, getPendingWormholeLink } from '../bodies/wormhole-link-state';
import { CoordinateGizmo } from '../gizmos/coordinate-gizmo';
import { ImpactShockwave } from '../effects/impact-shockwave';
import { SoundEffect, playSoundEffect } from '../utilities/audio.js';
import { IStateDependencies } from '../interfaces';
import {
    autopilotState,
    cameraState,
    flightState,
    simulationState,
} from '../simulation/simulation';
import { NotificationType } from '../event-log/event-log';

export interface ICustomEventContext {
    /** Module-level selectedBody (mutable). */
    selectedBody: { value: Body | null };
    /** Module-level manuallySelectedBody (mutable). */
    manuallySelectedBody: { value: Body | null };
    gizmo: CoordinateGizmo;
    scene: THREE.Scene;
    dependencies: IStateDependencies;
    addEvent: (event: { message: string; notificationType: NotificationType }) => void;
    handleBodyBecameInvalid: (body: Body | null | undefined) => void;
}

/**
 * Register all custom-event-driven window listeners (body:added, body:removed, etc.).
 * Call once during initialisation, after the context object is fully built.
 */
export function registerCustomEventListeners(ctx: ICustomEventContext): void {
    const {
        selectedBody,
        manuallySelectedBody,
        gizmo,
        scene,
        dependencies,
        addEvent,
        handleBodyBecameInvalid,
    } = ctx;

    // Physics → UI logging: body absorption events become Noty notifications via addEvent()
    window.addEventListener('body:absorbed', (e) => {
        if (!e?.detail) return;
        const { message, notificationType } = e.detail;
        addEvent({ message, notificationType });
    });

    // Body removed cleanup
    window.addEventListener('body:removed', (e: WindowEventMap['body:removed']) => {
        const removedBody = e.detail.body;
        // If the deleted body was the player's known ship, clear the reference
        // so the button reverts to "SPAWN SPACESHIP" rather than "ENTER SHIP".
        if (removedBody && removedBody === flightState.knownShip) {
            flightState.knownShip = null;
            // Disengage autopilot globally if this ship was the autopilot actor.
            if (autopilotState.isActive) {
                autopilotState.isActive = false;
                autopilotState.targetBody = null;
                autopilotState.phase = null;
                autopilotState.isBoostActive = false;
            }
        }
        handleBodyBecameInvalid(removedBody);
    });

    // Weapon impact handler
    window.addEventListener('weapon:hit', (e: WindowEventMap['weapon:hit']) => {
        const { body, position } = e.detail;
        if (body._isDisposed || !body.mesh) return;

        playSoundEffect(SoundEffect.WeaponImpact);

        // Spawn impact flash: pass body centre so ImpactShockwave can snap to surface
        simulationState.impacts.push(
            new ImpactShockwave(dependencies, scene, position, body.mesh.position, body.radius)
        );

        // Wormholes are indestructible — weapons can hit them but never damage them.
        if (body instanceof Wormhole) return;

        body.healthPoints -= e.detail.damage;
        if (body.healthPoints <= 0) {
            body.die();
        }
    });

    // Body death cleanup
    window.addEventListener('body:dead', (e: WindowEventMap['body:dead']) => {
        const body = e.detail.body;
        if (body) {
            // If the dead body was the player's ship, disengage autopilot globally.
            // Do NOT clear flightState.activeShip or flightState.knownShip here —
            // the animation loop's guard detects _isDisposed and calls exitFlightMode(),
            // which handles those references properly (including warp cleanup).
            const isShip = body === flightState.knownShip || body === flightState.activeShip;
            if (isShip && autopilotState.isActive) {
                autopilotState.isActive = false;
                autopilotState.targetBody = null;
                autopilotState.phase = null;
                autopilotState.isBoostActive = false;
            }

            // Ensure truly-dead bodies are removed from the simulation array.
            // Collision deaths already remove immediately, but other death paths (e.g. star fuel death)
            // can emit `body:dead` without being spliced out here.
            simulationState.bodies = (simulationState.bodies || []).filter((b) => b !== body);

            // A deleted wormhole's partner (if any) reverts to unlinked/destructive.
            if (body instanceof Wormhole) {
                if (getPendingWormholeLink() === body) clearPendingWormholeLink();
                if (body.linkedWormholeId) {
                    const partner = simulationState.bodies.find(
                        (b) => b instanceof Wormhole && b.id === body.linkedWormholeId
                    ) as Wormhole | undefined;
                    partner?.clearLink();
                }
            }
        }

        handleBodyBecameInvalid(body);
    });

    // Full system reset
    window.addEventListener('bodies:reset', () => {
        // Everything is rebuilt; clear selection-related pointers so UI/camera doesn't reference stale bodies.
        selectedBody.value = null;
        manuallySelectedBody.value = null;
        cameraState.focusBody = null;
        gizmo.attach(null);
    });
}
