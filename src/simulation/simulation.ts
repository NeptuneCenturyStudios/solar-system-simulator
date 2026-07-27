import * as THREE from 'three';
import { ImpactShockwave } from '../effects/impact-shockwave';
import { ParticleExplosion } from '../effects/particle-explosion';
import { Body } from '../bodies/body';
import {
    IAutopilotState,
    ICameraState,
    IFlightState,
    IInteractionState,
    ISimulationState,
} from '../interfaces';
import { Spaceship } from '../bodies/spaceship';

/**
 * The central state object for the solar system simulation, tracking time, bodies, and visual effects.
 */
export const simulationState: ISimulationState = {
    timeScale: 1,
    isPaused: false,
    savedTimeScale: 1,
    lastT: performance.now(),
    bodies: [] as Body[],
    explosions: [] as ParticleExplosion[],
    impacts: [] as ImpactShockwave[],
    showNames: false,
    gMultiplier: 1,
};

/**
 * The state object tracking the current flight status, including active ship, camera orientation, thrust, warp, and boost states.
 */
export const flightState: IFlightState = {
    isActive: false,
    activeShip: null as Spaceship | null,
    isCockpitView: false,
    /** Current thrust speed; persists after key release (W increases, S decreases). */
    currentSpeed: 0,
    /** Accumulated mouse pointer offset from screen centre (x/y pixels, capped). */
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    rollLeft: false,
    rollRight: false,
    /** Current angular roll velocity (rad/s). Decays when key released. */
    rollVelocity: 0,
    /** Smoothed steering values in [-1, 1]. Lerp toward raw target each frame. */
    steerX: 0,
    steerY: 0,
    /** Whether advanced (additive) flight physics are active. Default = false (simple mode). */
    isAdvancedMode: false,
    // Pre-flight camera snapshot so we can restore exactly on exit
    prevCameraPos: new THREE.Vector3(),
    prevCameraUp: new THREE.Vector3(0, 1, 0),
    prevCameraQuat: new THREE.Quaternion(),
    prevControlsTarget: new THREE.Vector3(),
    /** Reference to the last spawned ship; persists after exit so user can re-enter it. */
    knownShip: null as Spaceship | null,
    /** True while any thrust key (W/S/Shift) was held this frame. Used by trail. */
    thrustActive: false,
    /** Seconds space bar has been held in flight mode (0 – FLIGHT_WARP_CHARGE_TIME). */
    warpCharge: 0,
    /** True while space bar is being held down to charge warp. */
    warpCharging: false,
    /** True when warp speed is active. */
    warpActive: false,
    /** True while decelerating back from warp speed. */
    warpDecelerating: false,
    /** True while rapidly decelerating from boost speed back to normal max. */
    boostDecelerating: false,
    /** Camera reference frame quaternion, independent of ship mesh visual banking.
     *  Rotated by mouse steering (world-yaw + local-pitch) and A/D roll.
     *  In 3rd-person view the camera follows this, not ship.mesh.quaternion. */
    flightCameraQuat: new THREE.Quaternion(),
    /** Visual roll offset of ship mesh relative to camera frame (radians).
     *  Animated toward -steerX * FLIGHT_MAX_BANK_ANGLE when steering laterally. */
    shipBankRoll: 0,
    /** Visual pitch offset of ship mesh relative to camera frame (radians).
     *  Animated toward steerY * FLIGHT_MAX_BANK_PITCH when steering vertically. */
    shipBankPitch: 0,
    /** True while LMB is held during flight — fires weapon particles each frame. */
    isFiring: false,
    /** Whether Shift was held on the previous frame — used to detect Shift-release transitions. */
    prevShiftHeld: false,
    /** True while ALT is held — camera orbits the ship instead of steering it. */
    altOrbitActive: false,
    /** Accumulated yaw offset (radians) for the ALT orbit camera, in ship-local space. */
    altOrbitYaw: 0,
    /** Accumulated pitch offset (radians) for the ALT orbit camera, in ship-local space. */
    altOrbitPitch: 0,
    /** True once the warp-drive-active voice prompt has played for the current charge cycle. */
    warpVoicePlayed: false,
    /** The body currently under the steering line tip in flight mode. Set by PlanetNameIndicator. */
    steeringHoveredBody: null as Body | null,
    /** Seconds the E key has been held over the current hovered body (0 → FLIGHT_AUTOPILOT_CHARGE_TIME). */
    autopilotCharge: 0,
};

/**
 * Interaction state object, tracking the current input and manipulation states for user interactions within the simulation.
 */
export const interactionState: IInteractionState = {
    isRepositioning: false,
    isChangingVelocity: false,
    isMiddleMouseVelocity: false,
    isMouseLookActive: false,
    isDragging: false,
    activeAxis: null as string | null,
    wasRunningBeforeDrag: false,
    dragTarget: null as Body | null,
    dragCameraOffset: new THREE.Vector3(),
    dragPlane: new THREE.Plane(),

    // Velocity editing UX
    velocityEditMode: 'xz', // 'xz' | 'y'
    velocityEditHadRunningBeforeDrag: false,

    // Drag tracking for repositioning
    dragStartIntersection: null as THREE.Vector3 | null,
    dragStartPosition: null as THREE.Vector3 | null,

    // Touch camera gesture state (mobile)
    isTouchGestureActive: false,
    touchGestureMode: null as 'rotate' | 'pinch' | null,
    lastTouchX: 0,
    lastTouchY: 0,
    lastPinchDist: 0,

    // Mobile: ignore the synthetic mouse events browsers often emit right after touch.
    touchIgnoreUntil: 0,
};

/**
 * Camera state object, tracking the current mode, focus target, and input states for the camera system.
 */
export const cameraState: ICameraState = {
    isFreeCameraMode: false,
    isLookAtMode: false,
    lockToSun: false,
    // Target mode controls gizmo visibility behavior (similar to Look At toggle, but for gizmo)
    isTargetMode: false,
    // Keep id string for legacy/debug, but camera behavior should not rely on it.
    focusID: 'camSun',
    // Canonical camera focus target (used when Look At is enabled)
    focusBody: null as Body | null,
    offset: new THREE.Vector3(),
    lastPlanetAngle: 0,
    speed: 10,
    rotationSpeed: 0.002,
    keys: { w: false, a: false, s: false, d: false, c: false, e: false, space: false, shift: false },
    arrowKeys: { left: false, right: false, up: false, down: false },
    pendingCollisionFocusBody: null as Body | null,
};

/**
 * Autopilot state object, tracking the current status and timers for the ship's autopilot system.
 */
export const autopilotState: IAutopilotState = {
    isActive: false,
    targetBody: null,
    phase: null,
    /** Stable-orbit notification timer (seconds remaining to display). */
    orbitNotifyTimer: 0,
    /** True while the autopilot WARP phase is active (post-charge). */
    isWarpActive: false,
    /** Accumulated charge time (seconds) during the WARP_CHARGING phase. */
    warpChargeTimer: 0,
    /** True while the approach phase is using boost speed. */
    isBoostActive: false,
    /** Distance from target when BRAKE phase started — used to compute the
     *  0→1 blend factor that rotates the desired velocity from 'stop' to
     *  'orbital velocity' as the ship closes on the orbit radius. */
    brakeEntryDistance: 0,
    /** True once the warp-drive-active voice prompt has played for the current autopilot warp charge cycle. */
    warpVoicePlayed: false,
};
