import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Body } from './bodies/body';
import { ParticleExplosion } from './effects/particle-explosion';
import { Supernova } from './effects/supernova';
import { PlanetaryNebula } from './effects/planetary-nebula';
import { CoordinateGizmo } from './gizmos/coordinate-gizmo';
import { IPipelineFeedEffect } from './effects/effect-base';
import { LogMethods, NotificationType } from './event-log/event-log';
import { BodyTypeEnum, MoonTypeEnum, PlanetTypeEnum } from './bodies/body-enums';
import { ITidalLockOptions } from './bodies/celestial-body';
import { EffectiveCSpeed, EffectiveGForce } from './types';
import { Spaceship } from './bodies/spaceship';
import { ImpactShockwave } from './effects/impact-shockwave';
import { FlightHUD } from './drawing/flight-hud';
import { UIManager } from './ui/ui-manager';

/**
 * Options for configuring an atmosphere on a celestial body, including its radius and tint color.
 */
export interface IAtmosphereOptions {
    radius: number;
    tint: number;
}

/**
 * The interface for a solar system, containing an array of celestial bodies and a space texture.
 */
export interface ISolarSystem {
    bodies: Body[];
    /** The space texture representing the background of the solar system. Can be null if not yet generated. */
    spaceTexture: ISpaceBackground;
}

export interface ISimulationState {
    timeScale: number;
    isPaused: boolean;
    savedTimeScale: number;
    lastT: number;
    bodies: Body[];
    explosions: ParticleExplosion[];
    impacts: ImpactShockwave[];
    showNames: boolean;
    gMultiplier: number;
}

/**
 * Represents the rotation of a body in 3D space
 */
export interface IRotation {
    // axis: THREE.Vector3;
    tilt: number; // in degrees
    speed: number; // in degrees per second
    azimuth?: number; // in degrees — rotates the tilt direction around the world Y axis (default 0)
}

export interface IBodyCreationOptions {
    mass: number;
    radius: number;
    id: string;
    name: string;
}

export interface IOrbitalBodyCreationOptions extends IBodyCreationOptions {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    rotation?: IRotation;
    trailColor?: number;
    maxTrail?: number;
}

export interface ICelestialBodyCreationOptions extends IOrbitalBodyCreationOptions {
    mesh?: THREE.Mesh;
    /** Deterministic seed used to derive procedural textures and other procedural features at runtime. */
    seed?: string;
}

export interface ISatelliteCreationOptions extends ICelestialBodyCreationOptions {
    distance: number;
    angle?: number;
    inclinationDeg?: number;
    yVariation?: number;
    tidalLock?: ITidalLockOptions;
}

export interface IMoonCreationOptions extends ISatelliteCreationOptions {
    moonType: MoonTypeEnum;
    texture?: THREE.Texture;
}

export interface IPlanetCreationOptions extends ICelestialBodyCreationOptions {
    hasRings?: boolean;
    bodySubtype: PlanetTypeEnum;
    atmosphere?: IAtmosphereOptions;
}

export interface IStateDependencies {
    addEvent: (event: { message: string; notificationType: NotificationType }) => void;
    addExplosion: (explosion: ParticleExplosion) => void;
    addSupernova: (supernova: Supernova) => void;
    addPlanetaryNebula: (nebula: PlanetaryNebula) => void;
    addBody: (body: Body) => void;
    gizmo: CoordinateGizmo;
    getBodies: () => Body[];
    getG: () => EffectiveGForce;
    getC: () => EffectiveCSpeed;
}

/**
 * Structural interface for a star that can be siphoned by a black hole.
 * Avoids a circular import between black-hole.ts and star.ts.
 */
export interface ISiphonTarget {
    id: string;
    name: string;
    mass: number;
    fuel: number | null;
    maxFuel: number | null;
    initialMass: number;
    radius: number;
    mesh: THREE.Mesh;
    bodyType: BodyTypeEnum;
    baseColor: THREE.Color;
    _isDisposed: boolean;
    setMass(mass: number): void;
    triggerStarDeath(isMassiveStar: boolean): void;
}

/**
 * Structural interface for a body that can consume mass via an accretion disk.
 * Used by MassSiphonEffect to avoid circular imports.
 */
export interface IAccretionTarget {
    mesh: THREE.Mesh;
    mass: number;
    radius: number;
    _isDisposed: boolean;
    rotationAxis: THREE.Vector3;
    /** The accretion disk's outer radius; null when no disk is active. */
    accretionDisk: { maxRadius: number } | null;
}

/**
 * Extends IAccretionTarget for bodies that actively manage siphon streams and
 * queue incoming particles into their accretion disk. Implemented by BlackHole
 * and Pulsar.
 */
export interface IMassTransferBody extends IAccretionTarget {
    siphonEffects: Map<string, IPipelineFeedEffect>;
    enqueueAccretionParticle(angle: number): void;
}

/**
 * Structural interface for the flight state, representing the current state of the player's spaceship and flight-related parameters.
 */
export interface IFlightState {
    isActive: boolean;
    activeShip: Spaceship | null;
    isCockpitView: boolean;

    /** Current thrust speed; persists after key release (W increases, S decreases). */
    currentSpeed: number;

    /** Accumulated mouse pointer offset from screen centre (x/y pixels, capped). */
    pointerOffsetX: number;
    pointerOffsetY: number;

    rollLeft: boolean;
    rollRight: boolean;

    /** Whether advanced (additive) flight physics are active. */
    isAdvancedMode: boolean;

    // Pre-flight camera snapshot
    prevCameraPos: THREE.Vector3;
    prevCameraUp: THREE.Vector3;
    prevCameraQuat: THREE.Quaternion;
    prevControlsTarget: THREE.Vector3;

    /** Last spawned ship; persists after exit so user can re-enter it. */
    knownShip: Spaceship | null;

    /** True while any thrust key (W/S/Shift) was held this frame. */
    thrustActive: boolean;

    /** Camera reference frame quaternion, independent of ship mesh banking. */
    flightCameraQuat: THREE.Quaternion;

    /** True while LMB is held during flight — fires weapon particles each frame. */
    isFiring: boolean;

    /** True while ALT is held — camera orbits the ship instead of steering it. */
    altOrbitActive: boolean;

    /** Accumulated yaw offset (radians) for the ALT orbit camera, in ship-local space. */

    altOrbitYaw: number;

    /** Accumulated pitch offset (radians) for the ALT orbit camera, in ship-local space. */
    altOrbitPitch: number;

    /** The body currently under the steering line tip in flight mode. Set by PlanetNameIndicator each frame. */
    steeringHoveredBody: Body | null;

    /** Seconds the E key has been held over the current hovered body (0 → FLIGHT_AUTOPILOT_CHARGE_TIME). */
    autopilotCharge: number;
}

/**
 * Interaction state interface, defining the structure for tracking user input and manipulation states within the simulation.
 */
export interface IInteractionState {
    isRepositioning: boolean;
    isChangingVelocity: boolean;
    isMiddleMouseVelocity: boolean;
    isMouseLookActive: boolean;
    isDragging: boolean;

    activeAxis: string | null;
    wasRunningBeforeDrag: boolean;

    dragTarget: Body | null;
    dragCameraOffset: THREE.Vector3;
    dragPlane: THREE.Plane;

    // Velocity editing UX
    velocityEditMode: 'xz' | 'y';
    velocityEditHadRunningBeforeDrag: boolean;

    // Drag tracking for repositioning
    dragStartIntersection: THREE.Vector3 | null;
    dragStartPosition: THREE.Vector3 | null;

    // Touch camera gesture state (mobile)
    isTouchGestureActive: boolean;
    touchGestureMode: 'rotate' | 'pinch' | null;
    lastTouchX: number;
    lastTouchY: number;
    lastPinchDist: number;

    // Mobile: ignore synthetic mouse events after touch
    touchIgnoreUntil: number;
}

/**
 * Camera state interface, defining the structure for tracking the current state and controls of the camera within the simulation.
 */
export interface ICameraState {
    isFreeCameraMode: boolean;
    isLookAtMode: boolean;
    lockToSun: boolean;

    // Target mode controls gizmo visibility behavior
    isTargetMode: boolean;

    // Legacy/debug identifier
    focusID: string;

    // Canonical camera focus target
    focusBody: Body | null;

    offset: THREE.Vector3;
    lastPlanetAngle: number;

    speed: number;
    rotationSpeed: number;

    keys: {
        w: boolean;
        a: boolean;
        s: boolean;
        d: boolean;
        c: boolean;
        e: boolean;
        space: boolean;
        shift: boolean;
    };

    arrowKeys: {
        left: boolean;
        right: boolean;
        up: boolean;
        down: boolean;
    };

    pendingCollisionFocusBody: Body | null;
}

/**
 * Autopilot state and phase information used to control the ship's automatic navigation behavior
 */
export type AutopilotPhase =
    | 'ALIGN'
    | 'WARP_CHARGING'
    | 'WARP'
    | 'APPROACH'
    | 'BRAKE'
    | 'CIRCULARIZE'
    | 'TIDAL_LOCK';

/**
 * Represents the state of the autopilot, including its activity status, target body, current phase, and various timers.
 */
export interface IAutopilotState {
    isActive: boolean;
    targetBody: Body | null;
    phase: AutopilotPhase | null;
    /** Stable-orbit notification timer (seconds remaining to display). */
    orbitNotifyTimer: number;
    /** True while the approach phase is using boost speed. */
    isBoostActive: boolean;
    /** Distance from target when BRAKE phase started — used to compute the
     *  0→1 blend factor that rotates the desired velocity from 'stop' to
     *  'orbital velocity' as the ship closes on the orbit radius. */
    brakeEntryDistance: number;
}

/**
 * Represents a space background texture, including its display name and the filename of the texture image.
 */
export interface ISpaceBackground {
    name: string;
    filename: string;
}

/**
 * Represents the result of a procedural generator prompt, including the seed used for generation.
 */
export interface IProceduralGeneratorPromptResult {
    seed: string;
}

/**
 * Represents the options that can be specified when a body dies, such as whether to play the weapon impact sound effect.
 */
export interface IDeathOptions {
    skipImpactSound?: boolean;
    skipExplosion?: boolean;
}

export interface IFlightControlContext {
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;

    // UI
    uiManager: UIManager;

    // Steering / flight UI geometry (mutable buffer / meshes created once in index.ts)
    flightSteeringLine: THREE.Line;
    steeringLinePositions: Float32Array;
    steeringEndMarker: THREE.Mesh;
    steeringOriginMarker: THREE.Mesh;
    steeringLineGeo: THREE.BufferGeometry;
    flightCrosshair: THREE.LineSegments;
    flightHUD: FlightHUD;
    speedSprite: THREE.Sprite | null;

    refreshBodiesTable: () => void;
    addEvent: (event: { message: string; notificationType: NotificationType }) => void;
}

export interface IAutopilotContext {
    flightHUD: FlightHUD;
    addEvent: (event: {
        message: string;
        notificationType: NotificationType;
        logMethod?: LogMethods;
    }) => void;
    refreshBodiesTable: () => void;
    setAutopilotState: (active: boolean, canEngage: boolean) => void;
}

/**
 * Interface representing the handling characteristics of a spaceship, including its flight performance and steering feel parameters.
 *
 * All ships share the same set of tunable values.  A Starfighter handles differently
 * from a Freighter by choosing different numbers, not different mechanics.
 */
export interface ISpaceshipHandling {
    // ── Thrust / speed ────────────────────────────────────────────────
    flightMaxSpeed: number;
    flightThrustAccel: number;
    flightThrustDecel: number;
    flightThrustDecelTolerance: number;

    // ── Boost ─────────────────────────────────────────────────────────
    flightBoostMaxSpeed: number;
    flightBoostAccel: number;
    flightBoostDecel: number;

    // ── Warp ──────────────────────────────────────────────────────────
    flightWarpSpeed: number;
    flightWarpAccel: number;
    flightWarpDecel: number;
    flightWarpDecelTolerance: number;

    // ── Perpendicular drift decay (simple mode) ───────────────────────
    flightPerpDecay: number;

    // ── Steering feel ─────────────────────────────────────────────────
    flightMaxPointerOffset: number;  // pixels before reaching full turn rate
    flightMaxTurnRate: number;       // radians/s at full pointer deflection
    flightSteerSmoothRate: number;   // exponential-decay rate (per second)
    flightSteerDeadzone: number;     // normalised dead zone (0–1)

    // ── Roll ──────────────────────────────────────────────────────────
    flightRollSpeed: number;   // max roll angular velocity (rad/s)
    flightRollAccel: number;   // how fast roll ramps up (rad/s²)
    flightRollFriction: number; // how fast roll decays when key released (rad/s²)

    // ── Visual banking ────────────────────────────────────────────────
    flightBankLerpSpeed: number; // exponential-decay rate for banking animation (per second)
    flightMaxBankAngle: number;  // max visual roll angle (rad)
    flightMaxBankPitch: number;  // max visual pitch angle (rad)

    // ── Misc ──────────────────────────────────────────────────────────
    flightWarpChargeTime: number; // seconds to hold Space before warp engages
}
/** Per-ship weapon tuning — passed to ShipWeapon constructor. */
export interface IWeaponConfig {
    // ── Projectile physics ────────────────────────────────────────────
    /** Speed added on top of ship velocity (units/s). */
    baseSpeed: number;
    /** Seconds before a bolt fizzles. */
    particleLifetime: number;

    // ── Visuals ───────────────────────────────────────────────────────
    /** World-space length of each bolt line segment. */
    boltLength: number;
    /** Hex colour for bolts and the glow point. */
    boltColor: number;
    /** World-space size of the glowing head sprite (perspective-correct). */
    boltHeadSize: number;

    // ── Rate & damage ─────────────────────────────────────────────────
    /** Maximum bolts fired per second. */
    fireRate: number;
    /** HP damage dealt on impact. */
    damage: number;

    // ── Optional overrides ────────────────────────────────────────────
    /** Maximum simultaneous in-flight bolts (default 800). */
    maxProjectiles?: number;
    /** Called once per bolt fired; defaults to playWeaponFire() if omitted. */
    fireSound?: () => void;
}

/**
 * Result returned by Spaceship.advanceWarpSpeed() after each physics step.
 * The caller uses this to update UI/HUD without duplicating the phase-transition logic.
 *
 * - `phase`: the active phase after this step ('warp_active', 'warp_decel', 'boost_decel', or 'idle')
 * - `forwardSpeed`: the ship's velocity projected onto `forward` after the step
 * - `decelDone`: true when a deceleration phase just completed and its flag was cleared.
 *   For warp_decel, the ship auto-starts boost_decel — the caller can override by
 *   setting boostDecelerating = false (e.g. when shift is held in manual flight).
 */
export interface IWarpStepResult {
    phase: 'warp_active' | 'warp_decel' | 'boost_decel' | 'idle';
    forwardSpeed: number;
    decelDone: boolean;
}
