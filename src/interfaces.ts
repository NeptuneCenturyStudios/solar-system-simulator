import * as THREE from 'three';
import { Body } from './bodies/body';
import { ParticleExplosion } from './effects/particle-explosion';
import { Supernova } from './effects/supernova';
import { PlanetaryNebula } from './effects/planetary-nebula';
import { CoordinateGizmo } from './gizmos/coordinate-gizmo';
import { IPipelineFeedEffect } from './effects/effect-base';
import { NotificationType } from './event-log/event-log';
import { BodyTypeEnum, MoonTypeEnum, PlanetTypeEnum } from './bodies/body-enums';
import { ITidalLockOptions } from './bodies/celestial-body';
import { EffectiveGForce } from './types';
import { Spaceship } from './bodies/spaceship';
import { ImpactShockwave } from './effects/impact-shockwave';

/**
 * Options for configuring an atmosphere on a celestial body, including its radius and tint color.
 */
export interface IAtmosphereOptions{
    radius: number;
    tint: number;
}

/**
 * The interface for a solar system, containing an array of celestial bodies and a space texture.
 */
export interface ISolarSystem{
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

    /** Current angular roll velocity (rad/s). Decays when key released. */
    rollVelocity: number;

    /** Smoothed steering values in [-1, 1]. Lerp toward raw target each frame. */
    steerX: number;
    steerY: number;

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

    /** Seconds space bar has been held in flight mode. */
    warpCharge: number;

    /** True while space bar is being held down to charge warp. */
    warpCharging: boolean;

    /** True when warp speed is active. */
    warpActive: boolean;

    /** True while decelerating back from warp speed. */
    warpDecelerating: boolean;

    /** True while rapidly decelerating from boost speed back to normal max. */
    boostDecelerating: boolean;

    /** Camera reference frame quaternion, independent of ship mesh banking. */
    flightCameraQuat: THREE.Quaternion;

    /** Visual roll offset of ship mesh relative to camera frame (radians). */
    shipBankRoll: number;

    /** Visual pitch offset of ship mesh relative to camera frame (radians). */
    shipBankPitch: number;

    /** True while LMB is held during flight — fires weapon particles each frame. */
    isFiring: boolean;

    /** Whether Shift was held on the previous frame. */
    prevShiftHeld: boolean;
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
    | 'CIRCULARIZE';

/**
 * Represents the state of the autopilot, including its activity status, target body, current phase, and various timers.
 */
export interface IAutopilotState {
    isActive: boolean;
    targetBody: Body | null;
    phase: AutopilotPhase | null;
    /** Stable-orbit notification timer (seconds remaining to display). */
    orbitNotifyTimer: number;
    /** True while the autopilot WARP phase is active (post-charge). */
    isWarpActive: boolean;
    /** Accumulated charge time (seconds) during the WARP_CHARGING phase. */
    warpChargeTimer: number;
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

export interface IProceduralGeneratorPromptResult {
    seed: string;
}