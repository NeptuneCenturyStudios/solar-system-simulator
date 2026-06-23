import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Tell typescript about our custom events that has detail property
declare global {
    interface WindowEventMap {
        'body:added': CustomEvent<{ body: Body; id: string; name: string }>;
        'body:removed': CustomEvent<{ body: Body; id: string; name: string }>;
        'body:dead': CustomEvent<{ body: Body; id: string; name: string }>;
        'body:absorbed': CustomEvent<{ message: string; notificationType: NotificationType }>;
        'body:selected': CustomEvent<{ body: Body; id: string; name: string }>;
        'body:deselected': CustomEvent<{ body: Body; id: string; name: string }>;
        /** Fired when a weapon projectile strikes a body. Future damage systems listen here. */
        'weapon:hit': CustomEvent<{ body: Body; position: THREE.Vector3 }>;
        'camera:focusChanged': CustomEvent<{
            body: Body | null;
            id: string | null;
            name: string | null;
        }>;
    }

    interface Event {
        // Allow different CustomEvent detail payload shapes across the app
        // (e.g. body:* and our new body:absorbed notification).
        detail?: unknown;
    }

    interface Window {
        __updateHintSprite?: () => void;
    }
}

// Import all consts
import {
    SCALE_FACTOR,
    G,
    SUN_MASS,
    PLUTO_DIST,
    MOON_MASS,
    MOON_DIST_FROM_EARTH,
    MOON_RADIUS,
    GIZMO_TUNING,
    KUIPER_BELT_COUNT,
    KUIPER_BELT_INNER_DIST,
    KUIPER_BELT_OUTER_DIST,
    KUIPER_BELT_VERTICAL_SPREAD,
    SimulationStartMode,

    // HUD / sim constants moved from index.ts
    BASE_FRAME_DT,
    CROSSHAIR_SIZE,
    VEL_SCALE,

    // Flight thrust constants still imported for other derived logic
    FLIGHT_THRUST_ACCEL,
    FLIGHT_THRUST_DECEL,
    FLIGHT_BOOST_DECEL,
    FLIGHT_BOOST_MAX_SPEED,
    FLIGHT_MAX_SPEED,
    FLIGHT_WARP_DECEL,
    FLIGHT_WARP_SPEED,
    WARP_FADE_DIST,
    WARP_FULL_VIS_DIST,
    WARP_SHAKE_MAG,
    FLIGHT_BOOST_ACCEL,

    // Flight feel constants moved from index.ts
    FLIGHT_PERP_DECAY,
    FLIGHT_MAX_POINTER_OFFSET,
    FLIGHT_MAX_TURN_RATE,
    FLIGHT_ROLL_SPEED,
    FLIGHT_ROLL_ACCEL,
    FLIGHT_ROLL_FRICTION,
    FLIGHT_STEER_SMOOTH_RATE,
    FLIGHT_STEER_DEADZONE,
    FLIGHT_WARP_CHARGE_TIME,
    FLIGHT_MAX_BANK_ANGLE,
    FLIGHT_MAX_BANK_PITCH,
    FLIGHT_BANK_LERP_SPEED,

    // Autopilot tuning constants moved from index.ts
    AUTOPILOT_APPROACH_SPEED,
    AUTOPILOT_ACCEL,
    AUTOPILOT_DECEL,
    AUTOPILOT_BOOST_DECEL,
    AUTOPILOT_CIRCULARIZE_RATE,
    AUTOPILOT_CIRCULARIZE_GRAVITY_MARGIN,
    AUTOPILOT_BRAKE_PAD,
    AUTOPILOT_ORBIT_ALTITUDE_FACTOR,
    AUTOPILOT_BRAKE_DONE_SPEED,
    AUTOPILOT_MAX_TIMESCALE,
    AUTOPILOT_ORBIT_NOTIFY_DURATION,
    AUTOPILOT_BLOCKED_NOTIFY_DURATION,
    AUTOPILOT_WARP_DECEL,
    AUTOPILOT_APPROACH_MIN_DISTANCE,
    AUTOPILOT_BRAKE_ARC_DIST,
    AUTOPILOT_WARP_THRESHOLD,
    TIME_SCALE,
    SUN_RADIUS,
    DIST_SCALE,
    WEAPON_DAMAGE,
    TEXT_SPRITE_Z,
    FLIGHT_THRUST_DECEL_TOLERANCE,
    FLIGHT_WARP_DECEL_TOLERANCE,
} from './utilities/consts';
import { CoordinateGizmo } from './gizmos/coordinate-gizmo';
import {
    isBodyType,
    createUniqueId,
    generateIAUName,
    getBodyTypeLabel,
} from './utilities/utilities';
import { SeededRandom } from './utilities/prng';
import {
    absorbBody,
    chooseCollisionWinner,
    IAutopilotState,
    setBodyRadius,
    updateSimulation,
} from './physics/physics';
import {
    randomStarParams,
    randomBlackHoleParams,
    randomPlanetParams,
    randomMoonParams,
    randomCometParams,
    randomAsteroidParams,
} from './utilities/body-params';
import {
    loadSrgbTexture,
    fictionalTerrestrialTextures,
    fictionalVolcanicTexture,
    fictionalOceanTexture,
    fictionalFrozenTexture,
    fictionalTemperateTexture,
} from './drawing/textures';
import { Supernova } from './effects/supernova';
import { PlanetaryNebula } from './effects/planetary-nebula';
import { ParticleExplosion } from './effects/particle-explosion';
import { ImpactShockwave } from './effects/impact-shockwave';
import { WarpEffect } from './effects/warp-effect';
import { playWeaponImpact } from './utilities/audio.js';
import { AmbientSoundManager } from './utilities/ambient-sound';
import { triggerScreenFlash } from './effects/screen-flash';
import { GravitationalLensingEffect } from './effects/gravitational-lensing';
import { GridHelperManager } from './gizmos/grid-helper';
import { PositionIndicatorManager } from './gizmos/position-indicator';
import { FlightHUD } from './drawing/flight-hud';
import { VelocityArcManager } from './drawing/velocity-arc';
import { OrbitPredictionManager } from './drawing/orbit-prediction';
import { SurfaceCameraManager } from './camera/surface-camera';
import { Body } from './bodies/body';
import { CelestialBody } from './bodies/celestial-body';
import { Moon } from './bodies/moon';
import { createMoon } from './bodies/create-moon';
import { Mercury } from './bodies/mercury';
import { Venus } from './bodies/venus';
import { Earth } from './bodies/earth';
import { Mars } from './bodies/mars';
import { Jupiter } from './bodies/jupiter';
import { Saturn } from './bodies/saturn';
import { Uranus } from './bodies/uranus';
import { Neptune } from './bodies/neptune';
import { Pluto } from './bodies/pluto';
import { Ceres } from './bodies/ceres';
import { BlackHole } from './bodies/black-hole';
import { Star } from './bodies/star';
import { MainSequenceStar } from './bodies/main-sequence-star';
import { createMainSequenceStarFromParams } from './procedural/star-factory';
import { createPlanetBodyFromProceduralCreation } from './procedural/planet-factory';
import { upgradeProceduralTexture } from './procedural/texture-upgrader';
import { getDesertTexture } from './procedural/desert/desert-texture-generator';
import { Asteroid } from './bodies/asteroid';
import { Comet } from './bodies/comet';

import { Spaceship } from './bodies/spaceship';
import { ShipWeapon } from './ship-effects/ship-weapon';
import { StartupModal } from './ui/startup-modal';
import { ProceduralGeneratorModal } from './ui/procedural-generator-modal';
import { AboutModal } from './ui/about-modal';
import { OptionsPanel } from './ui/options-panel';
import { EventLogEntry, NotificationType } from './event-log/event-log';
import { IFlightState, IStateDependencies } from './interfaces';
import { Sun } from './bodies/sun';
import { GenericComet } from './bodies/generic-comet';
import { UIManager } from './ui/ui-manager';

const jupiterTexture = loadSrgbTexture('./assets/textures/jupiter.jpg');
const saturnTexture = loadSrgbTexture('./assets/textures/saturn.jpg');
const uranusTexture = loadSrgbTexture('./assets/textures/uranus.jpg');
const neptuneTexture = loadSrgbTexture('./assets/textures/neptune.jpg');
const plutoTexture = loadSrgbTexture('./assets/textures/pluto.jpg');
const ceresTexture = loadSrgbTexture('./assets/textures/ceres.jpg');

// Background texture (skydome)
const skydomeTexture = loadSrgbTexture('./assets/textures/stars.jpg');
skydomeTexture.wrapS = THREE.RepeatWrapping;
skydomeTexture.wrapT = THREE.RepeatWrapping;
skydomeTexture.repeat.set(2, 1);

// // Custom/random textures for custom gas giants
// const fictionalGasTextures = [
//     loadSrgbTexture('./assets/textures/fictional_gas_1.jpg'),
//     loadSrgbTexture('./assets/textures/fictional_gas_2.jpg'),
// ];

// // Custom/random textures for custom ice giants
// const fictionalIceTextures = [
//     loadSrgbTexture('./assets/textures/fictional_ice_1.jpg'),
//     loadSrgbTexture('./assets/textures/fictional_ice_2.jpg'),
// ];

// Custom/random atmosphere textures (used for custom mode planets/moons when "Has Atmosphere" is checked)
const fictionalAtmosphereTextures = [
    loadSrgbTexture('./assets/textures/fictional_atmosphere_1.jpg'),
    loadSrgbTexture('./assets/textures/fictional_atmosphere_2.jpg'),
];

// Note: Ctrl+W cannot be prevented due to browser security restrictions
// Browsers intentionally allow users to always close tabs with Ctrl+W
// See: https://stackoverflow.com/questions/21695682/is-it-possible-to-catch-ctrlw-shortcut-and-prevent-tab-closing

// Warn user before closing the tab/window
window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = ''; // Chrome requires returnValue to be set
    return ''; // Some browsers use the return value
});

// Function to create/update body stats texture

const scene = new THREE.Scene();

// --- Skydome background ---
// A huge inverted sphere that always follows the camera, giving a textured space background.
// This is separate from the point-starfield so users can toggle each independently.
const skydomeGeometry = new THREE.SphereGeometry(3_000_000_000 / DIST_SCALE, 48, 24);
const skydomeMaterial = new THREE.MeshBasicMaterial({
    map: skydomeTexture,
    side: THREE.BackSide,
    depthWrite: false,
});
const skydome = new THREE.Mesh(skydomeGeometry, skydomeMaterial);
skydome.renderOrder = -1000;
scene.add(skydome);

// === Ambient light from stars (base level of illumination) ===
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// --- Camera and renderer setup ---
const CAMERA_FAR_PLANE =
    PLUTO_DIST + (300000000 / DIST_SCALE) * SCALE_FACTOR + (2000000000 / DIST_SCALE) * SCALE_FACTOR;
const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.00001,
    CAMERA_FAR_PLANE
);
const MAX_ZOOM_OUT_DISTANCE = camera.far * 0.8;
const MAX_CAMERA_VIEW_DISTANCE = camera.far * 0.98;
const INITIAL_CAMERA_DISTANCE = SUN_RADIUS * 8;
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true }); // Better depth precision at extreme scales
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Must be true to initialize shadow infrastructure
renderer.shadowMap.type = THREE.VSMShadowMap; // Better for large-scale shadows
document.body.appendChild(renderer.domElement);

const lensingEffect = new GravitationalLensingEffect(renderer);

// Create orthographic camera and scene for 2D UI overlay
const uiScene = new THREE.Scene();
const uiCamera = new THREE.OrthographicCamera(
    -window.innerWidth / 2,
    window.innerWidth / 2,
    window.innerHeight / 2,
    -window.innerHeight / 2,
    1,
    10
);
uiCamera.position.z = 10;

import Noty from 'noty';
import 'noty/lib/noty.css';
import { createFPSTexture, createSpeedTexture, createStatsTexture } from './drawing/text-rendering';
import { SolarSystemGenerator } from './procedural/solar-system-generator';
import { ProceduralGenerator } from './procedural/procedural-generator';
import { NormalSolarSystemGenerator } from './procedural/normal-solar-system-generator';
import { BlackHoleSystemGenerator } from './procedural/black-hole-system-generator';
import { BodyTypeEnum, MoonTypeEnum, PlanetTypeEnum } from './bodies/body-enums';
import { EffectiveGForce } from './types';

// ── URL seed parameter helpers ──────────────────────────────────────────────
const SEED_TYPE_NORMAL = 'normal';
const SEED_TYPE_BLACKHOLE = 'blackhole';

/** Current seed value (with type prefix) that was last pushed to the URL. */
let _lastPushedSeedValue: string | null = null;

interface ParsedSeed {
    type: 'normal' | 'blackhole';
    seed: string;
}

function parseSeedFromURL(): ParsedSeed | null {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('seed');
    if (!raw) return null;

    const underscoreIdx = raw.indexOf('_');
    if (underscoreIdx <= 0) return null;

    const type = raw.substring(0, underscoreIdx);
    const seed = raw.substring(underscoreIdx + 1);
    if (!seed) return null;

    if (type === SEED_TYPE_NORMAL) {
        return { type: 'normal', seed };
    }
    if (type === SEED_TYPE_BLACKHOLE) {
        return { type: 'blackhole', seed };
    }
    return null;
}

function buildSeedValue(type: 'normal' | 'blackhole', seed: string): string {
    return `${type}_${seed}`;
}

function updateURLWithSeed(type: 'normal' | 'blackhole', seed: string): void {
    const value = buildSeedValue(type, seed);
    if (value === _lastPushedSeedValue) return;
    _lastPushedSeedValue = value;
    const url = new URL(window.location.href);
    url.searchParams.set('seed', value);
    window.history.pushState({ seed: value }, '', url.toString());
}

function clearURLSeed(): void {
    _lastPushedSeedValue = null;
    const url = new URL(window.location.href);
    if (url.searchParams.has('seed')) {
        url.searchParams.delete('seed');
        window.history.replaceState({ seed: null }, '', url.toString());
    }
}

// --- Event notifications (replaces sprite-based event log) ---
function addEvent(event: { message: string; notificationType: NotificationType }) {
    const entry = new EventLogEntry(event.message, event.notificationType);

    // Add the event message to the console as well for better visibility
    console.info(entry.message);

    // Not using Noty for now. Need to think of better event system. Maybe a log window?
    // new Noty({
    //     type: entry.notificationType,
    //     theme: 'semanticui',
    //     layout: 'topCenter',
    //     text: entry.message,
    //     timeout: 3500,
    //     progressBar: false,
    //     closeWith: ['click', 'button'],
    //     queue: 'solar-event-log',
    //     //killer: true,
    // }).show();
}

// Keep queue bounded to avoid a burst of notifications freezing the UI.
Noty.setMaxVisible(4, 'solar-event-log');

// --- Flight mode steering line (drawn in uiScene screen space) ---
// A line from the ship's projected aim point to the current pointer offset.
const steeringLinePositions = new Float32Array(6); // 2 points × 3 coords
const steeringLineGeo = new THREE.BufferGeometry();
steeringLineGeo.setAttribute('position', new THREE.BufferAttribute(steeringLinePositions, 3));
const flightSteeringLine = new THREE.Line(
    steeringLineGeo,
    new THREE.LineBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
    })
);
flightSteeringLine.frustumCulled = false;
flightSteeringLine.visible = false;
uiScene.add(flightSteeringLine);

// Small static crosshair at the projected aim point (visible even when offset is zero).
// Four vertices: left–right and top–bottom arm pairs for a + shape.
const crosshairPositions = new Float32Array([
    -CROSSHAIR_SIZE,
    0,
    TEXT_SPRITE_Z,
    CROSSHAIR_SIZE,
    0,
    TEXT_SPRITE_Z, // horizontal arm
    0,
    -CROSSHAIR_SIZE,
    TEXT_SPRITE_Z,
    0,
    CROSSHAIR_SIZE,
    TEXT_SPRITE_Z, // vertical arm
]);
const crosshairGeo = new THREE.BufferGeometry();
crosshairGeo.setAttribute('position', new THREE.BufferAttribute(crosshairPositions, 3));
const flightCrosshair = new THREE.LineSegments(
    crosshairGeo,
    new THREE.LineBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
        depthWrite: false,
    })
);
flightCrosshair.visible = false;
uiScene.add(flightCrosshair);

// End-circle marker (aim reticle) at the pointer end of the steering line.
// Kept large so it's easy to aim; driven by pointer offset each frame.
const steeringEndMarker = new THREE.Mesh(
    new THREE.RingGeometry(18, 24, 48),
    new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
    })
);
steeringEndMarker.frustumCulled = false;
steeringEndMarker.visible = false;
uiScene.add(steeringEndMarker);

// Origin circle — large translucent gray ring centred on the ship nose projection.
// Defines the aim boundary; the steering line + aim reticle live inside it.
const steeringOriginMarker = new THREE.Mesh(
    new THREE.RingGeometry(120, 124, 72),
    new THREE.MeshBasicMaterial({
        color: 0xaaaaaa,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
    })
);
steeringOriginMarker.frustumCulled = false;
steeringOriginMarker.visible = false;
uiScene.add(steeringOriginMarker);

// (Ship engine trail is owned by each Spaceship via its ShipTrail property)

// --- Ship weapon (projectile particle system, lives in the main 3D scene) ---
const shipWeapon = new ShipWeapon(scene);

const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(INITIAL_CAMERA_DISTANCE, 12018 * SCALE_FACTOR, INITIAL_CAMERA_DISTANCE); // Scaled for new world size
// Start in "center scene" orbit mode (NONE_FOCUS_POSITION is defined later)
controls.target.set(0, 0, 0);
controls.update();
controls.enableDamping = true;
// Disable OrbitControls mouse bindings; we handle camera rotation ourselves (RMB mouse-look).
// Keep MMB disabled (used for velocity edit in our custom handlers).
// Disable OrbitControls mouse bindings; we handle camera rotation ourselves (RMB mouse-look).
// Touch gestures will still use OrbitControls' built-in handlers.
controls.mouseButtons = {
    LEFT: null,
    MIDDLE: null,
    RIGHT: null,
};

// Touch gestures (mobile)
// ONE finger: rotate camera
// TWO fingers: pinch/dolly zoom (no pan)
controls.enablePan = false;
controls.enableZoom = true;
// Note: OrbitControls touch support seems unreliable on some mobile browsers.
// We still set touches here, but we also add our own custom handlers below.
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

// -------- Mobile touch controls (1-finger rotate, 2-finger pinch zoom) --------
function getTouchDist(t1: Touch, t2: Touch) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
}

function applyOrbitRotationDelta(dx: number, dy: number) {
    // Match existing mouse-look math:
    // - Free camera: quaternion + clamp pitch
    // - Normal orbit: spherical.theta/theta + clamp phi
    // - LookAt: orbit around focus object (or center if none)
    const rotSpeed = cameraState.rotationSpeed;

    if (isFreeCameraMode) {
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(camera.quaternion);
        euler.y -= dx * rotSpeed;
        euler.x -= dy * rotSpeed;
        euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
        camera.quaternion.setFromEuler(euler);
        return;
    }

    const spherical = new THREE.Spherical();

    if (!cameraState.isLookAtMode) {
        const target = NONE_FOCUS_POSITION.clone();
        const offset = camera.position.clone().sub(target);
        spherical.setFromVector3(offset);
        spherical.theta -= dx * rotSpeed;
        spherical.phi -= dy * rotSpeed;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
        offset.setFromSpherical(spherical);

        camera.position.copy(target).add(offset);
        camera.lookAt(target);
        controls.target.copy(target);
        return;
    }

    const focusObj = getFocusObject();
    const target = (() => {
        if (focusObj && simulationState.bodies.includes(focusObj) && !focusObj._isDisposed) {
            return focusObj.mesh.position.clone();
        }
        return NONE_FOCUS_POSITION.clone();
    })();

    const offset = camera.position.clone().sub(target);
    spherical.setFromVector3(offset);
    spherical.theta -= dx * rotSpeed;
    spherical.phi -= dy * rotSpeed;
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
    offset.setFromSpherical(spherical);

    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    controls.target.copy(target);
}

function isTouchOverUI(e: TouchEvent) {
    const touch = e.touches?.[0] ?? e.changedTouches?.[0];
    if (!touch) return false;

    // Determine what is actually under the finger.
    // This avoids blocking touches just because a fixed container overlaps the canvas.
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!(el instanceof Element)) return false;

    // If the finger is on an actual interactive control, allow the click/tap to happen.
    return Boolean(
        el.closest('#startup-overlay, #about-overlay, .modal-overlay, .modal') ||
        el.closest('.ui-panel') ||
        el.closest('button, input, select, textarea, label, a') ||
        el.closest('.toolbar-btn') ||
        el.closest('.old-ui')
    );
}

function onTouchStart(e: TouchEvent) {
    if (flightState.isActive) return;
    if (surfaceCam.isActive) return;
    if (modalBlocksInput()) return;
    if (isTouchOverUI(e)) return;

    e.preventDefault();
    e.stopPropagation();

    interactionState.touchIgnoreUntil = Date.now() + 250;

    const touches = e.touches;
    if (touches.length === 1) {
        interactionState.isTouchGestureActive = true;
        interactionState.touchGestureMode = 'rotate';
        interactionState.lastTouchX = touches[0].clientX;
        interactionState.lastTouchY = touches[0].clientY;
        interactionState.lastPinchDist = 0;
    } else if (touches.length === 2) {
        interactionState.isTouchGestureActive = true;
        interactionState.touchGestureMode = 'pinch';
        interactionState.lastPinchDist = getTouchDist(touches[0], touches[1]);
    }
}

function onTouchMove(e: TouchEvent) {
    if (flightState.isActive) return;
    if (surfaceCam.isActive) return;
    if (!interactionState.isTouchGestureActive) return;
    if (modalBlocksInput()) return;
    if (isTouchOverUI(e)) return;

    e.preventDefault();
    e.stopPropagation();

    const touches = e.touches;

    if (interactionState.touchGestureMode === 'rotate' && touches.length === 1) {
        const x = touches[0].clientX;
        const y = touches[0].clientY;
        const dx = x - interactionState.lastTouchX;
        const dy = y - interactionState.lastTouchY;

        interactionState.lastTouchX = x;
        interactionState.lastTouchY = y;

        if (dx !== 0 || dy !== 0) applyOrbitRotationDelta(dx, dy);
    } else if (interactionState.touchGestureMode === 'pinch' && touches.length === 2) {
        const dist = getTouchDist(touches[0], touches[1]);
        const lastDist = interactionState.lastPinchDist || dist;

        // Spread (dist increases) => zoom in => factor < 1
        const ratio = dist / Math.max(1e-6, lastDist);
        const factor = 1 / ratio;

        // Keep jumps reasonable
        const clamped = Math.max(0.75, Math.min(1.25, factor));
        zoomRelativeToTarget(getZoomTarget(), clamped);

        interactionState.lastPinchDist = dist;
    }
}

function endTouch() {
    interactionState.isTouchGestureActive = false;
    interactionState.touchGestureMode = null;
    interactionState.lastPinchDist = 0;
    interactionState.touchIgnoreUntil = Date.now() + 350;
}

document.addEventListener('touchstart', onTouchStart, { passive: false });
document.addEventListener('touchmove', onTouchMove, { passive: false });
document.addEventListener('touchend', endTouch, { passive: true });
document.addEventListener('touchcancel', endTouch, { passive: true });

// Don't let OrbitControls listen to keyboard - we handle WASD ourselves

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Organize state into cohesive objects
const interactionState = {
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

const cameraState = {
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
    keys: { w: false, a: false, s: false, d: false, c: false, space: false, shift: false },
    arrowKeys: { left: false, right: false, up: false, down: false },
    pendingCollisionFocusBody: null as Body | null,
};

const simulationState = {
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

// --- Flight mode state ---
const flightState: IFlightState = {
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
};

// --- Autopilot state ---
const autopilotState: IAutopilotState = {
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
};

let selectedBody: Body | null = null; // Track selected body for stats/management panel
const gizmo = new CoordinateGizmo(scene); // Single global gizmo instance

// Grid helper and position indicator managers (depend on scene + gizmo being ready)
const gridHelperManager = new GridHelperManager(scene);
gridHelperManager.init();
const posIndicator = new PositionIndicatorManager(scene, gridHelperManager, gizmo);
posIndicator.init();

const dependencies: IStateDependencies = {
    gizmo: gizmo,
    addEvent: addEvent,
    addExplosion: (explosion: ParticleExplosion) => {
        if (!explosion) return;
        // Push into the canonical explosions array that the main loop updates/filters
        simulationState.explosions.push(explosion);
    },
    addSupernova: (supernova: Supernova) => {
        if (!supernova) return;
        supernovas.push(supernova);
    },
    addPlanetaryNebula: (nebula: PlanetaryNebula) => {
        if (!nebula) return;
        planetaryNebulae.push(nebula);
    },
    addBody: (body: Body) => {
        if (!body) return;
        simulationState.bodies.push(body);

        // Notify UI / systems that track live bodies
        try {
            window.dispatchEvent(
                new CustomEvent('body:added', {
                    detail: { body, id: body.id, name: body.name },
                })
            );
        } catch (e) {
            console.error('Error adding body:', e);
        }
    },
    getBodies: () => simulationState.bodies,
    getG: () => (G * simulationState.gMultiplier) as EffectiveGForce,
};

/** Shared tuning constants. */
const SIM = Object.freeze({
    BASE_FRAME_DT,
});

// Physics accuracy: adjustable substeps per frame (16–128, default 64)
let stepsPerFrame = 64;

// --- Velocity editing arc helpers ---
const velArc = new VelocityArcManager(scene, gizmo, interactionState);

// --- Orbit prediction lines ---
const orbitPrediction = new OrbitPredictionManager(scene);
orbitPrediction.resize(window.innerWidth, window.innerHeight);

// Create FPS counter sprite
let fpsSprite: THREE.Sprite | null = null;
let fpsLastUpdate = 0;
function createFPSSprite() {
    const texture = createFPSTexture(60);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    fpsSprite = new THREE.Sprite(material);
    fpsSprite.scale.set(160, 40, 1);

    // Position in screen space (upper-right corner)
    // Orthographic camera uses screen coordinates
    // Account for sprite width (160) and add padding to match top spacing
    fpsSprite.position.set(
        window.innerWidth / 2 - 110, // Right side minus (sprite half-width + padding)
        window.innerHeight / 2 - 30, // Top minus padding
        TEXT_SPRITE_Z
    );

    uiScene.add(fpsSprite);
}
createFPSSprite();

// Create body stats sprite
let statsSprite: THREE.Sprite | null = null;
function createStatsSprite() {
    const texture = createStatsTexture({
        name: '',
        mass: 0,
        radius: 0,
        mesh: { position: new THREE.Vector3() },
        velocity: new THREE.Vector3(),
    } as unknown as Body);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    statsSprite = new THREE.Sprite(material);
    statsSprite.scale.set(450, 400, 1);
    statsSprite.visible = false; // Hidden by default

    // Position below FPS counter
    statsSprite.position.set(
        window.innerWidth / 2 - 255, // Right aligned
        window.innerHeight / 2 - 270, // Below FPS counter (slightly lower to fit extra line)
        TEXT_SPRITE_Z
    );

    uiScene.add(statsSprite);
}
createStatsSprite();

// Flight speed indicator — bottom-right corner, shown only while in flight mode
let speedSprite: THREE.Sprite | null = null;
function createSpeedSprite() {
    const texture = createSpeedTexture(0, false);
    if (!texture) return;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    speedSprite = new THREE.Sprite(material);
    speedSprite.scale.set(400, 400, 1);
    // Bottom-right corner: sprite center is 200px from right/bottom edges + 10px margin
    speedSprite.position.set(
        window.innerWidth / 2 - 210,
        -(window.innerHeight / 2 - 210),
        TEXT_SPRITE_Z
    );
    speedSprite.visible = false;
    uiScene.add(speedSprite);
}
createSpeedSprite();

const ambientMusic = new AmbientSoundManager();
// Start ambient music immediately. If the browser blocks autoplay,
// it falls back to starting on the first user gesture.
ambientMusic.init();
const _retryMusic = (): void => {
    console.log('Retrying ambient music initialization...');
    ambientMusic.init();
    document.removeEventListener('pointerdown', _retryMusic);
    document.removeEventListener('touchstart', _retryMusic);
    document.removeEventListener('keydown', _retryMusic);
};

document.addEventListener('pointerdown', _retryMusic);
document.addEventListener('touchstart', _retryMusic);
document.addEventListener('keydown', _retryMusic);
const warpEffect = new WarpEffect(scene);
const flightHUD = new FlightHUD(
    uiScene,
    autopilotState,
    interactionState,
    cameraState,
    simulationState,
    flightState,
    () => selectedBody
);
flightHUD.init();

// Backward compatibility aliases
let activeAxis: string | null = null;
let isChangingVelocity = false;
let isMiddleMouseVelocity = false;
let timeScale = 1;
let isFreeCameraMode = false;
let isMouseLookActive = false;
let focusID = 'camSun';
let manuallySelectedBody = null as Body | null; // Track bodies clicked in space (without camera buttons)
const NONE_FOCUS_POSITION = new THREE.Vector3(0, 0, 0); // Center of solar system
let isPaused = false;
let savedTimeScale = 1;
let lastT = performance.now();

let supernovas: Supernova[] = []; // Track all supernova effects
let planetaryNebulae: PlanetaryNebula[] = []; // Track all planetary nebula effects

let wasRunningBeforeDrag = false;
let isTilting = false;
let isAzimuthDragging = false;
const dragCameraOffset = new THREE.Vector3();
const dragPlane = new THREE.Plane();

// Synchronize aliases with state objects

Object.defineProperty(window, 'activeAxis', {
    get: () => interactionState.activeAxis,
    set: (v) => {
        interactionState.activeAxis = v;
    },
});
Object.defineProperty(window, 'isChangingVelocity', {
    get: () => interactionState.isChangingVelocity,
    set: (v) => {
        interactionState.isChangingVelocity = v;
    },
});
Object.defineProperty(window, 'isMiddleMouseVelocity', {
    get: () => interactionState.isMiddleMouseVelocity,
    set: (v) => {
        interactionState.isMiddleMouseVelocity = v;
    },
});
Object.defineProperty(window, 'isFreeCameraMode', {
    get: () => cameraState.isFreeCameraMode,
    set: (v) => {
        cameraState.isFreeCameraMode = v;
    },
});
Object.defineProperty(window, 'isMouseLookActive', {
    get: () => interactionState.isMouseLookActive,
    set: (v) => {
        interactionState.isMouseLookActive = v;
    },
});
Object.defineProperty(window, 'focusID', {
    get: () => cameraState.focusID,
    set: (v) => {
        cameraState.focusID = v;
    },
});
Object.defineProperty(window, 'timeScale', {
    get: () => simulationState.timeScale,
    set: (v) => {
        simulationState.timeScale = v;
    },
});
Object.defineProperty(window, 'isPaused', {
    get: () => simulationState.isPaused,
    set: (v) => {
        simulationState.isPaused = v;
    },
});
Object.defineProperty(window, 'savedTimeScale', {
    get: () => simulationState.savedTimeScale,
    set: (v) => {
        simulationState.savedTimeScale = v;
    },
});
Object.defineProperty(window, 'lastT', {
    get: () => simulationState.lastT,
    set: (v) => {
        simulationState.lastT = v;
    },
});

Object.defineProperty(window, 'wasRunningBeforeDrag', {
    get: () => interactionState.wasRunningBeforeDrag,
    set: (v) => {
        interactionState.wasRunningBeforeDrag = v;
    },
});
Object.defineProperty(window, 'dragCameraOffset', {
    get: () => interactionState.dragCameraOffset,
    set: (v) => {
        interactionState.dragCameraOffset = v;
    },
});
Object.defineProperty(window, 'dragPlane', {
    get: () => interactionState.dragPlane,
    set: (v) => {
        interactionState.dragPlane = v;
    },
});

const keys = cameraState.keys;
const cameraSpeed = cameraState.speed;
const cameraRotationSpeed = cameraState.rotationSpeed;

function canMoveSelectedBodyWithArrowKeys() {
    const target = gizmo?.target;
    return (
        !!target &&
        !!selectedBody &&
        selectedBody === target &&
        !!gizmo.group?.visible &&
        !!gizmo.target &&
        !!gizmo.target.mesh &&
        !interactionState.isRepositioning &&
        !isChangingVelocity &&
        !isMiddleMouseVelocity
    );
}

function moveSelectedBodyRelativeToCamera(directionKey: string, ctrlKey = false) {
    if (!canMoveSelectedBodyWithArrowKeys()) return false;

    const body = gizmo.target;
    if (!body?.mesh) return false;

    const wasRunning = !isPaused;
    if (wasRunning) {
        togglePause();
    }

    const step = 1000;
    const movement = new THREE.Vector3();
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);

    // Project camera forward onto the XZ plane so movement stays horizontal.
    const flatForward = new THREE.Vector3(cameraForward.x, 0, cameraForward.z);
    if (flatForward.lengthSq() < 1e-10) {
        flatForward.set(0, 0, -1);
    } else {
        flatForward.normalize();
    }

    // Camera-relative horizontal right vector.
    const flatRight = new THREE.Vector3().crossVectors(flatForward, new THREE.Vector3(0, 1, 0));
    if (flatRight.lengthSq() < 1e-10) {
        flatRight.set(1, 0, 0);
    } else {
        flatRight.normalize();
    }

    if (directionKey === 'arrowleft') {
        movement.addScaledVector(flatRight, -step);
    } else if (directionKey === 'arrowright') {
        movement.addScaledVector(flatRight, step);
    } else if (directionKey === 'arrowup') {
        if (ctrlKey) movement.y += step;
        else movement.addScaledVector(flatForward, step);
    } else if (directionKey === 'arrowdown') {
        if (ctrlKey) movement.y -= step;
        else movement.addScaledVector(flatForward, -step);
    } else {
        if (wasRunning) togglePause();
        return false;
    }

    body.mesh.position.add(movement);

    if (body instanceof CelestialBody && body.rings) {
        body.rings.position.copy(body.mesh.position);
    }

    if (body instanceof CelestialBody && body.clouds) {
        body.clouds.position.set(0, 0, 0);
    }

    const shouldMoveCameraWithBody =
        cameraState.isLookAtMode &&
        !isFreeCameraMode &&
        !surfaceCam.isActive &&
        !cameraState.isFreeCameraMode;

    if (shouldMoveCameraWithBody) {
        camera.position.add(movement);
        controls.target.add(movement);
    }

    if (gizmo.group?.visible) {
        posIndicator.show('position');
        posIndicator.updateIndicator(
            posIndicator.yAxisIndicator,
            posIndicator.yAxisRing,
            body.mesh.position
        );
    }

    if (gizmo.target === body) {
        gizmo.update();
        velArc.update();
        orbitPrediction.update(simulationState.bodies, simulationState.gMultiplier);
        if (posIndicator.yAxisIndicator && posIndicator.yAxisRing) {
            posIndicator.updateIndicator(
                posIndicator.yAxisIndicator,
                posIndicator.yAxisRing,
                body.mesh.position
            );
        }
        if (
            (isChangingVelocity || isMiddleMouseVelocity) &&
            posIndicator.velocityTipIndicator &&
            posIndicator.velocityTipRing
        ) {
            const speed = body.velocity.length();
            const arrowScale = 50;
            const direction =
                speed > 0 ? body.velocity.clone().normalize() : new THREE.Vector3(1, 0, 0);
            const arrowTip = body.mesh.position
                .clone()
                .add(direction.multiplyScalar(speed * arrowScale));
            posIndicator.updateIndicator(
                posIndicator.velocityTipIndicator,
                posIndicator.velocityTipRing,
                arrowTip
            );
        }
    }

    if (wasRunning) {
        togglePause();
    }

    return true;
}

// Kuiper Belt - distant icy objects in a donut/disc shape beyond Neptune
const kuiperBeltCount = KUIPER_BELT_COUNT;
const kuiperBeltGeo = new THREE.BufferGeometry();
const kuiperBeltPos = new Float32Array(kuiperBeltCount * 3);
for (let i = 0; i < kuiperBeltCount; i++) {
    // Donut shape: from Neptune to beyond Pluto
    const r =
        KUIPER_BELT_INNER_DIST + Math.random() * (KUIPER_BELT_OUTER_DIST - KUIPER_BELT_INNER_DIST);
    const theta = Math.random() * Math.PI * 2;
    const verticalSpread = (Math.random() - 0.5) * KUIPER_BELT_VERTICAL_SPREAD; // Some thickness to the disc

    kuiperBeltPos[i * 3] = r * Math.cos(theta);
    kuiperBeltPos[i * 3 + 1] = verticalSpread;
    kuiperBeltPos[i * 3 + 2] = r * Math.sin(theta);
}
kuiperBeltGeo.setAttribute('position', new THREE.BufferAttribute(kuiperBeltPos, 3));
const kuiperBeltMat = new THREE.PointsMaterial({
    color: 0x888888,
    size: 1.3,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.4,
    depthTest: true,
    depthWrite: false,
});
const kuiperBeltPoints = new THREE.Points(kuiperBeltGeo, kuiperBeltMat);
scene.add(kuiperBeltPoints);

// Velocity arrow is now part of CoordinateGizmo (gizmo.velocityArrow)

function getPrimaryStar() {
    return (
        (simulationState.bodies.find((b) => b && !b._isDisposed && b instanceof Star) as Star) ||
        null
    );
}

function syncAllStarLightTargets() {
    const stars = simulationState.bodies.filter(
        (b): b is Star => b instanceof Star && !b._isDisposed
    );
    if (stars.length === 0) return;

    // Priority chain: find the best non-star body to use as the light direction target.
    // Stars are excluded — targeting a star with its own light produces a near-zero direction.
    //
    // Last-resort: closest non-star body to the camera. This is critical for free-cam mode —
    // when the user deselects a body they were just viewing, the camera is still near that planet
    // so it stays the light target and the correct side remains illuminated.
    const _closestNonStarBody = (() => {
        let closest: Body | null = null;
        let closestDist = Infinity;
        for (const b of simulationState.bodies) {
            if (!b || b._isDisposed || b instanceof Star || !b.mesh) continue;
            const d = camera.position.distanceTo(b.mesh.position);
            if (d < closestDist) {
                closestDist = d;
                closest = b;
            }
        }
        return closest;
    })();

    const activeLightTarget =
        (selectedBody &&
        !selectedBody._isDisposed &&
        !(selectedBody instanceof Star) &&
        simulationState.bodies.includes(selectedBody)
            ? selectedBody
            : manuallySelectedBody &&
                !manuallySelectedBody._isDisposed &&
                !(manuallySelectedBody instanceof Star) &&
                simulationState.bodies.includes(manuallySelectedBody)
              ? manuallySelectedBody
              : cameraState.focusBody &&
                  !cameraState.focusBody._isDisposed &&
                  !(cameraState.focusBody instanceof Star) &&
                  simulationState.bodies.includes(cameraState.focusBody)
                ? cameraState.focusBody
                : _closestNonStarBody) ?? null;

    // Shadows are only needed when: the user has them enabled, we're not in free cam (user
    // requirement), and there is a non-star body to project shadows onto.
    const shadowsUserEnabled =
        (document.getElementById('enableShadows') as HTMLInputElement)?.checked ?? false;
    const shouldCastShadows =
        shadowsUserEnabled && !cameraState.isFreeCameraMode && activeLightTarget != null;

    for (const star of stars) {
        if (!star.sunLight?.target) continue;

        if (activeLightTarget?.mesh) {
            star.sunLight.target.position.copy(activeLightTarget.mesh.position);
        } else {
            // Star-relative fallback: offset +X from the star so the direction is always
            // well-defined regardless of where the star is in world space.
            star.sunLight.target.position.set(
                star.mesh.position.x + 1,
                star.mesh.position.y,
                star.mesh.position.z
            );
        }

        if (star.sunLight.target.parent) {
            star.sunLight.target.updateMatrixWorld();
        }

        star.sunLight.castShadow = shouldCastShadows;
        if (shouldCastShadows && activeLightTarget instanceof CelestialBody) {
            star.updateShadowFrustumForBody(activeLightTarget);
        }
    }
}

// State management
const lineMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
]);
const dragLine = new THREE.Line(lineGeo, lineMat);
dragLine.visible = false;
scene.add(dragLine);

function getNearCameraSpawnPos(offset = 500 * SCALE_FACTOR): THREE.Vector3 {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return camera.position.clone().add(dir.multiplyScalar(offset));
}

function computeOrbitVelocityAtPos(
    spawnPos: THREE.Vector3,
    parentPos: THREE.Vector3,
    parentMass: number,
    orbitType: string,
    eccentricity: number,
    inclinationDeg: number
): THREE.Vector3 {
    const toParent = spawnPos.clone().sub(parentPos);
    const distance = toParent.length();

    if (distance === 0) return new THREE.Vector3();

    const circularSpeed = Math.sqrt((G * simulationState.gMultiplier * parentMass) / distance);
    const speed =
        orbitType === 'elliptical'
            ? circularSpeed * Math.sqrt(Math.max(0, 1 - eccentricity))
            : circularSpeed;

    // Perpendicular velocity in XZ plane (ignoring Y component of toParent for horizontal orbit)
    const perp = new THREE.Vector3(-toParent.z, 0, toParent.x).normalize().multiplyScalar(speed);

    // Apply inclination tilt around X axis
    const inclinationRad = (inclinationDeg * Math.PI) / 180;
    perp.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);

    return perp;
}

function createPresetBody(presetKey: string) {
    const key = String(presetKey).toLowerCase();

    // Helper: find the current primary star (first star in bodies)
    const primaryStar = getPrimaryStar();

    // Presets assume a star exists. If launching empty mode, guide the user by creating a small star.
    if (!primaryStar && key !== 'sun') {
        createNewBody('sun');
    }

    const ensureEarth = () =>
        simulationState.bodies.find((b) => b && !b._isDisposed && b.name === 'Earth');
    let newBody: CelestialBody | null;

    switch (key) {
        case 'sun': {
            newBody = new Sun(dependencies, scene);

            break;
        }
        case 'mercury': {
            newBody = new Mercury(dependencies, scene);

            break;
        }
        case 'venus': {
            newBody = new Venus(dependencies, scene);

            break;
        }
        case 'earth': {
            newBody = new Earth(dependencies, scene);

            break;
        }
        case 'earth_moon': {
            // Ensure Earth exists; create it if not.
            let earth = ensureEarth() as Earth;
            if (!earth) {
                earth = new Earth(dependencies, scene);
                simulationState.bodies.push(earth);
            }

            newBody = createMoon(earth, scene, {
                distance: MOON_DIST_FROM_EARTH,
                radius: MOON_RADIUS,
                mass: MOON_MASS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                id: createUniqueId('moon'),
                name: 'Moon',
                moonType: MoonTypeEnum.Terrestrial,
                trailColor: 0xffffff,
                maxTrail: 1500,
            });
            break;
        }
        case 'mars': {
            newBody = new Mars(dependencies, scene);
            break;
        }
        case 'jupiter': {
            newBody = new Jupiter(dependencies, scene, jupiterTexture);
            break;
        }
        case 'saturn': {
            newBody = new Saturn(dependencies, scene, saturnTexture);
            break;
        }
        case 'uranus': {
            newBody = new Uranus(dependencies, scene, uranusTexture);
            break;
        }
        case 'neptune': {
            newBody = new Neptune(dependencies, scene, neptuneTexture);
            break;
        }
        case 'pluto': {
            newBody = new Pluto(dependencies, scene, plutoTexture);
            break;
        }
        case 'ceres': {
            newBody = new Ceres(dependencies, scene, ceresTexture);
            break;
        }
        default:
            console.warn('Unknown presetKey:', presetKey);
            return;
    }

    if (!newBody) return;

    // Reposition preset bodies near the camera (like custom bodies), so the user sees them
    // immediately rather than spawning at their preset orbital distance (e.g. Pluto at the
    // edge of the system). The Sun stays at the origin.
    if (key !== 'sun') {
        const star = getPrimaryStar();
        if (star && star.mesh) {
            const spawnPos = getNearCameraSpawnPos();
            const spawnVel = computeOrbitVelocityAtPos(
                spawnPos,
                star.mesh.position,
                star.mass,
                'circular',
                0,
                0
            );
            newBody.mesh.position.copy(spawnPos);
            newBody.velocity.copy(spawnVel);
        }
    }

    simulationState.bodies.push(newBody);

    // Notify UI / systems that track live bodies
    try {
        window.dispatchEvent(
            new CustomEvent('body:added', {
                detail: { body: newBody, id: newBody.id, name: newBody.name },
            })
        );
    } catch (e) {
        console.error('Error dispatching body:added event after preset body creation:', e);
    }

    // Select newly created body & keep selection pipeline consistent with custom creation
    if (cameraState.isTargetMode) {
        gizmo.attach(newBody);
    } else {
        gizmo.attach(null);
    }
    uiManager.managementPanel.setSelectedBody(newBody);

    setFocusBody(newBody, { zoom: cameraState.isLookAtMode });
    clearCameraPresetHighlights();
}

function createNewBody(
    bodyType: string,
    planetType = 'solid',
    orbitType = 'circular',
    inclination = 0,
    hasAtmosphere = false,
    hasRings = false,
    customMass: number | null = null,
    customTemperature: number | null = null,
    customLightIntensity: number | null = null,
    customRadius: number | null = null,
    orbitParent: Body | null = null,
    createTilt: number | null = null,
    createAzimuth: number | null = null
) {
    let newBody;
    let moonCreationParent: Body | null = null; // tracked so post-creation can re-focus the parent

    if (bodyType === 'sun') {
        // Create a custom STAR.
        //
        // Defaults are randomized around star-like values so the user can override them
        // in the creation UI before the body is actually created.
        // First star goes to world center; additional stars spawn near the camera.
        // Also treat an existing black hole as occupying the center.
        const _hasCentralBody =
            !!getPrimaryStar() ||
            simulationState.bodies.some((b) => b && !b._isDisposed && b instanceof BlackHole);
        const starPos = _hasCentralBody ? getNearCameraSpawnPos() : new THREE.Vector3(0, 0, 0);

        const starParams = randomStarParams({
            mass: customMass,
            radius: customRadius,
            temperature: customTemperature,
            lightIntensity: customLightIntensity,
        });
        const { rotationTilt, rotationSpeed } = starParams;

        const id = createUniqueId('star');
        const name = generateIAUName(BodyTypeEnum.Star, null, simulationState.bodies);

        newBody = createMainSequenceStarFromParams(dependencies, scene, starParams, {
            id,
            name,
            pos: starPos,
            vel:
                orbitParent && !orbitParent._isDisposed
                    ? computeOrbitVelocityAtPos(
                          starPos,
                          orbitParent.mesh.position.clone(),
                          orbitParent.mass,
                          orbitType,
                          0.3,
                          inclination
                      )
                    : new THREE.Vector3(0, 0, 0),
            rotation: { tilt: rotationTilt, speed: rotationSpeed },
        });
    } else if (bodyType === 'planet') {
        // Create a new planet near the camera with appropriate orbital velocity
        const planetParentBody =
            orbitParent && !orbitParent._isDisposed ? orbitParent : getPrimaryStar();
        const starPos = planetParentBody
            ? planetParentBody.mesh.position.clone()
            : new THREE.Vector3(0, 0, 0);
        const starMass = planetParentBody ? planetParentBody.mass : SUN_MASS;

        const spawnPos = getNearCameraSpawnPos();
        const spawnVel = computeOrbitVelocityAtPos(
            spawnPos,
            starPos,
            starMass,
            orbitType,
            0.3,
            inclination
        );

        // Custom mode: never create dwarfs (UI dropdown has only planet subtypes).
        const resolvedPlanetType = (planetType || 'solid') as
            | 'solid'
            | 'gas_giant'
            | 'ice_giant'
            | 'volcanic'
            | 'ocean'
            | 'desert'
            | 'frozen'
            | 'temperate';

        const planetId = createUniqueId('planet');
        const planetSeed = `${planetId}|custom|${resolvedPlanetType}`;

        const {
            mass: planetMass,
            radius: planetRadius,
            rotationSpeed: planetRotationSpeed,
            rotationTilt: planetRotationTilt,
            rotationAzimuth: planetRotationAzimuth,
            bodySubtype: planetBodySubtype,
        } = randomPlanetParams(resolvedPlanetType, {
            mass: customMass,
            radius: customRadius,
            seed: planetSeed,
        });

        const isSolidPlanet =
            resolvedPlanetType === 'solid' ||
            resolvedPlanetType === 'volcanic' ||
            resolvedPlanetType === 'ocean' ||
            resolvedPlanetType === 'desert' ||
            resolvedPlanetType === 'frozen' ||
            resolvedPlanetType === 'temperate';

        newBody = createPlanetBodyFromProceduralCreation(dependencies, scene, {
            id: planetId,
            name: generateIAUName(BodyTypeEnum.Planet, null, simulationState.bodies),
            pos: spawnPos,
            vel: spawnVel,
            bodyType: BodyTypeEnum.Planet,
            bodySubtype: planetBodySubtype,
            radius: planetRadius,
            mass: planetMass,
            rotationSpeed: planetRotationSpeed,
            rotationTilt: planetRotationTilt,
            rotationAzimuth: planetRotationAzimuth,
            hasRings,
            textureSeed: planetSeed,
        });

        // Optional atmosphere/cloud layer (checkbox-driven for custom solid + volcanic planets)
        // Temperate planets should ALWAYS have an atmosphere.
        if (
            (hasAtmosphere || planetBodySubtype === PlanetTypeEnum.Temperate) &&
            isSolidPlanet &&
            newBody
        ) {
            const atmosphereRng = new SeededRandom(`${newBody.id}|atmosphere|custom-solid`);
            const atmosphereTex =
                atmosphereRng.pick(fictionalAtmosphereTextures) ?? fictionalAtmosphereTextures[0];

            const cloudsMat = new THREE.MeshStandardMaterial({
                map: atmosphereTex,
                color: 0xffffff,
                transparent: true,
                opacity: 0.25,
                depthWrite: false,
                roughness: 1.0,
                metalness: 0.0,
            });

            const cloudsRadius =
                Number.isFinite(newBody.radius) && newBody.radius > 0
                    ? newBody.radius * 1.03
                    : null;

            if (cloudsRadius !== null) {
                const cloudsGeo = new THREE.SphereGeometry(cloudsRadius, 32, 32);
                newBody.clouds = new THREE.Mesh(cloudsGeo, cloudsMat);
                newBody.clouds.renderOrder = 2;
            } else {
                newBody.clouds = null;
            }

            // Make cloud sphere selectable (raycaster maps back to owning body)
            if (newBody.clouds) {
                newBody.clouds.userData = { parentBody: newBody };
                newBody.mesh.add(newBody.clouds);
            }

            // 0.12 + Math.random()*0.12 => [0.12, 0.24)
            newBody.cloudRotationSpeed = atmosphereRng.range(0.12, 0.24);
        }

        // Ensure brightness scaling uses a neutral base when texture is present
        newBody.baseColor = new THREE.Color(0xffffff);

        // Kick off background procedural texture upgrade (desert/ocean/frozen only)
        upgradeProceduralTexture(newBody as unknown as CelestialBody);
    } else if (bodyType === 'moon') {
        // Create a moon orbiting the selected body (management panel selection takes priority)
        const focusedBody = (() => {
            const candidate = orbitParent || cameraState.focusBody;
            return candidate && !candidate._isDisposed && simulationState.bodies.includes(candidate)
                ? candidate
                : null;
        })();
        if (focusedBody) {
            moonCreationParent = focusedBody; // remember so post-creation re-focuses parent

            // Step 1: get parent's world position and velocity
            const parentPos = focusedBody.mesh.position.clone();
            const parentVel = focusedBody.velocity.clone();

            // Step 2: random distance from parent surface
            const {
                mass: moonMass,
                radius: moonRadius,
                distance: moonDistance,
                rotationSpeed: moonRotationSpeed,
            } = randomMoonParams(focusedBody.radius, { mass: customMass, radius: customRadius });

            // Step 3: random radial direction using uniform sphere sampling
            //   theta ∈ [0, 2π), phi ∈ [0, π] distributed uniformly via inverse CDF
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radialDir = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );

            // Step 4: moon position = parent position + radialDir * moonDistance
            const moonSpawnPos = parentPos.clone().addScaledVector(radialDir, moonDistance);

            // Step 5: orbital velocity perpendicular to radialDir
            //   Build a full orthonormal basis in the plane perpendicular to radialDir,
            //   then pick a random direction within it.
            const circularSpeed = Math.sqrt(
                (G * simulationState.gMultiplier * focusedBody.mass) / moonDistance
            );
            const orbitSpeed =
                orbitType === 'elliptical'
                    ? circularSpeed * Math.sqrt(Math.max(0, 1 - 0.3))
                    : circularSpeed;

            const basisHelper =
                Math.abs(radialDir.y) < 0.9
                    ? new THREE.Vector3(0, 1, 0)
                    : new THREE.Vector3(1, 0, 0);
            const perp1 = new THREE.Vector3().crossVectors(radialDir, basisHelper).normalize();
            const perp2 = new THREE.Vector3().crossVectors(radialDir, perp1).normalize();
            const orbitAngle = Math.random() * Math.PI * 2;
            const orbitDir = perp1
                .clone()
                .multiplyScalar(Math.cos(orbitAngle))
                .addScaledVector(perp2, Math.sin(orbitAngle));

            // Moon velocity = parent velocity + orbital velocity
            const moonSpawnVel = parentVel.clone().addScaledVector(orbitDir, orbitSpeed);

            const moonId = createUniqueId('moon');
            const moonName = generateIAUName(
                BodyTypeEnum.Moon,
                focusedBody,
                simulationState.bodies
            );

            const geometry = new THREE.SphereGeometry(moonRadius, 32, 32);

            // planetType is used as moonType for `bodyType === 'moon'` custom creation.
            // Map moonType -> texture to match planet subtype visuals.
            const moonTextureSeed = `${moonId}|moonTexture|${planetType}`;
            const moonType = (planetType || 'solid') as
                | 'solid'
                | 'temperate'
                | 'volcanic'
                | 'ocean'
                | 'frozen'
                | 'desert';

            // Texture selection:
            // - desert: generated seam-safe procedural desert texture (like planets)
            // - temperate: earth_day texture for now
            // - others: deterministic fictional sub-planet textures
            // - solid: pooled fictional textures (seeded)
            let moonMap: THREE.Texture;
            switch (moonType) {
                case 'desert':
                    moonMap = getDesertTexture(moonTextureSeed);
                    break;
                case 'temperate':
                    moonMap = fictionalTemperateTexture;
                    break;
                case 'volcanic':
                    moonMap = fictionalVolcanicTexture;
                    break;
                case 'ocean':
                    moonMap = fictionalOceanTexture;
                    break;
                case 'frozen':
                    moonMap = fictionalFrozenTexture;
                    break;
                case 'solid':
                default: {
                    const seeded = new SeededRandom(moonTextureSeed);
                    const idx =
                        Math.floor(seeded.next() * fictionalTerrestrialTextures.length) %
                        fictionalTerrestrialTextures.length;
                    moonMap = fictionalTerrestrialTextures[Math.abs(idx)]!;
                    break;
                }
            }

            const moonMaterial = new THREE.MeshStandardMaterial({
                map: moonMap,
                color: 0xffffff, // keep texture untinted
                emissive: 0x000000,
                emissiveIntensity: 0,
                roughness:
                    moonType === 'desert' || moonType === 'temperate'
                        ? 0.95
                        : moonType === 'volcanic'
                          ? 0.6
                          : 0.7,
                metalness:
                    moonType === 'desert' || moonType === 'temperate'
                        ? 0.02
                        : moonType === 'volcanic'
                          ? 0.15
                          : 0.7,
                transparent: false,
                depthTest: true,
                depthWrite: true,
            });
            const mesh = new THREE.Mesh(geometry, moonMaterial);

            const moonSeed = `${moonId}|custom|${moonType}`;

            newBody = new Moon(dependencies, scene, {
                distance: moonDistance,
                angle: orbitAngle ?? 0,
                yVariation: 0,
                moonType: moonType as unknown as MoonTypeEnum,
                tidalLock: {
                    target: focusedBody as unknown as CelestialBody,
                    spinAxisWorld: new THREE.Vector3(0, 1, 0),
                    faceAxisLocal: new THREE.Vector3(0, 0, 1),
                    // 0 triggers CelestialBody to compute derived omega on first update tick.
                    angularSpeed: 0,
                },
                radius: moonRadius,
                pos: moonSpawnPos,
                vel: moonSpawnVel,
                mass: moonMass,
                id: moonId,
                name: moonName,
                trailColor: 0x666666,
                maxTrail: 1000,
                rotation: { tilt: 0, speed: moonRotationSpeed },
                mesh,
                seed: moonSeed,
            });

            // Kick off background procedural texture upgrade (desert/ocean/frozen only)
            upgradeProceduralTexture(newBody);

            // Optional atmosphere/cloud layer (checkbox-driven for custom bodies)
            // Temperate moons should always have atmosphere/clouds (UI checkbox hidden for temperate).
            if (hasAtmosphere || planetType === 'temperate') {
                const atmosphereRng = new SeededRandom(`${newBody.id}|atmosphere|custom-moon`);
                const atmosphereTex =
                    atmosphereRng.pick(fictionalAtmosphereTextures) ??
                    fictionalAtmosphereTextures[0];

                const cloudsMat = new THREE.MeshStandardMaterial({
                    map: atmosphereTex,
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.25,
                    depthWrite: false,
                    roughness: 1.0,
                    metalness: 0.0,
                });

                const cloudsGeo = new THREE.SphereGeometry(newBody.radius * 1.03, 32, 32);
                newBody.clouds = new THREE.Mesh(cloudsGeo, cloudsMat);
                newBody.clouds.renderOrder = 2;
                // Make cloud sphere selectable (raycaster maps back to owning body)
                newBody.clouds.userData = { parentBody: newBody };
                newBody.mesh.add(newBody.clouds);

                // 0.12 + Math.random()*0.12 => [0.12, 0.24)
                newBody.cloudRotationSpeed = atmosphereRng.range(0.12, 0.24);
            }

            // Ensure brightness scaling uses a neutral base when texture is present
            newBody.baseColor = new THREE.Color(0xffffff);
        } else {
            console.log('Please select a body first to create a moon');
            return;
        }
    } else if (bodyType === 'asteroid') {
        // Create an asteroid near the camera with appropriate orbital velocity
        const asteroidSpawnPos = getNearCameraSpawnPos();
        const asteroidParentBody =
            orbitParent && !orbitParent._isDisposed ? orbitParent : getPrimaryStar();
        const asteroidStarPos = asteroidParentBody
            ? asteroidParentBody.mesh.position.clone()
            : new THREE.Vector3(0, 0, 0);
        const asteroidStarMass = asteroidParentBody ? asteroidParentBody.mass : SUN_MASS;
        const asteroidVel = computeOrbitVelocityAtPos(
            asteroidSpawnPos,
            asteroidStarPos,
            asteroidStarMass,
            orbitType,
            0.3,
            inclination
        );

        const { mass: asteroidMass, radius: asteroidRadius } = randomAsteroidParams({
            mass: customMass,
            radius: customRadius,
        });

        newBody = new Asteroid(dependencies, scene, {
            pos: asteroidSpawnPos.toArray(),
            vel: asteroidVel.toArray(),
            mass: asteroidMass,
            radius: asteroidRadius,
        });
    } else if (bodyType === 'comet') {
        // Create a comet near the camera with appropriate orbital velocity
        const cometSpawnPos = getNearCameraSpawnPos();
        const cometParentBody =
            orbitParent && !orbitParent._isDisposed ? orbitParent : getPrimaryStar();
        const cometStarPos = cometParentBody
            ? cometParentBody.mesh.position.clone()
            : new THREE.Vector3(0, 0, 0);
        const cometStarMass = cometParentBody ? cometParentBody.mass : SUN_MASS;
        const cometOrbitVel = computeOrbitVelocityAtPos(
            cometSpawnPos,
            cometStarPos,
            cometStarMass,
            orbitType,
            0.4,
            inclination
        );

        const { mass: cometMass, radius: cometRadius } = randomCometParams({
            mass: customMass,
            radius: customRadius,
        });

        newBody = new GenericComet(dependencies, scene, {
            radius: cometRadius,
            pos: cometSpawnPos,
            vel: cometOrbitVel,
            mass: cometMass,
            id: createUniqueId('comet'),
            name: generateIAUName(BodyTypeEnum.Comet, null, simulationState.bodies),
            rotation: { tilt: 0, speed: 0.05 },
        });
    } else if (bodyType === 'black_hole') {
        const bhSpawnPos = getNearCameraSpawnPos();
        const { mass: bhMass } = randomBlackHoleParams({ mass: customMass });

        newBody = new BlackHole(
            dependencies,
            scene,
            bhSpawnPos,
            bhMass,
            createUniqueId('black_hole'),
            generateIAUName(BodyTypeEnum.BlackHole, null, simulationState.bodies),
            { tilt: 0, speed: 0 }
        );

        // Apply custom radius if the user overrode the slider
        if (typeof customRadius === 'number' && isFinite(customRadius) && customRadius > 0) {
            setBodyRadius(newBody as unknown as CelestialBody, customRadius);
        }
    }

    if (newBody) {
        // Apply axial tilt/azimuth from create sliders if the body supports rotation
        if (
            (createTilt !== null || createAzimuth !== null) &&
            newBody instanceof CelestialBody &&
            newBody.rotation
        ) {
            const tilt = createTilt !== null ? createTilt : (newBody.rotation.tilt ?? 0);
            const azimuth =
                createAzimuth !== null ? createAzimuth : (newBody.rotation.azimuth ?? 0);
            newBody.rotation.tilt = tilt;
            newBody.rotation.azimuth = azimuth;
            const tiltRad = THREE.MathUtils.degToRad(tilt);
            const azRad = THREE.MathUtils.degToRad(azimuth);
            const tiltQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0),
                tiltRad
            );
            const azQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                azRad
            );
            newBody.mesh.quaternion.multiplyQuaternions(azQuat, tiltQuat);
            if (newBody.rings) {
                newBody.rings.position.copy(newBody.mesh.position);
                newBody.rings.quaternion.copy(newBody.mesh.quaternion);
            }
        }

        simulationState.bodies.push(newBody);

        // Notify UI / systems that track live bodies
        try {
            window.dispatchEvent(
                new CustomEvent('body:added', {
                    detail: { body: newBody, id: newBody.id, name: newBody.name },
                })
            );
        } catch (e) {
            console.error('Error disposing body during spawn cleanup:', e);
        }

        console.log(`Created new ${bodyType}:`, newBody.name);

        // Auto-select the newly created body (gizmo depends on Target toggle)
        if (cameraState.isTargetMode) {
            gizmo.attach(newBody);
        } else {
            gizmo.attach(null);
        }

        // For moons: keep selection/focus on the parent so the user can keep adding
        // moons to the same body without re-selecting it each time.
        if (moonCreationParent) {
            uiManager.managementPanel.setSelectedBody(moonCreationParent);
            setFocusBody(moonCreationParent, { zoom: false });
        } else {
            uiManager.managementPanel.setSelectedBody(newBody);
            // Focus selection/camera on the new body (object-based, not id-based)
            setFocusBody(newBody, { zoom: cameraState.isLookAtMode });
        }

        // Clear any camera preset highlight (manual selection).
        // Do NOT clear LOOK AT / FREE / TARGET highlights, those are toggles with independent state.
        clearCameraPresetHighlights();
    }
}

function applyEnvironmentDefaultsForMode(mode: SimulationStartMode) {
    // Only touches background visuals + management checkboxes (if already initialized).
    const hideKuiper =
        mode === SimulationStartMode.Empty ||
        mode === SimulationStartMode.BlackHole ||
        mode === SimulationStartMode.Procedural;

    if (typeof kuiperBeltPoints !== 'undefined' && kuiperBeltPoints) {
        kuiperBeltPoints.visible = !hideKuiper;
    }

    // Keep UI in sync
    if (uiManager.managementPanel?.enableKuiperBeltCheckbox) {
        uiManager.managementPanel.enableKuiperBeltCheckbox.checked = !hideKuiper;
    }
}

/**
 * Spawns a new simulation based on the specified mode and seed. Initializes the environment, cleans up existing bodies and effects,
 * and sets up the initial state for the simulation.
 * @param param0 An object containing the mode and seed for the simulation spawn.
 * @returns
 */
async function spawn({
    mode = SimulationStartMode.Default,
    seed,
}: {
    mode?: SimulationStartMode;
    seed?: string;
} = {}) {
    // Store the generator used to create the solar system. For now, it will be for procedural generation only.
    let generator: SolarSystemGenerator | null = null;

    applyEnvironmentDefaultsForMode(mode);

    // Procedural mode seed plumbing (for now: only log + keep the system empty).
    if (mode === SimulationStartMode.Procedural) {
        generator = new ProceduralGenerator(seed, dependencies, scene);
    }

    if (mode === SimulationStartMode.BlackHole) {
        generator = new BlackHoleSystemGenerator(dependencies, scene, seed);
    }

    // Unified cleanup: always dispose existing bodies (stars included).
    // No special-casing is required here; Star.die(true) is already the canonical disposal path.
    for (const b of simulationState.bodies || []) {
        if (!b || b._isDisposed) continue;
        try {
            b.die();
        } catch (e) {
            console.error('Error disposing body during spawn loop:', e);
        }
    }

    // Clean up any existing explosions first
    simulationState.explosions.forEach((explosion) => {
        // ParticleExplosion.dispose() removes/diposes ALL meshes it spawns (including shockwave ring).
        explosion.dispose();
    });
    simulationState.explosions = [];

    // Clean up any existing impact shockwaves
    for (const impact of simulationState.impacts) impact.dispose();
    simulationState.impacts = [];

    // Clean up all supernova effects
    for (const supernova of supernovas) {
        supernova.dispose();
    }
    supernovas = [];

    // Clean up all planetary nebula effects
    for (const nebula of planetaryNebulae) {
        nebula.dispose();
    }
    planetaryNebulae = [];

    // Reset bodies array depending on mode
    simulationState.bodies = [];

    // Notify UI / systems that track live bodies
    try {
        window.dispatchEvent(new CustomEvent('bodies:reset'));
    } catch (e) {
        console.error('Error dispatching bodies:reset event:', e);
    }

    // Empty / procedural mode: starfield only (no bodies)
    if (mode === SimulationStartMode.Empty) {
        selectedBody = null;
        clearURLSeed();
        return;
    }

    // Black Hole mode: procedurally generated black hole + 1–3 stars in siphon range
    if (mode === SimulationStartMode.BlackHole && generator) {
        simulationState.bodies = await generator.generateSolarSystemAsync();

        updateURLWithSeed(SEED_TYPE_BLACKHOLE, generator.seed);

        syncAllStarLightTargets();
        selectedBody = null;

        // Focus on the first body in the list, which will probably be a star (e.g., the Sun).
        if (simulationState.bodies.length > 0) {
            triggerZoomToBody(simulationState.bodies[0]);
        }

        const shadowCheckboxForSpawn = document.getElementById('enableShadows') as HTMLInputElement;
        toggleShadows(shadowCheckboxForSpawn ? shadowCheckboxForSpawn.checked : true);
        return;
    }

    // Procedural generation (async + progress reporting)
    if (mode === SimulationStartMode.Procedural) {
        // Keep the solar system empty until generation finishes.
        simulationState.bodies = [];
        selectedBody = null;
        manuallySelectedBody = null;

        const abortController = new AbortController();

        // The procedural modal is already visible from the startup modal's prompt flow.
        // Switch to progress UI now that generation is starting.
        proceduralModal.showProgressUI();
        proceduralModal.setInputsLocked(true);

        // Guard against out-of-order completion when user resets/spawns again.
        // (We store the counter on window to avoid needing module-scope vars in this huge file.)
        const runIdKey = '__procRunId__';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        w[runIdKey] = (w[runIdKey] ?? 0) + 1;
        const runId = w[runIdKey] as number;

        const gen = generator;

        const onProceduralCancel = () => {
            // UI: lock progress status to "Canceling" immediately
            proceduralModal.markCancelRequested();
            abortController.abort();
        };

        // Index.ts owns cancellation (abort); UI is owned by proceduralModal.
        proceduralModal.on('cancelRequested', onProceduralCancel);

        try {
            const bodies = gen ? await gen.generateSolarSystemAsync() : [];

            if (runId !== w[runIdKey]) return; // stale completion

            simulationState.bodies = bodies;

            // Push URL seed after successful generation
            if (gen) {
                updateURLWithSeed(SEED_TYPE_NORMAL, gen.seed);
            }

            syncAllStarLightTargets();
            selectedBody = null;
            manuallySelectedBody = null;

            // Focus on the first body in the list, which will probably be a star (e.g., the Sun).
            if (simulationState.bodies.length > 0) {
                triggerZoomToBody(simulationState.bodies[0]);
            }

            // Initialise castShadow / receiveShadow on all newly spawned bodies so shadows work
            // immediately without requiring the user to toggle the checkbox.
            const shadowCheckboxForSpawn = document.getElementById(
                'enableShadows'
            ) as HTMLInputElement;
            toggleShadows(shadowCheckboxForSpawn ? shadowCheckboxForSpawn.checked : true);

            // Refresh UI now that bodies exist
            try {
                uiManager.managementPanel?.setSelectedBody?.(null);
                gizmo.attach(null);
                refreshBodiesTable();
                flightHUD.forceHintRefresh();
            } catch {
                // Empty
            }

            // Success path: hide procedural overlay, keep simulation running.
            proceduralModal.setInputsLocked(false);
            proceduralModal.hide();
        } catch (e) {
            if (runId !== w[runIdKey]) return;

            console.error('[procedural] generation failed:', e);

            // Keep bodies empty on error
            simulationState.bodies = [];

            proceduralModal.setInputsLocked(false);
            proceduralModal.setProgressStatusText('Generation failed.');
            proceduralModal.setProgressErrorVisible(true);
            proceduralModal.showSeedSectionForRetry();
        }

        return;
    }

    // Default mode: build the solar system
    clearURLSeed();
    const normalGenerator = new NormalSolarSystemGenerator(dependencies, scene, {
        jupiterTexture,
        saturnTexture,
        uranusTexture,
        neptuneTexture,
        plutoTexture,
        ceresTexture,
    });
    simulationState.bodies = await normalGenerator.generateSolarSystemAsync();
    syncAllStarLightTargets();
    selectedBody = null;

    // Focus on the first body in the list, which will probably be a star (e.g., the Sun).
    if (simulationState.bodies.length > 0) {
        triggerZoomToBody(simulationState.bodies[0]);
    }

    // Initialise castShadow / receiveShadow on all newly spawned bodies so shadows work
    // immediately without requiring the user to toggle the checkbox.
    const shadowCheckboxForSpawn = document.getElementById('enableShadows') as HTMLInputElement;
    toggleShadows(shadowCheckboxForSpawn ? shadowCheckboxForSpawn.checked : true);
    return;
}

function togglePause() {
    isPaused = !isPaused;

    if (isPaused) {
        // Remember the current speed and set to 0
        savedTimeScale = timeScale;
        timeScale = 0;

        uiManager.setPauseState(true);
        // Keep slider enabled so user can adjust speed while paused
    } else {
        // Restore the saved speed (which may have been adjusted while paused)
        timeScale = savedTimeScale;
        const direction = savedTimeScale < 0 ? ' REVERSE' : '';
        uiManager.mainPanel.updateTimeScaleDisplay(Math.abs(savedTimeScale) + 'x' + direction);
        uiManager.setPauseState(false);
    }
}

function handlePauseShortcut() {
    togglePause();
}

function toggleShadows(enabled: boolean) {
    renderer.shadowMap.enabled = enabled;

    // Update all celestial bodies
    simulationState.bodies.forEach((body) => {
        if (body && body.mesh) {
            if (body instanceof Star) {
                body.setShadowsEnabled(enabled);
            } else {
                // Update non-star bodies
                body.mesh.castShadow = enabled;
                body.mesh.receiveShadow = enabled;
            }
        }
    });
}

function onMouseDown(event: MouseEvent) {
    // Ignore synthetic mouse events immediately after touch gestures.
    if (Date.now() < interactionState.touchIgnoreUntil) return;

    // In flight mode: LMB fires the weapon; all other non-RMB interactions are blocked.
    if (flightState.isActive && event.button === 0) {
        flightState.isFiring = true;
        return;
    }
    if (flightState.isActive && event.button !== 2) return;

    // Surface mode RMB look uses the global mousemove handler (surfaceCam.onMouseMove).
    // Avoid engaging the generic pointer-lock mouse-look while on the surface.
    // Middle mouse button for velocity control when body is selected
    // Do not allow MMB velocity edit to start while already doing an LMB velocity drag.
    if (
        event.button === 1 &&
        !(isChangingVelocity || isMiddleMouseVelocity) &&
        gizmo.group.visible &&
        gizmo.velocityArrow.visible &&
        gizmo.target
    ) {
        isMiddleMouseVelocity = true;
        interactionState.isMiddleMouseVelocity = true;
        console.log('[drag] MMB velocity start', gizmo.target?.name);

        // Set up drag plane THROUGH the body position (prevents initial jump / cursor separation)
        // In velocity XZ mode, we want dragging constrained to the XZ plane (horizontal plane),
        // so mouse up/down maps to “toward/away camera” movement on the XZ plane.
        // In velocity Y mode, we want a vertical plane that contains world-up and the current
        // horizontal heading direction, so mouse up/down maps to +/-Y without changing heading.
        const origin = gizmo.target.mesh.position;
        if (interactionState.velocityEditMode === 'y') {
            const v = gizmo.target.velocity.clone();
            v.y = 0;
            const hDir = v.lengthSq() > 1e-10 ? v.normalize() : new THREE.Vector3(1, 0, 0);
            const up = new THREE.Vector3(0, 1, 0);
            const planeNormal = new THREE.Vector3().crossVectors(hDir, up).normalize();
            dragPlane.setFromNormalAndCoplanarPoint(planeNormal, origin);
        } else {
            // 'xz'
            dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), origin);
        }

        // Show grid and indicators
        posIndicator.show('both');
        velArc.update();

        return;
    }

    // Right mouse button activates mouse look
    if (event.button === 2) {
        if (surfaceCam.isActive) {
            isMouseLookActive = true;
            return;
        }
        // If we're currently dragging velocity with LMB, do NOT pointer-lock.
        // Pointer-lock steals the cursor and breaks the drag-plane mapping used by the velocity gizmo.
        // We'll still rotate the camera using normal mousemove deltas while RMB is held.
        if (!(isChangingVelocity || isMiddleMouseVelocity)) {
            // Make sure we're tracking the currently held mouse position
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            if (isFreeCameraMode) {
                // Free camera: look at what's under the mouse
                const allObjects = simulationState.bodies.map((b) => b.mesh);
                const intersects = raycaster.intersectObjects(allObjects, false);

                let lookAtPoint;
                if (intersects.length > 0) {
                    lookAtPoint = intersects[0].point;
                } else {
                    const direction = new THREE.Vector3();
                    camera.getWorldDirection(direction);
                    lookAtPoint = camera.position.clone().add(direction.multiplyScalar(5000));
                }
                camera.lookAt(lookAtPoint);
            }

            // Request pointer lock to capture the mouse (only when not dragging velocity)
            renderer.domElement.requestPointerLock();
        }

        isMouseLookActive = true;
        return;
    }

    // Left mouse button for everything else
    if (event.button !== 0) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Check for velocity gizmo
    const velIntersects = gizmo.velocityArrow
        ? raycaster.intersectObject(gizmo.velocityArrow, true)
        : [];
    if (velIntersects.length > 0 && gizmo.target) {
        isChangingVelocity = true;
        interactionState.isChangingVelocity = true;
        controls.enabled = false;
        console.log('[drag] LMB velocity start', gizmo.target?.name);

        // Always pause while editing velocity (store whether we should resume after)
        interactionState.velocityEditHadRunningBeforeDrag = !isPaused && !isFreeCameraMode;
        if (interactionState.velocityEditHadRunningBeforeDrag) {
            togglePause();
        }

        // Use whichever velocity edit mode the user last selected (toggled with 'G')
        // so the next grab starts in the same mode.
        // (Default is 'xz' from initial state.)
        interactionState.velocityEditMode = interactionState.velocityEditMode || 'xz';

        // Set up a drag plane THROUGH the body position (prevents initial jump / cursor separation)
        // In velocity XZ mode, we want dragging constrained to the XZ plane (horizontal plane),
        // so mouse up/down maps to “toward/away camera” movement on the XZ plane.
        // In velocity Y mode, we want a vertical plane that contains world-up and the current
        // horizontal heading direction, so mouse up/down maps to +/-Y without changing heading.
        const origin = gizmo.target.mesh.position;
        if (interactionState.velocityEditMode === 'y') {
            const v = gizmo.target.velocity.clone();
            v.y = 0;
            const hDir = v.lengthSq() > 1e-10 ? v.normalize() : new THREE.Vector3(1, 0, 0);
            const up = new THREE.Vector3(0, 1, 0);
            const planeNormal = new THREE.Vector3().crossVectors(hDir, up).normalize();
            dragPlane.setFromNormalAndCoplanarPoint(planeNormal, origin);
        } else {
            // 'xz'
            dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), origin);
        }

        // Immediately update velocity once on mouse-down using current cursor intersection
        // Use the SAME mapping as the drag loop (mouse corresponds to arrow tip in world space).
        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
            const origin = gizmo.target.mesh.position;
            const vNow = gizmo.target.velocity.clone();
            const tipDelta = new THREE.Vector3().subVectors(intersection, origin);
            if (tipDelta.lengthSq() < 1e-10) {
                tipDelta.set(1, 0, 0);
            }

            if (interactionState.velocityEditMode === 'xz') {
                tipDelta.y = 0;
                if (tipDelta.lengthSq() > 1e-10) {
                    const newVel = tipDelta.divideScalar(GIZMO_TUNING.VELOCITY_ARROW_SCALE);
                    newVel.y = vNow.y;
                    gizmo.target.velocity.copy(newVel);
                }
            } else {
                const vFlat = vNow.clone();
                vFlat.y = 0;
                const hDir =
                    vFlat.lengthSq() > 1e-10 ? vFlat.normalize() : new THREE.Vector3(1, 0, 0);
                const up = new THREE.Vector3(0, 1, 0);

                const tipH = tipDelta.dot(hDir);
                const tipY = tipDelta.dot(up);

                const horizontalSpeed = tipH / GIZMO_TUNING.VELOCITY_ARROW_SCALE;
                const verticalSpeed = tipY / GIZMO_TUNING.VELOCITY_ARROW_SCALE;

                const newVel = new THREE.Vector3()
                    .addScaledVector(hDir, horizontalSpeed)
                    .addScaledVector(up, verticalSpeed);

                gizmo.target.velocity.copy(newVel);
            }
        }

        // Show grid + arcs + indicators
        posIndicator.show('both');
        velArc.update();

        return;
    }

    // Check for tilt ring before the general gizmo check so it takes priority.
    if (gizmo.tiltRing?.visible && gizmo.target instanceof CelestialBody) {
        const tiltIntersects = raycaster.intersectObjects(
            [gizmo.tiltRing, gizmo.tiltKnob].filter((m) => m.visible),
            false
        );
        if (tiltIntersects.length > 0) {
            isTilting = true;
            controls.enabled = false;
            // Drag plane normal is perpendicular to the tilt ring's plane.
            // The tilt ring's plane contains world-Y and the azimuth forward direction.
            // Normal = worldX rotated by azimuth around Y = (cos(az), 0, -sin(az)).
            const az = THREE.MathUtils.degToRad(gizmo.target.rotation.azimuth ?? 0);
            dragPlane.setFromNormalAndCoplanarPoint(
                new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)),
                gizmo.target.mesh.position
            );
            // Highlight ring while dragging
            (gizmo.tiltRing.material as THREE.MeshPhongMaterial).color.set(0xffffff);
            (gizmo.tiltRing.material as THREE.MeshPhongMaterial).emissive.set(0x666666);
            if (!isPaused && !isFreeCameraMode) {
                togglePause();
                wasRunningBeforeDrag = true;
            }
            return;
        }
    }

    // Check for azimuth ring before the general gizmo check.
    if (gizmo.azimuthRing?.visible && gizmo.target instanceof CelestialBody) {
        const azimuthIntersects = raycaster.intersectObjects(
            [gizmo.azimuthRing, gizmo.azimuthKnob].filter((m) => m.visible),
            false
        );
        if (azimuthIntersects.length > 0) {
            isAzimuthDragging = true;
            controls.enabled = false;
            // Drag plane normal = Y-axis  =>  the XZ plane through the body.
            dragPlane.setFromNormalAndCoplanarPoint(
                new THREE.Vector3(0, 1, 0),
                gizmo.target.mesh.position
            );
            (gizmo.azimuthRing.material as THREE.MeshPhongMaterial).color.set(0xffffff);
            (gizmo.azimuthRing.material as THREE.MeshPhongMaterial).emissive.set(0x666666);
            if (!isPaused && !isFreeCameraMode) {
                togglePause();
                wasRunningBeforeDrag = true;
            }
            return;
        }
    }

    // Check for Gizmo first
    const gizmoIntersects = raycaster.intersectObjects(gizmo.group.children, true);
    if (gizmoIntersects.length > 0 && gizmo?.target) {
        // Gravity arrow is informational-only (shows net gravitational acceleration).
        // Ignore clicks/drags on it so it can't be used to move the body.
        if (gizmoIntersects[0].object?.userData?.isGravityGizmo) {
            return;
        }
        // Tilt ring is handled in the block above; skip it here to avoid spurious repositioning.
        if (gizmoIntersects[0].object?.userData?.isTiltGizmo) {
            return;
        }
        // Azimuth ring is handled in the block above; skip it here to avoid spurious repositioning.
        if (gizmoIntersects[0].object?.userData?.isAzimuthGizmo) {
            return;
        }

        interactionState.isRepositioning = true;
        activeAxis = gizmoIntersects[0].object.userData.axis;
        // Inside onMouseDown, when an arrow is clicked:
        gizmo.arrows.forEach((a) => ((a.line.material as THREE.LineBasicMaterial).opacity = 0.2)); // Dim others
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _parentArrow = gizmoIntersects[0].object.parent as Record<string, any>;
        if (_parentArrow?.line?.material)
            (_parentArrow.line.material as THREE.LineBasicMaterial).opacity = 1.0; // Highlight active
        controls.enabled = false; // Stop camera from moving

        // Capture initial camera offset relative to the body so we can restore perspective on mouse-up.
        // (We do NOT translate the camera during the drag, but we should "snap" back to the same
        // relative offset at the end so the user keeps their original viewpoint.)
        dragCameraOffset.subVectors(camera.position, gizmo.target.mesh.position);

        // For stable 1D axis dragging:
        // - Raycast mouse onto a plane that CONTAINS the axis and is as "screen-facing" as possible.
        // - Use incremental drag (start intersection + start position) to avoid runaway.
        const axisDir =
            activeAxis === 'x'
                ? new THREE.Vector3(1, 0, 0)
                : activeAxis === 'y'
                  ? new THREE.Vector3(0, 1, 0)
                  : new THREE.Vector3(0, 0, 1);

        // Camera direction (from camera into the scene)
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);

        // Compute a plane normal that:
        // 1) is perpendicular to the axisDir (so the plane contains the axis)
        // 2) is as aligned with cameraDirection as possible (for stable ray-plane intersection)
        //
        // This is accomplished by projecting cameraDirection onto the plane perpendicular to axisDir:
        //   n = cameraDirection - axisDir * dot(cameraDirection, axisDir)
        // If that collapses (axis nearly parallel to camera), fall back to camera.up similarly.
        let planeNormal = cameraDirection
            .clone()
            .sub(axisDir.clone().multiplyScalar(cameraDirection.dot(axisDir)));
        if (planeNormal.lengthSq() < 1e-10) {
            planeNormal = camera.up
                .clone()
                .sub(axisDir.clone().multiplyScalar(camera.up.dot(axisDir)));
        }
        if (planeNormal.lengthSq() < 1e-10) {
            // Absolute last resort: pick any vector not parallel to axisDir
            planeNormal =
                Math.abs(axisDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
            planeNormal.sub(axisDir.clone().multiplyScalar(planeNormal.dot(axisDir)));
        }
        planeNormal.normalize();

        dragPlane.setFromNormalAndCoplanarPoint(planeNormal, gizmo.target.mesh.position);

        // Cache initial intersection + starting position so drag is incremental.
        // If the ray doesn't hit the plane (can happen if plane is edge-on), fall back to body origin.
        interactionState.dragStartIntersection = new THREE.Vector3();
        interactionState.dragStartPosition = gizmo.target.mesh.position.clone();
        const ok = raycaster.ray.intersectPlane(dragPlane, interactionState.dragStartIntersection);
        if (!ok) {
            interactionState.dragStartIntersection.copy(gizmo.target.mesh.position);
        }

        // Show grid and indicators
        posIndicator.show('position');

        if (!isPaused && !isFreeCameraMode) {
            togglePause();
            wasRunningBeforeDrag = true;
        }
        return;
    }

    // Check for Planets if no gizmo was clicked
    const bodyIntersects = raycaster.intersectObjects(
        simulationState.bodies.map((b) => b.mesh),
        true
    );

    if (bodyIntersects.length > 0) {
        const clickedBody = bodyIntersects[0].object.userData.parentBody;
        if (clickedBody) {
            // Click-to-zoom rules:
            // - If nothing is selected: selecting any body should zoom.
            // - If a body IS selected:
            //    - Clicking the SAME body again should NOT zoom.
            //    - Clicking a DIFFERENT body should zoom.
            const prevSelectedBody =
                selectedBody &&
                simulationState.bodies.includes(selectedBody) &&
                !selectedBody._isDisposed
                    ? selectedBody
                    : null;

            selectedBody = clickedBody; // Update global selection

            // Update management panel with selected body
            uiManager.managementPanel.setSelectedBody(clickedBody);

            // Update bodies table highlight
            refreshBodiesTable();

            const isDifferentSelection = prevSelectedBody !== clickedBody;

            // Keep camera focus object-based; do not depend on preset camera ids.
            // This fixes follow/look-at for newly created bodies (they have no id).
            setFocusBody(clickedBody, { zoom: cameraState.isLookAtMode && isDifferentSelection });

            // Clear any camera preset highlight (manual selection).
            // Do NOT clear LOOK AT / FREE / TARGET highlights, those are toggles with independent state.
            clearCameraPresetHighlights();

            // TARGET (new behavior):
            // - If Target is ON, show gizmo for the selected body.
            // - If Target is OFF, keep body selected but hide gizmo.
            if (cameraState.isTargetMode) {
                gizmo.attach(clickedBody);
            } else {
                gizmo.attach(null);
            }
        }
    } else {
        // Clicked on empty space:
        // - Always deselect the body (UI + gizmo)
        // - BUT do not change camera focus if Look At is ON (so camera continues to follow/orbit focusBody)
        selectedBody = null;
        manuallySelectedBody = null;

        if (!cameraState.isLookAtMode) {
            cameraState.focusBody = null;
        }

        gizmo.attach(null);
        uiManager.managementPanel.setSelectedBody(null);

        refreshBodiesTable();
        flightHUD.forceHintRefresh();
    }
}

function onMouseMove(event: MouseEvent) {
    // Ignore synthetic mouse events immediately after touch gestures.
    if (Date.now() < interactionState.touchIgnoreUntil) return;

    // Flight mode: capture mouse movement as pointer offset for steering.
    // The pointer is locked during flight, so event.movementX/Y gives reliable deltas.
    if (flightState.isActive && document.pointerLockElement === renderer.domElement) {
        // Ignore mouse movement while autopilot is active so it can't be accidentally
        // steered (or later lurch) from accumulated offsets.
        if (!autopilotState.isActive) {
            const maxOff = FLIGHT_MAX_POINTER_OFFSET;
            flightState.pointerOffsetX = Math.max(
                -maxOff,
                Math.min(maxOff, flightState.pointerOffsetX + (event.movementX || 0))
            );
            flightState.pointerOffsetY = Math.max(
                -maxOff,
                Math.min(maxOff, flightState.pointerOffsetY + (event.movementY || 0))
            );
        }
        return; // Skip all other mouse-look / gizmo-drag logic during flight
    }

    // Handle Velocity Dragging OR middle mouse button
    // NOTE: While dragging velocity we still allow right-mouse mouse-look + zoom.
    // So we do NOT early-return here; we only return if we actually applied a drag update.
    if ((isChangingVelocity || isMiddleMouseVelocity) && gizmo.target) {
        // If RMB mouse-look is held at the same time as a velocity drag, keep normal cursor coords.
        // (Pointer-lock is disabled in that case in onMouseDown.)
        const rmbDown = (event.buttons & 2) === 2;

        // Use center screen coordinates if pointer is locked (and we're not also holding RMB),
        // otherwise use actual mouse position.
        if (!rmbDown && document.pointerLockElement === renderer.domElement) {
            mouse.x = 0;
            mouse.y = 0;
        } else {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        }
        raycaster.setFromCamera(mouse, camera);

        // Check if mouse is over another body for snapping
        const otherBodies = simulationState.bodies.filter(
            (b) => b !== gizmo.target && !b?._isDisposed && b?.mesh
        );
        const bodyIntersects = raycaster.intersectObjects(otherBodies.map((b) => b.mesh));

        if (bodyIntersects.length > 0) {
            // Snap to the target body
            const targetBody = bodyIntersects[0].object.userData.parentBody;
            const newVel = new THREE.Vector3().subVectors(
                targetBody.mesh.position,
                gizmo.target.mesh.position
            );
            gizmo.target.velocity.copy(newVel.divideScalar(VEL_SCALE));
        } else {
            // Use drag plane intersection, then constrain by current edit mode
            const intersection = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
                const origin = gizmo.target.mesh.position;
                const vNow = gizmo.target.velocity.clone();

                // Map mouse -> desired arrow tip position in world space, then derive velocity:
                //   velocity = (tipPos - origin) / GIZMO_TUNING.VELOCITY_ARROW_SCALE
                // This keeps the arrow tip "attached" to the mouse and avoids the initial shrink/jump.

                const tipDelta = new THREE.Vector3().subVectors(intersection, origin);

                // Avoid NaNs near origin
                if (tipDelta.lengthSq() < 1e-10) {
                    tipDelta.set(1, 0, 0);
                }

                if (interactionState.velocityEditMode === 'xz') {
                    // XZ edit: preserve existing Y, only update horizontal components.
                    // The drag plane in XZ mode is already a horizontal plane, so we don't need to
                    // “zero out” Y from a screen-plane projection (that caused the lag/jitter).
                    if (tipDelta.lengthSq() > 1e-10) {
                        const newVel = tipDelta.divideScalar(GIZMO_TUNING.VELOCITY_ARROW_SCALE);
                        newVel.y = vNow.y;
                        gizmo.target.velocity.copy(newVel);
                    }
                } else {
                    // Y edit: allow full +/-90° pitch while keeping heading (XZ direction) fixed.
                    //
                    // Old behavior only updated v.y and kept XZ magnitude fixed, which caps pitch < 90°
                    // unless XZ magnitude is already ~0. We instead treat the drag as setting (pitch + magnitude)
                    // in a vertical plane that contains:
                    //   - the current horizontal heading direction (hDir)
                    //   - world up
                    //
                    // Let tipDelta decomposed in that plane:
                    //   tipH = dot(tipDelta, hDir)
                    //   tipY = dot(tipDelta, up)
                    //
                    // This yields a velocity vector:
                    //   v = hDir * (tipH/ARROW_SCALE) + up * (tipY/ARROW_SCALE)
                    // Which supports tipH -> 0 (pure vertical) => +/-90°.
                    const vFlat = vNow.clone();
                    vFlat.y = 0;
                    const hDir =
                        vFlat.lengthSq() > 1e-10 ? vFlat.normalize() : new THREE.Vector3(1, 0, 0);
                    const up = new THREE.Vector3(0, 1, 0);

                    const tipH = tipDelta.dot(hDir);
                    const tipY = tipDelta.dot(up);

                    const horizontalSpeed = tipH / GIZMO_TUNING.VELOCITY_ARROW_SCALE;
                    const verticalSpeed = tipY / GIZMO_TUNING.VELOCITY_ARROW_SCALE;

                    const newVel = new THREE.Vector3()
                        .addScaledVector(hDir, horizontalSpeed)
                        .addScaledVector(up, verticalSpeed);
                    gizmo.target.velocity.copy(newVel);
                }

                velArc.update();
                // Do NOT return here; allow mouse-look to also run if RMB is held.
                // (Velocity updates will still be stable because Y-mode locks XZ, and XZ-mode is screen-plane constrained.)
                // If you want to prevent simultaneous camera movement, re-add `return`.
                //
                // We *do* return only when pointer is locked and we are in velocity drag (without RMB),
                // to avoid the mouse coords being meaningless.
                if (!rmbDown && document.pointerLockElement === renderer.domElement) return;
            }
        }
    }

    // Handle tilt ring drag — 3D analytic tangent projection.
    //
    // The tilt ring parameterization (azimuth=az, radius=Rt):
    //   P(θ) = (sin(az)·sin(θ), cos(θ), cos(az)·sin(θ)) * Rt  relative to body
    // Tangent = dP/dθ = (sin(az)·cos(θ), −sin(θ), cos(az)·cos(θ)) * Rt
    //
    // We project two nearby points on the ring to screen to get the screen-space tangent
    // direction AND pixels-per-radian sensitivity — both correct at any camera angle.
    if (isTilting && gizmo.target instanceof CelestialBody) {
        const W = window.innerWidth,
            H = window.innerHeight;
        const tiltRad = THREE.MathUtils.degToRad(gizmo.target.rotation.tilt);
        const azRad = THREE.MathUtils.degToRad(gizmo.target.rotation.azimuth ?? 0);
        const Rt = gizmo._tiltRingRadius;
        const bodyPos = gizmo.target.mesh.position;
        const eps = 0.002; // radians; large enough to avoid float noise

        // Two knob positions straddling the current tilt angle
        const makeKnob = (t: number) =>
            bodyPos
                .clone()
                .add(
                    new THREE.Vector3(
                        Math.sin(azRad) * Math.sin(t) * Rt,
                        Math.cos(t) * Rt,
                        Math.cos(azRad) * Math.sin(t) * Rt
                    )
                );
        const n1 = makeKnob(tiltRad - eps).project(camera);
        const n2 = makeKnob(tiltRad + eps).project(camera);

        // Screen pixels per radian along the tangent
        const tsx = ((n2.x - n1.x) * (W / 2)) / (2 * eps);
        const tsy = (-(n2.y - n1.y) * (H / 2)) / (2 * eps); // NDC Y up → screen Y down
        const tsLen = Math.hypot(tsx, tsy);

        if (tsLen > 0.5) {
            // skip only when ring tangent truly collapses to depth axis
            const tx = tsx / tsLen;
            const ty = tsy / tsLen;
            const movement = event.movementX * tx + event.movementY * ty;
            const deltaDeg = THREE.MathUtils.radToDeg(movement / tsLen);

            const newTiltDeg = gizmo.target.rotation.tilt + deltaDeg;
            const newTiltRad = THREE.MathUtils.degToRad(newTiltDeg);
            // Use setFromAxisAngle (not setFromUnitVectors) to avoid the antiparallel
            // singularity at tilt = ±180° where setFromUnitVectors picks the wrong axis.
            const tiltQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0),
                newTiltRad
            );
            const azQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                azRad
            );
            gizmo.target.mesh.quaternion.multiplyQuaternions(azQuat, tiltQuat);
            gizmo.target.rotation.tilt = newTiltDeg;
            if (gizmo.target.rings) {
                gizmo.target.rings.position.copy(gizmo.target.mesh.position);
                gizmo.target.rings.quaternion.copy(gizmo.target.mesh.quaternion);
            }
        }
        if (!isFreeCameraMode) return;
    }

    // Handle azimuth ring drag — same 3D analytic tangent projection.
    //
    // Azimuth ring parameterization (radius=Ra, in XZ plane, Y=0):
    //   P(φ) = (sin(φ), 0, cos(φ)) * Ra  relative to body
    // Tangent = dP/dφ = (cos(φ), 0, −sin(φ)) * Ra
    if (isAzimuthDragging && gizmo.target instanceof CelestialBody) {
        const W = window.innerWidth,
            H = window.innerHeight;
        const tiltRad = THREE.MathUtils.degToRad(gizmo.target.rotation.tilt);
        const azRad = THREE.MathUtils.degToRad(gizmo.target.rotation.azimuth ?? 0);
        const Ra = gizmo._azimuthRingRadius;
        const bodyPos = gizmo.target.mesh.position;
        const eps = 0.002;

        const makeKnob = (a: number) =>
            bodyPos.clone().add(new THREE.Vector3(Math.sin(a) * Ra, 0, Math.cos(a) * Ra));
        const n1 = makeKnob(azRad - eps).project(camera);
        const n2 = makeKnob(azRad + eps).project(camera);

        const tsx = ((n2.x - n1.x) * (W / 2)) / (2 * eps);
        const tsy = (-(n2.y - n1.y) * (H / 2)) / (2 * eps);
        const tsLen = Math.hypot(tsx, tsy);

        if (tsLen > 0.5) {
            const tx = tsx / tsLen;
            const ty = tsy / tsLen;
            const movement = event.movementX * tx + event.movementY * ty;
            const deltaDeg = THREE.MathUtils.radToDeg(movement / tsLen);

            const newAzimuthDeg = (gizmo.target.rotation.azimuth ?? 0) + deltaDeg;
            const newAzRad = THREE.MathUtils.degToRad(newAzimuthDeg);
            const tiltQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0),
                tiltRad
            );
            const azQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                newAzRad
            );
            gizmo.target.mesh.quaternion.multiplyQuaternions(azQuat, tiltQuat);
            gizmo.target.rotation.azimuth = newAzimuthDeg;
            if (gizmo.target.rings) {
                gizmo.target.rings.position.copy(gizmo.target.mesh.position);
                gizmo.target.rings.quaternion.copy(gizmo.target.mesh.quaternion);
            }
        }
        if (!isFreeCameraMode) return;
    }

    // Handle position gizmo dragging
    if (interactionState.isRepositioning && gizmo.target) {
        // Intersect the cached dragPlane, and move ONLY along the chosen axis by the
        // amount the intersection moved since drag start (incremental, stable).
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const intersection = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(dragPlane, intersection)) return;

        const axisDir =
            activeAxis === 'x'
                ? new THREE.Vector3(1, 0, 0)
                : activeAxis === 'y'
                  ? new THREE.Vector3(0, 1, 0)
                  : new THREE.Vector3(0, 0, 1);

        const startI = interactionState.dragStartIntersection || intersection;
        const startPos = interactionState.dragStartPosition || gizmo.target.mesh.position.clone();

        const deltaI = new THREE.Vector3().subVectors(intersection, startI);
        const amt = deltaI.dot(axisDir);

        gizmo.target.mesh.position.copy(startPos).addScaledVector(axisDir, amt);

        // Do NOT move the camera while dragging the coordinate gizmo (axis arrows).
        // Camera follow during drag causes unstable interaction / odd body motion.
        // The camera can still be moved manually by the user (RMB / zoom / etc).

        // Sync visuals
        if (gizmo.target instanceof CelestialBody && gizmo.target.rings) {
            gizmo.target.rings.position.copy(gizmo.target.mesh.position);
        }
        // Don't return here - let mouse look still work if in free camera mode
        if (!isFreeCameraMode) return;
    }

    // Mouse look: rotate camera when mouse look is active
    if (isMouseLookActive) {
        // Ensure velocity dragging doesn't block mouse-look updates
        // (mousemove can fire with button states that don't include event.movement if not pointer-locked)
        // Movement deltas still come through; we just want to guarantee the look block runs.
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        if (isFreeCameraMode) {
            // Free camera mode: rotate camera in place
            const euler = new THREE.Euler(0, 0, 0, 'YXZ');
            euler.setFromQuaternion(camera.quaternion);

            euler.y -= movementX * cameraRotationSpeed;
            euler.x -= movementY * cameraRotationSpeed;

            // Clamp vertical rotation to prevent flipping
            euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));

            camera.quaternion.setFromEuler(euler);
        } else if (!cameraState.isLookAtMode) {
            // Look At OFF: always orbit around solar system center [0,0,0]
            // (selection should not change the orbit anchor)
            const target = NONE_FOCUS_POSITION.clone();
            const offset = camera.position.clone().sub(target);

            // Convert to spherical coordinates
            const spherical = new THREE.Spherical();
            spherical.setFromVector3(offset);

            // Update angles based on mouse movement
            spherical.theta -= movementX * cameraRotationSpeed;
            spherical.phi -= movementY * cameraRotationSpeed;

            // Clamp phi to prevent flipping
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

            // Convert back to cartesian
            offset.setFromSpherical(spherical);
            camera.position.copy(target).add(offset);
            camera.lookAt(target);
            controls.target.copy(target);
        } else {
            // Look At ON:
            // - If a body is focused => orbit around it
            // - If no body is focused => behave like Look At OFF (center orbit)
            const focusObj = getFocusObject();
            if (focusObj && simulationState.bodies.includes(focusObj) && !focusObj._isDisposed) {
                const target = focusObj.mesh.position.clone();
                const offset = camera.position.clone().sub(target);

                // Convert to spherical coordinates
                const spherical = new THREE.Spherical();
                spherical.setFromVector3(offset);

                // Update angles based on mouse movement
                spherical.theta -= movementX * cameraRotationSpeed;
                spherical.phi -= movementY * cameraRotationSpeed;

                // Clamp phi to prevent flipping
                spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

                // Convert back to cartesian
                offset.setFromSpherical(spherical);
                camera.position.copy(target).add(offset);
                camera.lookAt(target);
                controls.target.copy(target);
            } else {
                const target = NONE_FOCUS_POSITION.clone();
                const offset = camera.position.clone().sub(target);

                const spherical = new THREE.Spherical();
                spherical.setFromVector3(offset);

                spherical.theta -= movementX * cameraRotationSpeed;
                spherical.phi -= movementY * cameraRotationSpeed;
                spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

                offset.setFromSpherical(spherical);
                camera.position.copy(target).add(offset);
                camera.lookAt(target);
                controls.target.copy(target);
            }
        }

        // If dragging velocity arrow, keep drag plane consistent with the active edit mode.
        if (isChangingVelocity && gizmo.target) {
            const origin = gizmo.target.mesh.position;

            if (interactionState.velocityEditMode === 'y') {
                const v = gizmo.target.velocity.clone();
                v.y = 0;
                const hDir = v.lengthSq() > 1e-10 ? v.normalize() : new THREE.Vector3(1, 0, 0);
                const up = new THREE.Vector3(0, 1, 0);
                const planeNormal = new THREE.Vector3().crossVectors(hDir, up).normalize();
                dragPlane.setFromNormalAndCoplanarPoint(planeNormal, origin);
            } else {
                dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), origin);
            }

            // Recalculate velocity (same constrained mapping as onMouseMove)
            raycaster.setFromCamera(mouse, camera);
            const intersection = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
                const vNow = gizmo.target.velocity.clone();
                const tipDelta = new THREE.Vector3().subVectors(intersection, origin);
                if (tipDelta.lengthSq() < 1e-10) {
                    tipDelta.set(1, 0, 0);
                }

                if (interactionState.velocityEditMode === 'xz') {
                    if (tipDelta.lengthSq() > 1e-10) {
                        const newVel = tipDelta.divideScalar(GIZMO_TUNING.VELOCITY_ARROW_SCALE);
                        newVel.y = vNow.y;
                        gizmo.target.velocity.copy(newVel);
                    }
                } else {
                    const vFlat = vNow.clone();
                    vFlat.y = 0;
                    const hDir =
                        vFlat.lengthSq() > 1e-10 ? vFlat.normalize() : new THREE.Vector3(1, 0, 0);
                    const up = new THREE.Vector3(0, 1, 0);

                    const tipH = tipDelta.dot(hDir);
                    const tipY = tipDelta.dot(up);

                    const horizontalSpeed = tipH / GIZMO_TUNING.VELOCITY_ARROW_SCALE;
                    const verticalSpeed = tipY / GIZMO_TUNING.VELOCITY_ARROW_SCALE;

                    const newVel = new THREE.Vector3()
                        .addScaledVector(hDir, horizontalSpeed)
                        .addScaledVector(up, verticalSpeed);
                    gizmo.target.velocity.copy(newVel);
                }
            }
        }
    }

    return;
}

function onMouseUp(event: MouseEvent) {
    // Ignore synthetic mouse events immediately after touch gestures.
    if (Date.now() < interactionState.touchIgnoreUntil) return;

    // Flight mode: release LMB stops firing.
    if (flightState.isActive && event.button === 0) {
        flightState.isFiring = false;
        return;
    }

    // Middle mouse button release
    if (event.button === 1) {
        isMiddleMouseVelocity = false;
        interactionState.isMiddleMouseVelocity = false;

        // If LMB velocity drag is still active, do NOT hide the grid/indicators/arcs.
        // This prevents "grid disappearing" when the user releases MMB while still dragging with LMB.
        if (!isChangingVelocity) {
            posIndicator.hide();

            // Hide arc helper for middle-mouse velocity drag as well
            velArc.hideAll();
        }

        return;
    }

    // Deactivate mouse look on right mouse button release
    if (event.button === 2) {
        isMouseLookActive = false;
        // Exit pointer lock
        if (document.pointerLockElement === renderer.domElement) {
            document.exitPointerLock();
        }
    }

    // Left mouse button releases
    if (event.button === 0) {
        const wasVel = isChangingVelocity;
        const wasTilting = isTilting;
        const wasAzimuth = isAzimuthDragging;

        interactionState.isRepositioning = false;
        isChangingVelocity = false;
        interactionState.isChangingVelocity = false;
        isTilting = false;
        isAzimuthDragging = false;
        activeAxis = null;
        gizmo.arrows.forEach((a) => ((a.line.material as THREE.LineBasicMaterial).opacity = 1.0));

        // Restore tilt ring color
        if (wasTilting && gizmo.tiltRing) {
            (gizmo.tiltRing.material as THREE.MeshPhongMaterial).color.set(0xff8800);
            (gizmo.tiltRing.material as THREE.MeshPhongMaterial).emissive
                .setRGB(1, 0.533, 0)
                .multiplyScalar(0.25);
        }
        // Restore azimuth ring color
        if (wasAzimuth && gizmo.azimuthRing) {
            (gizmo.azimuthRing.material as THREE.MeshPhongMaterial).color.set(0x00ccff);
            (gizmo.azimuthRing.material as THREE.MeshPhongMaterial).emissive
                .setRGB(0, 0.8, 1)
                .multiplyScalar(0.2);
        }
        controls.enabled = !isFreeCameraMode;
        posIndicator.hide();

        velArc.hideAll();

        if (wasVel) {
            // Restore velocity arrow color after drag
            try {
                gizmo.velocityArrow.setColor(new THREE.Color(0xffff00));
            } catch (e) {
                console.error('Error applying body color edit:', e);
            }
        }

        if (wasVel && interactionState.velocityEditHadRunningBeforeDrag) {
            // Resume only if we were running when the drag began
            togglePause();
            interactionState.velocityEditHadRunningBeforeDrag = false;
        }

        if (wasRunningBeforeDrag) {
            togglePause();
            wasRunningBeforeDrag = false;
        }

        // If we were repositioning with the coordinate gizmo, restore the camera to its
        // original offset relative to the body (preserves the user's perspective).
        //
        // IMPORTANT: Only do this if we actually started an axis drag (dragCameraOffset captured),
        // otherwise a normal click selection could incorrectly "snap" the camera into/near the body.
        if (
            !wasVel &&
            !isFreeCameraMode &&
            gizmo?.target &&
            !gizmo.target._isDisposed &&
            gizmo.target.mesh &&
            interactionState.dragStartPosition &&
            interactionState.dragStartIntersection
        ) {
            camera.position.copy(gizmo.target.mesh.position).add(dragCameraOffset);

            // If Look At is enabled, keep controls target consistent with the focus.
            // Otherwise keep orbit anchored at center.
            const lookAtFocus = getFocusObject();
            if (cameraState.isLookAtMode && lookAtFocus) {
                controls.target.copy(lookAtFocus.mesh.position);
            } else {
                controls.target.copy(NONE_FOCUS_POSITION);
            }
            controls.update();
        }

        // Clear axis-drag caches
        interactionState.dragStartPosition = null;
        interactionState.dragStartIntersection = null;
    }
}

function calcFitDistanceForBody(body: Body | null) {
    const radius = body && !body._isDisposed && body.mesh ? Math.max(1e-6, body.radius || 1) : 1;
    // Fit a sphere of size `radius` inside the camera's vertical FOV, with margin.
    const fovRad = THREE.MathUtils.degToRad(camera.fov || 60);
    const margin = 1.6;
    const dist = (radius * margin) / Math.tan(fovRad / 2);

    const minDist = radius * 2.2;
    const maxDist = MAX_ZOOM_OUT_DISTANCE;
    const worldRadius = radius;
    const farMargin = Math.max(worldRadius * 2, radius * 20, 100000 * SCALE_FACTOR);
    return THREE.MathUtils.clamp(dist, minDist, Math.min(maxDist, farMargin));
}

function triggerZoomToBody(bodyOrNull: Body | null) {
    const target =
        bodyOrNull && simulationState.bodies.includes(bodyOrNull) && !bodyOrNull._isDisposed
            ? bodyOrNull
            : null;

    if (!target) {
        const direction = new THREE.Vector3()
            .subVectors(camera.position, NONE_FOCUS_POSITION)
            .normalize();
        const distance = 50000;
        const newPos = NONE_FOCUS_POSITION.clone().add(direction.multiplyScalar(distance));
        camera.position.copy(newPos);
        return;
    }

    const targetPos = target.mesh.position;
    const direction = new THREE.Vector3().subVectors(camera.position, targetPos).normalize();
    const distance = calcFitDistanceForBody(target);
    camera.position.copy(targetPos.clone().add(direction.multiplyScalar(distance)));
}

function setFocusBody(bodyOrNull: Body | null, { zoom = false } = {}) {
    const body =
        bodyOrNull && simulationState.bodies.includes(bodyOrNull) && !bodyOrNull._isDisposed
            ? bodyOrNull
            : null;
    cameraState.focusBody = body;

    // Maintain selection pointers used by UI/gizmo
    selectedBody = body;
    manuallySelectedBody = body;

    if (cameraState.isLookAtMode) {
        const targetPos = body ? body.mesh.position : NONE_FOCUS_POSITION;
        controls.target.copy(targetPos);
        controls.update();
        camera.lookAt(targetPos);

        if (zoom) {
            triggerZoomToBody(body);
        }
    } else {
        // Look At OFF: selection should not affect orbit anchor.
        controls.target.copy(NONE_FOCUS_POSITION);
    }

    refreshBodiesTable();
}

let _lastFrameTime: number = performance.now();

// \u2500\u2500 Animate-loop scratch vectors \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Pre-allocated once to eliminate per-frame GC pressure from common operations.
const _animCamDirection = new THREE.Vector3();
const _animCamRight = new THREE.Vector3();
const _animCamMovement = new THREE.Vector3();
const _animOldPos = new THREE.Vector3();
// Pre-allocated star-direction array for the Earth atmosphere shell (8 stars max).
const _ATMO_MAX_STARS = 8;
const _animStarDirsWorld: THREE.Vector3[] = Array.from(
    { length: _ATMO_MAX_STARS },
    () => new THREE.Vector3(1, 0, 0)
);

function animate() {
    const now = performance.now();
    // Real wall-clock frame time (capped at 100ms to guard against tab-hidden spikes).
    const wallDt = Math.min((now - _lastFrameTime) / 1000, 0.1);
    _lastFrameTime = now;
    requestAnimationFrame(animate);
    const tScale = timeScale;
    const steps = stepsPerFrame;
    const dt = (SIM.BASE_FRAME_DT * TIME_SCALE * tScale) / steps;
    const dtTotal = dt * steps;

    // Surface camera transform update.
    // IMPORTANT: when surface mode is active, it fully owns camera position + orientation.
    // We still run physics (so the planet rotates under you), but we must skip any other
    // camera-follow / look-at / orbit-controls logic later in this frame.
    const isSurfaceModeActive = !!surfaceCam.isActive;
    if (isSurfaceModeActive) {
        surfaceCam.updateTransform();
    }

    // Flight mode camera + controls update.
    // When active, flight mode fully owns camera position/orientation and ship velocity.
    const isFlightModeActive =
        flightState.isActive && !!flightState.activeShip && !flightState.activeShip._isDisposed;

    // Auto-exit if the active ship was destroyed this frame (absorbed by collision, etc.)
    if (
        flightState.isActive &&
        flightState.activeShip &&
        (flightState.activeShip._isDisposed ||
            !simulationState.bodies.includes(flightState.activeShip))
    ) {
        exitFlightMode();
    }

    // Auto-cancel autopilot if the known ship was destroyed while autopilot was running.
    if (autopilotState.isActive) {
        const ap_ship = flightState.knownShip;
        if (!ap_ship || ap_ship._isDisposed || !simulationState.bodies.includes(ap_ship)) {
            cancelAutopilot();
        }
        // Manual thrust/steering keys are intentionally ignored during autopilot
        // (they no longer disengage it).
    }

    if (isFlightModeActive) {
        updateFlightControls(wallDt);
        // Camera is repositioned AFTER the physics loop (see updateFlightCamera below)
        // so it always reflects the ship's final post-physics position.
    }

    // Background warp: keep the known ship at warp speed when the player has
    // exited the cockpit while warp was still active.
    if (!isFlightModeActive && flightState.warpActive) {
        const bgShip = flightState.knownShip;
        if (bgShip && !bgShip._isDisposed && bgShip.mesh) {
            const bgFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bgShip.mesh.quaternion);
            bgShip.velocity.copy(bgFwd).multiplyScalar(FLIGHT_WARP_SPEED);
        } else {
            flightState.warpActive = false;
        }
    }

    // Always update warp streaks — opacity is driven by ship speed so no
    // explicit start/stop is needed.  Runs even when not in flight mode so
    // the tunnel is visible from lookAt mode and fades naturally on decel.
    const _warpUpdateShip = flightState.activeShip ?? flightState.knownShip;
    if (_warpUpdateShip && !_warpUpdateShip._isDisposed && _warpUpdateShip.mesh) {
        warpEffect.update(
            dtTotal,
            _warpUpdateShip.mesh.position,
            _warpUpdateShip.velocity,
            FLIGHT_WARP_SPEED
        );
    }

    // WASD camera movement (works in both free camera and normal mode, but NOT in flight mode)
    if (!isFlightModeActive) {
        const speed = (keys.shift ? cameraSpeed * 10 : cameraSpeed) * SCALE_FACTOR;
        camera.getWorldDirection(_animCamDirection);
        _animCamRight.crossVectors(camera.up, _animCamDirection).normalize();

        _animCamMovement.set(0, 0, 0);
        if (keys.w) _animCamMovement.addScaledVector(_animCamDirection, speed);
        if (keys.s) _animCamMovement.addScaledVector(_animCamDirection, -speed);
        if (keys.a) _animCamMovement.addScaledVector(_animCamRight, speed);
        if (keys.d) _animCamMovement.addScaledVector(_animCamRight, -speed);
        if (keys.space) _animCamMovement.y += speed;
        if (keys.c) _animCamMovement.y -= speed;

        const didMove = _animCamMovement.lengthSq() > 0;

        if (didMove) {
            camera.position.add(_animCamMovement);

            // In normal mode (except 'None'), also move the orbit controls target to maintain relative position
            // For 'None' mode, keep target fixed at center [0,0,0]
            if (!isFreeCameraMode && focusID !== 'camNone') {
                controls.target.add(_animCamMovement);
            }

            // If dragging gizmo arrow, move the planet along that specific axis
            if (interactionState.isRepositioning && gizmo.target && activeAxis) {
                if (activeAxis === 'x') {
                    gizmo.target.mesh.position.x += _animCamMovement.x;
                } else if (activeAxis === 'y') {
                    gizmo.target.mesh.position.y += _animCamMovement.y;
                } else if (activeAxis === 'z') {
                    gizmo.target.mesh.position.z += _animCamMovement.z;
                }
            }

            // If dragging velocity arrow and camera moved, keep plane through body and recalc velocity.
            // IMPORTANT: plane must respect the active velocity edit mode:
            // - XZ mode => horizontal plane (y=0) through the body
            // - Y mode  => vertical plane containing world-up + current horizontal heading
            if (isChangingVelocity && gizmo.target) {
                const origin = gizmo.target.mesh.position;

                if (interactionState.velocityEditMode === 'y') {
                    const v = gizmo.target.velocity.clone();
                    v.y = 0;
                    const hDir = v.lengthSq() > 1e-10 ? v.normalize() : new THREE.Vector3(1, 0, 0);
                    const up = new THREE.Vector3(0, 1, 0);
                    const planeNormal = new THREE.Vector3().crossVectors(hDir, up).normalize();
                    dragPlane.setFromNormalAndCoplanarPoint(planeNormal, origin);
                } else {
                    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), origin);
                }

                // Use center screen coordinates if pointer is locked
                const targetMouse = new THREE.Vector2(
                    document.pointerLockElement === renderer.domElement ? 0 : mouse.x,
                    document.pointerLockElement === renderer.domElement ? 0 : mouse.y
                );
                raycaster.setFromCamera(targetMouse, camera);
                const intersection = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
                    const vNow = gizmo.target.velocity.clone();
                    const tipDelta = new THREE.Vector3().subVectors(intersection, origin);
                    if (tipDelta.lengthSq() < 1e-10) {
                        tipDelta.set(1, 0, 0);
                    }

                    if (interactionState.velocityEditMode === 'xz') {
                        if (tipDelta.lengthSq() > 1e-10) {
                            const newVel = tipDelta.divideScalar(GIZMO_TUNING.VELOCITY_ARROW_SCALE);
                            newVel.y = vNow.y;
                            gizmo.target.velocity.copy(newVel);
                        }
                    } else {
                        const vFlat = vNow.clone();
                        vFlat.y = 0;
                        const hDir =
                            vFlat.lengthSq() > 1e-10
                                ? vFlat.normalize()
                                : new THREE.Vector3(1, 0, 0);
                        const up = new THREE.Vector3(0, 1, 0);

                        const tipH = tipDelta.dot(hDir);
                        const tipY = tipDelta.dot(up);

                        const horizontalSpeed = tipH / GIZMO_TUNING.VELOCITY_ARROW_SCALE;
                        const verticalSpeed = tipY / GIZMO_TUNING.VELOCITY_ARROW_SCALE;

                        const newVel = new THREE.Vector3()
                            .addScaledVector(hDir, horizontalSpeed)
                            .addScaledVector(up, verticalSpeed);
                        gizmo.target.velocity.copy(newVel);
                    }
                }
            }
        }
    } // end if (!isFlightModeActive) WASD movement

    const focusObj = getFocusObject();
    if (focusObj?.mesh) {
        _animOldPos.copy(focusObj.mesh.position);
    } else {
        _animOldPos.set(0, 0, 0);
    }
    const oldPos = _animOldPos;

    // Physics integration loop
    updateSimulation(simulationState, autopilotState, flightState, steps, dt, updateAutopilot);

    // Collision detection and trail updates (outside integration loop for performance)
    if (!interactionState.isRepositioning) {
        // NOTE: collision resolution can remove bodies from the `bodies` array mid-iteration.
        // Do NOT cache `bodies.length` (or rely on `bodies[j]` being non-undefined) in this loop.
        // Otherwise we can end up with `b1 === undefined` and crash on `b1.updateTrail()`.
        for (let j = 0; j < simulationState.bodies.length; j++) {
            const b1 = simulationState.bodies[j];
            if (!b1) continue;

            // Update the trail position for b1
            if (b1 instanceof CelestialBody) b1.updateTrail(camera.position);
            // Update cloud rotation and ring sync once per frame (not per substep)
            if (b1 instanceof CelestialBody) b1.updateVisuals(dtTotal);
            // Update comet tail with camera-relative rendering (dtTotal = full frame delta)
            if (b1 instanceof Comet) b1.updateTail(dtTotal, camera.position);

            // Skip disposed bodies in collision detection
            if (b1._isDisposed || !b1.mesh) continue;

            // Collision Detection between all pairs of bodies
            for (let k = j + 1; k < simulationState.bodies.length; k++) {
                const b2 = simulationState.bodies[k];
                if (!b2 || b2._isDisposed || !b2.mesh) continue;

                // Early distance culling - skip if bodies are too far apart to possibly collide
                const dx = b1.mesh.position.x - b2.mesh.position.x;
                const dy = b1.mesh.position.y - b2.mesh.position.y;
                const dz = b1.mesh.position.z - b2.mesh.position.z;
                const maxCollisionDist = b1.radius + b2.radius;

                // Quick reject test using Manhattan distance approximation
                if (
                    Math.abs(dx) > maxCollisionDist ||
                    Math.abs(dy) > maxCollisionDist ||
                    Math.abs(dz) > maxCollisionDist
                )
                    continue;

                // Accurate Distance Check (Sphere-to-Sphere) - only if passed quick test
                const distSq = dx * dx + dy * dy + dz * dz;
                const collisionDistSq = maxCollisionDist * maxCollisionDist;

                if (distSq < collisionDistSq) {
                    const { winner, victim } = chooseCollisionWinner(b1, b2);

                    // If the dying body is the current camera focus, hand off focus to the collider
                    // that destroyed it. This avoids a jarring jump back to world center.
                    if (cameraState?.focusBody === victim && winner && !winner._isDisposed) {
                        cameraState.pendingCollisionFocusBody = winner;
                        // Keep camera distance stable; just retarget follow/look-at.
                        setFocusBody(winner, { zoom: false });
                        if (cameraState.isTargetMode) gizmo.attach(winner);
                        uiManager.managementPanel?.setSelectedBody?.(winner);
                    }

                    absorbBody(winner, victim);

                    // die() already emits body:dead (and performs disposal)
                    victim.die();

                    // Remove the dead body from simulation
                    simulationState.bodies = simulationState.bodies.filter((b) => b !== victim);

                    // If primary star was destroyed, switch to None camera (legacy special-case)
                    if (victim === getPrimaryStar() && focusID === 'camSun') {
                        setF('camNone');
                        selectedBody = null;
                        gizmo.attach(null);
                        controls.enabled = true;
                        controls.target.set(0, 0, 0);
                        controls.mouseButtons.RIGHT = null;
                        triggerZoomToBody(null);
                    }
                }
            }
        }
    }

    // Update material brightness based on distance from star (inverse square law)
    const sunBody = simulationState.bodies.find(
        (b) => b && !b._isDisposed && isBodyType(b, BodyTypeEnum.Star)
    );
    if (sunBody) {
        for (const body of simulationState.bodies) {
            if (
                body &&
                !body._isDisposed &&
                body.mesh &&
                body instanceof CelestialBody &&
                !isBodyType(body, BodyTypeEnum.Star)
            ) {
                // Calculate distance from sun
                const dx = body.mesh.position.x - sunBody.mesh.position.x;
                const dy = body.mesh.position.y - sunBody.mesh.position.y;
                const dz = body.mesh.position.z - sunBody.mesh.position.z;
                const distanceFromSun = Math.sqrt(dx * dx + dy * dy + dz * dz);

                // Use inverse square law with a reference distance (Earth's orbit)
                const referenceDistance = 21850; // Earth's distance
                const minBrightness = 0.05; // Pluto will be quite dim but still visible
                const brightnessRaw =
                    (referenceDistance * referenceDistance) / (distanceFromSun * distanceFromSun);
                // Prevent inverse-square boost from overexposing near-star bodies (looks like "glow").
                // Preset far planets remain unchanged because brightnessRaw is already << 1.
                const brightness = Math.max(minBrightness, Math.min(1.0, brightnessRaw));

                // Apply brightness to material colors (clouds/atmosphere should match the planet too).
                if (body.mesh.material instanceof THREE.MeshStandardMaterial) {
                    body.mesh.material.color.copy(body.baseColor).multiplyScalar(brightness);
                }

                if (body.clouds?.material instanceof THREE.MeshStandardMaterial) {
                    body.clouds.material.color.copy(body.baseColor).multiplyScalar(brightness);
                }
            }
        }
    }

    // Keep skydome centered on the camera so it appears infinitely far away
    skydome.position.copy(camera.position);

    gizmo.update();
    velArc.update();
    orbitPrediction.update(simulationState.bodies, simulationState.gMultiplier);

    // Update grid size while dragging so it expands/contracts as needed.
    if (
        (interactionState.isRepositioning || isChangingVelocity || isMiddleMouseVelocity) &&
        gizmo.target &&
        !gizmo.target._isDisposed &&
        gizmo.target.mesh
    ) {
        const isDragging =
            interactionState.isRepositioning || isChangingVelocity || isMiddleMouseVelocity;
        gridHelperManager.ensure(gizmo.target, isDragging);

        if (
            posIndicator.yAxisIndicator &&
            posIndicator.yAxisRing &&
            (isChangingVelocity || isMiddleMouseVelocity || interactionState.isRepositioning)
        ) {
            posIndicator.updateIndicator(
                posIndicator.yAxisIndicator,
                posIndicator.yAxisRing,
                gizmo.target.mesh.position
            );
        }

        if (
            (isChangingVelocity || isMiddleMouseVelocity) &&
            posIndicator.velocityTipIndicator &&
            posIndicator.velocityTipRing
        ) {
            const speed = gizmo.target.velocity.length();
            const arrowScale = 50;
            const direction =
                speed > 0 ? gizmo.target.velocity.clone().normalize() : new THREE.Vector3(1, 0, 0);
            const arrowTip = gizmo.target.mesh.position
                .clone()
                .add(direction.multiplyScalar(speed * arrowScale));
            posIndicator.updateIndicator(
                posIndicator.velocityTipIndicator,
                posIndicator.velocityTipRing,
                arrowTip
            );
        }
    }

    // Keep steering end marker and origin ring synced each frame.
    if (flightState.isActive && flightSteeringLine.visible) {
        const startX = steeringLinePositions[0];
        const startY = steeringLinePositions[1];
        const endX = steeringLinePositions[3];
        const endY = steeringLinePositions[4];
        steeringEndMarker.position.set(endX, endY, TEXT_SPRITE_Z);
        steeringEndMarker.visible = true;
        steeringOriginMarker.position.set(startX, startY, TEXT_SPRITE_Z);
        steeringOriginMarker.visible = true;
    } else {
        steeringEndMarker.visible = false;
        steeringOriginMarker.visible = false;
    }

    // Update weapon bolts (advance positions, collision check, camera-relative upload).
    if (flightState.isActive && flightState.activeShip) {
        shipWeapon.update(
            wallDt,
            dtTotal,
            simulationState.bodies,
            camera.position,
            flightState.activeShip
        );
    }

    // Filter dead explosions
    simulationState.explosions = simulationState.explosions.filter((exp) => {
        exp.update(dtTotal, camera.position);
        return exp.active;
    });

    // Update impact shockwaves
    simulationState.impacts = simulationState.impacts.filter((impact) => {
        impact.update(dtTotal);
        return impact.active;
    });

    // Update all supernovas (remove those that have collapsed)
    for (let i = supernovas.length - 1; i >= 0; i--) {
        const supernova = supernovas[i];
        supernova.update(dtTotal);
        // If supernova has collapsed (for black hole formation), clean it up
        if (!supernova.active) {
            supernova.dispose();
            supernovas.splice(i, 1);
        }
    }

    // Update all planetary nebulae (remove when fully faded)
    for (let i = planetaryNebulae.length - 1; i >= 0; i--) {
        const nebula = planetaryNebulae[i];
        nebula.update(dtTotal);
        if (!nebula.active) {
            nebula.dispose();
            planetaryNebulae.splice(i, 1);
        }
    }

    // Update green/red indicators for velocity dragging (velocity arrow itself updates inside gizmo.update()).
    if (
        gizmo.target &&
        !gizmo.target._isDisposed &&
        gizmo.target.mesh &&
        gizmo.velocityArrow &&
        gizmo.velocityArrow.visible
    ) {
        const speed = gizmo.target.velocity.length();
        const arrowScale = 50;
        const direction =
            speed > 0 ? gizmo.target.velocity.clone().normalize() : new THREE.Vector3(1, 0, 0);

        if (
            (isChangingVelocity || isMiddleMouseVelocity) &&
            posIndicator.velocityTipIndicator &&
            posIndicator.velocityTipRing
        ) {
            const arrowTip = gizmo.target.mesh.position
                .clone()
                .add(direction.multiplyScalar(speed * arrowScale));
            posIndicator.updateIndicator(
                posIndicator.velocityTipIndicator,
                posIndicator.velocityTipRing,
                arrowTip
            );
        }

        if (
            (isChangingVelocity || isMiddleMouseVelocity) &&
            posIndicator.yAxisIndicator &&
            posIndicator.yAxisRing
        ) {
            posIndicator.updateIndicator(
                posIndicator.yAxisIndicator,
                posIndicator.yAxisRing,
                gizmo.target.mesh.position
            );
        }
    }

    // Update label scales based on distance from camera
    // Always update scale, visibility is controlled by checkbox
    const showNames = simulationState.showNames;
    simulationState.bodies.forEach((body) => {
        if (body && !body._isDisposed && body.mesh && body.label) {
            // Hide the active ship's label while in flight (it would clutter the camera view)
            const isActiveShip = flightState.isActive && body === flightState.activeShip;
            body.label.visible = showNames && !isActiveShip;
            if (body.labelLine) {
                body.labelLine.visible = showNames && !isActiveShip;
            }

            if (showNames) {
                // Calculate distance from camera to body
                const distance = camera.position.distanceTo(body.mesh.position);

                // Scale label proportionally to distance
                // This keeps apparent text size consistent from camera's viewpoint
                const scale = Math.max(distance * 0.033, 33);

                // Compensate for parent mesh scaling (important for white dwarfs)
                // Label is a child of mesh, so we need to counteract the mesh's scale
                const meshScale = body.mesh.scale.x; // Uniform scaling, so just use x component
                const compensatedScale = scale / meshScale;

                body.label.scale.set(compensatedScale * 6, compensatedScale * 2.4, 1);
            }
        }
    });

    // Handle camera positioning (skip entirely in surface mode or flight mode)
    // Flight camera is updated here — AFTER physics — so the camera uses the ship's
    // true post-physics position and never lags behind at high speed.
    if (isFlightModeActive) {
        const ship = flightState.activeShip;
        if (ship && !ship._isDisposed && ship.mesh) {
            if (flightState.isCockpitView) {
                const cockpitWorld = ship.cockpitOffset
                    .clone()
                    .applyQuaternion(ship.mesh.quaternion)
                    .add(ship.mesh.position);
                camera.position.copy(cockpitWorld);
                const shipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ship.mesh.quaternion);
                camera.up.copy(shipUp);
                const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.mesh.quaternion);
                camera.lookAt(cockpitWorld.clone().add(forward.multiplyScalar(1000)));
            } else {
                const offset = ship.thirdPersonOffset
                    .clone()
                    .applyQuaternion(flightState.flightCameraQuat);
                camera.position.copy(ship.mesh.position).add(offset);
                const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
                    flightState.flightCameraQuat
                );
                camera.up.copy(cameraUp);
                camera.lookAt(ship.mesh.position);
                controls.target.copy(ship.mesh.position);
            }
        }
    }

    // ── Warp camera shake ───────────────────────────────────────────────
    // Jitter the camera slightly while warp is active — applies to flight mode
    // (cockpit + 3rd person) and to lookAt mode when the tunnel is visible.
    if (!isPaused && (flightState.warpActive || autopilotState.isWarpActive)) {
        const warpShakeVisible = isFlightModeActive || warpEffect.lines.visible;
        if (warpShakeVisible) {
            const camFwd = new THREE.Vector3();
            camera.getWorldDirection(camFwd);
            const camRight = new THREE.Vector3().crossVectors(camFwd, camera.up).normalize();
            camera.position.addScaledVector(camRight, (Math.random() - 0.5) * WARP_SHAKE_MAG);
            camera.position.addScaledVector(camera.up, (Math.random() - 0.5) * WARP_SHAKE_MAG);
        }
    }

    // ── Ship trail update ──────────────────────────────────────────────────────
    // Runs every frame after physics so the nozzle position is final.
    // Covers both flight mode (player piloting) and autopilot-only (bodies-table "Fly Here").
    // const trailShip = isFlightModeActive
    //     ? flightState.activeShip!
    //     : autopilotState.isActive
    //       ? flightState.knownShip
    //       : null;

    // Get the ship whose trail we should update. The trail should always be visible for the active/known ship, even if the player has exited the cockpit view.
    // But it should not be visible while warping normal or autopilot.
    const trailShip = !(flightState.warpActive || autopilotState.isWarpActive)
        ? (flightState.activeShip ?? flightState.knownShip)
        : null;

    if (trailShip && trailShip.mesh) {
        const nozzle = trailShip.thrusterOffset
            .clone()
            .applyQuaternion(trailShip.mesh.quaternion)
            .add(trailShip.mesh.position);
        // Record trail continuously in flight; suppress only during warp/warp-decel.
        // const trailRecord = isFlightModeActive
        //     ? !flightState.warpActive && !flightState.warpDecelerating
        //     : !autopilotState.isWarpActive;
        // Exhaust direction = ship's backward direction (−forward axis)
        const exhaustDir = new THREE.Vector3(0, 0, -1).applyQuaternion(trailShip.mesh.quaternion);
        // In autopilot-only mode flightState.currentSpeed isn't maintained — use velocity magnitude
        const trailSpeed = isFlightModeActive
            ? flightState.currentSpeed
            : trailShip.velocity.length();
        // Pass the active speed ceiling so brightness scales correctly across modes
        const trailMaxSpeed = autopilotState.isWarpActive
            ? FLIGHT_WARP_SPEED
            : keys.shift || flightState.boostDecelerating || autopilotState.isBoostActive
              ? FLIGHT_BOOST_MAX_SPEED
              : FLIGHT_MAX_SPEED;
        trailShip.trail.update(
            nozzle,
            trailSpeed,
            trailMaxSpeed,
            true,
            trailShip.velocity,
            exhaustDir,
            dtTotal,
            camera.position
        );
    }

    if (!isSurfaceModeActive && !isFreeCameraMode && !isFlightModeActive) {
        // Only "follow" a body (translate camera by its delta) when Look At is enabled.
        if (
            cameraState.isLookAtMode &&
            focusObj &&
            simulationState.bodies.includes(focusObj) &&
            !focusObj._isDisposed &&
            focusObj.mesh
        ) {
            // Calculate how much the planet moved this frame (whether by physics or dragging)
            const delta = new THREE.Vector3().subVectors(focusObj.mesh.position, oldPos);

            if (cameraState.lockToSun) {
                // Simply move the camera by the same delta as the planet
                camera.position.add(delta);

                // Set target to sun and look at it
                controls.target.set(0, 0, 0);
                camera.lookAt(0, 0, 0);
            } else {
                // Normal look-at follow: camera follows focused body
                if (!interactionState.isRepositioning && !isChangingVelocity) {
                    camera.position.add(delta);
                    controls.target.copy(focusObj.mesh.position);
                }
            }
        } else {
            // Look At OFF (or no valid focus body): keep orbit anchored to scene center.
            controls.target.copy(NONE_FOCUS_POSITION);
        }
    }

    if (!isSurfaceModeActive && !isFreeCameraMode && !isFlightModeActive) {
        controls.update();
    }

    // Update Earth atmosphere shell (visible in both surface cam and exterior views)
    const earthBodyForShell = simulationState.bodies.find(
        (b): b is Earth => b instanceof Earth && !b._isDisposed
    );

    if (earthBodyForShell?.atmosphereShell) {
        // Compute multi-star directions so the atmosphere shell glows on any star-lit side (up to MAX_STARS).
        const stars = simulationState.bodies.filter(
            (b) => b instanceof Star && !b._isDisposed
        ) as Star[];

        // Reset pre-allocated direction array to default before filling.
        for (let i = 0; i < _ATMO_MAX_STARS; i++) _animStarDirsWorld[i].set(1, 0, 0);
        const earthPos = earthBodyForShell.mesh.position;

        const count = Math.min(_ATMO_MAX_STARS, stars.length);
        for (let i = 0; i < count; i++) {
            const star = stars[i];
            if (!star.mesh) continue;
            const dir = star.mesh.position.clone().sub(earthPos);
            if (dir.lengthSq() > 1e-12) dir.normalize();
            _animStarDirsWorld[i].copy(dir);
        }

        earthBodyForShell.atmosphereShell.update({
            starDirsWorld: _animStarDirsWorld,
            numStars: count,
            cameraPosWorld: camera.position,
        });
    }

    syncAllStarLightTargets();

    // Update hint sprite each frame (cheap; texture only updates when text changes)
    flightHUD.updateHintSprite();

    // Distance-fade the warp streaks based on camera proximity to the ship.
    // Speed-based opacity is handled inside warpEffect.update(); here we only
    // apply the distance multiplier and handle the case where no ship exists.
    const _visShip = flightState.activeShip ?? flightState.knownShip;
    let _warpDistanceFade;
    if (_visShip && !_visShip._isDisposed && _visShip.mesh) {
        if (isFlightModeActive) {
            _warpDistanceFade = 1.0;
            warpEffect.setOpacity(1.0);
        } else {
            const shipIsLookAtTarget =
                cameraState.isLookAtMode &&
                cameraState.focusBody !== null &&
                cameraState.focusBody === _visShip;
            if (shipIsLookAtTarget) {
                const dist = camera.position.distanceTo(_visShip.mesh.position);
                if (dist >= WARP_FADE_DIST) {
                    _warpDistanceFade = 0.0;
                    warpEffect.setOpacity(0.0);
                } else {
                    const t = Math.max(
                        0,
                        (dist - WARP_FULL_VIS_DIST) / (WARP_FADE_DIST - WARP_FULL_VIS_DIST)
                    );
                    _warpDistanceFade = 1.0 - t;
                    warpEffect.setOpacity(1.0 - t);
                }
            } else {
                _warpDistanceFade = 0.0;
                warpEffect.setOpacity(0.0);
            }
        }
    } else {
        _warpDistanceFade = 0.0;
        warpEffect.setOpacity(0.0);
    }

    // ── Warp loop sound effect ────────────────────────────────────────────
    // Volume = speedVolume × distanceFade, matching the warp tunnel visual.
    // The sound plays always; it is simply silent when the ship is slow or far away.
    if (_visShip && !_visShip._isDisposed && _visShip.mesh) {
        const _warpSpeedVolume = Math.min(
            _visShip.velocity.length() / (FLIGHT_WARP_SPEED / 33.33),
            1.0
        );
        _visShip.updateWarpSound(_warpSpeedVolume, _warpDistanceFade);
    }

    // Render 3D scene through the gravitational lensing pass, then composite to screen.
    lensingEffect.beginCapture(renderer);
    try {
        renderer.render(scene, camera);
    } catch (e) {
        console.error('Error during rendering:', e);
        console.log(simulationState.bodies);
    }

    // Gather active black holes and apply lensing warp to the captured frame.
    const activeBHs = simulationState.bodies.filter(
        (b) => !b._isDisposed && !!(b.bodyType & BodyTypeEnum.BlackHole)
    );
    lensingEffect.applyLensing(
        renderer,
        camera,
        activeBHs.map((b) => ({ position: b.mesh.position, radius: b.radius }))
    );

    renderer.autoClear = false;
    renderer.clearDepth(); // ensure 2D overlay draws on top even after rendering the 3D scene
    renderer.render(uiScene, uiCamera);
    renderer.autoClear = true;

    // Update FPS counter text
    if (now - fpsLastUpdate > 100) {
        // Update every 100ms
        const fps = Math.round(1000 / (now - lastT));
        if (fpsSprite) {
            fpsSprite.material.map?.dispose();
            fpsSprite.material.map = createFPSTexture(fps);
            fpsSprite.material.needsUpdate = true;
        }

        // Update flight speed sprite
        if (speedSprite && speedSprite.visible && flightState.isActive) {
            const ship = flightState.activeShip;
            // Autopilot phases override the manual warp/boost flags for the speed HUD.
            const hudIsWarp =
                flightState.warpActive ||
                flightState.warpDecelerating ||
                autopilotState.phase === 'WARP' ||
                autopilotState.phase === 'WARP_CHARGING';
            const hudIsBoosting =
                !hudIsWarp &&
                ((!autopilotState.isActive && keys.shift) ||
                    (autopilotState.phase === 'APPROACH' && autopilotState.isBoostActive) ||
                    (autopilotState.phase === 'BRAKE' &&
                        (flightState.activeShip?.velocity?.length() ?? 0) > FLIGHT_MAX_SPEED));
            speedSprite.material.map?.dispose();
            speedSprite.material.map = createSpeedTexture(
                flightState.currentSpeed,
                hudIsBoosting,
                ship?.mesh?.position,
                ship?.velocity,
                hudIsWarp
            );
            speedSprite.material.needsUpdate = true;
        }

        // Update body stats if there's a selected body
        if (
            selectedBody &&
            simulationState.bodies.includes(selectedBody) &&
            !selectedBody._isDisposed &&
            statsSprite
        ) {
            statsSprite.material.map?.dispose();
            statsSprite.material.map = createStatsTexture(selectedBody);
            statsSprite.material.needsUpdate = true;
            statsSprite.visible = true;
        } else if (statsSprite) {
            statsSprite.visible = false;
        }

        // Autopilot phase status HUD
        flightHUD.updateAutopilotHUD((now - lastT) / 1000);

        // Update event log

        fpsLastUpdate = now;
    }

    lastT = now;
}

function getFocusObject() {
    // Canonical follow target is cameraState.focusBody when Look At is enabled.
    // IMPORTANT: If Look At is ON but no body is selected, behave like Look At is OFF.
    // This keeps "center orbit" working even when the toggle is active.
    if (!cameraState.isLookAtMode) return null;
    if (!cameraState.focusBody) return null;
    return cameraState.focusBody &&
        simulationState.bodies.includes(cameraState.focusBody) &&
        !cameraState.focusBody._isDisposed
        ? cameraState.focusBody
        : null;
}

function refreshBodiesTable() {
    if (!uiManager.mainPanel) return;

    const ship = flightState.knownShip;
    const hasShip = !!(ship && !ship._isDisposed && simulationState.bodies.includes(ship));

    const rows = simulationState.bodies
        .filter((b) => b && !b._isDisposed && b.mesh)
        .map((b) => ({
            name: b.name || 'Unnamed',
            typeLabel: getBodyTypeLabel(b),
            body: b,
            isShip: b.bodyType === BodyTypeEnum.SpaceShip,
        }))
        .sort((a, b) => a.typeLabel.localeCompare(b.typeLabel) || a.name.localeCompare(b.name));

    // Keep table highlight in sync with current selection
    uiManager.mainPanel.setSelectedBody(selectedBody || manuallySelectedBody || null);
    uiManager.mainPanel.renderBodiesTable(rows, hasShip, autopilotState.targetBody);

    // Surface camera enablement depends on selection, so keep it in sync.
    try {
        surfaceCam.updateButtonEnabled();
    } catch {
        // Empty
    }
}
function setF(id: string) {
    // Legacy helper kept for compatibility with existing call sites,
    // but camera behavior should no longer depend on id.
    focusID = id;
}

// --- UI PANEL INITIALIZATION ---

// Create and initialize panels
const uiManager = new UIManager('ui-container');
const startupModal = new StartupModal('startup-overlay');
const proceduralModal = new ProceduralGeneratorModal();
const aboutModal = new AboutModal('about-overlay', 'btn-about', 'aboutCloseBtn');
const optionsPanel = new OptionsPanel('options-panel');
uiManager.managementPanel.registerGetFocusObject(() => {
    const body = cameraState.focusBody;
    return body && !body._isDisposed && simulationState.bodies.includes(body) ? body : null;
});

uiManager.initialize();
startupModal.initialize();
proceduralModal.initialize();
startupModal.setProceduralModal(proceduralModal);
aboutModal.initialize();
optionsPanel.initialize();

// Wire Flight Controls button and panel events

const flightControlsPanel = uiManager.flightControlsPanel;
const performanceOptionsBtn = document.getElementById('btn-performance-options');
if (performanceOptionsBtn) {
    performanceOptionsBtn.onclick = () => {
        const visible = optionsPanel.toggle();
        if (visible) {
            performanceOptionsBtn.classList.add('active');
        } else {
            performanceOptionsBtn.classList.remove('active');
        }
    };

    optionsPanel.on('closed', () => {
        performanceOptionsBtn.classList.remove('active');
    });
}
flightControlsPanel.on('spawnShip', () => spawnShip());
flightControlsPanel.on('toggleView', () => {
    flightState.isCockpitView = !flightState.isCockpitView;
});

// Autopilot toggle from the flight controls panel (targets currently selected body)
flightControlsPanel.on('autopilot', () => {
    if (autopilotState.isActive) {
        cancelAutopilot('Autopilot disengaged.');
        return;
    }
    const target = selectedBody || manuallySelectedBody;
    if (!target || target._isDisposed) {
        addEvent({
            message: 'Autopilot: select a target body first.',
            notificationType: NotificationType.Warning,
        });
        return;
    }
    engageAutopilot(target);
});

// Advanced flight mode checkbox
const advancedModeChk = document.getElementById('flightAdvancedMode') as HTMLInputElement | null;
if (advancedModeChk) {
    advancedModeChk.checked = flightState.isAdvancedMode;
    advancedModeChk.addEventListener('change', () => {
        flightState.isAdvancedMode = advancedModeChk.checked;
    });
}

// Prevent UI clicks and keyboard events from interfering with scene interaction
const uiContainer = document.getElementById('ui-container');
if (uiContainer) {
    uiContainer.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });
    uiContainer.addEventListener('mouseup', (e) => {
        e.stopPropagation();
    });
    uiContainer.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    // Prevent keyboard events (WASD, etc.) from triggering camera movement when typing in UI
    uiContainer.addEventListener('keydown', (e) => {
        e.stopPropagation();
    });
    uiContainer.addEventListener('keyup', (e) => {
        e.stopPropagation();
    });
}

function clearCameraPresetHighlights() {
    // Clear any camera preset highlight (manual selection).
    // Do NOT clear LOOK AT / FREE / TARGET highlights, those are toggles with independent state.
    document.querySelectorAll('.btn-row button').forEach((b) => {
        if (b?.id === 'camLookAtBtn') return;
        if (b?.id === 'freeCameraBtn') return;
        if (b?.id === 'camTargetBtn') return;
        b.classList.remove('active');
    });
}

// NOTE: Preset camera buttons were removed from the UI (replaced with toggles + bodies table).
// The old `cameraChange` event path is intentionally removed to reduce dead code.

function zoomRelativeToTarget(target: Body | null, factor: number) {
    // target=null means "zoom around scene center" (used when Look At is OFF)
    const targetPos =
        target && simulationState.bodies.includes(target) && !target._isDisposed && target.mesh
            ? target.mesh.position
            : NONE_FOCUS_POSITION;

    // Direction from target -> camera
    const dir = new THREE.Vector3().subVectors(camera.position, targetPos);
    //const currentDist = Math.max(1, dir.length());
    const currentDist = dir.length();
    dir.normalize();

    // Keep a sensible minimum distance so we don't clip into the body (only if we have a body target)
    // const minDist =
    //     target && simulationState.bodies.includes(target) && !target._isDisposed
    //         ? Math.max((target.radius || 1) * 2.2, 10)
    //         : 10;
    const maxDist = MAX_ZOOM_OUT_DISTANCE;
    const targetDistance =
        target && simulationState.bodies.includes(target) && !target._isDisposed && target.mesh
            ? target.mesh.position.length()
            : 0;
    const farLimit = Math.min(
        MAX_CAMERA_VIEW_DISTANCE,
        Math.max(
            targetDistance * 2,
            targetDistance + (500000000 / DIST_SCALE) * SCALE_FACTOR,
            maxDist
        )
    );

    const zoomInLimit = 0;
    //     target && simulationState.bodies.includes(target) && !target._isDisposed ? 0.001 : 0.01;
    const zoomOutLimit = farLimit;

    const newDist = THREE.MathUtils.clamp(currentDist * factor, zoomInLimit, zoomOutLimit);
    camera.position.copy(targetPos).add(dir.multiplyScalar(newDist));

    if (!isFreeCameraMode) {
        // When Look At is OFF, keep orbit controls anchored to the center.
        controls.target.copy(targetPos);
    }
}

function getZoomTarget() {
    // If look-at is OFF, zoom behaves like the "None" camera:
    // zoom relative to the scene center, regardless of selection.
    if (!cameraState.isLookAtMode) return null;

    // Look-at ON: zoom relative to the current focus body
    return getFocusObject();
}

function zoomIn() {
    zoomRelativeToTarget(getZoomTarget(), 0.85);
}

function zoomOut() {
    zoomRelativeToTarget(getZoomTarget(), 1.15);
}

// --- Surface camera / player rig ---
const surfaceCam = new SurfaceCameraManager(
    camera,
    controls,
    renderer,
    simulationState,
    uiManager,
    flightHUD,
    cameraState,
    () => selectedBody,
    () => manuallySelectedBody,
    () => {
        isFreeCameraMode = false;
    }
);

// ── Flight mode functions ────────────────────────────────────────────────────

/**
 * Autopilot: steers the ship through three phases to reach a target body and enter a circular orbit.
 * Phase 1 — APPROACH: Orient ship toward predicted intercept and thrust toward target.
 * Phase 2 — BRAKE:    Thrust opposite relative velocity to cancel approach speed near the target.
 * Phase 3 — CIRCULARIZE: Set tangential velocity for a stable circular orbit, then disengage.
 *
 * This runs regardless of whether flight mode is active (the ship must exist in simulationState.bodies).
 * Any manual thrust key press cancels the autopilot immediately.
 */
function updateAutopilot(dt: number) {
    if (!autopilotState.isActive) return;

    // ── Safety guards ────────────────────────────────────────────────────────
    const ship = flightState.knownShip;
    const target = autopilotState.targetBody;

    const shipAlive =
        ship && !ship._isDisposed && ship.mesh && simulationState.bodies.includes(ship);
    const targetAlive =
        target && !target._isDisposed && target.mesh && simulationState.bodies.includes(target);

    if (!shipAlive || !targetAlive) {
        cancelAutopilot('Autopilot disengaged: target or ship no longer exists.');
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
    // Using only AUTOPILOT_BOOST_DECEL at warp speed would give a brake trigger
    // millions of units away, causing an immediate BRAKE transition.
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

    if (autopilotState.phase === 'WARP') {
        // Transition to APPROACH once close enough for boost/normal to finish the journey.
        if (distance <= AUTOPILOT_WARP_THRESHOLD) {
            autopilotState.isWarpActive = false;
            warpEffect.stop();
            autopilotState.phase = 'APPROACH';
        }
    }

    if (autopilotState.phase === 'APPROACH') {
        // Only transition to BRAKE once the ship is near normal approach speed.  If the ship
        // still has boost or warp speed, effectiveStopDist is large enough that the check
        // would fire immediately — bypassing APPROACH deceleration and entering BRAKE with
        // far more speed than the available runway can absorb.  Waiting until the ship is
        // close to AUTOPILOT_APPROACH_SPEED ensures brakeDistance is sized for that speed.
        const nearApproachSpeed =
            approachSpeed <= AUTOPILOT_APPROACH_SPEED + AUTOPILOT_BRAKE_DONE_SPEED;
        // Use the larger of the physics stopping distance and the visual arc distance so the
        // blend spiral is long enough to be perceptible.  Physics wins when entering BRAKE from
        // boost/warp decel (already handled by nearApproachSpeed guard above).
        const brakeEntryTrigger = orbitRadius + Math.max(brakeDistance, AUTOPILOT_BRAKE_ARC_DIST);
        if (nearApproachSpeed && distance <= brakeEntryTrigger) {
            autopilotState.phase = 'BRAKE';
            // Record entry distance so BRAKE can compute how far through the blend it is.
            autopilotState.brakeEntryDistance = distance;
        }
    }

    if (autopilotState.phase === 'BRAKE') {
        // Transition when the ship is within 2% of orbitRadius.  A strict equality check
        // fails because the inward blend component is ~0 in the last few units, so the
        // ship settles into a gravitational equilibrium just above orbitRadius (e.g. 132u
        // vs 131.64u for Jupiter).  The 2% margin catches that and CIRCULARIZE snaps the
        // tiny residual.  Also fall back on radial closing speed: if the ship has stopped
        // moving inward while it's within 10% of orbit, the blend has converged.
        const radialClosingSpeed = -relVel.dot(toTargetDir); // positive = closing on target
        const withinOrbit = distance <= orbitRadius * 1.02;
        const driftedToOrbit = distance <= orbitRadius * 1.1 && radialClosingSpeed < 1;
        if (withinOrbit || driftedToOrbit) {
            autopilotState.phase = 'CIRCULARIZE';
        }
    }

    // ── Phase execution ──────────────────────────────────────────────────────
    // Both APPROACH and BRAKE use a desired-velocity controller: each substep we compute
    // the velocity we want and apply thrust toward it.  Decoupling the force from the ship's
    // visual orientation means there is NO rotation-lag overshoot — the ship slows down on
    // time regardless of which way it is currently pointing.  The ship still rotates to face
    // the thrust direction, but that rotation is cosmetic only.

    if (autopilotState.phase === 'ALIGN') {
        // Rotate toward the target without applying any thrust.  Once the ship's forward axis
        // is within ~3° of the target direction the warp-charge sequence begins.
        flightState.thrustActive = false;
        const alignQuat = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(targetPos, shipPos, new THREE.Vector3(0, 1, 0))
        );
        ship.mesh.quaternion.rotateTowards(alignQuat, FLIGHT_MAX_TURN_RATE * dt);

        const shipForward = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.mesh.quaternion);
        if (shipForward.dot(toTargetDir) >= Math.cos(THREE.MathUtils.degToRad(3))) {
            autopilotState.phase = 'WARP_CHARGING';
        }
    } else if (autopilotState.phase === 'WARP_CHARGING') {
        // Reuse the same charge progress bar shown during manual warp.
        autopilotState.warpChargeTimer = Math.min(
            autopilotState.warpChargeTimer + dt,
            FLIGHT_WARP_CHARGE_TIME
        );
        const fill = autopilotState.warpChargeTimer / FLIGHT_WARP_CHARGE_TIME;
        flightHUD.setWarpCharge(fill);
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
            flightHUD.hideWarpSprite();
            warpEffect.start();
            triggerScreenFlash(200, 0.01, 2.5);
            addEvent({
                message: '⚡ Autopilot warp engaged.',
                notificationType: NotificationType.Success,
            });
        }
    } else if (autopilotState.phase === 'WARP') {
        // Lock ship velocity to warp speed toward the target, in the target's frame.
        ship.velocity.copy(target.velocity).addScaledVector(toTargetDir, FLIGHT_WARP_SPEED);
        flightState.currentSpeed = FLIGHT_WARP_SPEED;
        flightState.thrustActive = true;
        // (warpEffect.update is called centrally in the animate loop each frame)

        // Keep ship visually pointed toward the target.
        const warpQuat = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(targetPos, shipPos, new THREE.Vector3(0, 1, 0))
        );
        ship.mesh.quaternion.rotateTowards(warpQuat, FLIGHT_MAX_TURN_RATE * dt);
    } else if (autopilotState.phase === 'APPROACH') {
        // Use boost speed when far away; switch to normal approach speed close in.
        // The global AUTOPILOT_BOOST_THRESHOLD is computed without knowing the target orbit
        // radius, so for large bodies (e.g. the Sun) the brake zone can extend beyond it —
        // leaving the ship at boost speed when BRAKE begins, which AUTOPILOT_DECEL cannot
        // stop in the available runway.  Add the orbit-specific boost-to-normal decel runway
        // so the ship always finishes shedding boost speed before the brake zone starts.
        const boostDecelDist =
            (FLIGHT_BOOST_MAX_SPEED * FLIGHT_BOOST_MAX_SPEED -
                FLIGHT_MAX_SPEED * FLIGHT_MAX_SPEED) /
            (2 * AUTOPILOT_BOOST_DECEL);
        // Use only the orbit-specific formula so boost ends at exactly the right distance
        // for the target's orbit radius.  The old max(AUTOPILOT_BOOST_THRESHOLD, ...) kept
        // the ship at boost-threshold distance even for small bodies, causing it to decelerate
        // from boost and then crawl the remaining ~0.5×boostDecelDist at FLIGHT_MAX_SPEED.
        const effectiveBoostThreshold =
            orbitRadius + AUTOPILOT_APPROACH_MIN_DISTANCE + boostDecelDist;
        const useBoost = distance > effectiveBoostThreshold;
        autopilotState.isBoostActive = useBoost;
        const targetSpeed = useBoost ? FLIGHT_BOOST_MAX_SPEED : AUTOPILOT_APPROACH_SPEED;

        // Desired velocity: move at targetSpeed toward the target in the target's frame.
        const desiredVel = new THREE.Vector3()
            .copy(target.velocity)
            .addScaledVector(toTargetDir, targetSpeed);

        const velDelta = new THREE.Vector3().subVectors(desiredVel, ship.velocity);
        const deltaLen = velDelta.length();

        if (deltaLen > 1e-6) {
            const accelDir = velDelta.clone().normalize();
            const needsDecel = approachSpeed > targetSpeed + AUTOPILOT_BRAKE_DONE_SPEED;
            // When current speed exceeds the target speed we need to decelerate, which
            // requires the full AUTOPILOT_DECEL rate (80 u/s²).  Using only AUTOPILOT_ACCEL
            // (20 u/s²) here would take 45 sim-seconds to scrub from boost speed, causing the
            // ship to fly thousands of units past the threshold before slowing down.
            // When the ship needs to speed UP, use the appropriate accel (boost or normal).
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

        // Always keep the ship pointed toward the target during approach.
        // Braking phase intentionally handles its own turnaround behavior.
        const approachQuat = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(targetPos, shipPos, new THREE.Vector3(0, 1, 0))
        );
        ship.mesh.quaternion.rotateTowards(approachQuat, FLIGHT_MAX_TURN_RATE * dt);
        flightState.thrustActive = deltaLen > 1e-6;
    } else if (autopilotState.phase === 'BRAKE' && G * simulationState.gMultiplier > 0) {
        // ── Trajectory-blend orbital insertion ────────────────────────────────
        // Key insight: both the "stop" vector (target.velocity) and the orbital
        // velocity vector have ZERO radial component in the target frame.  This
        // means the desired-velocity controller always drives the inward (approach)
        // velocity toward zero — regardless of the blend factor.  The blend only
        // controls how much tangential orbital speed to build at each distance.
        // Result: the ship spirals in, killing radial velocity while simultaneously
        // rotating its velocity vector toward the orbit direction so it arrives at
        // orbitRadius already moving tangentially at the correct orbital speed.
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

        // α = 0 at brake entry, 1 at orbitRadius.  Smoothstep eases the blend so
        // most of the approach velocity is killed before the hard turn to orbit.
        const brakeSpan = Math.max(autopilotState.brakeEntryDistance - orbitRadius, 1);
        const rawT = 1 - (distance - orbitRadius) / brakeSpan;
        const t = Math.max(0, Math.min(1, rawT));
        const alpha = t * t * (3 - 2 * t); // smoothstep

        // Blend desired velocity as the ship spirals inward:
        //   tangential component: 0 → vOrbit  (builds up as alpha → 1)
        //   radial-inward component: maxInward → 0  (fades to 0 at orbitRadius)
        //
        // Without the inward component, when alpha ≈ 1 the controller settles the ship
        // into a stable circular orbit at whatever distance it happens to be at (e.g. 328u
        // around Jupiter instead of 131u).  The inward term keeps the ship spiralling toward
        // orbitRadius so alpha and inward both reach their final values at the same point.
        //
        // Cap the inward speed to what the appropriate decel rate can stop in the available
        // brakeSpan.  Use a speed-aware decel (matching the three-tier logic in effectiveStopDist)
        // so that if the ship enters BRAKE with residual boost/warp speed — e.g. when targeting
        // a very large body whose brake zone begins before the boost threshold — the cap and
        // the thrust magnitude both scale correctly instead of under-braking and crashing.
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
            .addScaledVector(tangential, vOrbit * alpha) // tangential: 0 → vOrbit
            .addScaledVector(toTargetDir, inwardSpeed); // inward: AUTOPILOT_APPROACH_SPEED → 0

        // Explicit gravity compensation — same taper as CIRCULARIZE.
        // Prevents gravity accumulating inward velocity faster than thrust can counter it.
        const gravAccel = (G * simulationState.gMultiplier * target.mass) / (r * r);
        const tangentialSpeed = relVel.dot(tangential);
        const speedRatio = Math.max(0, Math.min(1, tangentialSpeed / vOrbit));
        const gravCompFraction = 1 - speedRatio * speedRatio;
        ship.velocity.addScaledVector(radial, gravAccel * gravCompFraction * dt);

        // Desired-velocity controller.
        const velDelta = new THREE.Vector3().subVectors(desiredVel, ship.velocity);
        const deltaLen = velDelta.length();

        if (deltaLen > 1e-6) {
            const thrustDir = velDelta.clone().normalize();
            const brakeMag = Math.min(brakeDecel * dt, deltaLen);
            ship.velocity.addScaledVector(thrustDir, brakeMag);

            const targetQuat = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                thrustDir
            );
            ship.mesh.quaternion.rotateTowards(targetQuat, FLIGHT_MAX_TURN_RATE * dt);
            flightState.thrustActive = deltaLen > 1;
        } else {
            flightState.thrustActive = false;
        }
    } else if (autopilotState.phase === 'CIRCULARIZE' && G * simulationState.gMultiplier > 0) {
        // ── Gradually steer into circular orbit ───────────────────────────────
        // Compute the desired orbital velocity for the ship's current position,
        // then use the same desired-velocity controller used in APPROACH/BRAKE to
        // smoothly blend toward it.  The ship curves into orbit instead of snapping.
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

        // ── Gravity-scaled minimum rate for velocity rotation ─────────────────
        const bodyRadius = target.radius ?? 10;
        const altitude = Math.max(r - bodyRadius, 1);
        const gravAccel = (G * simulationState.gMultiplier * target.mass) / (r * r);
        const safeRate =
            AUTOPILOT_CIRCULARIZE_GRAVITY_MARGIN * vOrbit * Math.sqrt(gravAccel / altitude);
        const effectiveRate = Math.max(AUTOPILOT_CIRCULARIZE_RATE, safeRate);

        // ── Explicit gravity compensation ─────────────────────────────────────
        // The desired-velocity controller drives velocity toward the orbital vector,
        // but at the start of circularize the velDelta is almost entirely tangential
        // (~159 u/s), so only ~1% of thrust goes radially outward even though gravity
        // is pulling the ship inward at full strength.  Near massive bodies this means
        // the ship is swallowed before orbital speed builds.
        //
        // Fix: cancel gravity explicitly, separate from the desired-velocity step.
        // Taper the compensation by (1 - speedRatio²): when tangential speed = 0,
        // counteract 100% of gravity; when tangential speed = vOrbit, counteract 0%
        // (the orbit is self-sustaining via centripetal acceleration at that point).
        const tangentialSpeed = relVel.dot(tangential);
        const speedRatio = Math.max(0, Math.min(1, tangentialSpeed / vOrbit));
        const gravCompFraction = 1 - speedRatio * speedRatio;
        ship.velocity.addScaledVector(radial, gravAccel * gravCompFraction * dt);

        // ── Desired-velocity controller ───────────────────────────────────────
        // Drive toward pure orbital velocity.  Gravity is handled above so we don't
        // need to bundle inward-drift correction into desiredVel — velDelta's radial
        // component handles any residual drift from the BRAKE phase naturally.
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
            addEvent({
                message: `✓ Autopilot: Stable orbit around ${targetName} achieved.`,
                notificationType: NotificationType.Success,
            });
            autopilotState.orbitNotifyTimer = AUTOPILOT_ORBIT_NOTIFY_DURATION;
            flightHUD.showOrbitNotify();

            autopilotState.isActive = false;
            autopilotState.phase = null;
            autopilotState.targetBody = null;
            setTimeout(() => updateAutopilotUI(), 0);
        } else {
            // Drive velocity toward the orbital vector at the gravity-adjusted rate.
            const thrustDir = velDelta.clone().normalize();
            const mag = Math.min(effectiveRate * dt, deltaLen);
            ship.velocity.addScaledVector(thrustDir, mag);

            // Rotate ship to face thrust direction (cosmetic).
            const targetQuat = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                thrustDir
            );
            ship.mesh.quaternion.rotateTowards(targetQuat, FLIGHT_MAX_TURN_RATE * dt);
            flightState.thrustActive = true;
        }
    }
}

/** Cancel the autopilot with an optional log message. */
function cancelAutopilot(message?: string) {
    if (!autopilotState.isActive) return;
    if (autopilotState.isWarpActive) {
        autopilotState.isWarpActive = false;
        warpEffect.stop();
    }
    // Hide the charge bar if it was showing.
    if (autopilotState.phase === 'WARP_CHARGING') {
        flightHUD.hideWarpSprite();
        autopilotState.warpChargeTimer = 0;
    }
    autopilotState.isActive = false;
    autopilotState.isBoostActive = false;
    autopilotState.phase = null;
    autopilotState.targetBody = null;
    flightState.thrustActive = false;
    if (message) {
        addEvent({ message, notificationType: NotificationType.Info });
    }
    // Defer DOM update — this may be called from inside the physics substep loop.
    setTimeout(() => updateAutopilotUI(), 0);
}

/** Engage the autopilot toward a specific target body. */
function engageAutopilot(target: Body) {
    if (!target || target._isDisposed) return;

    const ship = flightState.knownShip;
    if (!ship || ship._isDisposed || !simulationState.bodies.includes(ship)) {
        addEvent({
            message: 'Autopilot: no ship found. Spawn a spaceship first.',
            notificationType: NotificationType.Warning,
        });
        return;
    }

    if (simulationState.timeScale > AUTOPILOT_MAX_TIMESCALE) {
        addEvent({
            message: `Autopilot: time scale is too high (>${AUTOPILOT_MAX_TIMESCALE}×). Reduce time scale first.`,
            notificationType: NotificationType.Warning,
        });
        return;
    }

    // If already engaged on the same target, cancel (toggle)
    if (autopilotState.isActive && autopilotState.targetBody === target) {
        cancelAutopilot('Autopilot disengaged.');
        return;
    }

    // Guard: refuse to engage while manual warp is live.
    if (
        autopilotState.isWarpActive ||
        flightState.warpActive ||
        flightState.warpDecelerating ||
        flightState.warpCharging
    ) {
        addEvent({
            message: 'Autopilot: disengage warp before engaging autopilot.',
            notificationType: NotificationType.Warning,
        });
        return;
    }

    // Clean up any prior autopilot warp when switching targets.
    if (autopilotState.isWarpActive) {
        autopilotState.isWarpActive = false;
        warpEffect.stop();
    }

    // Choose initial phase based on distance.
    const dist0 =
        ship.mesh && target.mesh ? ship.mesh.position.distanceTo(target.mesh.position) : Infinity;
    const startWithWarp = dist0 > AUTOPILOT_WARP_THRESHOLD;
    const orbitRadius0 = (target.radius ?? 10) * AUTOPILOT_ORBIT_ALTITUDE_FACTOR;

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
            flightHUD.autopilotBlockedNotifyTimer = AUTOPILOT_BLOCKED_NOTIFY_DURATION;
            flightHUD.autopilotBlockedByName = nearestObstruction.name || 'obstruction';

            addEvent({
                message: `⚠ Autopilot blocked: ${nearestObstruction.name || 'obstruction'} is in the path to ${
                    target.name || 'target'
                }.`,
                notificationType: NotificationType.Warning,
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
    if (startWithWarp) {
        autopilotState.phase = 'ALIGN';
    } else if (startInBrake) {
        autopilotState.phase = 'BRAKE';
        autopilotState.brakeEntryDistance = dist0;
    } else {
        autopilotState.phase = 'APPROACH';
    }
    flightState.thrustActive = false;

    if (startWithWarp) {
        addEvent({
            message: `Autopilot engaged: aligning to ${target.name || 'target'}.`,
            notificationType: NotificationType.Info,
        });
    } else if (startInBrake) {
        addEvent({
            message: `Autopilot engaged: direct approach to ${target.name || 'target'}.`,
            notificationType: NotificationType.Info,
        });
    } else {
        addEvent({
            message: `Autopilot engaged: flying to ${target.name || 'target'}.`,
            notificationType: NotificationType.Info,
        });
    }
    updateAutopilotUI();
}

/** Reflect autopilot state back to buttons after any state change. */
function updateAutopilotUI() {
    const ship = flightState.knownShip;
    const shipExists = !!(ship && !ship._isDisposed && simulationState.bodies.includes(ship));
    flightControlsPanel.setAutopilotState(
        autopilotState.isActive,
        (shipExists && !!autopilotState.targetBody) || autopilotState.isActive
    );
    refreshBodiesTable();
}

/**
 * Applies per-frame flight controls to the active spaceship.
 * Called from animate() when flightState.isActive.
 */
function updateFlightControls(dt: number) {
    const ship = flightState.activeShip;
    if (!ship || ship._isDisposed || !ship.mesh) {
        exitFlightMode();
        return;
    }

    // Pause guard: while paused, do not mutate ship rotation, thrust, roll, or velocity.
    // Keep the active flight state intact so unpausing resumes from the exact same ship state.
    if (isPaused || simulationState.timeScale === 0) {
        flightState.thrustActive = false;
        return;
    }

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
        if (fwdSpd > FLIGHT_BOOST_MAX_SPEED + FLIGHT_WARP_DECEL_TOLERANCE) {
            // Phase 1: decel from warp speed to boost max using warp decel rate.
            const newSpd = Math.max(FLIGHT_BOOST_MAX_SPEED, fwdSpd - FLIGHT_WARP_DECEL * dt);
            ship.velocity.copy(forward).multiplyScalar(newSpd);
            flightState.currentSpeed = newSpd;
        } else {
            // Reached boost speed — end the warp decel phase.
            flightState.warpDecelerating = false;
            warpEffect.stop();
            // Restore steering HUD now that warp deceleration is complete.
            flightSteeringLine.visible = true;
            steeringOriginMarker.visible = true;
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
        flightHUD.hideWarpSprite();
        // Fall through to steering/roll below (no early return)
    }

    // ── Boost deceleration ───────────────────────────────────────────────────
    // When Shift is released above FLIGHT_MAX_SPEED, rapidly decelerate back down.
    if (flightState.boostDecelerating) {
        const fwdSpd = ship.velocity.dot(forward);
        // Use a small epsilon tolerance (0.01) for the completion check so that
        // gravity's tiny per-frame velocity contribution doesn't prevent the decel
        // from ever finishing — without this the ship can get stuck permanently
        // in boost-decel mode, fighting gravity every frame.
        if (fwdSpd > FLIGHT_MAX_SPEED + FLIGHT_THRUST_DECEL_TOLERANCE) {
            const newSpd = Math.max(FLIGHT_MAX_SPEED, fwdSpd - FLIGHT_BOOST_DECEL * dt);
            ship.velocity.copy(forward).multiplyScalar(newSpd);
            flightState.currentSpeed = newSpd;
        } else {
            flightState.boostDecelerating = false;
            flightState.currentSpeed = Math.min(fwdSpd, FLIGHT_MAX_SPEED);
        }
        flightState.thrustActive = false;
        // Fall through to steering/roll below
    }

    // ── Warp active ──────────────────────────────────────────────────────────
    if (flightState.warpActive) {
        // Drive ship forward at FLIGHT_WARP_SPEED; all other controls locked.
        const warpVel = forward.clone().multiplyScalar(FLIGHT_WARP_SPEED);
        ship.velocity.copy(warpVel);
        flightState.currentSpeed = FLIGHT_WARP_SPEED;
        flightState.thrustActive = true;
        // (warpEffect.update is called centrally in the animate loop each frame)
        // Hide steering HUD during warp (no manual steering available).
        flightSteeringLine.visible = false;
        flightCrosshair.visible = false;
        steeringEndMarker.visible = false;
        steeringOriginMarker.visible = false;
        // Pulsing warp-active text (update every call is cheap since canvas is small)
        const pulse = (Math.sin(Date.now() * 0.005) + 1) * 0.5;
        flightHUD.setWarpActive(pulse);
        return; // Skip all flight controls below
    }

    // ── Warp charging ────────────────────────────────────────────────────────
    if (flightState.warpCharging && !flightState.warpDecelerating && !autopilotState.isWarpActive) {
        flightState.warpCharge = Math.min(flightState.warpCharge + dt, FLIGHT_WARP_CHARGE_TIME);
        const fill = flightState.warpCharge / FLIGHT_WARP_CHARGE_TIME;
        flightHUD.setWarpCharge(fill);
        if (flightState.warpCharge >= FLIGHT_WARP_CHARGE_TIME) {
            // Engage warp!
            flightState.warpActive = true;
            flightState.warpCharging = false;
            flightState.warpCharge = 0;
            warpEffect.start();
            triggerScreenFlash(200, 0.01, 2.5);
            addEvent({
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
    const wEffective =
        manualInput && keys.w && (flightState.currentSpeed <= FLIGHT_MAX_SPEED || keys.shift);
    const thrustActive = manualInput && (keys.shift || wEffective || keys.s);
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
        // While a thrust key is held: currentSpeed is updated by hold-to-accelerate
        // and the full velocity is OVERWRITTEN to match the current forward direction.
        // This gives direct, arcade-style control of the ship vector.
        // When no key is held the ship coasts freely and gravity accumulates.
        if (thrustActive) {
            const maxSpeed = keys.shift ? FLIGHT_BOOST_MAX_SPEED : FLIGHT_MAX_SPEED;
            const accel = keys.shift ? FLIGHT_BOOST_ACCEL : FLIGHT_THRUST_ACCEL;
            const decel = keys.shift ? FLIGHT_BOOST_DECEL : FLIGHT_THRUST_DECEL;
            // Ignore boost while above boost max speed (e.g. decelerating from warp);
            // the ship should coast down through FLIGHT_BOOST_MAX_SPEED naturally.
            const shiftEffective = keys.shift && flightState.currentSpeed <= FLIGHT_BOOST_MAX_SPEED;
            if (shiftEffective || wEffective) {
                flightState.currentSpeed = Math.min(
                    flightState.currentSpeed + accel * dt,
                    maxSpeed
                );
            } else {
                // keys.s
                flightState.currentSpeed = Math.max(
                    flightState.currentSpeed - decel * dt,
                    -FLIGHT_MAX_SPEED
                );
            }
            // Gradually normalise trajectory toward the ship's forward axis while thrusting.
            // Decompose current velocity into forward + perpendicular components,
            // decay the perpendicular part, then reassemble — no jarring snap.
            const perpVel = ship.velocity.clone().addScaledVector(forward, -fwdSpeed);
            const decay = Math.max(0, 1 - FLIGHT_PERP_DECAY * dt);
            perpVel.multiplyScalar(decay);
            ship.velocity.copy(forward).multiplyScalar(flightState.currentSpeed).add(perpVel);
        } else {
            // Coasting: sync display value from real forward velocity
            flightState.currentSpeed = fwdSpeed;
        }
    } else if (manualInput) {
        // ── Advanced mode ────────────────────────────────────────────────────────
        // Thrust adds to velocity without removing gravity-accumulated perpendicular
        // components, so orbital mechanics work at all times.
        if (keys.shift) {
            if (fwdSpeed < FLIGHT_BOOST_MAX_SPEED) {
                const delta = Math.min(FLIGHT_BOOST_ACCEL * dt, FLIGHT_BOOST_MAX_SPEED - fwdSpeed);
                ship.velocity.addScaledVector(forward, delta);
            }
        } else if (keys.w) {
            if (fwdSpeed < FLIGHT_MAX_SPEED) {
                const delta = Math.min(FLIGHT_THRUST_ACCEL * dt, FLIGHT_MAX_SPEED - fwdSpeed);
                ship.velocity.addScaledVector(forward, delta);
            }
        } else if (keys.s) {
            if (fwdSpeed > -FLIGHT_MAX_SPEED) {
                const delta = Math.max(-FLIGHT_THRUST_DECEL * dt, -FLIGHT_MAX_SPEED - fwdSpeed);
                ship.velocity.addScaledVector(forward, delta);
            }
        }
        // No thrust: ship coasts freely
        flightState.currentSpeed = ship.velocity.dot(forward);
    } else if (!manualInput) {
        // Autopilot: sync display speed from real forward velocity (autopilot manages thrust)
        flightState.currentSpeed = fwdSpeed;
    }

    // ── Roll with inertia (A/D) ───────────────────────────────────────────────
    // Accelerate rollVelocity toward ±FLIGHT_ROLL_SPEED when key held,
    // then apply friction to bring it back to 0 when released.
    const rollTarget = flightState.rollLeft
        ? -FLIGHT_ROLL_SPEED
        : flightState.rollRight
          ? FLIGHT_ROLL_SPEED
          : 0;
    if (manualInput && (flightState.rollLeft || flightState.rollRight)) {
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
    if (manualInput) {
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
    const noseNDC = ship.mesh.position.clone().addScaledVector(forward, 8).project(camera);
    const noseScreenX = noseNDC.x * (window.innerWidth * 0.5);
    const noseScreenY = noseNDC.y * (window.innerHeight * 0.5);

    // Circularly clamp the pointer offset for display so the indicator line
    // has equal maximum length in all directions (not square-capped).
    const rawMag = Math.sqrt(flightState.pointerOffsetX ** 2 + flightState.pointerOffsetY ** 2);
    const circleScale = rawMag > FLIGHT_MAX_POINTER_OFFSET ? FLIGHT_MAX_POINTER_OFFSET / rawMag : 1;
    const displayOffX = flightState.pointerOffsetX * circleScale;
    const displayOffY = flightState.pointerOffsetY * circleScale;

    steeringLinePositions[0] = noseScreenX;
    steeringLinePositions[1] = noseScreenY;
    steeringLinePositions[2] = TEXT_SPRITE_Z;
    steeringLinePositions[3] = noseScreenX + displayOffX;
    steeringLinePositions[4] = noseScreenY - displayOffY;
    steeringLinePositions[5] = TEXT_SPRITE_Z;
    steeringLineGeo.attributes.position.needsUpdate = true;

    // Move origin ring and aim reticle to their screen positions.
    steeringOriginMarker.position.set(noseScreenX, noseScreenY, 0);
    steeringEndMarker.position.set(noseScreenX + displayOffX, noseScreenY - displayOffY, 0);
    steeringEndMarker.visible = true;

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
        const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.5);
        const tanHalfFovY = Math.tan(halfFovY);
        const tanHalfFovX = tanHalfFovY * camera.aspect;
        const viewSpaceDir = new THREE.Vector3(
            aimNdcX * tanHalfFovX,
            aimNdcY * tanHalfFovY,
            -1 // camera local -Z is forward in OpenGL/Three.js convention
        ).normalize();
        const aimDir = viewSpaceDir.transformDirection(camera.matrixWorld);

        // Muzzle: slightly ahead of the ship so projectiles clear the hull.
        const muzzlePos = ship.mesh.position.clone().addScaledVector(forward, ship.radius * 4);
        shipWeapon.tryFire(dt, muzzlePos, aimDir, ship.velocity);
    }

    // ── Track prevShiftHeld for next frame's Shift-release detection ──────
    flightState.prevShiftHeld = keys.shift;
}

/** Spawn a spaceship in front of the camera and enter flight mode.
 *  If a previously spawned ship is still alive in the scene, re-enters it instead. */
function spawnShip() {
    // Re-enter an existing ship when possible
    const existing = flightState.knownShip;
    const canReenter =
        existing && !existing._isDisposed && simulationState.bodies.includes(existing);

    if (!canReenter) {
        // --- Fresh spawn: create the ship and focus the camera on it without entering flight mode ---
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        const spawnPos = camera.position.clone().add(cameraDir.multiplyScalar(60));

        const ship = new Spaceship(
            dependencies,
            scene,
            spawnPos,
            new THREE.Vector3(),
            createUniqueId('spaceship'),
            flightControlsPanel.getSelectedModel()
        );

        // Orient the ship to the same direction the camera is facing
        const cameraQuat = camera.quaternion.clone();
        ship.mesh.quaternion.copy(cameraQuat);
        // Rotate 180° around the Y axis to flip the ship
        ship.mesh.rotateY(Math.PI);

        simulationState.bodies.push(ship);
        try {
            window.dispatchEvent(
                new CustomEvent('body:added', {
                    detail: { body: ship, id: ship.id, name: ship.name },
                })
            );
        } catch {
            // Empty
        }

        // Remember the ship so "RE-ENTER SHIP" works on the next click
        flightState.knownShip = ship;

        // Select the ship as the look-at target (same as clicking it in the bodies list)
        cameraState.isLookAtMode = true;
        uiManager.mainPanel.setLookAtState(true);
        setFocusBody(ship, { zoom: true });
        uiManager.managementPanel.setSelectedBody(ship);

        // Update button label to "RE-ENTER SHIP"
        uiManager.flightControlsPanel.updateFlightSpawnBtnLabel(
            flightState.knownShip,
            simulationState.bodies
        );

        addEvent({
            message: 'Spaceship spawned.',
            notificationType: NotificationType.Info,
        });
        return;
    }

    // --- Re-enter existing ship: enter flight mode immediately ---
    const ship: Spaceship = existing;

    // Snapshot camera / controls state so exit can restore it cleanly
    flightState.prevCameraPos.copy(camera.position);
    flightState.prevCameraUp.copy(camera.up);
    flightState.prevCameraQuat.copy(camera.quaternion);
    flightState.prevControlsTarget.copy(controls.target);

    flightState.knownShip = ship;
    flightState.activeShip = ship;
    flightState.isActive = true;
    // Preserve warp state: if the ship was warping autonomously while the player
    // was outside, keep warpActive so flight resumes at warp speed immediately.
    flightState.currentSpeed = flightState.warpActive ? FLIGHT_WARP_SPEED : 0;
    flightState.pointerOffsetX = 0;
    flightState.pointerOffsetY = 0;
    flightState.rollLeft = false;
    flightState.rollRight = false;
    flightState.rollVelocity = 0;
    flightState.steerX = 0;
    flightState.steerY = 0;
    flightState.warpCharge = 0;
    flightState.warpCharging = false;
    // warpActive and warpDecelerating are intentionally NOT zeroed here —
    // they are preserved from the background-warp state set before re-entry.
    flightState.flightCameraQuat.copy(ship.mesh.quaternion);
    flightState.shipBankRoll = 0;
    flightState.shipBankPitch = 0;

    // Deselect any currently selected body so the gizmo doesn't appear on entry
    if (selectedBody) {
        selectedBody = null;
        manuallySelectedBody = null;
        gizmo.attach(null);
        uiManager.managementPanel.setSelectedBody(null);
        refreshBodiesTable();
    }

    // Initialize the ship's trail (but it will be hidden until warp ends, to avoid showing a long trail from spawn point to first flight location)
    ship.trail.init();

    // Show flight speed sprite
    if (speedSprite) {
        speedSprite.material.map?.dispose();
        speedSprite.material.map = createSpeedTexture(0, false);
        speedSprite.material.needsUpdate = true;
        speedSprite.visible = true;
    }

    // Pointer lock so the mouse steers freely without leaving the window
    renderer.domElement.requestPointerLock();
    controls.enabled = false;

    flightSteeringLine.visible = true;
    steeringEndMarker.visible = true;
    steeringOriginMarker.visible = true;
    flightHUD.hideWarpSprite();
    flightControlsPanel.setFlightActive(true);
    // Enable the autopilot button now that a ship is active
    flightControlsPanel.setAutopilotState(autopilotState.isActive, true);
    refreshBodiesTable();

    ambientMusic.startPlayback();

    // Close the flight controls panel
    flightControlsPanel.hide();

    addEvent({
        message: 'Entered spaceship.',
        notificationType: NotificationType.Success,
    });
}

/** Exit flight mode and restore normal camera controls. */
function exitFlightMode() {
    // Preserve the ship reference so the user can re-enter later.
    // Only keep it if the ship is still alive.
    if (
        flightState.activeShip &&
        !flightState.activeShip._isDisposed &&
        simulationState.bodies.includes(flightState.activeShip)
    ) {
        flightState.knownShip = flightState.activeShip;
    } else {
        // Ship was destroyed — clear the known reference too
        flightState.knownShip = null;
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
    shipWeapon.reset();

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
    isMouseLookActive = false;

    if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
    }

    // Restore camera up so OrbitControls rotation doesn't break (it was set to ship's local up).
    camera.up.copy(flightState.prevCameraUp);

    // Re-enable controls before moving camera so the orbit anchor is valid.
    controls.enabled = !isFreeCameraMode;

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
        const currentCamDist = camera.position.distanceTo(shipPos);
        const prevDir = new THREE.Vector3()
            .subVectors(flightState.prevCameraPos, flightState.prevControlsTarget)
            .normalize();
        const dist =
            currentCamDist > 0
                ? currentCamDist
                : flightState.prevCameraPos.distanceTo(flightState.prevControlsTarget);
        camera.position.copy(shipPos).addScaledVector(prevDir, dist);
        controls.target.copy(shipPos);
    } else {
        camera.position.copy(flightState.prevCameraPos);
        camera.quaternion.copy(flightState.prevCameraQuat);
        controls.target.copy(flightState.prevControlsTarget);
    }
    controls.update();

    flightSteeringLine.visible = false;
    flightCrosshair.visible = false;
    steeringEndMarker.visible = false;
    steeringOriginMarker.visible = false;
    flightHUD.hideWarpSprite();
    flightState.warpCharge = 0;
    flightState.warpCharging = false;
    flightState.warpDecelerating = false;
    if (!flightState.warpActive) {
        // Not warping — clean up fully.
        warpEffect.stop();
    }
    // If warpActive is true, the ship continues warping autonomously and the
    // background updater (in the animate loop) maintains its velocity and the
    // tunnel animation.  Do NOT zero warpActive or stop the effect here.
    if (flightState.knownShip && !flightState.knownShip._isDisposed) {
        flightState.knownShip.trail.hide();
    }
    if (speedSprite) speedSprite.visible = false;
    flightControlsPanel.setFlightActive(false);
    // Keep autopilot button enabled as long as the known ship still exists
    const _exitShip = flightState.knownShip;
    const _exitShipAlive = !!(
        _exitShip &&
        !_exitShip._isDisposed &&
        simulationState.bodies.includes(_exitShip)
    );
    flightControlsPanel.setAutopilotState(autopilotState.isActive, _exitShipAlive);
    refreshBodiesTable();
    // updateFlightSpawnBtnLabel is defined after this function; call via a timeout
    // to avoid forward-reference issues in the module execution order.
    setTimeout(() => {
        try {
            uiManager.flightControlsPanel.updateFlightSpawnBtnLabel(
                flightState.knownShip,
                simulationState.bodies
            );
        } catch {
            // Empty
        }
    }, 0);
    addEvent({
        message: 'Flight mode exited.',
        notificationType: NotificationType.Info,
    });
}

window.addEventListener('mousemove', surfaceCam.onMouseMove, { passive: true });

uiManager.mainPanel.on('surfaceCameraToggle', () => {
    if (surfaceCam.isActive) {
        surfaceCam.exit();
        surfaceCam.updateButtonEnabled();
        return;
    }

    const selected =
        (selectedBody && simulationState.bodies.includes(selectedBody) && !selectedBody._isDisposed
            ? selectedBody
            : null) ||
        (manuallySelectedBody &&
        simulationState.bodies.includes(manuallySelectedBody) &&
        !manuallySelectedBody._isDisposed
            ? manuallySelectedBody
            : null);

    if (!surfaceCam.isEligibleBody(selected)) return;
    surfaceCam.enter(selected);
    surfaceCam.updateButtonEnabled();
});

uiManager.mainPanel.on('freeCameraToggle', () => {
    // If turning on free camera, surface mode must exit.
    if (!surfaceCam.isActive) {
        // noop
    } else {
        surfaceCam.exit();
    }

    isFreeCameraMode = !isFreeCameraMode;
    cameraState.isFreeCameraMode = isFreeCameraMode;
    uiManager.mainPanel.setFreeCameraState(isFreeCameraMode);

    // Preserve selection and gizmo visibility when toggling free camera:
    // - Selection should NEVER be cleared here.
    // - Gizmo should remain visible if Target is ON and a body is selected.
    const selected =
        (selectedBody && simulationState.bodies.includes(selectedBody) && !selectedBody._isDisposed
            ? selectedBody
            : null) ||
        (manuallySelectedBody &&
        simulationState.bodies.includes(manuallySelectedBody) &&
        !manuallySelectedBody._isDisposed
            ? manuallySelectedBody
            : null);

    if (isFreeCameraMode) {
        // Turning on Free Camera disables Look At (mutually exclusive)
        cameraState.isLookAtMode = false;
        uiManager.mainPanel.setLookAtState(false);

        controls.enabled = false;
    } else {
        // Turning OFF free camera behaves like Look At is OFF:
        // orbit/zoom around the scene center (0,0,0)
        cameraState.isLookAtMode = false;
        uiManager.mainPanel.setLookAtState(false);

        controls.enabled = true;
        focusID = 'camNone';
        controls.target.copy(NONE_FOCUS_POSITION);
        camera.lookAt(NONE_FOCUS_POSITION);
    }

    // Target toggle governs gizmo visibility in both modes.
    if (cameraState.isTargetMode && selected) {
        gizmo.attach(selected);
    } else {
        gizmo.attach(null);
    }
    uiManager.managementPanel.setSelectedBody(selected);

    refreshBodiesTable();
    surfaceCam.updateButtonEnabled();
    flightHUD.forceHintRefresh();
});

uiManager.mainPanel.on('zoomIn', () => {
    zoomIn();
});

uiManager.mainPanel.on('zoomOut', () => {
    zoomOut();
});

uiManager.mainPanel.on('lockToSunChange', ({ checked }: { checked: boolean }) => {
    cameraState.lockToSun = checked;
});

optionsPanel.on('shadowsChange', ({ checked }: { checked: boolean }) => {
    toggleShadows(checked);
});

uiManager.managementPanel.on('kuiperBeltChange', ({ checked }: { checked: boolean }) => {
    if (typeof kuiperBeltPoints !== 'undefined' && kuiperBeltPoints) {
        kuiperBeltPoints.visible = checked;
    }
});

uiManager.managementPanel.on('gChange', ({ value }: { value: number }) => {
    simulationState.gMultiplier = value;
});

const enableSkydomeCheckbox = document.getElementById('enableSkydome') as HTMLInputElement;
if (enableSkydomeCheckbox) {
    enableSkydomeCheckbox.onchange = () => {
        skydome.visible = enableSkydomeCheckbox.checked;
    };
}

uiManager.mainPanel.on('trailsChange', ({ checked }: { checked: boolean }) => {
    simulationState.bodies.forEach((body) => {
        if (body && body instanceof CelestialBody && body.trail) {
            body.trail.visible = checked;
        }
    });
});

uiManager.mainPanel.on('predictionChange', ({ checked }: { checked: boolean }) => {
    orbitPrediction.visible = checked;
});

uiManager.mainPanel.on('namesChange', ({ checked }: { checked: boolean }) => {
    simulationState.showNames = checked;
    simulationState.bodies.forEach((body) => {
        if (body && body.label) {
            const isActiveShip = flightState.isActive && body === flightState.activeShip;
            body.label.visible = checked && !isActiveShip;
            if (body.labelLine) {
                body.labelLine.visible = checked && !isActiveShip;
            }
        }
    });
});

optionsPanel.on('substepsChange', ({ value }: { value: number }) => {
    stepsPerFrame = value;
});

optionsPanel.on('sfxVolumeChange', () => {
    // performanceSettings.sfxVolume is already updated by the panel
    // sfxVolume is read live by audio.ts playBuffer() and playWarpLoop() each call
});

optionsPanel.on('musicVolumeChange', ({ value }: { value: number }) => {
    ambientMusic.setVolume(value);
});

uiManager.on('timeScaleChange', ({ value }: { value: number }) => {
    const newSpeed = value;
    const direction = newSpeed < 0 ? ' REVERSE' : '';
    const absSpeed = Math.abs(newSpeed);
    if (isPaused) {
        // When paused, update the saved value that will be used on resume
        savedTimeScale = newSpeed;
        uiManager.mainPanel.updateTimeScaleDisplay(
            '0.0x (PAUSED - next: ' + absSpeed + 'x' + direction + ')'
        );
    } else {
        // When running, immediately update the speed
        timeScale = newSpeed;
        uiManager.mainPanel.updateTimeScaleDisplay(absSpeed + 'x' + direction);
    }
});

uiManager.on('pause', () => {
    togglePause();
});

uiManager.on('reset', () => {
    // Auto-close management UI and show launcher with Cancel
    uiManager.managementPanel.hide();
    startupModal.open({ allowCancel: true });
});

// "Fly Here" button from the bodies table
uiManager.mainPanel.on('autopilot', ({ body }: { body: Body }) => {
    if (!body || body._isDisposed) return;
    engageAutopilot(body);
});

// Manual selection from Bodies table
uiManager.mainPanel.on('manualBodySelect', ({ body }: { body: Body }) => {
    if (!body || !simulationState.bodies.includes(body) || body._isDisposed) return;

    // Clear any camera preset highlight (manual selection).
    // Do NOT clear LOOK AT / FREE / TARGET highlights, those are toggles with independent state.
    clearCameraPresetHighlights();

    // Manual selection should NOT automatically enable Look At.
    // However, if Look At is already enabled, selecting a body should immediately look at it.
    if (isFreeCameraMode) {
        // If we are in Free Camera mode and the user clicks a body in the list,
        // we KEEP Free Camera mode on (the user can still use Look At / Target buttons explicitly).
        // Just ensure the button highlight stays accurate.
        uiManager.mainPanel.setFreeCameraState(true);
        controls.enabled = false;
    }

    // Selecting from the table should always refresh hints (selection-driven).
    setFocusBody(body, { zoom: cameraState.isLookAtMode });
    flightHUD.forceHintRefresh();

    // Gizmo visibility controlled by Target toggle
    if (cameraState.isTargetMode) {
        gizmo.attach(body);
    } else {
        gizmo.attach(null);
    }
    uiManager.managementPanel.setSelectedBody(body);
});

// TARGET button (toggle):
// - OFF: selecting bodies does NOT show gizmo, but selection still works
// - ON: selected body shows gizmo (and switching selection moves gizmo)
// - Must NOT auto zoom/focus the camera
uiManager.mainPanel.on('targetToggle', () => {
    const turningOn = !cameraState.isTargetMode;
    cameraState.isTargetMode = turningOn;
    uiManager.mainPanel.setTargetState(turningOn);

    const b =
        selectedBody && simulationState.bodies.includes(selectedBody) && !selectedBody._isDisposed
            ? selectedBody
            : manuallySelectedBody &&
                simulationState.bodies.includes(manuallySelectedBody) &&
                !manuallySelectedBody._isDisposed
              ? manuallySelectedBody
              : null;

    if (turningOn) {
        if (b) {
            gizmo.attach(b);
            uiManager.managementPanel.setSelectedBody(b);
        }
    } else {
        // Hide gizmo but keep selection
        gizmo.attach(null);
    }

    // Target toggle changes the "selected body" hint line, so force a refresh.
    flightHUD.forceHintRefresh();
});

// LOOK AT button (toggle): when enabled, orbit/zoom around selected body.
// When disabled, behave like "None camera": orbit/zoom around the scene center.
uiManager.mainPanel.on('lookAtToggle', () => {
    // Turning Look At ON/OFF exits surface mode (mutually exclusive camera behaviors).
    if (surfaceCam.isActive) {
        surfaceCam.exit();
        surfaceCam.updateButtonEnabled();
    }
    const turningOn = !cameraState.isLookAtMode;
    // Look-at changes hint context (and camera focus behavior) so refresh.
    // We'll also refresh again after any selection changes.
    flightHUD.forceHintRefresh();

    // If we are turning Look At ON while Free Camera is ON, we implicitly disable Free Camera.
    // That transition must also refresh the hint (Free Camera hint -> Look At/selection hint).
    if (turningOn && isFreeCameraMode) {
        isFreeCameraMode = false;
        cameraState.isFreeCameraMode = false;
        uiManager.mainPanel.setFreeCameraState(false);
        controls.enabled = true;
        flightHUD.forceHintRefresh();
    }

    if (turningOn) {
        const b =
            selectedBody &&
            simulationState.bodies.includes(selectedBody) &&
            !selectedBody._isDisposed
                ? selectedBody
                : manuallySelectedBody &&
                    simulationState.bodies.includes(manuallySelectedBody) &&
                    !manuallySelectedBody._isDisposed
                  ? manuallySelectedBody
                  : null;

        // Look-at mode requires OrbitControls, so exit free camera mode if active
        if (isFreeCameraMode) {
            isFreeCameraMode = false;
            uiManager.mainPanel.setFreeCameraState(false);
            controls.enabled = true;
        }

        cameraState.isLookAtMode = true;
        uiManager.mainPanel.setLookAtState(true);

        // If no body is selected, behave like "auto look-at": keep center orbit until selection.
        if (!b) {
            cameraState.focusBody = null;
            controls.enabled = true;
            controls.target.copy(NONE_FOCUS_POSITION);
            controls.update();
            camera.lookAt(NONE_FOCUS_POSITION);

            // No selection => no gizmo attachment (Target still governs showing it later)
            gizmo.attach(null);
            uiManager.managementPanel.setSelectedBody(null);
            refreshBodiesTable();
            return;
        }

        // Only show gizmo if Target is ON
        if (cameraState.isTargetMode) {
            gizmo.attach(b);
        } else {
            gizmo.attach(null);
        }
        uiManager.managementPanel.setSelectedBody(b);

        setFocusBody(b, { zoom: true });
    } else {
        cameraState.isLookAtMode = false;
        uiManager.mainPanel.setLookAtState(false);

        // Behave like "None": orbit/zoom around center (but keep selection)
        controls.enabled = true;
        focusID = 'camNone';
        controls.target.copy(NONE_FOCUS_POSITION);
        controls.update();
        camera.lookAt(NONE_FOCUS_POSITION);

        // Look At OFF does not force gizmo visibility; Target still controls it.
        if (cameraState.isTargetMode) {
            const b =
                selectedBody &&
                simulationState.bodies.includes(selectedBody) &&
                !selectedBody._isDisposed
                    ? selectedBody
                    : manuallySelectedBody &&
                        simulationState.bodies.includes(manuallySelectedBody) &&
                        !manuallySelectedBody._isDisposed
                      ? manuallySelectedBody
                      : null;
            if (b) gizmo.attach(b);
        }
    }
});

// Subscribe to ManagementPanel events
uiManager.managementPanel.on(
    'createBody',
    ({
        bodyType,
        planetType,
        orbitType,
        inclination,
        hasAtmosphere,
        hasRings,
        customMass,
        customTemperature,
        customLightIntensity,
        customRadius,
        orbitParent,
        createTilt,
        createAzimuth,
    }: {
        bodyType: string;
        planetType: string;
        orbitType: string;
        inclination: number;
        hasAtmosphere: boolean;
        hasRings: boolean;
        customMass: number | null;
        customTemperature: number | null;
        customLightIntensity: number | null;
        customRadius: number | null;
        orbitParent: Body | null;
        createTilt: number | null;
        createAzimuth: number | null;
    }) => {
        createNewBody(
            bodyType,
            planetType,
            orbitType,
            inclination,
            hasAtmosphere,
            hasRings,
            customMass,
            customTemperature,
            customLightIntensity,
            customRadius,
            orbitParent ?? null,
            createTilt ?? null,
            createAzimuth ?? null
        );
        refreshBodiesTable();
    }
);

// Preset bodies (canonical solar-system objects)
uiManager.managementPanel.on('createPresetBody', ({ presetKey }: { presetKey: string }) => {
    if (!presetKey) return;
    createPresetBody(presetKey);
    refreshBodiesTable();
});

function refreshSelectionVisuals() {
    // Recompute gizmo scale immediately when selected body properties change (e.g., star mass -> radius)
    if (!selectedBody || !simulationState.bodies.includes(selectedBody) || selectedBody._isDisposed)
        return;
    gizmo.attach(selectedBody);
}

function keepCameraDistanceOnBodyScaleChange(body: Body, oldRadius: number, newRadius: number) {
    if (!body || !simulationState.bodies.includes(body) || body._isDisposed) return;
    if (!oldRadius || !newRadius || oldRadius <= 0 || newRadius <= 0) return;

    // If we're in free cam mode, do nothing (controls are disabled and we shouldn't move the camera)
    if (isFreeCameraMode) return;

    // Only adjust camera if this body is currently the focus object
    const focusObj = getFocusObject();
    if (!focusObj || focusObj !== body) return;

    const targetPos = body.mesh.position;

    // Keep the same "radii distance" ratio so the sun doesn't fill the screen when resized.
    // Example: if camera is 10 radii away, keep it 10 radii away.
    const dir = new THREE.Vector3().subVectors(camera.position, targetPos);
    const currentDist = Math.max(1, dir.length());
    dir.normalize();

    const ratio = currentDist / oldRadius;
    const newDist = Math.max(newRadius * ratio, newRadius * 2); // never clip into the surface

    camera.position.copy(targetPos).add(dir.multiplyScalar(newDist));
    controls.target.copy(targetPos);
}

uiManager.managementPanel.on('deleteBody', () => {
    deleteSelectedBody();
});

uiManager.managementPanel.on(
    'applyEdit',
    ({
        body,
        name,
        mass,
        temperature,
        lightIntensity,
        velocity,
        orbitalAngle,
        inclination,
        color,
        editTilt,
        editAzimuth,
    }: {
        body: Body;
        name: string;
        mass: number;
        temperature: number | null;
        lightIntensity: number | null;
        velocity: number | null;
        orbitalAngle: number | null;
        inclination: number | null;
        color: number;
        editTilt: number | null;
        editAzimuth: number | null;
    }) => {
        if (!body || !simulationState.bodies.includes(body) || body._isDisposed) return;

        // Update name
        if (name !== null && name !== '') {
            body.updateLabel(name);
            // Update just the edit form label without repopulating the entire form
            if (uiManager.managementPanel.editBodyName) {
                uiManager.managementPanel.editBodyName.textContent = body.name;
            }
        }

        // Update mass — setMass handles brown dwarf transition for stars
        body.setMass(mass);

        // Refill fuel for stars based on new mass (skipped automatically for brown dwarfs since fuel is null)
        if (body instanceof MainSequenceStar && body.fuel !== null) {
            body.maxFuel = mass * 100000;
            body.fuel = body.maxFuel;
            // Reset to initial state (in case it was in red giant phase)
            body.initialMass = mass;
            body.temperature = body.temperature || 5778;
        }

        // Star-only updates (temperature, light) — radius handled globally below
        if (body instanceof MainSequenceStar) {
            // Update temperature if provided
            if (temperature !== null) {
                body.setTemperature(temperature);
            }

            // Update light intensity if provided
            if (lightIntensity !== null) {
                body.setLightIntensity(lightIntensity);
            }

            // If this is the currently-selected body, rescale gizmo immediately after radius update
            // (radius update happens below for all bodies)
        }

        // Apply radius change for ALL body types if radius input present
        // Preserve special non-spherical asteroid geometry when editing low-mass asteroids.
        try {
            const isLowMassAsteroid =
                isBodyType(body, BodyTypeEnum.Asteroid) &&
                typeof body.mass === 'number' &&
                body.mass < 1;

            if (uiManager.managementPanel && uiManager.managementPanel.editRadiusSlider) {
                const oldRadiusAll = body.radius || 1;
                const newRadiusAll = parseFloat(
                    (uiManager.managementPanel.editRadiusSlider as HTMLInputElement).value
                );
                if (!isNaN(newRadiusAll) && isFinite(newRadiusAll)) {
                    if (isLowMassAsteroid) {
                        body.mass = mass;
                        if (body === selectedBody) refreshSelectionVisuals();
                    } else {
                        if (body instanceof CelestialBody) setBodyRadius(body, newRadiusAll);
                        keepCameraDistanceOnBodyScaleChange(body, oldRadiusAll, newRadiusAll);
                        if (body === selectedBody) refreshSelectionVisuals();
                    }
                }
            } else if (isLowMassAsteroid) {
                body.mass = mass;
                if (body === selectedBody) refreshSelectionVisuals();
            }
        } catch (e) {
            console.error('Error applying body radius edit:', e);
        }

        // Apply new trajectory (velocity, orbital angle, and inclination) only if explicitly set.
        // Each control is tracked independently so changing only speed doesn't alter direction
        // and changing only angle doesn't alter speed.
        if (velocity !== null || orbitalAngle !== null || inclination !== null) {
            const currentVel = body.velocity.clone();
            const currentSpeed = currentVel.length();
            const currentAngleDeg =
                ((Math.atan2(currentVel.z, currentVel.x) * 180) / Math.PI + 360) % 360;
            const currentHorizSpeed = Math.sqrt(
                currentVel.x * currentVel.x + currentVel.z * currentVel.z
            );
            const currentInclinationDeg =
                (Math.atan2(currentVel.y, currentHorizSpeed) * 180) / Math.PI;

            const resolvedSpeed = velocity !== null ? velocity : currentSpeed;
            const resolvedAngleDeg = orbitalAngle !== null ? orbitalAngle : currentAngleDeg;
            const resolvedInclinationDeg =
                inclination !== null ? inclination : currentInclinationDeg;

            const angleRad = (resolvedAngleDeg * Math.PI) / 180;
            const inclinationRad = (resolvedInclinationDeg * Math.PI) / 180;

            const horizontalSpeed = resolvedSpeed * Math.cos(inclinationRad);
            const verticalSpeed = resolvedSpeed * Math.sin(inclinationRad);

            body.velocity.x = horizontalSpeed * Math.cos(angleRad);
            body.velocity.y = verticalSpeed;
            body.velocity.z = horizontalSpeed * Math.sin(angleRad);
        }

        // Apply color change if provided and if body is not a star
        if (color && !isBodyType(body, BodyTypeEnum.Star)) {
            try {
                // Convert hex string to THREE.Color
                const col = new THREE.Color(color);
                if (body.mesh && body.mesh.material) {
                    (body.mesh.material as THREE.MeshStandardMaterial).color?.set(col);
                }
                if (body instanceof CelestialBody) body.baseColor.set(col);
            } catch (e) {
                console.error('Error applying body color edit:', e);
            }
        }

        // Apply axial tilt and azimuth if the sliders were visible and the body supports rotation
        if ((editTilt !== null || editAzimuth !== null) && body instanceof CelestialBody) {
            const newTilt = editTilt !== null ? editTilt : (body.rotation.tilt ?? 0);
            const newAzimuth = editAzimuth !== null ? editAzimuth : (body.rotation.azimuth ?? 0);
            body.rotation.tilt = newTilt;
            body.rotation.azimuth = newAzimuth;
            const tiltRad = THREE.MathUtils.degToRad(newTilt);
            const azRad = THREE.MathUtils.degToRad(newAzimuth);
            const tiltQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0),
                tiltRad
            );
            const azQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                azRad
            );
            body.mesh.quaternion.multiplyQuaternions(azQuat, tiltQuat);
            if (body.rings) {
                body.rings.position.copy(body.mesh.position);
                body.rings.quaternion.copy(body.mesh.quaternion);
            }
            if (body === selectedBody) gizmo.attach(body);
        }

        refreshBodiesTable();
    }
);

// Update stats display when star death checkbox is toggled
const starDeathCheckbox = document.getElementById('enableStarDeath');
if (starDeathCheckbox) {
    starDeathCheckbox.addEventListener('change', () => {
        // Update stats display if a body is currently selected
        if (selectedBody && statsSprite && statsSprite.visible) {
            statsSprite.material.map?.dispose();
            statsSprite.material.map = createStatsTexture(selectedBody);
            statsSprite.material.needsUpdate = true;
        }
    });
}

function deleteSelectedBody() {
    if (!selectedBody || !simulationState.bodies.includes(selectedBody) || selectedBody._isDisposed)
        return false;
    const bodyToDelete = selectedBody;

    // Check if this body is the camera's current focus (legacy id check kept)
    const wasCameraTarget = bodyToDelete.id === focusID;

    // For stars: delete immediately with NO supernova / black hole.
    // (Natural star death still triggers those effects via the fuel system.)
    const deletingStar = isBodyType(bodyToDelete, BodyTypeEnum.Star);

    if (deletingStar) {
        // Star.die(true) is the single cleanup path (no supernova/black hole for manual deletion).
        bodyToDelete.die();

        const index = simulationState.bodies.indexOf(bodyToDelete);
        if (index > -1) simulationState.bodies.splice(index, 1);

        try {
            window.dispatchEvent(
                new CustomEvent('body:removed', {
                    detail: { body: bodyToDelete, id: bodyToDelete.id, name: bodyToDelete.name },
                })
            );
        } catch (e) {
            console.error('Error dispatching body:added event after body creation:', e);
        }

        if (bodyToDelete === getPrimaryStar()) {
            addEvent?.({
                message: 'Sun deleted',
                notificationType: NotificationType.Alert,
            });
        }
    } else {
        bodyToDelete.die();

        try {
            window.dispatchEvent(
                new CustomEvent('body:removed', {
                    detail: { body: bodyToDelete, id: bodyToDelete.id, name: bodyToDelete.name },
                })
            );
        } catch (e) {
            console.error('Error dispatching body:removed event after deleting star:', e);
        }

        const index = simulationState.bodies.indexOf(bodyToDelete);
        if (index > -1) simulationState.bodies.splice(index, 1);

        addEvent?.({
            message: `${bodyToDelete.name} deleted`,
            notificationType: NotificationType.Alert,
        });

        if (wasCameraTarget) {
            setF('camNone');
            controls.enabled = true;
            controls.target.set(0, 0, 0);
            controls.mouseButtons.RIGHT = null;
            triggerZoomToBody(null);
        }
    }

    // Update UI selection state (match existing empty-space click behavior)
    selectedBody = null;
    uiManager.managementPanel?.setSelectedBody?.(null);
    if (cameraState?.isTargetMode) {
        gizmo.attach(null);
    }

    refreshBodiesTable();
    return true;
}

// Keyboard controls for free camera
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    // Arrow-key movement for selected bodies when the gizmo is visible.
    if (key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown') {
        if (moveSelectedBodyRelativeToCamera(key, e.ctrlKey)) {
            e.preventDefault();
            return;
        }
    }

    // Toggle velocity edit mode while actively editing velocity
    // G toggles between XZ (horizontal) and Y (vertical).
    if ((isChangingVelocity || isMiddleMouseVelocity) && key === 'g') {
        interactionState.velocityEditMode = interactionState.velocityEditMode === 'xz' ? 'y' : 'xz';

        // Update the drag plane to match the active velocity edit mode.
        // - XZ: horizontal plane through the body (constrains to XZ while still tracking mouse up/down)
        // - Y: vertical plane containing world-up and the current horizontal heading
        if (gizmo?.target) {
            const origin = gizmo.target.mesh.position;

            if (interactionState.velocityEditMode === 'y') {
                const v = gizmo.target.velocity.clone();
                v.y = 0;

                const hDir = v.lengthSq() > 1e-10 ? v.normalize() : new THREE.Vector3(1, 0, 0);
                const up = new THREE.Vector3(0, 1, 0);

                const planeNormal = new THREE.Vector3().crossVectors(hDir, up).normalize();
                dragPlane.setFromNormalAndCoplanarPoint(planeNormal, origin);
            } else {
                // XZ mode: use horizontal plane (not a camera-facing plane)
                dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), origin);
            }
        }

        velArc.update();
        // Prevent the key from doing anything else
        e.preventDefault();
        return;
    }

    if (key === 'w') {
        // Flight mode: W = hold to thrust forward
        if (flightState.isActive) {
            keys.w = true;
            e.preventDefault();
            return;
        }
        keys.w = true;
    }
    if (key === 'a') {
        // Flight mode: A rolls left
        if (flightState.isActive) {
            flightState.rollLeft = true;
            e.preventDefault();
            return;
        }
        keys.a = true;
    }
    if (key === 's') {
        // Flight mode: S = hold to thrust backward / decelerate
        if (flightState.isActive) {
            keys.s = true;
            e.preventDefault();
            return;
        }
        keys.s = true;
    }
    if (key === 'd') {
        // Flight mode: D rolls right
        if (flightState.isActive) {
            flightState.rollRight = true;
            e.preventDefault();
            return;
        }
        keys.d = true;
    }
    if (key === 'c') {
        // Flight mode: C toggles between cockpit and 3rd-person view
        if (flightState.isActive) {
            flightState.isCockpitView = !flightState.isCockpitView;
            e.preventDefault();
            return;
        }
        keys.c = true;
    }
    if (key === ' ') {
        if (flightState.isActive) {
            e.preventDefault();
            if (e.repeat) return; // ignore key-repeat; only act on the initial press
            if (flightState.warpActive) {
                // Disengage warp
                flightState.warpActive = false;
                flightState.warpCharging = false;
                flightState.warpCharge = 0;
                flightState.warpDecelerating = true;
                warpEffect.stop();
                // Restore steering HUD immediately on disengage (decel still active,
                // but steering is restored so the player can redirect during slowdown).
                flightSteeringLine.visible = true;
                addEvent({
                    message: 'Warp disengaged. Decelerating...',
                    notificationType: NotificationType.Info,
                });
            } else if (!flightState.warpDecelerating && !autopilotState.isActive) {
                // Only start charging when not already decelerating from a previous warp,
                // and not under autopilot control.
                flightState.warpCharging = true;
            }
            return;
        }
        keys.space = true;
    }
    if (key === 'shift') {
        keys.shift = true;
    }

    // Escape exits flight mode
    if (key === 'escape' && flightState.isActive) {
        exitFlightMode();
        e.preventDefault();
        return;
    }

    // Delete key to remove selected body
    if (key === 'n') {
        const showNamesCheckbox = uiManager.mainPanel.showNamesCheckbox as HTMLInputElement | null;
        if (showNamesCheckbox) {
            showNamesCheckbox.checked = !showNamesCheckbox.checked;
            showNamesCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            e.preventDefault();
            return;
        }
    }

    if (key === 'p') {
        handlePauseShortcut();
        e.preventDefault();
        return;
    }

    if (key === 'delete') {
        deleteSelectedBody();
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w') keys.w = false;
    if (key === 'a') {
        keys.a = false;
        if (flightState.isActive) flightState.rollLeft = false;
    }
    if (key === 's') keys.s = false;
    if (key === 'd') {
        keys.d = false;
        if (flightState.isActive) flightState.rollRight = false;
    }
    if (key === 'c') keys.c = false;
    if (key === ' ') {
        keys.space = false;
        if (flightState.isActive) {
            // Cancel warp charge if space released before full charge
            if (flightState.warpCharging) {
                flightState.warpCharging = false;
                flightState.warpCharge = 0;
                flightHUD.hideWarpSprite();
            }
        }
    }
    if (key === 'shift') keys.shift = false;

    if (key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown') {
        if (!isChangingVelocity && !isMiddleMouseVelocity && !interactionState.isRepositioning) {
            posIndicator.hide();
            velArc.hideAll();
        }
    }
});

window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('contextmenu', (e) => e.preventDefault());

// Allow zooming while dragging velocity arrow:
// - Wheel scroll zooms camera (relative to selected/focus body)
// - EXCEPT when the wheel event originates over the UI (e.g. Bodies table),
//   in which case we allow normal scrolling and do NOT zoom the scene.
window.addEventListener(
    'wheel',
    (e) => {
        // If the wheel is used over the UI panel, let it scroll normally.
        // This allows scrolling the Bodies table without zooming the scene.
        const uiContainer = document.getElementById('ui-container');
        if (uiContainer && e.target instanceof Node && uiContainer.contains(e.target)) {
            return;
        }

        // Disable wheel zoom while dragging gizmos (position or velocity).
        // Wheel zoom during a drag causes unstable interaction / weird cursor-plane mapping.
        if (interactionState.isRepositioning || isChangingVelocity || isMiddleMouseVelocity) {
            return;
        }

        // Otherwise, treat wheel as scene zoom
        e.preventDefault();

        const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1;
        zoomRelativeToTarget(getZoomTarget(), zoomFactor);
    },
    { passive: false }
);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Update orthographic camera for UI
    uiCamera.left = -window.innerWidth / 2;
    uiCamera.right = window.innerWidth / 2;
    uiCamera.top = window.innerHeight / 2;
    uiCamera.bottom = -window.innerHeight / 2;
    uiCamera.updateProjectionMatrix();

    // Update fat-line resolutions (velocity arcs)
    velArc.resize(window.innerWidth, window.innerHeight);
    orbitPrediction.resize(window.innerWidth, window.innerHeight);

    // Reposition FPS counter
    if (fpsSprite) {
        fpsSprite.position.set(window.innerWidth / 2 - 110, window.innerHeight / 2 - 30, TEXT_SPRITE_Z);
    }

    // Reposition stats display
    if (statsSprite) {
        statsSprite.position.set(window.innerWidth / 2 - 255, window.innerHeight / 2 - 270, TEXT_SPRITE_Z);
    }

    // Reposition hint display (top-center)
    if (flightHUD.hintSprite) {
        flightHUD.hintSprite.position.set(0, window.innerHeight / 2 - 55, TEXT_SPRITE_Z);
    }

    // Reposition event log

    warpEffect.resize(window.innerWidth, window.innerHeight);
    lensingEffect.resize(window.innerWidth, window.innerHeight);
});

// Apply initial background visibility (pre-launch view): kuiper off
if (typeof kuiperBeltPoints !== 'undefined' && kuiperBeltPoints) kuiperBeltPoints.visible = false;
if (uiManager.managementPanel.enableKuiperBeltCheckbox)
    uiManager.managementPanel.enableKuiperBeltCheckbox.checked = false;

if (skydome) skydome.visible = true;
if (enableSkydomeCheckbox) enableSkydomeCheckbox.checked = true;

function handleBodyBecameInvalid(body: Body | null | undefined) {
    if (!body) return;

    // If collision logic already handed camera focus off to a different body this frame,
    // do NOT force a fallback to center/orbit-off.
    // We still clear selection pointers for the dead body.
    const collisionHandoffTarget =
        cameraState?.pendingCollisionFocusBody &&
        simulationState.bodies.includes(cameraState.pendingCollisionFocusBody) &&
        !cameraState.pendingCollisionFocusBody._isDisposed
            ? cameraState.pendingCollisionFocusBody
            : null;

    const wasLookAtTarget = cameraState.focusBody === body;
    const focusAlreadyMoved =
        collisionHandoffTarget && cameraState.focusBody === collisionHandoffTarget;

    // Clear selection state
    if (selectedBody === body) selectedBody = null;
    if (manuallySelectedBody === body) manuallySelectedBody = null;
    if (cameraState.focusBody === body && !focusAlreadyMoved) cameraState.focusBody = null;

    // If Look At is ON and we just lost the focus target, fall back to "None" orbit mode.
    // Otherwise RMB mouse-look has no valid orbit anchor and camera rotation appears "stuck".
    //
    // But: if a collision just re-focused the camera to the "killer" body, keep Look At ON and
    // keep the new focus.
    if (cameraState.isLookAtMode && wasLookAtTarget && !focusAlreadyMoved) {
        cameraState.isLookAtMode = false;
        try {
            uiManager.mainPanel?.setLookAtState(false);
        } catch (e) {
            console.error('Error dispatching body:removed event after deleting body:', e);
        }

        controls.enabled = !isFreeCameraMode;
        controls.target.copy(NONE_FOCUS_POSITION);
        controls.update();
        camera.lookAt(NONE_FOCUS_POSITION);

        // Legacy alias kept in sync for any older call sites
        focusID = 'camNone';
    }

    // Clear edit panel selection if it is showing this body
    if (uiManager.managementPanel && uiManager.managementPanel.selectedBody === body) {
        uiManager.managementPanel.setSelectedBody(null);
    }

    // Clear gizmo if it was attached to this body
    if (gizmo && gizmo.target === body) {
        gizmo.attach(null);
    }

    // Consume pending focus handoff marker once the dead body cleanup has run.
    if (cameraState?.pendingCollisionFocusBody) {
        cameraState.pendingCollisionFocusBody = null;
    }
}

// Event-driven bodies table + selection cleanup updates (avoid constant refresh/flicker)
window.addEventListener('body:added', refreshBodiesTable);

// Physics → UI logging: body absorption events become Noty notifications via addEvent()
window.addEventListener('body:absorbed', (e) => {
    if (!e?.detail) return;
    const { message, notificationType } = e.detail;
    addEvent({ message, notificationType });
});

window.addEventListener('body:removed', (e: WindowEventMap['body:removed']) => {
    const removedBody = e.detail.body;
    // If the deleted body was the player's known ship, clear the reference
    // so the button reverts to "SPAWN SPACESHIP" rather than "ENTER SHIP".
    if (removedBody && removedBody === flightState.knownShip) {
        flightState.knownShip = null;
        setTimeout(() => {
            try {
                uiManager.flightControlsPanel.updateFlightSpawnBtnLabel(
                    flightState.knownShip,
                    simulationState.bodies
                );
            } catch {
                // Empty
            }
        }, 0);
    }
    handleBodyBecameInvalid(removedBody);
    refreshBodiesTable();
});

window.addEventListener('weapon:hit', (e: WindowEventMap['weapon:hit']) => {
    const { body, position } = e.detail;
    if (body._isDisposed || !body.mesh) return;

    playWeaponImpact();

    // Spawn impact flash: pass body centre so ImpactShockwave can snap to surface
    simulationState.impacts.push(
        new ImpactShockwave(dependencies, scene, position, body.mesh.position, body.radius)
    );

    body.healthPoints -= WEAPON_DAMAGE;
    if (body.healthPoints <= 0) {
        body.die();
    }
});

window.addEventListener('body:dead', (e: WindowEventMap['body:dead']) => {
    const body = e.detail.body;
    if (body) {
        // Ensure truly-dead bodies are removed from the simulation array.
        // Collision deaths already remove immediately, but other death paths (e.g. star fuel death)
        // can emit `body:dead` without being spliced out here.
        simulationState.bodies = (simulationState.bodies || []).filter((b) => b !== body);
    }

    handleBodyBecameInvalid(body);
    refreshBodiesTable();
});

window.addEventListener('bodies:reset', () => {
    // Everything is rebuilt; clear selection-related pointers so UI/camera doesn't reference stale bodies.
    selectedBody = null;
    manuallySelectedBody = null;
    cameraState.focusBody = null;
    gizmo.attach(null);
    uiManager.managementPanel.setSelectedBody(null);
    refreshBodiesTable();
});

// --- Startup modal wiring ---
function applyDefaultCameraTogglesAfterSpawn() {
    // Default behavior:
    // - Target OFF by default
    // - Look At ON (button shows active), but with NO pre-selected body
    //   so camera still behaves like center-orbit until the user selects a body.
    cameraState.isTargetMode = false;
    uiManager.mainPanel.setTargetState(false);

    cameraState.isLookAtMode = true;
    uiManager.mainPanel.setLookAtState(true);

    // No auto-focus/selection.
    cameraState.focusBody = null;
    selectedBody = null;
    manuallySelectedBody = null;

    // With Look At ON but no focus body, keep orbit anchor at center.
    controls.enabled = !isFreeCameraMode;
    controls.target.copy(NONE_FOCUS_POSITION);
    controls.update();
    camera.lookAt(NONE_FOCUS_POSITION);

    // Force the primary light to initialize correctly on first load.
    syncAllStarLightTargets();

    // No selection => no gizmo attachment yet.
    gizmo.attach(null);
    uiManager.managementPanel.setSelectedBody(null);
    refreshBodiesTable();

    // Hint text depends on toggle state (Target/Look At).
    flightHUD.forceHintRefresh();
}

function applyStartupGMultiplier() {
    const gMult = startupModal.getGMultiplier();
    simulationState.gMultiplier = gMult;
    const mpSlider = uiManager.managementPanel.gravitationalConstantSlider;
    const mpDisplay = uiManager.managementPanel.gravitationalConstantDisplay;
    if (mpSlider) mpSlider.value = String(gMult);
    if (mpDisplay) mpDisplay.textContent = gMult.toFixed(gMult < 10 ? 2 : 0);
}

startupModal.on('launchDefault', async () => {
    ambientMusic.init();
    applyStartupGMultiplier();
    uiManager.managementPanel.hide();
    startupModal.hide();
    await spawn({ mode: SimulationStartMode.Default });
    applyDefaultCameraTogglesAfterSpawn();
});

startupModal.on('launchEmpty', async () => {
    applyStartupGMultiplier();
    uiManager.managementPanel.hide();
    startupModal.hide();
    await spawn({ mode: SimulationStartMode.Empty });
    applyDefaultCameraTogglesAfterSpawn();
});

startupModal.on('generateBlackHole', async ({ seed }: { seed: string }) => {
    applyStartupGMultiplier();
    uiManager.managementPanel.hide();
    proceduralModal.hide();
    startupModal.hide();

    await spawn({ mode: SimulationStartMode.BlackHole, seed });
    applyDefaultCameraTogglesAfterSpawn();
});

startupModal.on('generateProcedural', async ({ seed }: { seed: string }) => {
    applyStartupGMultiplier();
    uiManager.managementPanel.hide();

    await spawn({ mode: SimulationStartMode.Procedural, seed });
    applyDefaultCameraTogglesAfterSpawn();
});

startupModal.on('cancel', () => {
    startupModal.hide();
});

// Retry: user clicked Create on the seed form after a failed generation.
proceduralModal.on('create', async ({ seed }: { seed: string }) => {
    await spawn({ mode: SimulationStartMode.Procedural, seed });
    applyDefaultCameraTogglesAfterSpawn();
});

// Retry cancel: user clicked Cancel on the seed form after a failed generation.
proceduralModal.on('cancelFromRetry', () => {
    proceduralModal.hide();
    startupModal.open({ allowCancel: startupModal._allowCancel });
});

// Block input while modal visible
const _origOnMouseDown = onMouseDown;
const _origOnMouseMove = onMouseMove;
const _origOnMouseUp = onMouseUp;

function modalBlocksInput() {
    return startupModal.isVisible() || proceduralModal.isVisible();
}

function onMouseDownWrapped(e: MouseEvent) {
    if (modalBlocksInput()) return;
    return _origOnMouseDown(e);
}
function onMouseMoveWrapped(e: MouseEvent) {
    if (modalBlocksInput()) return;
    return _origOnMouseMove(e);
}
function onMouseUpWrapped(e: MouseEvent) {
    if (modalBlocksInput()) return;
    return _origOnMouseUp(e);
}

window.removeEventListener('mousedown', onMouseDown);
window.removeEventListener('mousemove', onMouseMove);
window.removeEventListener('mouseup', onMouseUp);
window.addEventListener('mousedown', onMouseDownWrapped);
window.addEventListener('mousemove', onMouseMoveWrapped);
window.addEventListener('mouseup', onMouseUpWrapped);

// When the browser releases pointer lock (e.g. user presses Esc natively),
// exit flight mode so the ship doesn't keep spinning with stale pointer offsets.
document.addEventListener('pointerlockchange', () => {
    if (flightState.isActive && document.pointerLockElement !== renderer.domElement) {
        exitFlightMode();
    }
});

window.addEventListener(
    'keydown',
    () => {
        if (modalBlocksInput()) return;
    },
    true
);

// ── Initialize: check for URL seed or show startup modal ────────────────────
(async function initializeApp() {
    const urlSeed = parseSeedFromURL();
    if (urlSeed) {
        // Skip startup modal — proceed directly to generation
        applyStartupGMultiplier();
        uiManager.managementPanel.hide();

        const mode =
            urlSeed.type === SEED_TYPE_BLACKHOLE
                ? SimulationStartMode.BlackHole
                : SimulationStartMode.Procedural;

        // For procedural, make the modal overlay visible before spawn shows progress
        if (mode === SimulationStartMode.Procedural && proceduralModal.element) {
            proceduralModal.element.classList.add('visible');
        }

        await spawn({ mode, seed: urlSeed.seed });
        applyDefaultCameraTogglesAfterSpawn();
    } else {
        startupModal.open({ allowCancel: false });
    }
})();

// ── popstate listener for back/forward navigation ───────────────────────────
window.addEventListener('popstate', async () => {
    const currentSeed = parseSeedFromURL();

    // If there's no seed in the URL now (e.g. navigated back to a page without one)
    if (!currentSeed) {
        // Only reload if we were previously showing a seeded system
        if (_lastPushedSeedValue !== null) {
            _lastPushedSeedValue = null;
            applyStartupGMultiplier();
            uiManager.managementPanel.hide();
            startupModal.hide();
            await spawn({ mode: SimulationStartMode.Default });
            applyDefaultCameraTogglesAfterSpawn();
        }
        return;
    }

    // Avoid re-generating the same system
    const fullValue = buildSeedValue(currentSeed.type, currentSeed.seed);
    if (fullValue === _lastPushedSeedValue) return;
    _lastPushedSeedValue = fullValue;

    applyStartupGMultiplier();
    uiManager.managementPanel.hide();
    startupModal.hide();

    const mode =
        currentSeed.type === SEED_TYPE_BLACKHOLE
            ? SimulationStartMode.BlackHole
            : SimulationStartMode.Procedural;

    if (mode === SimulationStartMode.Procedural && proceduralModal.element) {
        proceduralModal.element.classList.add('visible');
    }

    await spawn({ mode, seed: currentSeed.seed });
    applyDefaultCameraTogglesAfterSpawn();
});

refreshBodiesTable();
animate();
