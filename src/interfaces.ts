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
import type { CelestialBody } from './bodies/celestial-body';
import { ITidalLockOptions } from './bodies/celestial-body';
import { EffectiveCSpeed, EffectiveGForce } from './types';
import { Spaceship } from './bodies/ships/spaceship';
import { ImpactShockwave } from './effects/impact-shockwave';
import { FlightHUD } from './drawing/flight-hud';
import type { HudSprite } from './drawing/hud/hud-sprite';
import { Weapon } from './ship-effects/weapons/weapon';
import type { IPlanetaryAttributes } from './bodies/body-attributes';

/**
 * Options for configuring an atmosphere on a celestial body, including its radius and tint color.
 */
export interface IAtmosphereOptions {
    radius: number;
    tint: number;
    /** Density at the surface, on the abstract scale documented at
     *  ATMOSPHERE_DEFAULT_SURFACE_DENSITY (1.0 = "Earth-like" reference). Falls off toward 0
     *  with altitude — see computeAtmosphericDensity in src/physics/atmosphere-density.ts.
     *  Omitted → ATMOSPHERE_DEFAULT_SURFACE_DENSITY. */
    density?: number;
}

/**
 * Dipole magnetic field of a celestial body.
 *
 * Drives the aurora effect, which derives its magnetic axis and its intensity from
 * these values — see `CelestialBody.refreshAurora()`. The magnetic axis is expressed
 * relative to the body's rotation axis, so `tilt` and `azimuth` here are offsets from
 * `IRotation`, not world-space angles.
 */
export interface IMagneticFieldOptions {
    /** Surface equatorial dipole field strength, in gauss. Earth ≈ 0.305 G. */
    strength: number;
    /** Dipole tilt away from the body's rotation axis, in degrees (0 = aligned). */
    tilt: number;
    /** Rotation of the tilt direction about the rotation axis, in degrees. */
    azimuth: number;
    /**
     * Displacement of the dipole centre from the body centre, as a fraction of the
     * body radius. 0 = centred. Neptune is the extreme real case at ≈0.55.
     */
    offset?: number;
    /**
     * True when the dipole moment points opposite the rotation axis, as Earth's does
     * (which is why Earth's geographic north pole is a magnetic south pole).
     */
    reversed?: boolean;
}

/**
 * The interface for a solar system, containing an array of celestial bodies and a space texture.
 */
export interface ISolarSystem {
    bodies: Body[];
    /** The space texture representing the background of the solar system. Can be null if not yet generated. */
    spaceTexture: ISpaceBackground;
}

/**
 * Camera framing a generator can request once its system is live.
 */
export interface ILaunchCameraOptions {
    /** Body the camera focuses on and follows. */
    focusBody: Body;
    /** Distance from the focus body to place the camera, in sim units. */
    distance: number;
    /** Direction from the focus body to the camera. Normalized when applied. */
    viewDirection: THREE.Vector3;
}

/**
 * Launch-time settings a generator can request. Every field is optional; a generator
 * that needs none of them returns an empty object.
 */
export interface ISystemLaunchOptions {
    /** Time scale applied once the system is live. */
    timeScale?: number;
    /** Camera framing applied once the system is live. */
    camera?: ILaunchCameraOptions;
    /** A ship (also present in `bodies`) the player is put into flight mode in immediately. */
    playerShip?: Spaceship;
}

/**
 * A track a scenario wants played while it is running.
 *
 * Declared by the scenario itself so any scenario can supply its own music
 * without the audio layer knowing about it. The scenario manager hands this to
 * the registered {@link IScenarioAudio} hook when the scenario starts.
 */
export interface IScenarioMusic {
    /** Resolved asset URL of the track. */
    url: string;
    /** When true the track repeats for as long as the scenario runs. */
    loop: boolean;
}

/**
 * Music control surface a scenario manager uses to start/stop a scenario's track.
 * Implemented in index.ts on top of the AmbientSoundManager, so scenarios and the
 * manager stay decoupled from the concrete audio implementation.
 */
export interface IScenarioAudio {
    /**
     * Replace the currently playing ambient track with the given scenario track.
     * While active, the ambient playlist does not advance.
     * @param loop When true the track repeats forever.
     */
    playOverride(url: string, loop?: boolean): void;
    /** Drop the active scenario track and fade back into ambient playback. */
    releaseOverride(): void;
}

/**
 * UI actions a scenario can refuse while it is running. Checked at the actual
 * mutation choke points (body create/edit/delete), not just at the button —
 * so the keyboard Delete key is covered too. Extend this enum as new lockable
 * actions are needed (e.g. whole-panel locks).
 */
export enum ScenarioLock {
    AddBody = 'addBody',
    EditBody = 'editBody',
    DeleteBody = 'deleteBody',
}

/**
 * Per-frame scenario logic, driven by the scenario manager for as long as the
 * generated system is live.
 */
export interface IScenario {
    /** Display name, used for logging. */
    readonly name: string;
    /**
     * Optional track to play while this scenario runs. Omitted/null leaves the
     * ambient music untouched. Handled by the scenario manager, not the scenario.
     */
    readonly music?: IScenarioMusic | null;
    /**
     * Actions the UI should refuse while this scenario is running. Omitted/empty
     * means nothing is locked. A scenario may mutate this array at runtime if it
     * needs its locks to change mid-run.
     */
    locks?: ScenarioLock[];
    /** Called once, after the generated bodies are live in the simulation. */
    start(): void;
    /**
     * Called once per rendered frame.
     * @param simDt Sim-time seconds advanced this frame (0 while paused).
     */
    update(simDt: number): void;
    /**
     * Called on teardown. Releases anything the scenario holds; does not kill bodies,
     * since the system teardown already disposes them.
     */
    dispose(): void;
}

/**
 * What every SolarSystemGenerator returns: the generated system, the launch options it
 * wants applied, and the scenario (if any) the scenario manager should run.
 */
export interface ISolarSystemGenerationResult {
    system: ISolarSystem;
    options: ISystemLaunchOptions;
    scenario: IScenario | null;
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
    /** AI-piloted (non-player) ships currently in the simulation.
     *  Maintained by simulation/ai/npc-manager.ts; always a subset of `bodies`. */
    npcShips: Spaceship[];
}

/**
 * Virtual control surface for a single ship — the ship-level equivalent of the
 * player's keyboard/mouse state.  Written either by the player input path
 * (updateFlightControls) or by a ShipAI, and read by the ship's own flight
 * control methods.  Nothing downstream knows or cares which one wrote it, so an
 * AI-piloted ship goes through exactly the same handling as a piloted one.
 */
export interface IShipControlInput {
    /** Forward thrust — the "W" key for the player. */
    thrust: boolean;
    /** Boost — the "Shift" key for the player. */
    boost: boolean;
    /** Reverse / decelerate — the "S" key for the player. */
    brake: boolean;
    /** Roll left — the "A" key for the player. */
    rollLeft: boolean;
    /** Roll right — the "D" key for the player. */
    rollRight: boolean;
    /** Horizontal steering, already normalised to [-1, 1] AND past the deadzone. */
    steerX: number;
    /** Vertical steering, already normalised to [-1, 1] AND past the deadzone. */
    steerY: number;
    /** Trigger held — the left mouse button for the player. */
    fire: boolean;
    /**
     * World-space unit direction the mounted weapons are aimed along — the player's reticle
     * bearing, or a ShipAI's firing solution.
     *
     * Meaningful ONLY while `fire` is true. There is no sentinel "not aiming" direction — a
     * zeroed or default vector would read as a live aim along world +Z to anything that forgot
     * to check the trigger — so `resetControlInput()` deliberately leaves this field alone and
     * disarms the ship by clearing `fire` instead. Consumers gate on `fire` and on
     * `aimDir.lengthSq() > 0`.
     */
    aimDir: THREE.Vector3;
    /**
     * Warp intent — the "Space" key for the player, but held as a *level* rather
     * than an edge: true means "I want warp", false means "I don't".
     *
     * The player's Space key is edge-triggered (press to charge, press again to
     * disengage) and is handled directly by the key handler in index.ts, which
     * never writes this field. A ShipAI instead holds the level and lets
     * `Spaceship.updateWarpIntentState()` turn the rising and falling edges into
     * exactly the same charge/engage/cancel/decel calls the key handler makes.
     */
    warp: boolean;
}

/**
 * Plain, serialisable snapshot of the simulation's scalar controls.
 * Consumed by the Vue UI bridge to mirror P-key / toolbar state instantly.
 */
export interface ISimStateSnapshot {
    timeScale: number;
    savedTimeScale: number;
    isPaused: boolean;
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
    tidalLock?: ITidalLockOptions;
}

/**
 * Options for creating a comet, extending the orbital-body options with the
 * comet-tail main color. Kept separate from IOrbitalBodyCreationOptions so
 * `tailColor` isn't exposed to non-comet bodies.
 */
export interface ICometCreationOptions extends ICelestialBodyCreationOptions {
    tailColor?: number;
}

export interface ICelestialBodyCreationOptions extends IOrbitalBodyCreationOptions {
    mesh?: THREE.Mesh;
    hasRings?: boolean;
    atmosphere?: IAtmosphereOptions;
    /** Dipole magnetic field, or omitted/null when the body has no global field. */
    magneticField?: IMagneticFieldOptions | null;
    /** Deterministic seed used to derive procedural textures and other procedural features at runtime. */
    seed?: string;
    /** Hidden/discoverable planetary science data. Omitted entirely for subtypes where none
     *  of this applies (ships, satellites, wormholes, black holes). */
    attributes?: IPlanetaryAttributes;
    /**
     * Body this orbits, used as the reference frame for CelestialBody.getOrbitalPeriod().
     * When omitted, falls back to `tidalLock.target` (so moons/satellites need no extra
     * wiring), and finally to null (no derivable orbital period).
     */
    orbitParent?: CelestialBody | null;
    /**
     * Mass of the system barycenter, for bodies on a P-type (circumbinary) orbit with no
     * single physical parent body. Used by getOrbitalPeriod() only when `orbitParent` is
     * omitted/null; the barycenter itself is treated as fixed at the world origin with zero
     * velocity, matching the existing "P-type orbits use the system barycenter (always at
     * origin)" convention already used for orbital-speed calculation in planet-generator.ts.
     */
    orbitBarycenterMass?: number;
}

/**
 * Station-keeping tuning for a satellite, grouped the same way ISpaceshipHandling groups a ship's
 * flight characteristics so a vehicle's feel lives in one object rather than scattered across the
 * class. Accelerations are u/s², speeds u/s, radii u, the turn rate rad/s and the gain 1/s.
 */
export interface ISatelliteHandling {
    /** Maximum acceleration available when the autopilot needs to gain speed (u/s²). */
    maxThrustAccel: number;
    /** Maximum deceleration available when the autopilot needs to shed speed (u/s²). */
    thrustDecel: number;
    /**
     * Maximum rate the autopilot may rotate the velocity vector by (rad/s). Rotating a velocity of
     * magnitude v at this rate is a lateral acceleration of v·ω, so this is effectively a second
     * thrust budget and should stay within the same order as `maxThrustAccel / orbitalSpeed` — see
     * SATELLITE_MAX_TURN_RATE in consts.ts.
     */
    maxTurnRate: number;
    /** Altitude loss below the target radius that triggers a correction (u). */
    orbitDecayTolerance: number;
    /** Radius error the correction must reach before it disengages again (u). */
    orbitHoldTolerance: number;
    /** Cap on the commanded outward radial speed while climbing (u/s). */
    maxClimbRate: number;
    /** Proportional gain mapping altitude deficit to commanded climb speed (1/s). */
    climbGain: number;
    /** Radius error past which the autopilot re-baselines instead of correcting (u). */
    maxStationKeepingDeviation: number;
}

export interface ISatelliteCreationOptions extends ICelestialBodyCreationOptions {
    distance: number;
    angle?: number;
    inclinationDeg?: number;
    yVariation?: number;
    /**
     * Body this satellite orbits, used as the reference frame for station-keeping. Supplying it
     * enables the autopilot; when omitted, the satellite falls back to `tidalLock.target` and, if
     * that is absent too, simply never station-keeps.
     */
    orbitParent?: CelestialBody;
    /** Station-keeping tuning. Defaults to DEFAULT_SATELLITE_HANDLING when omitted. */
    handling?: ISatelliteHandling;
}

/**
 * Fresh, isolated travel-phase tuning for a Probe's own TRAVEL/INSERT autopilot. Deliberately
 * unrelated to ISatelliteHandling (which a Probe still uses, unmodified, once it reaches orbit
 * for station-keeping) or ISpaceshipHandling — a probe has no boost/warp tier, just these four
 * numbers. Speeds are u/s, accelerations u/s², the turn rate rad/s.
 */
export interface IProbeHandling {
    maxSpeed: number;
    turnRate: number;
    accel: number;
    decel: number;
}

export interface IProbeCreationOptions extends ISatelliteCreationOptions {
    /** Travel-phase tuning. Defaults to DEFAULT_PROBE_HANDLING when omitted. */
    probeHandling?: IProbeHandling;
    /** The body this probe is dispatched to orbit and scan. */
    missionTarget: CelestialBody;
    /** Desired circular-orbit altitude above missionTarget's surface, in km. */
    altitudeKm: number;
}

export interface IMoonCreationOptions extends ISatelliteCreationOptions {
    moonType: MoonTypeEnum;
    texture?: THREE.Texture;
}

export interface IPlanetCreationOptions extends ICelestialBodyCreationOptions {
    bodySubtype: PlanetTypeEnum;
    atmosphere?: IAtmosphereOptions;
}

/**
 * Options for creating a spaceship, including its physical properties, position, velocity, and handling characteristics.
 */
/** Per-ship-type shield tuning. */
export interface IShipShieldConfig {
    /** Max shield HP as a multiple of the hull's maxHealthPoints. */
    hullMultiplier: number;
    /** Sim-seconds for the shield to refill to full after the last hit, regardless of how much was lost. */
    rechargeTime: number;
}

export interface ISpaceshipCreationOptions extends IBodyCreationOptions {
    radius: number;
    mass: number;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    id: string;
    mesh: THREE.Mesh;
    handling: ISpaceshipHandling;
    weapons: Weapon[];
    /** Hull HP, set explicitly per ship type instead of derived from mass. Ship
     *  masses are real-world kg scaled by the same MASS_SCALE used for planetary
     *  masses, so mass * HP_MASS_MULTIPLIER (Body's default) would land many
     *  orders of magnitude below 1 HP — any hit would instantly destroy the ship. */
    healthPoints: number;
    /** Shield layer that absorbs damage before the hull. */
    shield: IShipShieldConfig;

    /** Registry id of the ship type (must match IShipType.id in ship-registry.ts).
     *  Used to detect when the user selects a different ship class than the one
     *  currently spawned, so the old ship can be destroyed and replaced. */
    shipTypeId: string;

    /** Local-space offset for the 1st-person cockpit camera. When omitted, the
     *  offset is derived from the loaded model's bounding box after it loads. */
    cockpitOffset?: THREE.Vector3;
    /** Local-space offset for the 3rd-person chase camera. When omitted, a
     *  radius-scaled default is used. */
    thirdPersonOffset?: THREE.Vector3;
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
    /** Show or hide the Vue PanelManager (toolbar + System Explorer/panels). */
    setPanelManagerVisible: (visible: boolean) => void;
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

    // Canonical camera focus target
    focusBody: Body | null;

    // When the focused body is destroyed/deleted, this holds its last position so the
    // camera keeps orbiting there instead of snapping to the scene center. Look At is
    // left enabled, and this is used as the orbit target until a new body is selected.
    frozenFocusPosition: THREE.Vector3 | null;

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

    // Smooth Zoom (orbit mode). Non-null while an eased zoom is in flight; the
    // per-frame step (index.ts `stepSmoothZoom`, invoked from animation-loop.ts)
    // eases the camera's distance from the resolved pivot toward this value and
    // clears both fields once it arrives (or once another system — free camera,
    // surface mode, flight mode — takes over the camera transform).
    targetZoomDistance: number | null;
    // The `target` argument zoomRelativeToTarget was called with when this zoom
    // began (null = scene center / frozen focus, same semantics as that
    // parameter). Used both to re-resolve the live pivot position every eased
    // frame and to detect "same pivot" vs. "pivot changed" on the next zoom
    // request (same pivot chains off the pending target distance; a changed
    // pivot restarts from the live camera distance).
    zoomPivotBody: Body | null;

    // Smooth Zoom (free-camera mode). Remaining dolly translation to apply,
    // eased in over several frames. Null when no zoom animation is pending.
    pendingFreeCamZoom: THREE.Vector3 | null;
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
    /**
     * Relative speed of the collision that caused this death, in sim units (same convention as
     * Body.velocity / dependencies.getC()). When known, scales the explosion's particle/debris
     * speed; omitted for non-collision deaths (weapon kills, manual deletion, etc.).
     */
    impactSpeed?: number;
}

export interface IFlightControlContext {
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;

    // Steering / flight UI geometry (mutable buffer / meshes created once in index.ts)
    flightSteeringLine: THREE.Line;
    steeringLinePositions: Float32Array;
    steeringEndMarker: THREE.Mesh;
    steeringOriginMarker: THREE.Mesh;
    steeringLineGeo: THREE.BufferGeometry;
    flightCrosshair: THREE.LineSegments;
    flightHUD: FlightHUD;
    speedSprite: HudSprite | null;

    addEvent: (event: { message: string; notificationType: NotificationType }) => void;
}

export interface IAutopilotContext {
    flightHUD: FlightHUD;
    addEvent: (event: {
        message: string;
        notificationType: NotificationType;
        logMethod?: LogMethods;
    }) => void;
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
    flightMaxPointerOffset: number; // pixels before reaching full turn rate
    flightMaxTurnRate: number; // radians/s at full pointer deflection
    flightSteerSmoothRate: number; // exponential-decay rate (per second)
    flightSteerDeadzone: number; // normalised dead zone (0–1)

    // ── Roll ──────────────────────────────────────────────────────────
    flightRollSpeed: number; // max roll angular velocity (rad/s)
    flightRollAccel: number; // how fast roll ramps up (rad/s²)
    flightRollFriction: number; // how fast roll decays when key released (rad/s²)

    // ── Visual banking ────────────────────────────────────────────────
    flightBankLerpSpeed: number; // exponential-decay rate for banking animation (per second)
    flightMaxBankAngle: number; // max visual roll angle (rad)
    flightMaxBankPitch: number; // max visual pitch angle (rad)

    // ── Misc ──────────────────────────────────────────────────────────
    flightWarpChargeTime: number; // seconds to hold Space before warp engages
}

/**
 * Result returned by Spaceship.advanceWarpSpeed() after each physics step.
 * The caller uses this to update UI/HUD without duplicating the phase-transition logic.
 *
 * - `phase`: the active phase after this step ('warp_active', 'warp_decel', 'boost_decel', 'stop_brake', or 'idle')
 * - `forwardSpeed`: the ship's velocity projected onto `forward` after the step
 * - `decelDone`: true when a deceleration phase just completed and its flag was cleared.
 *   For warp_decel, the ship auto-starts boost_decel — the caller can override by
 *   setting boostDecelerating = false (e.g. when shift is held in manual flight).
 */
export interface IWarpStepResult {
    phase: 'warp_active' | 'warp_decel' | 'boost_decel' | 'stop_brake' | 'idle';
    forwardSpeed: number;
    decelDone: boolean;
}
