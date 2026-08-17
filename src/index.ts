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
        /** Fired when a weapon projectile strikes a body. */
        'weapon:hit': CustomEvent<{ body: Body; position: THREE.Vector3; damage: number }>;
        'camera:focusChanged': CustomEvent<{
            body: Body | null;
            id: string | null;
            name: string | null;
        }>;
        /** Fired when the sim's scalar controls (pause / time scale / gravity) change. */
        'sim:stateChange': CustomEvent<ISimStateSnapshot>;
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
    CROSSHAIR_SIZE,
    VEL_SCALE,

    // Flight feel constants moved from index.ts
    FLIGHT_MAX_POINTER_OFFSET,
    FLIGHT_ALT_ORBIT_SENSITIVITY,
    FLIGHT_ALT_ORBIT_PITCH_MIN,
    FLIGHT_ALT_ORBIT_PITCH_MAX,
    FLIGHT_ALT_ORBIT_YAW_MAX,
    SUN_RADIUS,
    DIST_SCALE,
    TEXT_SPRITE_Z,
    C,
} from './utilities/consts';
import { CoordinateGizmo } from './gizmos/coordinate-gizmo';
import {
    isBodyType,
    createUniqueId,
    generateIAUName,
    getBodyTypeLabel,
} from './utilities/utilities';
import { SeededRandom } from './utilities/prng';
import { setBodyRadius } from './physics/physics';
import {
    randomStarParams,
    randomBlackHoleParams,
    randomPlanetParams,
    randomMoonParams,
    randomCometParams,
    randomAsteroidParams,
} from './utilities/body-params';
import {
    loadSpaceTexture,
    showSpaceBackground,
    getRoughnessForMoonTexture,
    getMetalnessForMoonTexture,
    moonTexture,
    cloudTextures,
} from './drawing/textures';
import { Supernova } from './effects/supernova';
import { PlanetaryNebula } from './effects/planetary-nebula';
import { ParticleExplosion } from './effects/particle-explosion';
import { AmbientSoundManager } from './utilities/ambient-sound';
import { GravitationalLensingEffect } from './effects/gravitational-lensing';
import { GridHelperManager } from './gizmos/grid-helper';
import { PositionIndicatorManager } from './gizmos/position-indicator';
import { FlightHUD } from './drawing/flight-hud';
import { AutopilotTargetIndicator } from './drawing/autopilot-target-indicator';
import { PlanetNameIndicator } from './drawing/planet-name-indicator';
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
import { Asteroid } from './bodies/asteroid';

import { Spaceship } from './bodies/ships/spaceship';
import { StartupModal } from './ui/startup-modal';
import { ProceduralGeneratorModal } from './ui/procedural-generator-modal';
import { AboutModal } from './ui/about-modal';
import { OptionsPanel } from './ui/options-panel';
import { EventLogEntry, LogMethods, NotificationType } from './event-log/event-log';
import {
    IAutopilotContext,
    IFlightControlContext,
    IProceduralGeneratorPromptResult,
    ISimStateSnapshot,
    IStateDependencies,
} from './interfaces';
import { cancelAutopilot, engageAutopilot, drainAutopilotEvents } from './simulation/autopilot';
import { Sun } from './bodies/sun';
import { GenericComet } from './bodies/generic-comet';
import { UIManager } from './ui/ui-manager';
import { runAnimationLoop, AnimationContext } from './simulation/animation-loop';
import { registerCustomEventListeners } from './events/custom-event-listeners';

// Vue UI overlay (new UI, developed in parallel with the existing UI)
import { mountVueUi } from './vue/main';
import { registerVueSimHooks, setDisplayState } from './vue/sim-bridge';

// State singletons
import {
    autopilotState,
    cameraState,
    flightState,
    interactionState,
    simulationState,
} from './simulation/simulation';

// Note: Ctrl+W cannot be prevented due to browser security restrictions
// Browsers intentionally allow users to always close tabs with Ctrl+W
// See: https://stackoverflow.com/questions/21695682/is-it-possible-to-catch-ctrlw-shortcut-and-prevent-tab-closing

// Warn user before closing the tab/window
window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = ''; // Chrome requires returnValue to be set
    return ''; // Some browsers use the return value
});

// Create the scene
const scene = new THREE.Scene();

// === Ambient light from stars (base level of illumination) ===
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

// --- Camera and renderer setup ---
const CAMERA_FAR_PLANE =
    PLUTO_DIST +
    (300_000_000 / DIST_SCALE) * SCALE_FACTOR +
    (2_000_000_000 / DIST_SCALE) * SCALE_FACTOR;
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
document.body.appendChild(renderer.domElement);
renderer.domElement.classList.add('webgl-canvas');

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
import { ProceduralGenerator } from './procedural/procedural-generator';
import { NormalSolarSystemGenerator } from './procedural/normal-solar-system-generator';
import { BlackHoleSystemGenerator } from './procedural/black-hole-system-generator';
import { BodyTypeEnum, MoonTypeEnum, PlanetTypeEnum } from './bodies/body-enums';
import { EffectiveCSpeed, EffectiveGForce } from './types';
import { SolarSystemGenerator } from './procedural/solar-system-generator';
import { EmptySystemGenerator } from './procedural/empty-system-generator';
import { pickMoonTextureForMoonType } from './procedural/moon-factory';
import { ProceduralGenerationReporter } from './procedural/procedural-generation-progress';
import { exitFlightMode } from './simulation/flight-controllers';
import {
    parseSeedFromURL,
    buildSeedValue,
    updateURLWithSeed,
    clearURLSeed,
    SEED_TYPE_NORMAL,
    SEED_TYPE_BLACKHOLE,
    getLastPushedSeed,
    setLastPushedSeed,
    resetLastPushedSeed,
} from './utilities/url-seed';
import { getShipTypeById } from './bodies/ships/ship-registry';

// --- Event notifications (replaces sprite-based event log) ---
function addEvent(event: {
    message: string;
    notificationType: NotificationType;
    logMethod?: LogMethods;
}) {
    const entry = new EventLogEntry(event.message, event.notificationType, event.logMethod);

    // Add the event message to the console as well for better visibility
    if (entry.logMethod & LogMethods.Console) {
        console.info(entry.message);
    }

    // If log method contains Alert, then also show Noty
    if (entry.logMethod & LogMethods.Alert) {
        new Noty({
            type: entry.notificationType,
            theme: 'semanticui',
            layout: 'topCenter',
            text: entry.message,
            timeout: 3500,
            progressBar: false,
            closeWith: ['click', 'button'],
            queue: 'solar-event-log',
            //killer: true,
        }).show();
    }
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

    if (cameraState.isFreeCameraMode) {
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
        el.closest('#vue-ui-root') ||
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
    getC: () => (C * Math.sqrt(simulationState.gMultiplier)) as EffectiveCSpeed,
};

// --- Velocity editing arc helpers ---
const velArc = new VelocityArcManager(scene, gizmo, interactionState);

// --- Orbit prediction lines ---
const orbitPrediction = new OrbitPredictionManager(scene);
orbitPrediction.resize(window.innerWidth, window.innerHeight);

// Create FPS counter sprite
let fpsSprite: THREE.Sprite | null = null;

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

// (warp effect is now created per-ship inside the Spaceship constructor)

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

const targetIndicator = new AutopilotTargetIndicator(uiScene, autopilotState, flightState);
targetIndicator.init();

const planetNameIndicator = new PlanetNameIndicator(uiScene, simulationState);

// Backward-compatible let kept for basic module-level state
let manuallySelectedBody = null as Body | null; // Track bodies clicked in space (without camera buttons)
const NONE_FOCUS_POSITION = new THREE.Vector3(0, 0, 0); // Center of solar system

const supernovas: Supernova[] = []; // Track all supernova effects
const planetaryNebulae: PlanetaryNebula[] = []; // Track all planetary nebula effects

let isTilting = false;
let isAzimuthDragging = false;

const keys = cameraState.keys;
//const cameraSpeed = cameraState.speed;
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
        !interactionState.isChangingVelocity &&
        !interactionState.isMiddleMouseVelocity
    );
}

function moveSelectedBodyRelativeToCamera(directionKey: string, ctrlKey = false) {
    if (!canMoveSelectedBodyWithArrowKeys()) return false;

    const body = gizmo.target;
    if (!body?.mesh) return false;

    const wasRunning = !simulationState.isPaused;
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
        !cameraState.isFreeCameraMode &&
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
            (interactionState.isChangingVelocity || interactionState.isMiddleMouseVelocity) &&
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
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden
                id: createUniqueId('moon'),
                name: 'Moon',
                moonType: MoonTypeEnum.Terrestrial,
                texture: moonTexture,
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
            newBody = new Jupiter(dependencies, scene);
            break;
        }
        case 'saturn': {
            newBody = new Saturn(dependencies, scene);
            break;
        }
        case 'uranus': {
            newBody = new Uranus(dependencies, scene);
            break;
        }
        case 'neptune': {
            newBody = new Neptune(dependencies, scene);
            break;
        }
        case 'pluto': {
            newBody = new Pluto(dependencies, scene);
            break;
        }
        case 'ceres': {
            newBody = new Ceres(dependencies, scene);
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
            const atmosphereTex = atmosphereRng.pick(cloudTextures) ?? cloudTextures[0];

            // Cloud layer (UV sphere slightly above surface)
            const cloudsMat = new THREE.MeshStandardMaterial({
                map: atmosphereTex,
                alphaMap: atmosphereTex,
                transparent: true,
                opacity: 1.0,
                depthWrite: false,
                depthTest: true,
                color: 0xffffff,
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

            // Map planetType to MoonTypeEnum
            const moonTypeEnum = (() => {
                switch (moonType) {
                    case 'desert':
                        return MoonTypeEnum.Desert;
                    case 'temperate':
                        return MoonTypeEnum.Temperate;
                    case 'volcanic':
                        return MoonTypeEnum.Volcanic;
                    case 'ocean':
                        return MoonTypeEnum.Ocean;
                    case 'frozen':
                        return MoonTypeEnum.Frozen;
                    case 'solid':
                    default:
                        return MoonTypeEnum.Terrestrial;
                }
            })();

            const rng = new SeededRandom(moonTextureSeed);

            const moonMap = pickMoonTextureForMoonType(moonTypeEnum, rng);

            const moonMaterial = new THREE.MeshStandardMaterial({
                map: moonMap,
                color: 0xffffff, // keep texture untinted
                emissive: 0x000000,
                emissiveIntensity: 0,
                roughness: getRoughnessForMoonTexture(moonTypeEnum),
                metalness: getMetalnessForMoonTexture(moonTypeEnum),
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
                const atmosphereTex = atmosphereRng.pick(cloudTextures) ?? cloudTextures[0];

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
 * Cleans up the entire solar system, disposing of all celestial bodies, explosions, impacts, supernovas, and planetary nebulae.
 * Resets the simulation state and notifies the UI of the reset.
 */
function cleanUpSolarSystem() {
    // Unified cleanup: always dispose existing bodies (stars included).
    // No special-casing is required here; Star.die({ skipExplosion: true }) is already the canonical disposal path.
    for (const b of simulationState.bodies || []) {
        if (!b || b._isDisposed) continue;
        try {
            b.die({ skipExplosion: true, skipImpactSound: true });
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
    // Mutate in place (NOT `supernovas = []`) — animCtx captured the array
    // reference via `{ value: supernovas }`, so rebinding would orphan every
    // future supernova from the animation loop. Use the same for nebulae.
    supernovas.length = 0;

    // Clean up all planetary nebula effects
    for (const nebula of planetaryNebulae) {
        nebula.dispose();
    }
    planetaryNebulae.length = 0;

    // Reset bodies array depending on mode
    simulationState.bodies = [];

    // Notify UI / systems that track live bodies
    try {
        window.dispatchEvent(new CustomEvent('bodies:reset'));
    } catch (e) {
        console.error('Error dispatching bodies:reset event:', e);
    }

    clearURLSeed();

    selectedBody = null;
}

/**
 * Spawns a new simulation based on the specified mode and seed. Initializes the environment, cleans up existing bodies and effects,
 * and sets up the initial state for the simulation.
 * @param param0 An object containing the mode and seed for the simulation spawn.
 * @returns
 */
async function spawn(
    mode = SimulationStartMode.Default,
    proceduralResult?: IProceduralGeneratorPromptResult,
    progressReporter?: ProceduralGenerationReporter
) {
    applyEnvironmentDefaultsForMode(mode);

    cleanUpSolarSystem();

    let generator: SolarSystemGenerator;
    let seedType: typeof SEED_TYPE_NORMAL | typeof SEED_TYPE_BLACKHOLE | null = null;

    if (mode === SimulationStartMode.Default) {
        // Normal solar system generator
        generator = new NormalSolarSystemGenerator(dependencies, scene);
    } else if (mode === SimulationStartMode.Procedural && proceduralResult) {
        // Procedural system generator
        generator = new ProceduralGenerator(dependencies, scene, proceduralResult?.seed);
        seedType = SEED_TYPE_NORMAL;
    } else if (mode === SimulationStartMode.BlackHole) {
        // Black hole system generator
        generator = new BlackHoleSystemGenerator(dependencies, scene, proceduralResult?.seed);
        seedType = SEED_TYPE_BLACKHOLE;
    } else {
        // Empty system generator
        generator = new EmptySystemGenerator(dependencies, scene);
    }

    // Generate the solar system using the selected generator
    const solarSystem = await generator.generateSolarSystemAsync(progressReporter);

    // Set the bodies
    simulationState.bodies = solarSystem.bodies;
    // Apply the space texture from the generated solar system
    await loadSpaceTexture(scene, solarSystem.spaceTexture.filename);

    // Sync the texture with the management panel UI
    uiManager.managementPanel.setSelectedSpaceTexture(solarSystem.spaceTexture);

    // Update the url with the seed and seed type
    if (seedType) {
        updateURLWithSeed(seedType, generator.seed);
    }

    //syncAllStarLightTargets();
    selectedBody = null;

    // Focus on the first body in the list, which will probably be a star (e.g., the Sun).
    if (simulationState.bodies.length > 0) {
        triggerZoomToBody(simulationState.bodies[0]);
    }
}

/**
 * Notify the Vue UI bridge (and any other listeners) that the sim's scalar
 * controls changed, so e.g. the P-key pause state is reflected instantly
 * instead of waiting for the bridge's poll interval.
 */
function dispatchSimStateChange() {
    window.dispatchEvent(
        new CustomEvent<ISimStateSnapshot>('sim:stateChange', {
            detail: {
                timeScale: simulationState.timeScale,
                savedTimeScale: simulationState.savedTimeScale,
                isPaused: simulationState.isPaused,
                gMultiplier: simulationState.gMultiplier,
            },
        })
    );
}

function togglePause() {
    simulationState.isPaused = !simulationState.isPaused;

    if (simulationState.isPaused) {
        // Remember the current speed and set to 0
        simulationState.savedTimeScale = simulationState.timeScale;
        simulationState.timeScale = 0;

        uiManager.setPauseState(true);
        // Keep slider enabled so user can adjust speed while paused
    } else {
        // Restore the saved speed (which may have been adjusted while paused)
        simulationState.timeScale = simulationState.savedTimeScale;
        const direction = simulationState.savedTimeScale < 0 ? ' REVERSE' : '';
        uiManager.mainPanel.updateTimeScaleDisplay(
            Math.abs(simulationState.savedTimeScale) + 'x' + direction
        );
        uiManager.setPauseState(false);
    }

    dispatchSimStateChange();
}

function handlePauseShortcut() {
    togglePause();
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
        !(interactionState.isChangingVelocity || interactionState.isMiddleMouseVelocity) &&
        gizmo.group.visible &&
        gizmo.velocityArrow.visible &&
        gizmo.target
    ) {
        interactionState.isMiddleMouseVelocity = true;
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
            interactionState.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, origin);
        } else {
            // 'xz'
            interactionState.dragPlane.setFromNormalAndCoplanarPoint(
                new THREE.Vector3(0, 1, 0),
                origin
            );
        }

        // Show grid and indicators
        posIndicator.show('both');
        velArc.update();

        return;
    }

    // Right mouse button activates mouse look
    if (event.button === 2) {
        if (surfaceCam.isActive) {
            interactionState.isMouseLookActive = true;
            return;
        }
        // If we're currently dragging velocity with LMB, do NOT pointer-lock.
        // Pointer-lock steals the cursor and breaks the drag-plane mapping used by the velocity gizmo.
        // We'll still rotate the camera using normal mousemove deltas while RMB is held.
        if (!(interactionState.isChangingVelocity || interactionState.isMiddleMouseVelocity)) {
            // Make sure we're tracking the currently held mouse position
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            if (cameraState.isFreeCameraMode) {
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

        interactionState.isMouseLookActive = true;
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
        interactionState.isChangingVelocity = true;
        controls.enabled = false;
        console.log('[drag] LMB velocity start', gizmo.target?.name);

        // Always pause while editing velocity (store whether we should resume after)
        interactionState.velocityEditHadRunningBeforeDrag =
            !simulationState.isPaused && !cameraState.isFreeCameraMode;
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
            interactionState.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, origin);
        } else {
            // 'xz'
            interactionState.dragPlane.setFromNormalAndCoplanarPoint(
                new THREE.Vector3(0, 1, 0),
                origin
            );
        }

        // Immediately update velocity once on mouse-down using current cursor intersection
        // Use the SAME mapping as the drag loop (mouse corresponds to arrow tip in world space).
        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(interactionState.dragPlane, intersection)) {
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
            interactionState.dragPlane.setFromNormalAndCoplanarPoint(
                new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)),
                gizmo.target.mesh.position
            );
            // Highlight ring while dragging
            (gizmo.tiltRing.material as THREE.MeshPhongMaterial).color.set(0xffffff);
            (gizmo.tiltRing.material as THREE.MeshPhongMaterial).emissive.set(0x666666);
            if (!simulationState.isPaused && !cameraState.isFreeCameraMode) {
                togglePause();
                interactionState.wasRunningBeforeDrag = true;
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
            interactionState.dragPlane.setFromNormalAndCoplanarPoint(
                new THREE.Vector3(0, 1, 0),
                gizmo.target.mesh.position
            );
            (gizmo.azimuthRing.material as THREE.MeshPhongMaterial).color.set(0xffffff);
            (gizmo.azimuthRing.material as THREE.MeshPhongMaterial).emissive.set(0x666666);
            if (!simulationState.isPaused && !cameraState.isFreeCameraMode) {
                togglePause();
                interactionState.wasRunningBeforeDrag = true;
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
        interactionState.activeAxis = gizmoIntersects[0].object.userData.axis;
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
        interactionState.dragCameraOffset.subVectors(camera.position, gizmo.target.mesh.position);

        // For stable 1D axis dragging:
        // - Raycast mouse onto a plane that CONTAINS the axis and is as "screen-facing" as possible.
        // - Use incremental drag (start intersection + start position) to avoid runaway.
        const axisDir =
            interactionState.activeAxis === 'x'
                ? new THREE.Vector3(1, 0, 0)
                : interactionState.activeAxis === 'y'
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

        interactionState.dragPlane.setFromNormalAndCoplanarPoint(
            planeNormal,
            gizmo.target.mesh.position
        );

        // Cache initial intersection + starting position so drag is incremental.
        // If the ray doesn't hit the plane (can happen if plane is edge-on), fall back to body origin.
        interactionState.dragStartIntersection = new THREE.Vector3();
        interactionState.dragStartPosition = gizmo.target.mesh.position.clone();
        const ok = raycaster.ray.intersectPlane(
            interactionState.dragPlane,
            interactionState.dragStartIntersection
        );
        if (!ok) {
            interactionState.dragStartIntersection.copy(gizmo.target.mesh.position);
        }

        // Show grid and indicators
        posIndicator.show('position');

        if (!simulationState.isPaused && !cameraState.isFreeCameraMode) {
            togglePause();
            interactionState.wasRunningBeforeDrag = true;
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
            const isAlreadyLookAtTarget = cameraState.focusBody === clickedBody;
            setFocusBody(clickedBody, {
                zoom: cameraState.isLookAtMode && isDifferentSelection && !isAlreadyLookAtTarget,
            });

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
        // ALT orbit mode: mouse orbits camera around ship instead of steering it.
        if (flightState.altOrbitActive) {
            let yawDelta = -(event.movementX || 0) * FLIGHT_ALT_ORBIT_SENSITIVITY;
            let pitchDelta = (event.movementY || 0) * FLIGHT_ALT_ORBIT_SENSITIVITY;

            // Apply resistance near the orbit limits — movement pushing further toward the limit
            // is progressively scaled down so the camera feels heavier as it approaches the edge.
            if (yawDelta !== 0 && Math.sign(yawDelta) === Math.sign(flightState.altOrbitYaw)) {
                const frac = Math.abs(flightState.altOrbitYaw) / FLIGHT_ALT_ORBIT_YAW_MAX;
                yawDelta *= Math.max(0, 1 - frac * frac);
            }
            if (pitchDelta > 0 && flightState.altOrbitPitch > 0) {
                const frac = flightState.altOrbitPitch / FLIGHT_ALT_ORBIT_PITCH_MAX;
                pitchDelta *= Math.max(0, 1 - frac * frac);
            } else if (pitchDelta < 0 && flightState.altOrbitPitch < 0) {
                const frac =
                    Math.abs(flightState.altOrbitPitch) / Math.abs(FLIGHT_ALT_ORBIT_PITCH_MIN);
                pitchDelta *= Math.max(0, 1 - frac * frac);
            }

            flightState.altOrbitYaw = Math.max(
                -FLIGHT_ALT_ORBIT_YAW_MAX,
                Math.min(FLIGHT_ALT_ORBIT_YAW_MAX, flightState.altOrbitYaw + yawDelta)
            );
            flightState.altOrbitPitch = Math.max(
                FLIGHT_ALT_ORBIT_PITCH_MIN,
                Math.min(FLIGHT_ALT_ORBIT_PITCH_MAX, flightState.altOrbitPitch + pitchDelta)
            );
            return; // Skip normal steering accumulation
        }
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
    if (
        (interactionState.isChangingVelocity || interactionState.isMiddleMouseVelocity) &&
        gizmo.target
    ) {
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
            if (raycaster.ray.intersectPlane(interactionState.dragPlane, intersection)) {
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
        if (!cameraState.isFreeCameraMode) return;
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
        if (!cameraState.isFreeCameraMode) return;
    }

    // Handle position gizmo dragging
    if (interactionState.isRepositioning && gizmo.target) {
        // Intersect the cached interactionState.dragPlane, and move ONLY along the chosen axis by the
        // amount the intersection moved since drag start (incremental, stable).
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const intersection = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(interactionState.dragPlane, intersection)) return;

        const axisDir =
            interactionState.activeAxis === 'x'
                ? new THREE.Vector3(1, 0, 0)
                : interactionState.activeAxis === 'y'
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
        if (!cameraState.isFreeCameraMode) return;
    }

    // Mouse look: rotate camera when mouse look is active
    if (interactionState.isMouseLookActive) {
        // Ensure velocity dragging doesn't block mouse-look updates
        // (mousemove can fire with button states that don't include event.movement if not pointer-locked)
        // Movement deltas still come through; we just want to guarantee the look block runs.
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        if (cameraState.isFreeCameraMode) {
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
        if (interactionState.isChangingVelocity && gizmo.target) {
            const origin = gizmo.target.mesh.position;

            if (interactionState.velocityEditMode === 'y') {
                const v = gizmo.target.velocity.clone();
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

            // Recalculate velocity (same constrained mapping as onMouseMove)
            raycaster.setFromCamera(mouse, camera);
            const intersection = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(interactionState.dragPlane, intersection)) {
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
        interactionState.isMiddleMouseVelocity = false;
        interactionState.isMiddleMouseVelocity = false;

        // If LMB velocity drag is still active, do NOT hide the grid/indicators/arcs.
        // This prevents "grid disappearing" when the user releases MMB while still dragging with LMB.
        if (!interactionState.isChangingVelocity) {
            posIndicator.hide();

            // Hide arc helper for middle-mouse velocity drag as well
            velArc.hideAll();
        }

        return;
    }

    // Deactivate mouse look on right mouse button release
    if (event.button === 2) {
        interactionState.isMouseLookActive = false;
        // Exit pointer lock
        if (document.pointerLockElement === renderer.domElement) {
            document.exitPointerLock();
        }
    }

    // Left mouse button releases
    if (event.button === 0) {
        const wasVel = interactionState.isChangingVelocity;
        const wasTilting = isTilting;
        const wasAzimuth = isAzimuthDragging;

        interactionState.isRepositioning = false;
        interactionState.isChangingVelocity = false;
        isTilting = false;
        isAzimuthDragging = false;
        interactionState.activeAxis = null;
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
        controls.enabled = !cameraState.isFreeCameraMode;
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

        if (interactionState.wasRunningBeforeDrag) {
            togglePause();
            interactionState.wasRunningBeforeDrag = false;
        }

        // If we were repositioning with the coordinate gizmo, restore the camera to its
        // original offset relative to the body (preserves the user's perspective).
        //
        // IMPORTANT: Only do this if we actually started an axis drag (interactionState.dragCameraOffset captured),
        // otherwise a normal click selection could incorrectly "snap" the camera into/near the body.
        if (
            !wasVel &&
            !cameraState.isFreeCameraMode &&
            gizmo?.target &&
            !gizmo.target._isDisposed &&
            gizmo.target.mesh &&
            interactionState.dragStartPosition &&
            interactionState.dragStartIntersection
        ) {
            camera.position.copy(gizmo.target.mesh.position).add(interactionState.dragCameraOffset);

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
    cameraState.focusID = id;
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

// ── Vue UI overlay (new UI, developed in parallel with the existing UI) ──
// Wire the Vue bridge to the same control paths the old UI uses, so both UIs
// stay in sync. `togglePause` is a hoisted function declaration defined above.
registerVueSimHooks({
    togglePause: () => togglePause(),
    setTimeScale: (value: number) => uiManager.emit('timeScaleChange', { value }),
    setGMultiplier: (value: number) => {
        simulationState.gMultiplier = value;
        const mpSlider = uiManager.managementPanel.gravitationalConstantSlider;
        const mpDisplay = uiManager.managementPanel.gravitationalConstantDisplay;
        if (mpSlider) mpSlider.value = String(value);
        if (mpDisplay) mpDisplay.textContent = value.toFixed(value < 10 ? 2 : 0);
        dispatchSimStateChange();
    },
    selectBody: (body: Body) => {
        uiManager.mainPanel.emit('manualBodySelect', { body });
    },

    // ── System Explorer: delegate to the same event paths as the old panel ──
    toggleTargetMode: () => uiManager.mainPanel.emit('targetToggle'),
    toggleLookAtMode: () => uiManager.mainPanel.emit('lookAtToggle'),
    toggleFreeCameraMode: () => uiManager.mainPanel.emit('freeCameraToggle'),
    toggleSurfaceCamera: () => uiManager.mainPanel.emit('surfaceCameraToggle'),
    zoomIn: () => uiManager.mainPanel.emit('zoomIn'),
    zoomOut: () => uiManager.mainPanel.emit('zoomOut'),
    setLockToSun: (checked: boolean) =>
        uiManager.mainPanel.emit('lockToSunChange', { checked }),
    setShowTrails: (checked: boolean) =>
        uiManager.mainPanel.emit('trailsChange', { checked }),
    setShowOrbitPrediction: (checked: boolean) =>
        uiManager.mainPanel.emit('predictionChange', { checked }),
    setShowNames: (checked: boolean) =>
        uiManager.mainPanel.emit('namesChange', { checked }),
    flyToBody: (body: Body) => uiManager.mainPanel.emit('autopilot', { body }),
    enterShip: (body: Body) => uiManager.mainPanel.emit('enterShip', { body }),
});
mountVueUi();

// Mirror the old panel's default display-option state in the Vue store
// (Show Orbit Trails checked, Show Orbit Prediction unchecked).
setDisplayState({ showTrails: true, showOrbitPrediction: false });

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
        cancelAutopilot(autopilotCtx, 'Autopilot disengaged.');
        return;
    }
    const target = selectedBody || manuallySelectedBody;
    if (!target || target._isDisposed) {
        addEvent({
            message: 'Autopilot: select a target body first.',
            notificationType: NotificationType.Warning,
            logMethod: LogMethods.Alert,
        });
        return;
    }
    engageAutopilot(autopilotCtx, target);
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

// Block events from the Vue UI overlay so interactions never reach the 3D scene.
// (The Vue UI sits above the old toolbar/panels, so without this, clicks on it
// would rotate the camera / select bodies underneath.)
const vueUiRoot = document.getElementById('vue-ui-root');
if (vueUiRoot) {
    // `wheel` must be blocked too: without it, scrolling the System Explorer
    // body list bubbles up to the window-level zoom handler, which calls
    // preventDefault() and zooms the canvas instead. `stopPropagation` here
    // (not preventDefault) lets the list scroll normally.
    ['mousedown', 'mouseup', 'click', 'wheel', 'keydown', 'keyup'].forEach(
        (eventName) => {
            vueUiRoot.addEventListener(eventName, (e) => {
                e.stopPropagation();
            });
        }
    );
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

    const maxDist = MAX_ZOOM_OUT_DISTANCE;
    const targetDistance =
        target && simulationState.bodies.includes(target) && !target._isDisposed && target.mesh
            ? target.mesh.position.length()
            : 0;
    const farLimit = Math.min(
        MAX_CAMERA_VIEW_DISTANCE,
        Math.max(
            targetDistance * 2,
            targetDistance + (5_000_000_000 / DIST_SCALE) * SCALE_FACTOR,
            maxDist
        )
    );

    const zoomInLimit = 0;
    //     target && simulationState.bodies.includes(target) && !target._isDisposed ? 0.001 : 0.01;
    const zoomOutLimit = farLimit;

    const newDist = THREE.MathUtils.clamp(currentDist * factor, zoomInLimit, zoomOutLimit);
    camera.position.copy(targetPos).add(dir.multiplyScalar(newDist));

    if (!cameraState.isFreeCameraMode) {
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
        cameraState.isFreeCameraMode = false;
    }
);

// Surface camera enablement is selection-driven, so register the state
// snapshot with the Vue bridge now that `surfaceCam` exists. (The bridge's
// earlier polls simply defaulted to "disabled/inactive" until this runs.)
registerVueSimHooks({
    getSurfaceCameraState: () => {
        const selected =
            (selectedBody &&
            simulationState.bodies.includes(selectedBody) &&
            !selectedBody._isDisposed
                ? selectedBody
                : null) ||
            (manuallySelectedBody &&
            simulationState.bodies.includes(manuallySelectedBody) &&
            !manuallySelectedBody._isDisposed
                ? manuallySelectedBody
                : null);
        return {
            isActive: surfaceCam.isActive,
            isEnabled: surfaceCam.isEligibleBody(selected),
        };
    },
});

// ── Flight mode functions ────────────────────────────────────────────────────

const flightCtx: IFlightControlContext = {
    camera,
    renderer,
    controls,
    uiManager,
    flightSteeringLine,
    steeringLinePositions,
    steeringEndMarker,
    steeringOriginMarker,
    steeringLineGeo,
    flightCrosshair,
    flightHUD,
    speedSprite,
    refreshBodiesTable,
    addEvent,
};

const autopilotCtx: IAutopilotContext = {
    flightHUD,
    addEvent,
    refreshBodiesTable,
    setAutopilotState: (active, canEngage) =>
        flightControlsPanel.setAutopilotState(active, canEngage),
};

/** Spawn a spaceship in front of the camera and enter flight mode.
 *  If a previously spawned ship of the same type is still alive in the scene,
 *  re-enters it instead.  When a different ship type is selected while a ship
 *  is already spawned, the old ship is destroyed and the new one spawns in its
 *  place.  Pass an explicit `targetShip` (bodies-table "Enter Ship" button) to
 *  re-enter that exact ship regardless of the dropdown selection. */
function spawnShip(targetShip?: Spaceship) {
    // A targeted ship (bodies-table "Enter Ship") is always re-entered as-is.
    // Otherwise re-enter only when the dropdown selection matches the live ship.
    const existing = targetShip ?? flightState.knownShip;
    const live = !!(existing && !existing._isDisposed && simulationState.bodies.includes(existing));
    const selectedTypeId = flightControlsPanel.getSelectedShipTypeId();
    const typeMatched = !!(existing && existing.shipTypeId === selectedTypeId);
    const canReenter = live && (!!targetShip || typeMatched);

    if (!canReenter) {
        // --- Different ship selected with a live ship present: destroy and replace it ---
        if (live && existing) {
            // Snapshot the old ship's state so the replacement spawns in its place.
            const oldPos = existing.mesh.position.clone();
            const oldVel = existing.velocity.clone();
            const oldQuat = existing.mesh.quaternion.clone();

            // Disengage autopilot (if any) before the old ship is destroyed.
            if (autopilotState.isActive) {
                cancelAutopilot(autopilotCtx);
            }

            // Destroy the old ship.  die() disposes the model, trail, warp
            // effect, weapons, and warp sound; the body:dead listener removes it
            // from simulationState.bodies and clears selection/focus references.
            existing.die({ skipImpactSound: true });

            // Spawn the newly selected ship type in the old ship's place.
            const shipType = getShipTypeById(selectedTypeId);
            const ship = shipType.create(
                dependencies,
                scene,
                oldPos,
                oldVel,
                createUniqueId('spaceship')
            );
            // Inherit the old ship's orientation.
            ship.mesh.quaternion.copy(oldQuat);

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

            // Remember the new ship so "ENTER SHIP" works on the next click.
            flightState.knownShip = ship;

            // Select the ship as the look-at target (same as clicking it in the bodies list).
            cameraState.isLookAtMode = true;
            uiManager.mainPanel.setLookAtState(true);
            setFocusBody(ship, { zoom: true });
            uiManager.managementPanel.setSelectedBody(ship);

            uiManager.flightControlsPanel.updateFlightSpawnBtnLabel(ship, simulationState.bodies);

            addEvent({
                message: 'Spaceship spawned.',
                notificationType: NotificationType.Info,
            });
            return;
        }

        // --- Fresh spawn: create the ship and focus the camera on it without entering flight mode ---
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        const spawnPos = camera.position.clone().add(cameraDir.multiplyScalar(60));

        // Create the selected ship type from the registry (falls back to the first type).
        const shipType = getShipTypeById(flightControlsPanel.getSelectedShipTypeId());
        const ship = shipType.create(
            dependencies,
            scene,
            spawnPos,
            new THREE.Vector3(),
            createUniqueId('spaceship')
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
    flightState.currentSpeed = ship.warpActive ? ship.handling.flightWarpSpeed : 0;
    flightState.pointerOffsetX = 0;
    flightState.pointerOffsetY = 0;
    flightState.rollLeft = false;
    flightState.rollRight = false;
    ship.cancelWarpCharge();
    // warpActive and warpDecelerating are intentionally NOT zeroed here —
    // they are preserved from the background-warp state set before re-entry.
    // Reset ship-local flight control state (roll vel, steer, banking, prevShift).
    ship.resetFlightControlState();
    flightState.flightCameraQuat.copy(ship.mesh.quaternion);

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

    cameraState.isFreeCameraMode = !cameraState.isFreeCameraMode;
    uiManager.mainPanel.setFreeCameraState(cameraState.isFreeCameraMode);

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

    if (cameraState.isFreeCameraMode) {
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
        cameraState.focusID = 'camNone';
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

uiManager.managementPanel.on('kuiperBeltChange', ({ checked }: { checked: boolean }) => {
    if (typeof kuiperBeltPoints !== 'undefined' && kuiperBeltPoints) {
        kuiperBeltPoints.visible = checked;
    }
});

uiManager.managementPanel.on('gChange', ({ value }: { value: number }) => {
    simulationState.gMultiplier = value;
    dispatchSimStateChange();
});

uiManager.managementPanel.on(
    'spaceTextureChange',
    async ({ texturePath }: { texturePath: string }) => {
        // Apply the space texture from the user's selection
        await loadSpaceTexture(scene, texturePath);
    }
);

const enableSkydomeCheckbox = document.getElementById('enableSkydome') as HTMLInputElement;
if (enableSkydomeCheckbox) {
    enableSkydomeCheckbox.onchange = () => {
        const checked = enableSkydomeCheckbox.checked;
        // Show or hide the background
        showSpaceBackground(scene, checked);
    };
}

uiManager.mainPanel.on('trailsChange', ({ checked }: { checked: boolean }) => {
    setDisplayState({ showTrails: checked });
    simulationState.bodies.forEach((body) => {
        if (body && body instanceof CelestialBody && body.trail) {
            body.trail.visible = checked;
        }
    });
});

uiManager.mainPanel.on('predictionChange', ({ checked }: { checked: boolean }) => {
    setDisplayState({ showOrbitPrediction: checked });
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

optionsPanel.on('sfxVolumeChange', () => {
    // settingsStore.settings.sfxVolume is already updated by the panel
    // sfxVolume is read live by audio.ts playBuffer() and playSoundEffect() each call
});

optionsPanel.on('musicVolumeChange', ({ value }: { value: number }) => {
    ambientMusic.setVolume(value);
});

// ── Playlist panel wiring ────────────────────────────────────────────────

ambientMusic.onTrackChange = (index: number) => {
    uiManager.playlistPanel.setCurrentTrack(index);
    uiManager.playlistPanel.setPlayingState(true);
};

uiManager.on('playlistOpened', () => {
    uiManager.playlistPanel.setPlaylist(
        ambientMusic.getShuffledPlaylist(),
        ambientMusic.getCurrentTrackIndex()
    );
    uiManager.playlistPanel.setPlayingState(!ambientMusic.isPaused);
});

uiManager.playlistPanel.on('prev', () => {
    ambientMusic.skipToPrev();
});

uiManager.playlistPanel.on('next', () => {
    ambientMusic.skipToNext();
});

uiManager.playlistPanel.on('playPause', () => {
    if (ambientMusic.isPaused) {
        ambientMusic.resume();
        uiManager.playlistPanel.setPlayingState(true);
    } else {
        ambientMusic.pause();
        uiManager.playlistPanel.setPlayingState(false);
    }
});

uiManager.playlistPanel.on('trackSelected', (index: number) => {
    ambientMusic.playTrackAt(index);
});

uiManager.on('timeScaleChange', ({ value }: { value: number }) => {
    const newSpeed = value;
    const direction = newSpeed < 0 ? ' REVERSE' : '';
    const absSpeed = Math.abs(newSpeed);
    if (simulationState.isPaused) {
        // When paused, update the saved value that will be used on resume
        simulationState.savedTimeScale = newSpeed;
        uiManager.mainPanel.updateTimeScaleDisplay(
            '0.0x (PAUSED - next: ' + absSpeed + 'x' + direction + ')'
        );
    } else {
        // When running, immediately update the speed
        simulationState.timeScale = newSpeed;
        uiManager.mainPanel.updateTimeScaleDisplay(absSpeed + 'x' + direction);
    }
    dispatchSimStateChange();
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
    engageAutopilot(autopilotCtx, body);
});

// "Enter Ship" button from the bodies table
uiManager.mainPanel.on('enterShip', ({ body }: { body: Body }) => {
    if (!body || body._isDisposed) return;
    if (flightState.isActive) return;
    flightState.knownShip = body as Spaceship;
    spawnShip(body as Spaceship);
});

// Manual selection from Bodies table
uiManager.mainPanel.on('manualBodySelect', ({ body }: { body: Body }) => {
    if (!body || !simulationState.bodies.includes(body) || body._isDisposed) return;

    // Clear any camera preset highlight (manual selection).
    // Do NOT clear LOOK AT / FREE / TARGET highlights, those are toggles with independent state.
    clearCameraPresetHighlights();

    // Manual selection should NOT automatically enable Look At.
    // However, if Look At is already enabled, selecting a body should immediately look at it.
    if (cameraState.isFreeCameraMode) {
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
    if (turningOn && cameraState.isFreeCameraMode) {
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
        if (cameraState.isFreeCameraMode) {
            cameraState.isFreeCameraMode = false;
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
        cameraState.focusID = 'camNone';
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
    if (cameraState.isFreeCameraMode) return;

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
    const wasCameraTarget = bodyToDelete.id === cameraState.focusID;

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
    if (
        (interactionState.isChangingVelocity || interactionState.isMiddleMouseVelocity) &&
        key === 'g'
    ) {
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
                interactionState.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, origin);
            } else {
                // XZ mode: use horizontal plane (not a camera-facing plane)
                interactionState.dragPlane.setFromNormalAndCoplanarPoint(
                    new THREE.Vector3(0, 1, 0),
                    origin
                );
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
    if (key === 'e' && flightState.isActive) {
        keys.e = true;
        e.preventDefault();
        return;
    }
    if (key === ' ') {
        if (flightState.isActive) {
            e.preventDefault();
            if (e.repeat) return; // ignore key-repeat; only act on the initial press
            const ship = flightState.activeShip;
            if (ship?.warpActive && !autopilotState.isActive) {
                // Disengage warp (manual only — autopilot manages its own warp lifecycle)
                ship.beginWarpDecel();
                ship.cancelWarpCharge();
                flightSteeringLine.visible = true;
                addEvent({
                    message: 'Warp disengaged. Decelerating...',
                    notificationType: NotificationType.Info,
                });
            } else if (ship && !ship.warpDecelerating && !autopilotState.isActive) {
                // Only start charging when not already decelerating from a previous warp,
                // and not under autopilot control.
                ship.startWarpCharge();
            }
            return;
        }
        keys.space = true;
    }
    if (key === 'shift') {
        keys.shift = true;
    }
    if (key === 'alt' && flightState.isActive) {
        flightState.altOrbitActive = true;
        // Zero steering offsets so the ship stops turning immediately
        flightState.pointerOffsetX = 0;
        flightState.pointerOffsetY = 0;
        e.preventDefault();
    }

    // Escape exits flight mode
    if (key === 'escape' && flightState.isActive) {
        exitFlightMode(flightCtx);
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
    if (key === 'e') {
        keys.e = false;
        if (flightState.isActive) flightState.autopilotCharge = 0;
    }
    if (key === ' ') {
        keys.space = false;
        if (flightState.isActive) {
            // Cancel warp charge if space released before full charge
            const _spaceShip = flightState.activeShip;
            if (_spaceShip?.warpCharging) {
                _spaceShip.cancelWarpCharge();
                flightHUD.hideWarpSprite();
            }
        }
    }
    if (key === 'shift') keys.shift = false;
    if (key === 'alt' && flightState.isActive) {
        flightState.altOrbitActive = false;
        // Zero steering offsets so the ship doesn't lurch when steering resumes
        flightState.pointerOffsetX = 0;
        flightState.pointerOffsetY = 0;
        e.preventDefault();
    }

    if (key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown') {
        if (
            !interactionState.isChangingVelocity &&
            !interactionState.isMiddleMouseVelocity &&
            !interactionState.isRepositioning
        ) {
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
        if (
            interactionState.isRepositioning ||
            interactionState.isChangingVelocity ||
            interactionState.isMiddleMouseVelocity
        ) {
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
        fpsSprite.position.set(
            window.innerWidth / 2 - 110,
            window.innerHeight / 2 - 30,
            TEXT_SPRITE_Z
        );
    }

    // Reposition stats display
    if (statsSprite) {
        statsSprite.position.set(
            window.innerWidth / 2 - 255,
            window.innerHeight / 2 - 270,
            TEXT_SPRITE_Z
        );
    }

    // Reposition hint display (top-center)
    if (flightHUD.hintSprite) {
        flightHUD.hintSprite.position.set(0, window.innerHeight / 2 - 55, TEXT_SPRITE_Z);
    }

    // Reposition warp charge / warp active sprite (bottom-center)
    if (flightHUD.warpSprite) {
        flightHUD.warpSprite.position.set(0, -(window.innerHeight / 2 - 50), TEXT_SPRITE_Z);
    }

    // Reposition orbit notify sprite (bottom-center, above warp)
    if (flightHUD.orbitNotifySprite) {
        flightHUD.orbitNotifySprite.position.set(0, -(window.innerHeight / 2 - 120), TEXT_SPRITE_Z);
    }

    // Reposition speed indicator (bottom-right)
    if (speedSprite) {
        speedSprite.position.set(
            window.innerWidth / 2 - 210,
            -(window.innerHeight / 2 - 210),
            TEXT_SPRITE_Z
        );
    }

    lensingEffect.resize(window.innerWidth, window.innerHeight);
});

// Apply initial background visibility (pre-launch view): kuiper off
if (typeof kuiperBeltPoints !== 'undefined' && kuiperBeltPoints) kuiperBeltPoints.visible = false;
if (uiManager.managementPanel.enableKuiperBeltCheckbox)
    uiManager.managementPanel.enableKuiperBeltCheckbox.checked = false;

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

        controls.enabled = !cameraState.isFreeCameraMode;
        controls.target.copy(NONE_FOCUS_POSITION);
        controls.update();
        camera.lookAt(NONE_FOCUS_POSITION);

        // Legacy alias kept in sync for any older call sites
        cameraState.focusID = 'camNone';
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

// Event-driven custom event listeners (body:added, body:removed, weapon:hit, etc.)
registerCustomEventListeners({
    selectedBody: {
        get value() {
            return selectedBody;
        },
        set value(v: Body | null) {
            selectedBody = v;
        },
    },
    manuallySelectedBody: {
        get value() {
            return manuallySelectedBody;
        },
        set value(v: Body | null) {
            manuallySelectedBody = v;
        },
    },
    gizmo,
    uiManager,
    scene,
    dependencies,
    refreshBodiesTable,
    addEvent,
    handleBodyBecameInvalid,
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
    controls.enabled = !cameraState.isFreeCameraMode;
    controls.target.copy(NONE_FOCUS_POSITION);
    controls.update();
    camera.lookAt(NONE_FOCUS_POSITION);

    // Force the primary light to initialize correctly on first load.
    //syncAllStarLightTargets();

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
    dispatchSimStateChange();
}

startupModal.on('launchDefault', async () => {
    ambientMusic.init();
    applyStartupGMultiplier();
    uiManager.managementPanel.hide();
    startupModal.hide();
    const progressReporter = proceduralModal.showProgressUI();
    await spawn(SimulationStartMode.Default, undefined, progressReporter);
    applyDefaultCameraTogglesAfterSpawn();
    proceduralModal.hide();
});

startupModal.on('launchEmpty', async () => {
    applyStartupGMultiplier();
    uiManager.managementPanel.hide();
    startupModal.hide();
    await spawn(SimulationStartMode.Empty);
    applyDefaultCameraTogglesAfterSpawn();
});

startupModal.on('generateBlackHole', async (result: IProceduralGeneratorPromptResult) => {
    applyStartupGMultiplier();
    uiManager.managementPanel.hide();

    startupModal.hide();
    const progressReporter = proceduralModal.showProgressUI();
    await spawn(SimulationStartMode.BlackHole, result, progressReporter);
    applyDefaultCameraTogglesAfterSpawn();
    proceduralModal.hide();
});

startupModal.on('generateProcedural', async (result: IProceduralGeneratorPromptResult) => {
    applyStartupGMultiplier();
    uiManager.managementPanel.hide();

    startupModal.hide();
    const progressReporter = proceduralModal.showProgressUI();
    await spawn(SimulationStartMode.Procedural, result, progressReporter);
    applyDefaultCameraTogglesAfterSpawn();
    proceduralModal.hide();
});

startupModal.on('cancel', () => {
    startupModal.hide();
});

// // Retry: user clicked Create on the seed form after a failed generation.
// proceduralModal.on('create', async ({ seed }: { seed: string }) => {
//     await spawn({ mode: SimulationStartMode.Procedural, seed });
//     applyDefaultCameraTogglesAfterSpawn();
// });

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
        exitFlightMode(flightCtx);
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

        proceduralModal.show();
        const progressReporter = proceduralModal.showProgressUI();

        await spawn(
            mode,
            {
                seed: urlSeed.seed,
            },
            progressReporter
        );
        applyDefaultCameraTogglesAfterSpawn();

        proceduralModal.hide();
    } else {
        // Load the default space texture to display while the startup modal is active before the user
        // does anything. This will get replaced once the actual space texture is loaded during the simulation setup.
        // Note: Build your own system doesn't have a generator yet, so it doesn't replace this texture yet.
        await loadSpaceTexture(scene, './assets/textures/skydome/space-default.jpg');
        // Display the startup modal.
        startupModal.open({ allowCancel: false });
    }
})();

// ── popstate listener for back/forward navigation ───────────────────────────
window.addEventListener('popstate', async () => {
    const currentSeed = parseSeedFromURL();

    // If there's no seed in the URL now (e.g. navigated back to a page without one)
    if (!currentSeed) {
        // Only reload if we were previously showing a seeded system
        if (getLastPushedSeed() !== null) {
            resetLastPushedSeed();
            applyStartupGMultiplier();
            uiManager.managementPanel.hide();
            startupModal.hide();
            proceduralModal.show();
            proceduralModal.setTitle('Generate Solar System');
            const progressReporter = proceduralModal.showProgressUI();
            await spawn(SimulationStartMode.Default, undefined, progressReporter);
            applyDefaultCameraTogglesAfterSpawn();
            proceduralModal.hide();
        }
        return;
    }

    // Avoid re-generating the same system
    const fullValue = buildSeedValue(currentSeed.type, currentSeed.seed);
    if (fullValue === getLastPushedSeed()) return;
    setLastPushedSeed(fullValue);

    applyStartupGMultiplier();
    uiManager.managementPanel.hide();
    startupModal.hide();

    const mode =
        currentSeed.type === SEED_TYPE_BLACKHOLE
            ? SimulationStartMode.BlackHole
            : SimulationStartMode.Procedural;

    proceduralModal.show();
    const progressReporter = proceduralModal.showProgressUI();

    await spawn(mode, { seed: currentSeed.seed }, progressReporter);
    applyDefaultCameraTogglesAfterSpawn();
    proceduralModal.hide();
});

refreshBodiesTable();
// ── Start the animation loop ───────────────────────────────────────────
const animCtx: AnimationContext = {
    scene,
    camera,
    renderer,
    uiScene,
    uiCamera,
    controls,
    raycaster,
    mouse,
    autopilotState,
    cameraState,
    flightState,
    interactionState,
    simulationState,
    selectedBody: {
        get value() {
            return selectedBody;
        },
        set value(v: Body | null) {
            selectedBody = v;
        },
    },
    manuallySelectedBody: {
        get value() {
            return manuallySelectedBody;
        },
        set value(v: Body | null) {
            manuallySelectedBody = v;
        },
    },
    NONE_FOCUS_POSITION,
    supernovas: { value: supernovas },
    planetaryNebulae: { value: planetaryNebulae },
    lensingEffect,
    gizmo,
    velArc,
    orbitPrediction,
    posIndicator,
    gridHelperManager,
    flightHUD,
    targetIndicator,
    planetNameIndicator,
    surfaceCam,
    fpsSprite: { value: fpsSprite },
    statsSprite: { value: statsSprite },
    speedSprite: { value: speedSprite },
    keys,
    flightSteeringLine,
    steeringLinePositions,
    steeringEndMarker,
    steeringOriginMarker,
    getFocusObject,
    setFocusBody,
    updateAutopilotStep: (subDt: number) => {
        const _apShip = flightState.knownShip;
        if (_apShip && _apShip.autopilotActive && !_apShip._isDisposed) {
            // If the autopilot's target is gone (destroyed, absorbed, or deleted),
            // disengage immediately instead of letting the ship coast onward.
            const _apTarget = _apShip.autopilotTarget;
            const _apTargetAlive =
                _apTarget &&
                !_apTarget._isDisposed &&
                _apTarget.mesh &&
                simulationState.bodies.includes(_apTarget);
            if (!_apTargetAlive) {
                cancelAutopilot(autopilotCtx, 'Autopilot disengaged: target destroyed.');
                return;
            }
            _apShip.autopilotStep(subDt);
            // Drain any one-shot events the autopilot generated this substep
            drainAutopilotEvents(autopilotCtx);
        }
    },
    cancelAutopilot: (message?: string) => cancelAutopilot(autopilotCtx, message),
    engageAutopilot: (target: Body) => engageAutopilot(autopilotCtx, target),
    setF,
    triggerZoomToBody,
    uiManager,
};

runAnimationLoop(animCtx, flightCtx);
