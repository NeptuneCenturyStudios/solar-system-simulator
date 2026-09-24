import * as THREE from 'three';
import type { CoordinateGizmo } from '../gizmos/coordinate-gizmo';
import type { PositionIndicatorManager } from '../gizmos/position-indicator';
import type { FlightHUD } from '../drawing/flight-hud';
import type { VelocityArcManager } from '../drawing/velocity-arc';
import { NotificationType } from '../event-log/event-log';
import type { ICameraState, IFlightControlContext } from '../interfaces';
import { exitFlightMode } from './flight-controllers';
import {
    autopilotState,
    cameraState,
    flightState,
    interactionState,
    simulationState,
} from './simulation';
import { cycleTargetLock } from './target-lock';

/** Names of the held-state flags on `cameraState.keys`. */
type HeldKeyName = keyof ICameraState['keys'];

/**
 * Everything the keyboard layer needs from the application shell (index.ts).
 * Simulation state singletons are imported directly; only objects and actions owned by
 * index.ts are injected.
 */
export interface KeyboardControlsContext {
    flightCtx: IFlightControlContext;
    gizmo: CoordinateGizmo;
    velArc: VelocityArcManager;
    posIndicator: PositionIndicatorManager;
    flightSteeringLine: THREE.Object3D;
    flightHUD: FlightHUD;
    /** Root of the Vue UI overlay. Tab is left alone inside it so focus can move between controls. */
    vueUiRoot: HTMLElement | null;
    /** True while a modal owns the keyboard. */
    modalBlocksInput: () => boolean;
    addEvent: (event: { message: string; notificationType: NotificationType }) => void;
    moveSelectedBodyRelativeToCamera: (directionKey: string, ctrlKey: boolean) => boolean;
    deleteSelectedBody: () => void;
    togglePause: () => void;
    /** Multiply the simulation time scale by `factor` (same action as the speed buttons). */
    stepTimeScale: (factor: number) => void;
    dispatchSimStateChange: () => void;
}

interface KeyBinding {
    /** Handle a key press. Return true when the press was consumed (its default is prevented). */
    onDown?: (e: KeyboardEvent) => boolean;
    /**
     * Handle a key release. Return true when the release was consumed. Never gated by modals or
     * focus, so held state always clears; also invoked for every binding when the window loses focus.
     */
    onUp?: () => boolean;
}

/**
 * Physical keys for the WASD cluster. These are matched by `e.code` so the controls stay on the
 * same physical keys on non-QWERTY layouts (AZERTY, Dvorak). Every other binding is matched by
 * the character it produces (`e.key`), which is what mnemonic shortcuts like N / P / G want.
 */
const POSITIONAL_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

const ARROW_KEYS = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'] as const;

function keyId(e: KeyboardEvent): string {
    return POSITIONAL_CODES.has(e.code) ? e.code : e.key.toLowerCase();
}

/**
 * Whether a keyboard event's target is a text-editing control. WASD / Space / Esc / etc. flow
 * through to the sim, but typing in the System Explorer search box or any other form field is
 * left alone.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
    if (target instanceof HTMLSelectElement) return true;
    return target.isContentEditable;
}

/**
 * Build a press handler that fires once per physical press: OS key-repeat events are still
 * consumed (so their default, e.g. Space scrolling the page, stays suppressed) but do not re-run `act`.
 *
 * @param applies Whether the binding is active right now; when false the key is not consumed.
 * @param act The action to run on the initial press.
 * @param consume Whether an active press prevents the browser default.
 */
function pressOnce(
    applies: (e: KeyboardEvent) => boolean,
    act: (e: KeyboardEvent) => void,
    consume = true
): (e: KeyboardEvent) => boolean {
    return (e) => {
        if (!applies(e)) return false;
        if (!e.repeat) act(e);
        return consume;
    };
}

const inFlight = (): boolean => flightState.isActive;

/**
 * Register the simulation's keyboard shortcuts.
 *
 * One capture-phase keydown/keyup pair is registered on `window`, so keys reach the sim before
 * any UI-level stopPropagation() handler regardless of which element has focus. Typing targets
 * and open modals are excluded explicitly instead of relying on events being blocked in the UI.
 *
 * @returns A function that removes every listener registered here.
 */
export function installKeyboardControls(ctx: KeyboardControlsContext): () => void {
    const keys = cameraState.keys;

    /** Zero the steering offsets so the ship doesn't lurch when Alt-orbit toggles. */
    const zeroSteeringOffsets = (): void => {
        flightState.pointerOffsetX = 0;
        flightState.pointerOffsetY = 0;
    };

    /**
     * A held-state key. Sets `cameraState.keys[name]` while down (used by free-cam and by the
     * flight thrust/brake logic). `flight` overrides the press/release behaviour while in flight
     * mode, where the key drives something other than the shared flag.
     */
    const heldKey = (
        name: HeldKeyName,
        flight?: { down: () => void; up: () => void }
    ): KeyBinding => ({
        onDown: () => {
            if (flightState.isActive) {
                if (flight) flight.down();
                else keys[name] = true;
                return true;
            }
            keys[name] = true;
            return false;
        },
        onUp: () => {
            keys[name] = false;
            if (flightState.isActive) flight?.up();
            return false;
        },
    });

    /** G while dragging a velocity: toggle between the XZ (horizontal) and Y (vertical) edit planes. */
    const toggleVelocityEditMode = (): void => {
        interactionState.velocityEditMode = interactionState.velocityEditMode === 'xz' ? 'y' : 'xz';

        // Re-aim the drag plane for the new mode.
        // - XZ: horizontal plane through the body (constrains to XZ while still tracking mouse up/down)
        // - Y: vertical plane containing world-up and the current horizontal heading
        if (ctx.gizmo?.target) {
            const origin = ctx.gizmo.target.mesh.position;

            if (interactionState.velocityEditMode === 'y') {
                const v = ctx.gizmo.target.velocity.clone();
                v.y = 0;

                const hDir = v.lengthSq() > 1e-10 ? v.normalize() : new THREE.Vector3(1, 0, 0);
                const up = new THREE.Vector3(0, 1, 0);

                const planeNormal = new THREE.Vector3().crossVectors(hDir, up).normalize();
                interactionState.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, origin);
            } else {
                interactionState.dragPlane.setFromNormalAndCoplanarPoint(
                    new THREE.Vector3(0, 1, 0),
                    origin
                );
            }
        }

        ctx.velArc.update();
    };

    /** Space in flight: start charging the warp drive, or disengage an active warp. */
    const toggleWarp = (): void => {
        const ship = flightState.activeShip;
        if (ship?.warpActive && !autopilotState.isActive) {
            // Disengage warp (manual only — autopilot manages its own warp lifecycle)
            ship.beginWarpDecel();
            ship.cancelWarpCharge();
            ctx.flightSteeringLine.visible = true;
            ctx.addEvent({
                message: 'Warp disengaged. Decelerating...',
                notificationType: NotificationType.Info,
            });
        } else if (ship && !ship.warpDecelerating && !autopilotState.isActive) {
            // Only start charging when not already decelerating from a previous warp,
            // and not under autopilot control.
            ship.startWarpCharge();
        }
    };

    const isVelocityEditing = (): boolean =>
        interactionState.isChangingVelocity || interactionState.isMiddleMouseVelocity;

    const bindings = new Map<string, KeyBinding>();

    // Arrow keys nudge the selected body while its gizmo is visible.
    for (const arrow of ARROW_KEYS) {
        bindings.set(arrow, {
            onDown: (e) => ctx.moveSelectedBodyRelativeToCamera(arrow, e.ctrlKey),
            onUp: () => {
                if (!isVelocityEditing() && !interactionState.isRepositioning) {
                    ctx.posIndicator.hide();
                    ctx.velArc.hideAll();
                }
                return false;
            },
        });
    }

    bindings.set('g', {
        onDown: pressOnce(isVelocityEditing, toggleVelocityEditMode),
    });

    // WASD: thrust / brake in flight, free-cam movement otherwise. In flight A/D roll instead.
    bindings.set('KeyW', heldKey('w'));
    bindings.set(
        'KeyA',
        heldKey('a', {
            down: () => {
                flightState.rollLeft = true;
            },
            up: () => {
                flightState.rollLeft = false;
            },
        })
    );
    bindings.set('KeyS', heldKey('s'));
    bindings.set(
        'KeyD',
        heldKey('d', {
            down: () => {
                flightState.rollRight = true;
            },
            up: () => {
                flightState.rollRight = false;
            },
        })
    );

    // C: free-cam descend; in flight, toggles cockpit / 3rd-person view.
    const cockpitToggle = pressOnce(inFlight, () => {
        flightState.isCockpitView = !flightState.isCockpitView;
    });
    const cKey = heldKey('c');
    bindings.set('c', {
        onDown: (e) => (flightState.isActive ? cockpitToggle(e) : (cKey.onDown?.(e) ?? false)),
        onUp: cKey.onUp,
    });

    // Tab: flight-only — cycle the locked threat target, Shift+Tab reverses. Left alone while
    // focus is inside the Vue UI so Tab still moves focus between its controls.
    bindings.set('tab', {
        onDown: pressOnce(
            (e) => flightState.isActive && !ctx.vueUiRoot?.contains(e.target as Node),
            (e) => cycleTargetLock(e.shiftKey)
        ),
    });

    // E: flight-only — hold to charge autopilot toward the hovered target.
    bindings.set('e', {
        onDown: () => {
            if (!flightState.isActive) return false;
            keys.e = true;
            return true;
        },
        onUp: () => {
            keys.e = false;
            if (flightState.isActive) flightState.autopilotCharge = 0;
            return false;
        },
    });

    // Space: free-cam ascend; in flight, engage / disengage warp.
    const warpToggle = pressOnce(inFlight, toggleWarp);
    bindings.set(' ', {
        onDown: (e) => {
            if (flightState.isActive) return warpToggle(e);
            keys.space = true;
            return false;
        },
        onUp: () => {
            keys.space = false;
            if (flightState.isActive) {
                // Cancel warp charge if space released before full charge
                const ship = flightState.activeShip;
                if (ship?.warpCharging) {
                    ship.cancelWarpCharge();
                    ctx.flightHUD.hideWarpSprite();
                }
            }
            return false;
        },
    });

    bindings.set('shift', {
        onDown: () => {
            keys.shift = true;
            return false;
        },
        onUp: () => {
            keys.shift = false;
            return false;
        },
    });

    // Alt: flight-only — hold to orbit the camera around the ship without steering.
    bindings.set('alt', {
        onDown: pressOnce(inFlight, () => {
            flightState.altOrbitActive = true;
            zeroSteeringOffsets();
        }),
        onUp: () => {
            if (!flightState.isActive) return false;
            flightState.altOrbitActive = false;
            zeroSteeringOffsets();
            return true;
        },
    });

    bindings.set('escape', {
        onDown: pressOnce(inFlight, () => exitFlightMode(ctx.flightCtx)),
    });

    bindings.set('n', {
        onDown: pressOnce(
            () => true,
            () => {
                simulationState.showNames = !simulationState.showNames;
                ctx.dispatchSimStateChange();
            },
            false
        ),
    });

    bindings.set('p', {
        onDown: pressOnce(() => true, ctx.togglePause),
    });

    // + / - double / halve the time scale, in every mode including flight. '=' and '_' are the
    // same physical keys without / with Shift on US layouts, so they count too. Ctrl/Cmd combos
    // are left to the browser (page zoom). Once per press: repeat would ramp to the limit instantly.
    const noBrowserModifier = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.metaKey;
    const speedUp = { onDown: pressOnce(noBrowserModifier, () => ctx.stepTimeScale(2)) };
    const slowDown = { onDown: pressOnce(noBrowserModifier, () => ctx.stepTimeScale(0.5)) };
    bindings.set('+', speedUp);
    bindings.set('=', speedUp);
    bindings.set('-', slowDown);
    bindings.set('_', slowDown);

    bindings.set('delete', {
        onDown: pressOnce(() => true, ctx.deleteSelectedBody, false),
    });

    const onKeyDown = (e: KeyboardEvent): void => {
        // While a modal is open, let it own the keyboard entirely.
        if (ctx.modalBlocksInput()) return;

        // Never hijack keys while the user is typing in a form control
        // (System Explorer search box, ship-type dropdown, etc.).
        if (isEditableTarget(e.target)) return;

        if (bindings.get(keyId(e))?.onDown?.(e)) e.preventDefault();
    };

    // Keyup runs with NO guards: held-key flags must ALWAYS be cleared, otherwise a key pressed
    // before focusing a text field (or opening a modal) would get stuck "down" forever.
    const onKeyUp = (e: KeyboardEvent): void => {
        if (bindings.get(keyId(e))?.onUp?.()) e.preventDefault();
    };

    // The browser never delivers the keyup for a key released while the window is unfocused
    // (Alt+Tab is the common case, and Alt is itself a bound key), so release everything.
    const releaseAll = (): void => {
        for (const binding of bindings.values()) binding.onUp?.();
    };
    const onVisibilityChange = (): void => {
        if (document.hidden) releaseAll();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('keyup', onKeyUp, true);
        window.removeEventListener('blur', releaseAll);
        document.removeEventListener('visibilitychange', onVisibilityChange);
    };
}
