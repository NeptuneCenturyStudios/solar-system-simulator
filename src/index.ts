import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

// Import all consts
import {
    SCALE_FACTOR,
    G,
    SUN_MASS,
    SUN_RADIUS,
    ASTEROID_SPAWN_MIN_DIST,
    ASTEROID_SPAWN_MAX_DIST,
    MIN_STAR_MASS,
    PLUTO_DIST,
    IO_MASS,
    IO_DIST_FROM_JUPITER,
    IO_RADIUS,
    EUROPA_MASS,
    EUROPA_DIST_FROM_JUPITER,
    EUROPA_RADIUS,
    GANYMEDE_MASS,
    GANYMEDE_DIST_FROM_JUPITER,
    GANYMEDE_RADIUS,
    CALLISTO_MASS,
    CALLISTO_DIST_FROM_JUPITER,
    CALLISTO_RADIUS,
    MOON_MASS,
    MOON_DIST_FROM_EARTH,
    MOON_RADIUS,
    GIZMO_TUNING,
    KUIPER_BELT_COUNT,
    KUIPER_BELT_INNER_DIST,
    KUIPER_BELT_OUTER_DIST,
    KUIPER_BELT_VERTICAL_SPREAD,
    CERES_MASS,
    CERES_DISTANCE,
    CERES_RADIUS,
    VESTA_MASS,
    VESTA_DISTANCE,
    VESTA_RADIUS,
    PALLAS_MASS,
    PALLAS_DISTANCE,
    PALLAS_RADIUS,
    HYGIEA_MASS,
    HYGIEA_DISTANCE,
    HYGIEA_RADIUS,
} from './utilities/consts.js';
import { CoordinateGizmo } from './gizmos/coordinate-gizmo.js';
import {
    isBodyType,
    BodyType,
    pickRandom,
    createUniqueId,
    BodyTypeEnum,
} from './utilities/utilities.js';
import { calculateTrajectory } from './physics/physics.js';
import { loadSrgbTexture, fictionalTextures } from './drawing/textures.js';
import { Supernova } from './effects/supernova.js';
import { StarBirth } from './effects/star-birth';
import { ParticleExplosion } from './effects/particle-explosion.js';
import { Body } from './bodies/body.js';
import { CelestialBody } from './bodies/celestial-body.js';
import { Mercury } from './bodies/mercury.js';
import { Venus } from './bodies/venus.js';
import { Earth } from './bodies/earth.js';
import { Mars } from './bodies/mars.js';
import { Jupiter } from './bodies/jupiter.js';
import { Saturn } from './bodies/saturn.js';
import { Uranus } from './bodies/uranus.js';
import { Neptune } from './bodies/neptune.js';
import { Pluto } from './bodies/pluto.js';
import { BlackHole } from './bodies/black-hole.js';
import { Star } from './bodies/star';
import { Asteroid } from './bodies/asteroid.js';
import { Comet } from './bodies/comet.js';

import { MainPanel } from './ui/main-panel.js';
import { ManagementPanel } from './ui/management-panel.js';
import { StartupModal } from './ui/startup-modal.js';
import { EventLogEntry } from './event-log/event-log.js';
import { Halley } from './bodies/halley.js';
import { IStateDependencies } from './interfaces.js';
const jupiterTexture = loadSrgbTexture('./assets/textures/jupiter.jpg');
const saturnTexture = loadSrgbTexture('./assets/textures/saturn.jpg');
const uranusTexture = loadSrgbTexture('./assets/textures/uranus.jpg');
const neptuneTexture = loadSrgbTexture('./assets/textures/neptune.jpg');
const plutoTexture = loadSrgbTexture('./assets/textures/pluto.jpg');
const sunTexture = loadSrgbTexture('./assets/textures/sun.jpg');
const blueStarTexture = loadSrgbTexture('./assets/textures/blue-star.jpg');
const redStarTexture = loadSrgbTexture('./assets/textures/red-star.jpg');
const orangeStarTexture = loadSrgbTexture('./assets/textures/orange_star.jpg');
const whiteStarTexture = loadSrgbTexture('./assets/textures/white_star.jpg');
const whiteDwarfTexture = loadSrgbTexture('./assets/textures/white_dwarf.jpg');

// Background texture (skydome)
const skydomeTexture = loadSrgbTexture('./assets/textures/stars.jpg');
skydomeTexture.wrapS = THREE.RepeatWrapping;
skydomeTexture.wrapT = THREE.RepeatWrapping;
skydomeTexture.repeat.set(2, 1);

// Custom/random textures for custom gas giants
const fictionalGasTextures = [
    loadSrgbTexture('./assets/textures/fictional_gas_1.jpg'),
    loadSrgbTexture('./assets/textures/fictional_gas_2.jpg'),
];

// Custom/random textures for custom ice giants
const fictionalIceTextures = [
    loadSrgbTexture('./assets/textures/fictional_ice_1.jpg'),
    loadSrgbTexture('./assets/textures/fictional_ice_2.jpg'),
];

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

/**
 * Calculate star radius based on mass using mass-radius relationship
 * For main sequence stars: radius ∝ mass^0.8
 * @param {number} mass - Star mass
 * @param {number} baseMass - Reference mass
 * @param {number} baseRadius - Reference radius
 * @returns {number} - Calculated radius
 */
function calculateStarRadius(mass: number, baseMass: number, baseRadius: number): number {
    // Use mass-radius relationship for main sequence stars
    return baseRadius * Math.pow(mass / baseMass, 0.8);
}

/**
 * Set the visual radius for any body. If the body implements `setRadius`, delegate to it.
 * Otherwise update mesh geometry, label, label line and rings if present.
 * TODO: This should be moved to the CelestialBody class
 * @param {object} body - The celestial body to update
 * @param {number} newRadius - The new radius to set
 */
function setBodyRadius(body: CelestialBody, newRadius: number) {
    if (!body) return;

    // Hard cap to prevent extreme “fills the screen” glitches.
    // Target: allow stars to grow to roughly Kuiper-belt scale, but never beyond.
    //
    // Kuiper belt generation uses:
    //   r = NEPTUNE_DIST + rand * (PLUTO_DIST - NEPTUNE_DIST + 300000)
    // So the outer edge is roughly PLUTO_DIST + 300000.
    const MAX_RADIUS = PLUTO_DIST + 300000;
    newRadius = Math.min(newRadius, MAX_RADIUS);

    const oldRadius = body.radius || 1;

    if (body instanceof Star) {
        body.setRadius(newRadius);
        return;
    }

    // Update stored radius
    body.radius = newRadius;

    // Update mesh geometry
    try {
        if (body.mesh && body.mesh.geometry) {
            body.mesh.geometry.dispose();
            body.mesh.geometry = new THREE.SphereGeometry(newRadius, 32, 32);
        }
    } catch (e) {
        console.error('Error updating body geometry radius:', e);
    }

    // Update cast/receive shadow for non-stars
    if (body.mesh) {
        const isBodyStar = isBodyType(body, BodyType.Star);
        body.mesh.castShadow = !isBodyStar;
        body.mesh.receiveShadow = !isBodyStar;
    }

    // Update label position and label line
    try {
        if (body.label) {
            const labelHeight = newRadius * 3.5;
            body.label.position.set(0, labelHeight, 0);
        }

        if (body.labelLine && body.labelLine.geometry) {
            const posAttr = body.labelLine.geometry.attributes.position;
            if (posAttr && posAttr.array) {
                posAttr.array[0] = 0;
                posAttr.array[1] = newRadius;
                posAttr.array[2] = 0;
                posAttr.array[3] = 0;
                posAttr.array[4] = newRadius * 3.5;
                posAttr.array[5] = 0;
                posAttr.needsUpdate = true;
            }
        }
    } catch (e) {
        console.error('Error updating body label or label line position:', e);
    }

    // Update cloud layer (if present) to follow new radius
    try {
        if (body.clouds && body.clouds.geometry) {
            try {
                body.clouds.geometry.dispose();
            } catch (e) {
                console.error('Error disposing old cloud geometry:', e);
            }

            const cloudFactor = 1.03;
            body.clouds.geometry = new THREE.SphereGeometry(newRadius * cloudFactor, 32, 32);
        }
    } catch (e) {
        console.error('Error updating cloud layer radius:', e);
    }

    // If rings exist, scale them roughly to new radius
    try {
        if (body.rings) {
            const scaleFactor = newRadius / Math.max(oldRadius, 1);
            body.rings.scale.setScalar(scaleFactor);
        }
    } catch (e) {
        console.error('Error updating body rings scale:', e);
    }
}

function collisionScoreEscapeVelocity(body) {
    // Winner heuristic: compare escape velocity (constants cancel):
    //   v_esc = sqrt(2GM/R)  => ordering is equivalent to M/R
    //
    // Important nuance for black holes in this sim:
    // - `radius` is the visual/event-horizon sphere (very small).
    // - `eventHorizonRadius` may represent the original baseline horizon and doesn't update on absorption.
    // So: prefer `radius` (current), but use `eventHorizonRadius` as a fallback if present.
    const m = Math.max(0, body?.mass || 0);

    const rawR =
        typeof body?.radius === 'number' && isFinite(body.radius) && body.radius > 0
            ? body.radius
            : typeof body?.eventHorizonRadius === 'number' && isFinite(body.eventHorizonRadius)
              ? body.eventHorizonRadius
              : 0;

    const r = Math.max(1e-6, rawR);

    return m / r;
}

function chooseCollisionWinner(b1: Body, b2: Body) {
    const s1 = collisionScoreEscapeVelocity(b1);
    const s2 = collisionScoreEscapeVelocity(b2);

    if (s1 > s2) return { winner: b1, victim: b2 };
    if (s2 > s1) return { winner: b2, victim: b1 };

    // Stable-ish tie breakers (avoid random flip-flops on exact ties)
    const m1 = Math.max(0, b1?.mass || 0);
    const m2 = Math.max(0, b2?.mass || 0);
    if (m1 > m2) return { winner: b1, victim: b2 };
    if (m2 > m1) return { winner: b2, victim: b1 };

    const n1 = String(b1?.name || '');
    const n2 = String(b2?.name || '');
    if (n1 >= n2) return { winner: b1, victim: b2 };
    return { winner: b2, victim: b1 };
}

function absorbBody(winner: Body, victim: Body) {
    if (!winner || !victim) return;
    if (winner._isDisposed || victim._isDisposed) return;
    if (winner._isDisposed || victim._isDisposed) return;

    const mw = Math.max(0, winner.mass || 0);
    const mv = Math.max(0, victim.mass || 0);
    const newMass = mw + mv;
    if (newMass <= 0) return;

    // Momentum conservation
    const vW = winner.velocity?.clone?.() || new THREE.Vector3();
    const vV = victim.velocity?.clone?.() || new THREE.Vector3();
    const mergedVel = vW.multiplyScalar(mw).add(vV.multiplyScalar(mv)).divideScalar(newMass);
    if (winner.velocity) winner.velocity.copy(mergedVel);

    // Mass
    winner.mass = newMass;

    // Stars: transfer remaining fuel + capacity (when fuel system is active)
    if (
        winner instanceof Star &&
        victim instanceof Star &&
        winner.fuel !== null &&
        victim.fuel !== null
    ) {
        winner.fuel += victim.fuel;
        if (winner.maxFuel !== null && victim.maxFuel !== null) {
            winner.maxFuel += victim.maxFuel;
        }
    }

    // Radius:
    // - Default: volume add => cbrt(r1^3 + r2^3)
    // - Black holes: radius is derived from mass compression, not added "raw volume".
    if (winner instanceof BlackHole) {
        const compressed = BlackHole.massToEventHorizonRadius(newMass);
        setBodyRadius(winner, compressed);
    } else if (winner instanceof CelestialBody && victim instanceof CelestialBody) {
        const rw = Math.max(0.0001, winner.radius || 0.0001);
        const rv = Math.max(0.0001, victim.radius || 0.0001);
        const newRadius = Math.cbrt(rw * rw * rw + rv * rv * rv);
        setBodyRadius(winner, newRadius);
    }

    // Inform the user
    try {
        addEvent?.(`${winner.name} absorbed ${victim.name}`);
    } catch (e) {
        console.error('Error dispatching body:added event:', e);
    }
}

// --- IAU-style Random Naming Convention ---
// Generates science-style provisional/catalog names for new bodies
function generateIAUName(type: BodyTypeEnum, parentBody: Body | null = null) {
    const year = new Date().getFullYear();

    // Letter set excluding 'I' to mimic IAU conventions
    const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
    function randLetter() {
        return letters.charAt(Math.floor(Math.random() * letters.length));
    }

    function randNumber(max = 99) {
        return Math.floor(1 + Math.random() * max);
    }

    function provisional() {
        // Year + two-letter code + optional sequence number
        const a = randLetter();
        const b = randLetter();
        const seq = Math.random() < 0.25 ? randNumber(9) : ''; // occasional sub-number
        return `${year} ${a}${b}${seq}`;
    }

    function cometDesignation() {
        // Simple comet-like designation: C/YYYY Xn
        const a = randLetter();
        const n = randNumber(9);
        return `C/${year} ${a}${n}`;
    }

    function hdCatalog() {
        // Henry Draper-like catalog number
        const num = Math.floor(100000 + Math.random() * 900000);
        return `HD ${num}`;
    }

    function asteroidDesignation() {
        return provisional();
    }

    function planetDesignation() {
        return provisional();
    }

    function moonName(parent: Body | null) {
        if (!parent) return `Moon ${provisional()}`;
        // Count existing moons that start with parent name (simple heuristic)
        const existing = simulationState.bodies.filter(
            (b) => b.name && b.name.startsWith(parent.name + ' ')
        ).length;
        const roman = toRoman(existing + 1);
        return `${parent.name} ${roman}`;
    }

    // Convert integer to Roman numerals (1..3999)
    function toRoman(num: number): string {
        if (!num || num <= 0) return 'I';
        const romans = [
            [1000, 'M'],
            [900, 'CM'],
            [500, 'D'],
            [400, 'CD'],
            [100, 'C'],
            [90, 'XC'],
            [50, 'L'],
            [40, 'XL'],
            [10, 'X'],
            [9, 'IX'],
            [5, 'V'],
            [4, 'IV'],
            [1, 'I'],
        ];
        let n = num;
        let result = '';
        for (const [val, sym] of romans) {
            while (n >= (val as number)) {
                result += sym;
                n -= val as number;
            }
        }
        return result;
    }

    switch (type) {
        case BodyTypeEnum.Star:
            return hdCatalog();
        case BodyTypeEnum.Planet:
            return planetDesignation();
        case BodyTypeEnum.Asteroid:
            return asteroidDesignation();
        case BodyTypeEnum.Comet:
            return cometDesignation();
        case BodyTypeEnum.Moon:
            return moonName(parentBody);
        default:
            return provisional();
    }
}

// Function to create/update FPS counter texture
function createFPSTexture(fps: number) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;

    // Set canvas size
    canvas.width = 256;
    canvas.height = 64;

    // Setup text style (monospace for numbers)
    context.font = '27px monospace';
    context.fillStyle = '#00ffcc';
    context.textAlign = 'right';
    context.textBaseline = 'middle';

    // Add glow effect
    context.shadowColor = 'rgba(0, 255, 204, 0.8)';
    context.shadowBlur = 8;

    // Draw text
    context.fillText(`FPS: ${fps}`, canvas.width - 10, canvas.height / 2);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return texture;
}

// Function to create/update body stats texture
function createStatsTexture(body: Body, bodiesArray = [] as Body[]) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;

    // Set canvas size
    canvas.width = 700;
    canvas.height = 640;

    // Setup text style
    context.fillStyle = '#aaaaaa'; // Light gray
    context.textAlign = 'right';
    context.textBaseline = 'top';

    const lineHeight = 40;
    const rightPadding = 10;
    let y = 5;

    // Helper function to format numbers with locale separators and scientific notation for very small values
    function formatNumber(
        num: number,
        options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {}
    ) {
        const { minimumFractionDigits = 2, maximumFractionDigits = 2 } = options;

        if (!Number.isFinite(num)) return '—';
        if (num === 0) return new Intl.NumberFormat().format(0);

        const absNum = Math.abs(num);
        if (absNum < 0.01) {
            return num.toExponential(2);
        }

        return new Intl.NumberFormat(undefined, {
            minimumFractionDigits,
            maximumFractionDigits,
        }).format(num);
    }

    // Helper function to draw label + value right-aligned (normal font weight)
    function drawStat(label: string, value: string | number, yPos: number) {
        if (!context) return;
        context.font = '27px monospace';
        const text = label + value;
        context.fillText(text, canvas.width - rightPadding, yPos);
    }

    // (duplicate getBodyTypeLabel removed; use the shared version below)

    // Name
    drawStat('Name: ', body.name, y);
    y += lineHeight;

    // Body Type
    drawStat('Body Type: ', getBodyTypeLabel(body), y);
    y += lineHeight;

    // Mass
    drawStat('Mass: ', formatNumber(body.mass), y);
    y += lineHeight;

    // Radius
    if (body instanceof CelestialBody) {
        drawStat('Radius: ', formatNumber(body.radius), y);
        y += lineHeight;
    }

    // Temperature (for stars and stellar remnants)
    if (body instanceof Star) {
        drawStat(
            'Temperature: ',
            formatNumber(body.temperature, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) +
                'K',
            y
        );
        y += lineHeight;
    }

    // Fuel (for stars with fuel system, only if star death is enabled)
    const starDeathEnabled =
        (document.getElementById('enableStarDeath') as HTMLInputElement)?.checked || false;
    if (starDeathEnabled && body instanceof Star && body.fuel !== null && body.maxFuel !== null) {
        const fuelPercent = ((body.fuel / body.maxFuel) * 100).toFixed(1);
        drawStat('Fuel: ', `${fuelPercent}%`, y);
        y += lineHeight;
    }

    // Position
    const pos = body.mesh.position;
    drawStat('Position: ', `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`, y);
    y += lineHeight;

    // Velocity
    const vel = body.velocity;
    drawStat('Velocity: ', `(${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)})`, y);
    y += lineHeight;

    // Speed (velocity magnitude)
    const speed = vel.length();
    drawStat('Speed: ', speed.toFixed(2), y);
    y += lineHeight;

    // Net gravitational force (force experienced FROM other bodies, F = m * a)
    if (body.tempAcc) {
        const netForce = body.tempAcc.length() * body.mass;
        drawStat('Net Force: ', formatNumber(netForce), y);
        y += lineHeight;
    }

    // Total gravitational force exerted ON other bodies
    let totalForceExerted = 0;
    for (const other of bodiesArray) {
        if (other !== body && !other?._isDisposed && other.mesh) {
            const diff = new THREE.Vector3().subVectors(other.mesh.position, body.mesh.position);
            const r = diff.length();
            if (r > 0.01) {
                const force = (G * body.mass * other.mass) / (r * r);
                totalForceExerted += force;
            }
        }
    }
    drawStat('Grav Output: ', formatNumber(totalForceExerted), y);
    y += lineHeight;

    // Orbital inclination (angle of velocity from xy-plane, in degrees)
    const velXY = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    const inclination = Math.atan2(vel.z, velXY) * (180 / Math.PI);
    drawStat('Inclination: ', inclination.toFixed(1) + '°', y);
    y += lineHeight;

    // Longitude (angle in xy-plane, in degrees)
    const longitude = Math.atan2(pos.y, pos.x) * (180 / Math.PI);
    drawStat('Longitude: ', longitude.toFixed(1) + '°', y);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return texture;
}

const scene = new THREE.Scene();

// --- Skydome background ---
// A huge inverted sphere that always follows the camera, giving a textured space background.
// This is separate from the point-starfield so users can toggle each independently.
const skydomeGeometry = new THREE.SphereGeometry(3000000, 48, 24);
const skydomeMaterial = new THREE.MeshBasicMaterial({
    map: skydomeTexture,
    side: THREE.BackSide,
    depthWrite: false,
});
const skydome = new THREE.Mesh(skydomeGeometry, skydomeMaterial);
skydome.renderOrder = -1000;
scene.add(skydome);

const CAMERA_FAR_PLANE = PLUTO_DIST + 300000 * SCALE_FACTOR + 2000000 * SCALE_FACTOR;
const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    1,
    CAMERA_FAR_PLANE
);
const MAX_ZOOM_OUT_DISTANCE = camera.far * 0.8;
const MAX_CAMERA_VIEW_DISTANCE = camera.far * 0.98;
const INITIAL_CAMERA_DISTANCE = 16388 * SCALE_FACTOR;
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true }); // Better depth precision at extreme scales
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Must be true to initialize shadow infrastructure
renderer.shadowMap.type = THREE.VSMShadowMap; // Better for large-scale shadows
document.body.appendChild(renderer.domElement);

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

// Event log system for tracking body deaths
const eventLog: EventLogEntry[] = [];
const MAX_EVENTS = 5;
const EVENT_DISPLAY_TIME = 5000; // Show for 5 seconds
const EVENT_FADE_START = 3000; // Start fading after 3 seconds

function addEvent(message: string) {
    eventLog.push({
        message: message,
        timestamp: performance.now(),
    });
    // Keep only recent events
    while (eventLog.length > MAX_EVENTS) {
        eventLog.shift();
    }
}

function createEventLogTexture() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = 600;
    canvas.height = 250;

    context.fillStyle = '#aaaaaa';
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.font = '27px monospace';

    const lineHeight = 40;
    const leftPadding = 10;
    const now = performance.now();

    // Remove old events from array
    while (eventLog.length > 0 && now - eventLog[0].timestamp > EVENT_DISPLAY_TIME) {
        eventLog.shift();
    }

    // Filter active events
    const activeEvents = eventLog.filter((e) => now - e.timestamp < EVENT_DISPLAY_TIME);

    // Draw from bottom to top (newest at bottom)
    activeEvents.forEach((event, index) => {
        const age = now - event.timestamp;
        let opacity = 1.0;

        // Fade out effect
        if (age > EVENT_FADE_START) {
            opacity = 1.0 - (age - EVENT_FADE_START) / (EVENT_DISPLAY_TIME - EVENT_FADE_START);
        }

        // Calculate y position (from bottom)
        const yPos = canvas.height - (activeEvents.length - index) * lineHeight;

        // Apply opacity
        context.fillStyle = `rgba(170, 170, 170, ${opacity})`;
        context.fillText(event.message, leftPadding, yPos);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

let eventLogSprite = null;
function createEventLogSprite() {
    const texture = createEventLogTexture();
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    eventLogSprite = new THREE.Sprite(material);
    eventLogSprite.scale.set(600, 250, 1);

    // Position at lower-left corner
    eventLogSprite.position.set(
        -window.innerWidth / 2 + 300, // Left side
        -window.innerHeight / 2 + 125, // Bottom
        0
    );

    uiScene.add(eventLogSprite);
}
createEventLogSprite();

const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(INITIAL_CAMERA_DISTANCE, 12018 * SCALE_FACTOR, INITIAL_CAMERA_DISTANCE); // Scaled for new world size
// Start in "center scene" orbit mode (NONE_FOCUS_POSITION is defined later)
controls.target.set(0, 0, 0);
controls.update();
controls.enableDamping = true;
// Disable OrbitControls mouse bindings; we handle camera rotation ourselves (RMB mouse-look).
// Keep MMB disabled (used for velocity edit in our custom handlers).
controls.mouseButtons = {
    LEFT: null,
    MIDDLE: null,
    RIGHT: null,
};
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
    activeAxis: null,
    wasRunningBeforeDrag: false,
    dragTarget: null,
    dragCameraOffset: new THREE.Vector3(),
    dragPlane: new THREE.Plane(),

    // Velocity editing UX
    velocityEditMode: 'xz', // 'xz' | 'y'
    velocityEditHadRunningBeforeDrag: false,
};

const cameraState = {
    isFreeCameraMode: false,
    isLookAtMode: false,
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
};

const simulationState = {
    timeScale: 1.5,
    isPaused: false,
    savedTimeScale: 1.5,
    lastT: performance.now(),
    bodies: [] as Body[],
    explosions: [] as ParticleExplosion[],
};

let selectedBody: Body | null = null; // Track selected body for stats/management panel
const gizmo = new CoordinateGizmo(scene); // Single global gizmo instance
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
};

const VEL_SCALE = 546; // The multiplier used to visualize speed as arrow length (scaled)

// --- Shared tuning constants ---
const SIM = Object.freeze({
    STEPS_PER_FRAME: 120,
    BASE_FRAME_DT: 0.016, // seconds (approx 60fps)
    DT_SCALE: 60, // existing convention: multiply by 60 to normalize to "frames"
});

// --- Velocity editing arc helpers ---
// NOTE: We use Line2 (fat lines) because LineBasicMaterial.linewidth is ignored on most WebGL platforms.
const VEL_ARC_SEGMENTS = 64;
const VEL_ARC_COLOR = 0x00ff00;
const VEL_ARC_OPACITY = 0.25;
const VEL_ARC_ACTIVE_OPACITY = 0.35;
const VEL_ARC_LINEWIDTH_PX = 22;
const VEL_ARC_MIN_R = 250;
const VEL_ARC_MAX_R = 6000;
const VEL_ARC_RADIUS_MULT = 1.0;

// Arc is centered on the VELOCITY TIP (not the body), and its radius is based on body radius.
// This creates a "mouse path preview" near where the tip will sweep as you drag.
const VEL_ARC_TIP_RADIUS_MULT = 2.5;
const VEL_ARC_TIP_RADIUS_MIN = 80;
const VEL_ARC_TIP_RADIUS_MAX = 1200;

// Small "preview" arc shown near the velocity handle, not a full circle.
function createArcLine(segments = VEL_ARC_SEGMENTS, color = VEL_ARC_COLOR) {
    // Authored in the XZ plane around origin and later positioned/rotated/scaled.
    const positions = [];
    const span = (Math.PI * 2) / 3; // 120° visible arc
    const start = -span / 2;
    const end = span / 2;

    for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const t = start + (end - start) * u;
        positions.push(Math.cos(t), 0, Math.sin(t));
    }

    const geo = new LineGeometry();
    geo.setPositions(positions);

    const mat = new LineMaterial({
        color,
        transparent: true,
        opacity: VEL_ARC_OPACITY,
        linewidth: VEL_ARC_LINEWIDTH_PX, // in pixels (requires setting resolution)
        depthTest: false,
        depthWrite: false,
    });
    mat.resolution.set(window.innerWidth, window.innerHeight);

    const line = new Line2(geo, mat);
    line.computeLineDistances();
    line.frustumCulled = false;
    line.renderOrder = 999; // keep on top of most scene elements
    line.visible = false;
    return line;
}

const velocityArcXZ = createArcLine();
const velocityArcY = createArcLine();
scene.add(velocityArcXZ);
scene.add(velocityArcY);

function updateArcResolution() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (velocityArcXZ?.material?.resolution) velocityArcXZ.material.resolution.set(w, h);
    if (velocityArcY?.material?.resolution) velocityArcY.material.resolution.set(w, h);
}

function calcVelArcRadius(body) {
    // Arc radius should match the velocity arrow length (treat arrow as circle radius).
    // velocityArrow length = speed * ARROW_SCALE
    const speed = body?.velocity?.length?.() ? body.velocity.length() : 0;
    const arrowLen = Math.max(speed * GIZMO_TUNING.VELOCITY_ARROW_SCALE, 0.1);

    // Keep within sane limits so it stays visible and not enormous.
    return THREE.MathUtils.clamp(arrowLen, VEL_ARC_TIP_RADIUS_MIN, VEL_ARC_TIP_RADIUS_MAX);
}

function updateVelocityArcs() {
    // Use the legacy alias flags (isChangingVelocity/isMiddleMouseVelocity) because the drag handlers
    // still mutate those variables directly. The interactionState flags are *not* guaranteed to be in sync.
    const draggingVel = isChangingVelocity || isMiddleMouseVelocity;

    if (!gizmo?.target || gizmo.target._isDisposed || !gizmo.target.mesh || !draggingVel) {
        velocityArcXZ.visible = false;
        velocityArcY.visible = false;
        return;
    }

    // Force visibility while dragging so the user gets immediate "hit" feedback.
    velocityArcXZ.visible = true;
    velocityArcY.visible = true;

    const body = gizmo.target;
    const origin = body.mesh.position;
    const arcR = calcVelArcRadius(body);

    // Current velocity direction in world space
    const v = body.velocity.clone();
    const speed = v.length();
    const handleDir = speed > 1e-10 ? v.normalize() : new THREE.Vector3(1, 0, 0);

    // Center arc at the VELOCITY TIP (what the mouse is effectively dragging around).
    // Note: velocityArrow uses arrowScale=50 in CoordinateGizmo.updateVelocityArrow().
    const tipPos = origin
        .clone()
        .addScaledVector(handleDir, speed * GIZMO_TUNING.VELOCITY_ARROW_SCALE);

    // Center arcs on the ARROW TIP, but the arc should be a segment of the circle
    // whose radius is the arrow length. That means the circle's center is:
    //   center = tipPos - handleDir * arcR
    // (tipPos is one radius away from the center, in the handleDir direction)
    //
    // XZ mode: the arc should be located at the arrow tip's CURRENT Y (not forced to y=0).
    // Using the full handleDir can push the center down/up; instead we compute the center in XZ only,
    // then restore the tip's Y so it visually sits at the handle height.
    const arcCenterXZ = tipPos
        .clone()
        .addScaledVector(new THREE.Vector3(handleDir.x, 0, handleDir.z).normalize(), -arcR);
    arcCenterXZ.y = tipPos.y;

    // Y mode: keep using full 3D center so it stays oriented/pitched with the handle.
    const arcCenterY = tipPos.clone().addScaledVector(handleDir, -arcR);

    velocityArcXZ.position.copy(arcCenterXZ);
    velocityArcY.position.copy(arcCenterY);

    // XZ arc:
    // Keep the arc in the horizontal plane, but rotate it so it is oriented around
    // the SAME heading as the velocity arrow's horizontal projection.
    //
    // Additionally: tilt the arc to match the arrow's pitch, so the arc "leans" with
    // the arrow even though XZ mode doesn't allow changing Y. This is purely visual.
    const h = new THREE.Vector3(handleDir.x, 0, handleDir.z);
    if (h.lengthSq() < 1e-10) h.set(1, 0, 0);
    h.normalize();

    // Heading in XZ
    const yaw = -Math.atan2(h.z, h.x);

    // Pitch relative to XZ plane (signed): atan2(y, horizontalLen)
    const hLen = Math.sqrt(handleDir.x * handleDir.x + handleDir.z * handleDir.z);
    const pitch = Math.atan2(handleDir.y, hLen);

    // Keep the XZ arc FLAT in the XZ plane regardless of the arrow's pitch.
    // Only rotate around Y to match the horizontal heading.
    velocityArcXZ.rotation.set(0, yaw, 0);
    velocityArcXZ.scale.set(arcR, arcR, arcR);

    // Y arc:
    // The arc should "tilt" with the current velocity vector, i.e. match the arrow's pitch
    // relative to the XZ plane. We build an orthonormal basis where:
    //   - xAxis points along the full velocity direction (handleDir)
    //   - yAxis lies in the plane spanned by (handleDir, up) and is perpendicular to handleDir
    //   - zAxis completes the right-handed basis
    //
    // This makes the arc's plane rotate as the user adds Y, so at 45° pitch the arc plane is also pitched 45°.
    const up = new THREE.Vector3(0, 1, 0);

    // If the handle is (nearly) vertical, fall back to using world X as a stable reference.
    const xAxis = handleDir.clone();
    const ref = Math.abs(xAxis.dot(up)) > 0.999 ? new THREE.Vector3(1, 0, 0) : up;

    // Build yAxis as component of ref that's perpendicular to xAxis
    const yAxis = ref.clone().sub(xAxis.clone().multiplyScalar(ref.dot(xAxis)));
    if (yAxis.lengthSq() < 1e-10) yAxis.set(0, 0, 1);
    yAxis.normalize();

    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();

    // Our arc geometry is authored in XZ (y=0). Rotate it into the "x-y" plane of this basis
    // so it varies in y as it sweeps.
    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    const arcAdjust = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const m = new THREE.Matrix4().multiplyMatrices(basis, arcAdjust);

    velocityArcY.setRotationFromMatrix(m);
    velocityArcY.scale.set(arcR, arcR, arcR);

    // Visibility by mode (and ensure they're not accidentally left hidden)
    if (interactionState.velocityEditMode === 'xz') {
        velocityArcXZ.visible = true;
        velocityArcY.visible = false;
    } else {
        velocityArcXZ.visible = false;
        velocityArcY.visible = true;
    }

    // Extra "hit" feedback: thicken + brighten the active arc during the drag
    const activeArc = interactionState.velocityEditMode === 'xz' ? velocityArcXZ : velocityArcY;
    if (activeArc && activeArc.material) {
        activeArc.material.opacity = VEL_ARC_ACTIVE_OPACITY;
    }
}

// Create FPS counter sprite
let fpsSprite = null;
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
        0
    );

    uiScene.add(fpsSprite);
}
createFPSSprite();

// Create body stats sprite
let statsSprite = null;
function createStatsSprite() {
    const texture = createStatsTexture({
        name: '',
        mass: 0,
        radius: 0,
        mesh: { position: new THREE.Vector3() },
        velocity: new THREE.Vector3(),
    });
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
        0
    );

    uiScene.add(statsSprite);
}
createStatsSprite();

// --- Context hint system (top-center HUD text) ---
let hintSprite = null;
let hintLastText = '';

function createHintSprite() {
    const texture = createHintTexture({
        lines: [],
    });
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    hintSprite = new THREE.Sprite(material);
    hintSprite.scale.set(1100, 95, 1); // allow 1-2 lines (wider to avoid clipping)
    hintSprite.visible = false;

    // Top-center of the screen (slightly below top edge)
    hintSprite.position.set(0, window.innerHeight / 2 - 55, 0);

    uiScene.add(hintSprite);

    window.__updateHintSprite = function updateHintSprite() {
        if (!hintSprite) return;

        const hint = getActiveContextHint();
        hintSprite.visible = hint.visible;
        if (!hint.visible) return;

        const textKey = hint.lines.join('\n');
        if (textKey === hintLastText) return;
        hintLastText = textKey;

        if (hintSprite.material.map) hintSprite.material.map.dispose();
        hintSprite.material.map = createHintTexture({ lines: hint.lines });
        hintSprite.material.needsUpdate = true;
    };
}

function forceHintRefresh() {
    try {
        hintLastText = '';

        // Always recompute the hint, and force-apply both visibility and texture.
        // This avoids "stuck" hint sprites when switching camera modes.
        if (!hintSprite) return;

        const hint = getActiveContextHint();
        hintSprite.visible = hint.visible;

        // Dispose old texture (if any)
        if (hintSprite.material?.map) hintSprite.material.map.dispose();

        if (!hint.visible) {
            // Ensure we don't keep stale text around
            hintLastText = '';
            hintSprite.material.map = createHintTexture({ lines: [] });
            hintSprite.material.needsUpdate = true;
            return;
        }

        hintLastText = hint.lines.join('\n');
        hintSprite.material.map = createHintTexture({ lines: hint.lines });
        hintSprite.material.needsUpdate = true;
    } catch (e) {
        console.error('Error dispatching body:added event for preset body:', e);
    }
}

function getActiveContextHint() {
    // Highest priority: velocity dragging hint (existing behavior)
    const draggingVel = isChangingVelocity || isMiddleMouseVelocity;
    if (draggingVel) {
        const mode = interactionState.velocityEditMode || 'xz';
        return {
            visible: true,
            lines: [
                `Dragging velocity — press G to switch modes (XZ ↔ Y) | Mode: ${mode.toUpperCase()}`,
            ],
        };
    }

    const selected =
        selectedBody && simulationState.bodies.includes(selectedBody) ? selectedBody : null;

    const isFree = !!cameraState.isFreeCameraMode;
    const isTarget = !!cameraState.isTargetMode;

    // Case 1: Free camera mode hint (always show when enabled)
    if (isFree) {
        // If a body is also selected, we can show a second line about manipulation.
        if (selected) {
            const bodyLine = isTarget
                ? `Selected: drag axis arrows to move body | Drag yellow arrow to change velocity`
                : `Selected: click Target (crosshair) to enable arrows | Then drag arrows to move / change velocity`;
            return {
                visible: true,
                lines: [`Free Camera: WASD move | Space up | C down | Shift = fast`, bodyLine],
            };
        }

        return {
            visible: true,
            lines: [`Free Camera: WASD move | Space up | C down | Shift = fast`],
        };
    }

    // Case 2: Body selected manipulation hint (non-free-cam)
    if (selected) {
        const line = isTarget
            ? `Selected: drag axis arrows or use Arrow keys to move body | Drag yellow arrow to change velocity`
            : `Selected: click Target (crosshair) to enable arrows | Arrow keys move body once Target is on`;

        return {
            visible: true,
            lines: [line, 'Hold middle mouse button: follow mode'],
        };
    }

    // Case 3: Default camera hint (no selection, not free camera)
    return {
        visible: true,
        lines: ['Use right mouse button to rotate camera'],
    };
}

function createHintTexture({ lines }) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = 2200;
    canvas.height = 140;

    context.clearRect(0, 0, canvas.width, canvas.height);

    // 28pt hint text (slightly smaller to avoid clipping)
    context.font = '28px monospace';
    context.fillStyle = '#aaaaaa';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
    if (safeLines.length === 0) {
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    const lineY = safeLines.length > 1 ? [50, 100] : [75];
    for (let i = 0; i < Math.min(safeLines.length, 2); i++) {
        context.fillText(safeLines[i], canvas.width / 2, lineY[i]);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

createHintSprite();

// Backward compatibility aliases
let isRepositioning = false;
let activeAxis = null;
let isChangingVelocity = false;
let isMiddleMouseVelocity = false;
let timeScale = 1.5;
const cameraOffsetFromPlanet = new THREE.Vector3();
const lastPlanetAngle = 0;
let isFreeCameraMode = false;
let isMouseLookActive = false;
let focusID = 'camSun';
let manuallySelectedBody = null as Body | null; // Track bodies clicked in space (without camera buttons)
const NONE_FOCUS_POSITION = new THREE.Vector3(0, 0, 0); // Center of solar system
let isPaused = false;
let savedTimeScale = 1.5;
let lastT = performance.now();

let supernovas: Supernova[] = []; // Track all supernova effects

const isDragging = false;
const dragTarget = null as Body | null;
let wasRunningBeforeDrag = false;
const dragCameraOffset = new THREE.Vector3();
const dragPlane = new THREE.Plane();

// Synchronize aliases with state objects
Object.defineProperty(window, 'isRepositioning', {
    get: () => interactionState.isRepositioning,
    set: (v) => {
        interactionState.isRepositioning = v;
    },
});
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
const arrowKeys = cameraState.arrowKeys;

function canMoveSelectedBodyWithArrowKeys() {
    const target = gizmo?.target;
    return (
        !!target &&
        !!selectedBody &&
        selectedBody === target &&
        !!gizmo.group?.visible &&
        !!gizmo.target &&
        !!gizmo.target.mesh &&
        !isRepositioning &&
        !isChangingVelocity &&
        !isMiddleMouseVelocity
    );
}

function getCameraLeftRightBasis() {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);

    const up = camera.up.clone().normalize();
    const right = new THREE.Vector3().crossVectors(forward, up);

    if (right.lengthSq() < 1e-10) {
        right.set(1, 0, 0);
    } else {
        right.normalize();
    }

    return {
        left: right.clone().multiplyScalar(-1),
        right,
    };
}

function moveSelectedBodyRelativeToCamera(directionKey, ctrlKey = false) {
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

    if (body.rings) {
        body.rings.position.copy(body.mesh.position);
    }

    if (body.clouds) {
        body.clouds.position.set(0, 0, 0);
    }

    const shouldMoveCameraWithBody =
        cameraState.isLookAtMode &&
        !isFreeCameraMode &&
        !surfaceState?.isActive &&
        !cameraState.isFreeCameraMode;

    if (shouldMoveCameraWithBody) {
        camera.position.add(movement);
        controls.target.add(movement);
    }

    if (gizmo.group?.visible) {
        showPositionIndicators('position');
        updatePositionIndicator(yAxisIndicator, yAxisRing, body.mesh.position);
    }

    if (gizmo.target === body) {
        gizmo.update();
        updateVelocityArcs();
        if (yAxisIndicator && yAxisRing) {
            updatePositionIndicator(yAxisIndicator, yAxisRing, body.mesh.position);
        }
        if (
            (isChangingVelocity || isMiddleMouseVelocity) &&
            velocityTipIndicator &&
            velocityTipRing
        ) {
            const speed = body.velocity.length();
            const arrowScale = 50;
            const direction =
                speed > 0 ? body.velocity.clone().normalize() : new THREE.Vector3(1, 0, 0);
            const arrowTip = body.mesh.position
                .clone()
                .add(direction.multiplyScalar(speed * arrowScale));
            updatePositionIndicator(velocityTipIndicator, velocityTipRing, arrowTip);
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
});
const kuiperBeltPoints = new THREE.Points(kuiperBeltGeo, kuiperBeltMat);
scene.add(kuiperBeltPoints);

// Velocity arrow is now part of CoordinateGizmo (gizmo.velocityArrow)

// Grid plane for when dragging gizmo or velocity arrow
// UX goal: grid should feel "world anchored" (does not move with the body),
// but should dynamically expand/contract to encompass the dragged target + buffer.
let gridHelper = null;
const gridState = {
    size: 0,
    divisions: 0,

    // While dragging, the grid is anchored at the body's position at drag start (but does not move after).
    dragAnchor: new THREE.Vector3(),

    // Base cell size to use for the drag session (fixed; derived from body radius at drag start).
    dragCellSize: null,

    // While dragging, keep divisions stable to avoid a distracting "grid shifting" effect
    // (divisions changes re-quantize line spacing, which reads as the grid moving).
    freezeDivisions: false,
};

function disposeGridHelper() {
    if (!gridHelper) return;
    scene.remove(gridHelper);
    gridHelper.geometry?.dispose?.();
    gridHelper.material?.dispose?.();
    gridHelper = null;
    gridState.size = 0;
    gridState.divisions = 0;
}

function createGridHelper({ size, divisions, center }) {
    // Recreate (GridHelper doesn't support resizing)
    disposeGridHelper();

    gridHelper = new THREE.GridHelper(size, divisions, 0x444444, 0x222222);
    // Anchored at a fixed center (drag-start position) on the y=0 plane
    if (center) {
        gridHelper.position.set(center.x, 0, center.z);
    } else {
        gridHelper.position.set(0, 0, 0);
    }
    gridHelper.visible = false;
    scene.add(gridHelper);

    gridState.size = size;
    gridState.divisions = divisions;
}

function calcGridRequiredSize(targetBody) {
    // Fallback: if no target, just keep a modest grid.
    if (!targetBody || targetBody._isDisposed || !targetBody.mesh) {
        const fallbackSize = 12000;
        const fallbackDivisions = 200;
        return {
            size: fallbackSize,
            divisions: fallbackDivisions,
            center: new THREE.Vector3(0, 0, 0),
        };
    }

    // Grid anchor: where the body was when the drag started.
    // During drag we keep gridHelper.position fixed at this point (XZ).
    const anchor = gridState.dragAnchor || new THREE.Vector3(0, 0, 0);

    // How far the body has moved away from the drag start anchor (in XZ)
    const p = targetBody.mesh.position;
    const dx = p.x - anchor.x;
    const dz = p.z - anchor.z;
    const rXZ = Math.sqrt(dx * dx + dz * dz);

    const radius = Math.max(0, targetBody.radius || 0);

    // Buffer rules:
    // Keep the initial grid SMALL and only slightly larger than the dragged body.
    // Then EXPAND ONLY as the body moves away from the drag-start anchor.
    //
    // Use a smaller body-relative padding so the grid doesn't feel excessively large.
    const buffer = Math.max(25, radius * 4);

    // Baseline: just enough to cover the body + padding.
    const baseHalfExtent = Math.max(radius + buffer, 120);

    // Expand as the body moves away from the anchor
    const halfExtent = baseHalfExtent + rXZ;

    // GridHelper size is full width across X and Z.
    const size = THREE.MathUtils.clamp(halfExtent * 2, 500, 4000000); //4000000

    // Cell sizing rules:
    // - Cell size is FIXED for the drag session and based on the object's radius at drag start.
    // - Cell size MUST NOT increase as the body moves away; only size/divisions change.
    const cell = gridState.dragCellSize || Math.max(0.05, Math.min(20000, radius || 1));

    // Keep cell size stable by computing divisions from the fixed cell size.
    let divisions = Math.round(size / cell);

    // Clamp for GridHelper sanity, but avoid forcing large minimums (that would imply a big grid).
    // Allow smaller cell sizes by allowing more divisions.
    // GridHelper cost grows with divisions, so keep a safety cap.
    divisions = THREE.MathUtils.clamp(divisions, 2, 20000);

    // Make divisions even so the center line is stable/consistent.
    if (divisions % 2 !== 0) divisions += 1;

    return { size, divisions, center: anchor };
}

function ensureGridHelperSizedToTarget(targetBody) {
    const {
        size: requiredSize,
        divisions: requiredDivisions,
        center,
    } = calcGridRequiredSize(targetBody);

    const currentSize = gridState.size || 0;
    const currentDivisions = gridState.divisions || 0;

    const sizeChangedEnough =
        !gridHelper || Math.abs(requiredSize - currentSize) > currentSize * 0.05;

    // While dragging we freeze divisions to avoid a perceived "grid shifting" effect.
    // But if we allow the grid to SHRINK, we must allow divisions to shrink too, otherwise cell size
    // becomes enormous as size decreases. So during freeze we still keep the cell size stable by
    // tracking divisions from the required size.
    const divisionsToUse = gridState.freezeDivisions ? requiredDivisions : requiredDivisions;
    const divisionsChanged = divisionsToUse !== currentDivisions;

    const shouldRebuild =
        sizeChangedEnough ||
        (!gridState.freezeDivisions && divisionsChanged) ||
        (gridState.freezeDivisions && sizeChangedEnough);

    if (shouldRebuild) {
        createGridHelper({
            size: requiredSize,
            divisions: divisionsToUse,
            center,
        });
    }

    // Keep the grid anchored at drag-start center (XZ).
    if (gridHelper && center) {
        gridHelper.position.set(center.x, 0, center.z);

        // Ensure the grid remains visible during a drag even if we recreate it this frame.
        if (isRepositioning || isChangingVelocity || isMiddleMouseVelocity) {
            gridHelper.visible = true;
        }
    }
}

// Initialize with a default grid
createGridHelper(calcGridRequiredSize(null));

// Y-axis indicator (red line from grid to object with ring at bottom)
let yAxisIndicator = null;
let yAxisRing = null;
let velocityTipIndicator = null;
let velocityTipRing = null;
let indicatorMode = 'none';

function createPositionIndicator(color) {
    // Create vertical line
    const lineMaterial = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 100, 0),
    ]);
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.visible = false;
    scene.add(line);

    // Create ring at bottom
    const ringGeometry = new THREE.RingGeometry(8, 10, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2; // Rotate to lie flat on XZ plane
    ring.visible = false;
    scene.add(ring);

    return { line, ring };
}

// Create red indicator for object position
const redIndicator = createPositionIndicator(0xff0000);
yAxisIndicator = redIndicator.line;
yAxisRing = redIndicator.ring;

// Create green indicator for velocity arrow tip
const greenIndicator = createPositionIndicator(0x00ff00);
velocityTipIndicator = greenIndicator.line;
velocityTipRing = greenIndicator.ring;

function updatePositionIndicator(line, ring, position) {
    if (!line || !ring || !position) return;

    const gridY = 0; // Grid is at y=0

    // Update line position and length
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(position.x, gridY, position.z),
        new THREE.Vector3(position.x, position.y, position.z),
    ]);
    line.geometry.dispose();
    line.geometry = lineGeometry;

    // Update ring position
    ring.position.set(position.x, gridY, position.z);
}

function setIndicatorMode(mode) {
    indicatorMode = mode;
    const showRed = mode === 'position' || mode === 'both';
    const showGreen = mode === 'velocity' || mode === 'both';

    if (yAxisIndicator) yAxisIndicator.visible = showRed;
    if (yAxisRing) yAxisRing.visible = showRed;
    if (velocityTipIndicator) velocityTipIndicator.visible = showGreen;
    if (velocityTipRing) velocityTipRing.visible = showGreen;
}

function showPositionIndicators(mode = 'position') {
    // Capture drag-start anchor and a fixed cell size derived from the dragged body's radius.
    // Grid will be anchored here (not moving), and will only EXPAND as the body moves away.
    if (gizmo?.target?.mesh) {
        gridState.dragAnchor.copy(gizmo.target.mesh.position);
        const r = Math.max(0, gizmo.target.radius || 0);
        // Cell size is derived from body radius, but scaled down for this sim's world units.
        const cell = Math.max(0.05, Math.min(20000, r || 1));
        gridState.dragCellSize = cell;
    } else {
        gridState.dragAnchor.set(0, 0, 0);
        gridState.dragCellSize = 10;
    }

    // Freeze divisions during drag to prevent "shimmering" / perceived grid motion.
    gridState.freezeDivisions = true;
    ensureGridHelperSizedToTarget(gizmo?.target);

    // Defensive: ensure helpers are actually in the scene and not disposed/removed due to any race
    if (gridHelper && !gridHelper.parent) scene.add(gridHelper);
    if (yAxisIndicator && !yAxisIndicator.parent) scene.add(yAxisIndicator);
    if (yAxisRing && !yAxisRing.parent) scene.add(yAxisRing);
    if (velocityTipIndicator && !velocityTipIndicator.parent) scene.add(velocityTipIndicator);
    if (velocityTipRing && !velocityTipRing.parent) scene.add(velocityTipRing);

    if (gridHelper) gridHelper.visible = true;
    setIndicatorMode(mode);

    if ((mode === 'position' || mode === 'both') && gizmo?.target?.mesh) {
        updatePositionIndicator(yAxisIndicator, yAxisRing, gizmo.target.mesh.position);
    }
}

function hidePositionIndicators() {
    // Allow divisions to update again once the drag ends.
    gridState.freezeDivisions = false;
    gridState.dragCellSize = null;
    setIndicatorMode('none');

    if (gridHelper) gridHelper.visible = false;
}

function getPrimaryStar() {
    return (
        simulationState.bodies.find((b) => b && !b._isDisposed && isBodyType(b, BodyType.Star)) ||
        null
    );
}

function syncPrimaryStarLightTarget() {
    const primaryStar = getPrimaryStar();
    if (!primaryStar || !primaryStar.sunLight || !primaryStar.sunLight.target) return;

    const activeLightTarget =
        (selectedBody && simulationState.bodies.includes(selectedBody) && !selectedBody._isDisposed
            ? selectedBody
            : manuallySelectedBody &&
                simulationState.bodies.includes(manuallySelectedBody) &&
                !manuallySelectedBody._isDisposed
              ? manuallySelectedBody
              : cameraState.focusBody &&
                  simulationState.bodies.includes(cameraState.focusBody) &&
                  !cameraState.focusBody._isDisposed
                ? cameraState.focusBody
                : null) || null;

    if (activeLightTarget && activeLightTarget.mesh) {
        primaryStar.sunLight.target.position.copy(activeLightTarget.mesh.position);
    } else {
        // Default to a stable world-space direction instead of the scene center.
        // This avoids the initial "wrong side lit" look before a body is focused.
        primaryStar.sunLight.target.position.set(1, 0, 0);
    }

    if (primaryStar.sunLight.target.parent) {
        primaryStar.sunLight.target.updateMatrixWorld();
    }
}

// State management
let dragLine; // A visual helper to show the intended path

const lineMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
]);
dragLine = new THREE.Line(lineGeo, lineMat);
dragLine.visible = false;
scene.add(dragLine);

// Calculate elliptical orbit trajectory
function calculateEllipticalTrajectory(distance, parentMass, eccentricity = 0.4) {
    // For elliptical orbit, reduce velocity from circular orbit speed
    // Lower velocity = more elliptical orbit
    const circularSpeed = Math.sqrt((G * parentMass) / distance);
    const ellipticalSpeed = circularSpeed * Math.sqrt(1 - eccentricity);

    // Position on the X axis
    const pos = new THREE.Vector3(distance, 0, 0);

    // Velocity on the Z axis (perpendicular to position)
    const vel = new THREE.Vector3(0, 0, ellipticalSpeed);

    return { pos, vel };
}

// Apply orbital angle and inclination to trajectory
function applyOrbitalTransforms(trajectory, orbitalAngleDeg, inclinationDeg) {
    const orbitalAngleRad = (orbitalAngleDeg * Math.PI) / 180;
    const inclinationRad = (inclinationDeg * Math.PI) / 180;

    // Clone the vectors to avoid modifying the original
    const pos = trajectory.pos.clone();
    const vel = trajectory.vel.clone();

    // Apply orbital angle (rotation around Y axis)
    pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitalAngleRad);
    vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitalAngleRad);

    // Apply inclination (rotation around X axis to tilt the orbital plane)
    pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);
    vel.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);

    return { pos, vel };
}

function getRandomStarSpawnPosition() {
    const hasAnyExistingStar = simulationState.bodies.some(
        (b) => b && !b._isDisposed && isBodyType(b, BodyType.Star)
    );

    if (!hasAnyExistingStar) return new THREE.Vector3(0, 0, 0);

    const spawnRadius = 50000 * SCALE_FACTOR + Math.random() * (30000 * SCALE_FACTOR);
    const randomAngle = Math.random() * Math.PI * 2;
    const ySpread = 10000 * SCALE_FACTOR;

    return new THREE.Vector3(
        Math.cos(randomAngle) * spawnRadius,
        (Math.random() - 0.5) * ySpread,
        Math.sin(randomAngle) * spawnRadius
    );
}

function createPresetBody(presetKey) {
    const key = String(presetKey).toLowerCase();

    // Helper: find the current primary star (first star in bodies)
    const primaryStar = getPrimaryStar();

    // Presets assume a star exists. If launching empty mode, guide the user by creating a small star.
    if (!primaryStar && key !== 'sun') {
        createNewBody('sun');
    }

    const ensureEarth = () =>
        simulationState.bodies.find((b) => b && !b._isDisposed && b.name === 'Earth');
    const ensureJupiter = () =>
        simulationState.bodies.find((b) => b && !b._isDisposed && b.name === 'Jupiter');

    let newBody = null;

    switch (key) {
        case 'sun': {
            // Spawn an additional Sun (preset defaults, like default solar system spawn).
            // Position rules:
            // - If there are NO other star-type bodies, place it at the center (0,0,0).
            // - Otherwise place it randomly so multiple stars don't overlap by default.
            const pos = getRandomStarSpawnPosition();

            newBody = new Star(
                dependencies,
                scene,
                {
                    radius: SUN_RADIUS,
                    pos,
                    mass: SUN_MASS,
                    id: createUniqueId('sun'),
                    name: 'Sun',
                    temperature: 5778,
                    lightIntensity: 500000000,
                    lightDistance: 524400,
                },
                {
                    sunTexture,
                    redStarTexture,
                    orangeStarTexture,
                    whiteStarTexture,
                    blueStarTexture,
                    whiteDwarfTexture,
                }
            );

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

                newBody = earth.createMoon(scene, {
                    distance: MOON_DIST_FROM_EARTH,
                    radius: MOON_RADIUS,
                    mass: MOON_MASS,
                    id: createUniqueId('moon'),
                    name: 'Moon',
                    trailColor: 0xffffff,
                    maxTrail: 1500,
                    metalness: 0.95,
                });
            }
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
        default:
            console.warn('Unknown presetKey:', presetKey);
            return;
    }

    if (!newBody) return;

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
    managementPanel.setSelectedBody(newBody);

    setFocusBody(newBody, { zoom: cameraState.isLookAtMode });
    clearCameraPresetHighlights();
}

Star.createStarBirth = (
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    pos: THREE.Vector3,
    radius: number
) => {
    return new StarBirth(dependencies, scene, pos, radius);
};

function createNewBody(
    bodyType,
    planetType = 'solid',
    orbitType = 'circular',
    orbitalAngle = 0,
    inclination = 0,
    hasAtmosphere = false,
    customMass = null,
    customTemperature = null,
    customLightIntensity = null,
    customRadius = null
) {
    let newBody;

    switch (bodyType) {
        case 'sun': {
            // Create a custom STAR.
            //
            // Defaults are randomized around star-like values so the user can override them
            // in the creation UI before the body is actually created.
            const starPos = getRandomStarSpawnPosition();

            // Mass range: ~0.08 M☉ (red dwarf limit) up to ~150 M☉ (very massive / hypergiant-ish)
            // Use log sampling so we get interesting small/medium stars more often.
            const minMass = SUN_MASS * 0.08;
            const maxMass = SUN_MASS * 150;
            const t = Math.random();
            const randomStarMass = minMass * Math.pow(maxMass / minMass, t);
            const newStarMass =
                typeof customMass === 'number' && isFinite(customMass) && customMass > 0
                    ? customMass
                    : randomStarMass;

            // Radius: use mass-radius relationship, but clamp to a wide plausible visual range.
            // 0.08 M☉ ≈ 0.2 R☉ (very rough), 150 M☉ can be tens of R☉ to hundreds+ (supergiants).
            // We'll allow an intentionally dramatic spread, but keep within the existing slider max.
            const minRadius = SUN_RADIUS * 0.15;
            const maxRadius = 200000;
            const computedRadius = calculateStarRadius(newStarMass, SUN_MASS, SUN_RADIUS);
            const newStarRadius =
                typeof customRadius === 'number' && isFinite(customRadius) && customRadius > 0
                    ? customRadius
                    : THREE.MathUtils.clamp(computedRadius, minRadius, maxRadius);

            // Temperature: pick a broad range (cool red dwarfs/giants to hot blue stars)
            // 2000K..30000K matches the edit slider + existing color function.
            const randomStarTemp = 2000 + Math.random() * (30000 - 2000);
            const newStarTemp =
                typeof customTemperature === 'number' && isFinite(customTemperature)
                    ? customTemperature
                    : randomStarTemp;

            newBody = new Star(
                dependencies,
                scene,
                {
                    radius: newStarRadius,
                    pos: starPos,
                    vel: new THREE.Vector3(0, 0, 0),
                    mass: newStarMass,
                    id: createUniqueId('star'),
                    name: generateIAUName(BodyTypeEnum.Star),
                    temperature: newStarTemp,
                    lightIntensity:
                        typeof customLightIntensity === 'number' && isFinite(customLightIntensity)
                            ? customLightIntensity
                            : 500000000,
                    lightDistance: 524400,
                },
                {
                    sunTexture,
                    redStarTexture,
                    orangeStarTexture,
                    whiteStarTexture,
                    blueStarTexture,
                    whiteDwarfTexture,
                }
            );

            if (typeof customLightIntensity === 'number' && isFinite(customLightIntensity)) {
                try {
                    newBody.setLightIntensity(customLightIntensity);
                } catch (e) {
                    console.error('Error applying custom star light intensity:', e);
                }
            }

            break;
        }

        case 'planet':
            // Create a new planet in orbit
            const planetDistance = 30000 + Math.random() * 400000; // Random orbital distance

            // Use appropriate trajectory calculation based on orbit type
            let trajectory;
            if (orbitType === 'elliptical') {
                trajectory = calculateEllipticalTrajectory(planetDistance, SUN_MASS, 0.3);
            } else {
                trajectory = calculateTrajectory(planetDistance, SUN_MASS);
            }

            // Apply orbital angle and inclination
            trajectory = applyOrbitalTransforms(trajectory, orbitalAngle, inclination);

            const resolvedPlanetType = planetType || 'solid';
            const isGasGiant = resolvedPlanetType === 'gas_giant';
            const isIceGiant = resolvedPlanetType === 'ice_giant';
            const isSolidPlanet = !isGasGiant && !isIceGiant;

            const planetRadius =
                typeof customRadius === 'number' && isFinite(customRadius) && customRadius > 0
                    ? customRadius
                    : isSolidPlanet
                      ? 5 + Math.random() * 10
                      : 18 + Math.random() * 24;

            const planetMass =
                typeof customMass === 'number' && isFinite(customMass) && customMass > 0
                    ? customMass
                    : isSolidPlanet
                      ? 50 + Math.random() * 500
                      : isGasGiant
                        ? 4000 + Math.random() * 26000
                        : 1200 + Math.random() * 7000;

            const planetTexturePool = isGasGiant
                ? fictionalGasTextures
                : isIceGiant
                  ? fictionalIceTextures
                  : fictionalTextures;

            const customPlanetBodyType = isGasGiant
                ? BodyType.GasGiant
                : isIceGiant
                  ? BodyType.IceGiant
                  : BodyType.Planet;

            const planetMaterial = new THREE.MeshStandardMaterial({
                map: pickRandom(planetTexturePool),
                color: 0xffffff, // keep texture untinted
                emissive: 0x000000,
                emissiveIntensity: 0,
                roughness: 0.7,
                metalness: 0.7,
            });

            newBody = new CelestialBody(
                dependencies,
                scene,
                planetRadius,
                0xffffff,
                trajectory.pos.toArray(),
                trajectory.vel.toArray(),
                planetMass,
                null, // No camera button
                generateIAUName('planet'),
                customPlanetBodyType,
                0xaaaaaa,
                3000,
                false,
                { axis: [0, 1, 0], speed: 0.1 + Math.random() * 0.4 },
                null,
                planetMaterial
            );

            // Optional atmosphere/cloud layer (checkbox-driven for custom solid planets only)
            if (hasAtmosphere && isSolidPlanet) {
                const cloudsMat = new THREE.MeshStandardMaterial({
                    map: pickRandom(fictionalAtmosphereTextures),
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.45,
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
                newBody.cloudRotationSpeed = 0.12 + Math.random() * 0.12;
            }

            // Ensure brightness scaling uses a neutral base when texture is present
            newBody.baseColor = new THREE.Color(0xffffff);
            break;

        case 'moon':
            // Create a moon orbiting the currently focused body
            const focusedBody = getFocusObject();
            if (
                focusedBody &&
                simulationState.bodies.includes(focusedBody) &&
                !focusedBody._isDisposed
            ) {
                const moonDistance =
                    focusedBody.radius * 5 + Math.random() * focusedBody.radius * 10;

                // Use appropriate trajectory calculation based on orbit type
                let moonTrajectory;
                if (orbitType === 'elliptical') {
                    moonTrajectory = calculateEllipticalTrajectory(
                        moonDistance,
                        focusedBody.mass,
                        0.3
                    );
                } else {
                    moonTrajectory = calculateTrajectory(moonDistance, focusedBody.mass);
                }

                // Apply orbital angle and inclination
                moonTrajectory = applyOrbitalTransforms(moonTrajectory, orbitalAngle, inclination);

                const moonRadius =
                    typeof customRadius === 'number' && isFinite(customRadius) && customRadius > 0
                        ? customRadius
                        : 1 + Math.random() * 3;
                const moonMass =
                    typeof customMass === 'number' && isFinite(customMass) && customMass > 0
                        ? customMass
                        : 0.5 + Math.random() * 2;

                // Random texture per custom moon instance
                const moonMaterial = new THREE.MeshStandardMaterial({
                    map: pickRandom(fictionalTextures),
                    color: 0xffffff, // keep texture untinted
                    emissive: 0x000000,
                    emissiveIntensity: 0,
                    roughness: 0.7,
                    metalness: 0.7,
                });

                // Offset position and velocity by parent body
                const parentPos = focusedBody.mesh.position;
                const parentVel = focusedBody.velocity;

                newBody = new CelestialBody(
                    dependencies,
                    scene,
                    moonRadius,
                    0xffffff,
                    [
                        parentPos.x + moonTrajectory.pos.x,
                        parentPos.y + moonTrajectory.pos.y,
                        parentPos.z + moonTrajectory.pos.z,
                    ],
                    [
                        parentVel.x + moonTrajectory.vel.x,
                        parentVel.y + moonTrajectory.vel.y,
                        parentVel.z + moonTrajectory.vel.z,
                    ],
                    moonMass,
                    null,
                    generateIAUName('moon', focusedBody),
                    BodyType.Moon,
                    0x666666,
                    1000,
                    false,
                    { axis: [0, 1, 0], speed: 0.15 + Math.random() * 0.35 },
                    null,
                    moonMaterial
                );

                // Optional atmosphere/cloud layer (checkbox-driven for custom bodies)
                if (hasAtmosphere) {
                    const cloudsMat = new THREE.MeshStandardMaterial({
                        map: pickRandom(fictionalAtmosphereTextures),
                        color: 0xffffff,
                        transparent: true,
                        opacity: 0.45,
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
                    newBody.cloudRotationSpeed = 0.12 + Math.random() * 0.12;
                }

                // Ensure brightness scaling uses a neutral base when texture is present
                newBody.baseColor = new THREE.Color(0xffffff);
            } else {
                console.log('Please select a body first to create a moon');
                return;
            }
            break;

        case 'asteroid':
            // Create a small asteroid
            const asteroidDistance =
                ASTEROID_SPAWN_MIN_DIST * SCALE_FACTOR +
                Math.random() *
                    ((ASTEROID_SPAWN_MAX_DIST - ASTEROID_SPAWN_MIN_DIST) * SCALE_FACTOR);

            // Use appropriate trajectory calculation based on orbit type
            let asteroidTrajectory;
            if (orbitType === 'elliptical') {
                asteroidTrajectory = calculateEllipticalTrajectory(asteroidDistance, SUN_MASS, 0.3);
            } else {
                asteroidTrajectory = calculateTrajectory(asteroidDistance, SUN_MASS);
            }

            // Apply orbital angle and inclination
            asteroidTrajectory = applyOrbitalTransforms(
                asteroidTrajectory,
                orbitalAngle,
                inclination
            );

            newBody = new Asteroid(dependencies, scene, {
                pos: asteroidTrajectory.pos.toArray(),
                vel: asteroidTrajectory.vel.toArray(),
            });
            break;

        case 'comet': {
            // Create a comet using the dedicated Comet class so it gets nucleus + tail behavior.
            const cometDistance = 100000 + Math.random() * 500000;

            // Use appropriate trajectory calculation based on orbit type
            let cometTrajectory;
            if (orbitType === 'elliptical') {
                // Comets typically have highly elliptical orbits
                cometTrajectory = calculateEllipticalTrajectory(cometDistance, SUN_MASS, 0.4);
            } else {
                cometTrajectory = calculateTrajectory(cometDistance, SUN_MASS);
            }

            // Apply orbital angle and inclination
            cometTrajectory = applyOrbitalTransforms(cometTrajectory, orbitalAngle, inclination);

            const cometRadius = 1 + Math.random() * 2;
            const cometMass = 0.5 + Math.random() * 3;
            const cometMaterial = new THREE.MeshStandardMaterial({
                color: 0x888888,
                emissive: 0x000000,
                emissiveIntensity: 0,
                roughness: 0.7,
                metalness: 0.6,
            });

            newBody = new Comet(
                dependencies,
                scene,
                {
                    radius: cometRadius,
                    pos: cometTrajectory.pos.toArray(),
                    vel: cometTrajectory.vel.toArray(),
                    mass: cometMass,
                    id: createUniqueId('comet'),
                    name: generateIAUName('comet'),
                },
                cometMaterial
            );
            break;
        }
    }

    if (newBody) {
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
        managementPanel.setSelectedBody(newBody);

        // Focus selection/camera on the new body (object-based, not id-based)
        setFocusBody(newBody, { zoom: cameraState.isLookAtMode });

        // Clear any camera preset highlight (manual selection).
        // Do NOT clear LOOK AT / FREE / TARGET highlights, those are toggles with independent state.
        clearCameraPresetHighlights();
    }
}

const SimulationStartMode = Object.freeze({
    Default: 'default',
    Empty: 'empty',
});

function applyEnvironmentDefaultsForMode(mode) {
    // Only touches background visuals + management checkboxes (if already initialized).
    const isEmpty = mode === SimulationStartMode.Empty;

    if (typeof kuiperBeltPoints !== 'undefined' && kuiperBeltPoints) {
        kuiperBeltPoints.visible = !isEmpty;
    }

    // Keep UI in sync
    if (managementPanel?.enableKuiperBeltCheckbox) {
        managementPanel.enableKuiperBeltCheckbox.checked = !isEmpty;
    }
}

function spawn({ mode = SimulationStartMode.Default } = {}) {
    applyEnvironmentDefaultsForMode(mode);

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
        if (explosion.points) {
            scene.remove(explosion.points);
            explosion.geometry?.dispose();
            explosion.material?.dispose();
        }
        if (explosion.flashSphere) {
            scene.remove(explosion.flashSphere);
            explosion.flashSphere.geometry?.dispose();
            explosion.flashSphere.material?.dispose();
        }
    });
    simulationState.explosions = [];

    // Clean up all supernova effects
    for (const supernova of supernovas) {
        supernova.dispose();
    }
    supernovas = [];

    // Recreate the primary star for default mode (local, not global)
    const primaryStar =
        mode === SimulationStartMode.Empty
            ? null
            : new Star(
                  dependencies,
                  scene,
                  {
                      radius: SUN_RADIUS,
                      pos: new THREE.Vector3(0, 0, 0),
                      vel: new THREE.Vector3(0, 0, 0),
                      mass: SUN_MASS,
                      id: createUniqueId('sun'),
                      name: 'Sun',
                      temperature: 5778,
                      lightIntensity: 500000000,
                      lightDistance: 524400,
                  },
                  {
                      sunTexture,
                      redStarTexture,
                      orangeStarTexture,
                      whiteStarTexture,
                      blueStarTexture,
                      whiteDwarfTexture,
                  }
              );

    // Reset bodies array depending on mode
    simulationState.bodies = [];

    // Notify UI / systems that track live bodies
    try {
        window.dispatchEvent(new CustomEvent('bodies:reset'));
    } catch (e) {
        console.error('Error dispatching bodies:reset event:', e);
    }

    // Empty mode: starfield only (no bodies)
    if (mode === SimulationStartMode.Empty) {
        selectedBody = null;
        return;
    }

    // Default mode: build the solar system
    simulationState.bodies = [primaryStar];
    syncPrimaryStarLightTarget();

    // Mercury
    simulationState.bodies.push(new Mercury(dependencies, scene));

    // Venus
    simulationState.bodies.push(new Venus(dependencies, scene));

    // Earth
    const earth = new Earth(dependencies, scene);
    simulationState.bodies.push(earth);

    // Moon
    simulationState.bodies.push(
        earth.createMoon(scene, {
            distance: MOON_DIST_FROM_EARTH,
            radius: MOON_RADIUS, // 0.273 × Earth
            color: 0xffffff,
            mass: MOON_MASS,
            id: 'camMoon',
            name: 'Moon',
            trailColor: 0xffffff,
            maxTrail: 1500,
            metalness: 0.95,
        })
    );

    // Mars
    simulationState.bodies.push(new Mars(dependencies, scene));

    // Ceres - largest asteroid (dwarf planet), ~2.77 AU in real life
    const ceresAngle = Math.random() * Math.PI * 2;
    const ceresTrajectory = calculateTrajectory(CERES_DISTANCE, SUN_MASS);
    const ceres = new Asteroid(dependencies, scene, {
        radius: CERES_RADIUS, // Larger than typical asteroids
        color: 0xaaaaaa,
        pos: [Math.cos(ceresAngle) * CERES_DISTANCE, 0, Math.sin(ceresAngle) * CERES_DISTANCE],
        vel: [
            -Math.sin(ceresAngle) * ceresTrajectory.vel.length(),
            0,
            Math.cos(ceresAngle) * ceresTrajectory.vel.length(),
        ],
        mass: CERES_MASS,
        id: 'ceres',
        name: 'Ceres',
        trailColor: 0xcccccc,
        maxTrail: 2000,
        roughness: 0.9,
    });
    simulationState.bodies.push(ceres);

    // Vesta - second most massive asteroid, ~2.36 AU
    const vestaAngle = Math.random() * Math.PI * 2;
    const vestaTrajectory = calculateTrajectory(VESTA_DISTANCE, SUN_MASS);
    const vesta = new Asteroid(dependencies, scene, {
        radius: VESTA_RADIUS,
        color: 0xb8a890,
        pos: [
            Math.cos(vestaAngle) * VESTA_DISTANCE,
            (Math.random() - 0.5) * 1639,
            Math.sin(vestaAngle) * VESTA_DISTANCE,
        ],
        vel: [
            -Math.sin(vestaAngle) * vestaTrajectory.vel.length(),
            0,
            Math.cos(vestaAngle) * vestaTrajectory.vel.length(),
        ],
        mass: VESTA_MASS,
        id: 'vesta',
        name: 'Vesta',
        trailColor: 0xc9b89a,
        maxTrail: 1500,
        roughness: 0.9,
    });
    simulationState.bodies.push(vesta);

    // Pallas - third most massive, ~2.77 AU
    const pallasAngle = Math.random() * Math.PI * 2;
    const pallasTrajectory = calculateTrajectory(PALLAS_DISTANCE, SUN_MASS);
    const pallas = new Asteroid(dependencies, scene, {
        radius: PALLAS_RADIUS,
        color: 0x8a8a8a,
        pos: [
            Math.cos(pallasAngle) * PALLAS_DISTANCE,
            (Math.random() - 0.5) * 2185,
            Math.sin(pallasAngle) * PALLAS_DISTANCE,
        ],
        vel: [
            -Math.sin(pallasAngle) * pallasTrajectory.vel.length(),
            0,
            Math.cos(pallasAngle) * pallasTrajectory.vel.length(),
        ],
        mass: PALLAS_MASS,
        id: 'pallas',
        name: 'Pallas',
        trailColor: 0x999999,
        maxTrail: 1500,
        roughness: 0.9,
    });
    simulationState.bodies.push(pallas);

    // Hygiea - fourth largest, ~3.14 AU
    const hygieaAngle = Math.random() * Math.PI * 2;
    const hygieaTrajectory = calculateTrajectory(HYGIEA_DISTANCE, SUN_MASS);
    const hygiea = new Asteroid(dependencies, scene, {
        radius: HYGIEA_RADIUS,
        color: 0x7a7a7a,
        pos: [
            Math.cos(hygieaAngle) * HYGIEA_DISTANCE,
            (Math.random() - 0.5) * 1093,
            Math.sin(hygieaAngle) * HYGIEA_DISTANCE,
        ],
        vel: [
            -Math.sin(hygieaAngle) * hygieaTrajectory.vel.length(),
            0,
            Math.cos(hygieaAngle) * hygieaTrajectory.vel.length(),
        ],
        mass: HYGIEA_MASS,
        id: 'hygiea',
        name: 'Hygiea',
        trailColor: 0x888888,
        maxTrail: 1500,
        roughness: 0.9,
    });
    simulationState.bodies.push(hygiea);

    // Jupiter
    const jupiter = new Jupiter(dependencies, scene, jupiterTexture);
    simulationState.bodies.push(jupiter);

    // Io (innermost Galilean moon) - Start at 0 degrees
    simulationState.bodies.push(
        jupiter.createMoon(scene, {
            angle: 0,
            distance: IO_DIST_FROM_JUPITER,
            radius: IO_RADIUS, // 1.048 × Moon
            color: 0xffdd77,
            mass: IO_MASS,
            id: 'camIo',
            name: 'Io',
            trailColor: 0xffdd77,
            maxTrail: 800,
            yVariation: 109,
            metalness: 0.95,
        })
    );

    // Europa - Start at 90 degrees
    simulationState.bodies.push(
        jupiter.createMoon(scene, {
            angle: Math.PI / 2,
            distance: EUROPA_DIST_FROM_JUPITER,
            radius: EUROPA_RADIUS, // 0.899 × Moon
            color: 0xccddee,
            mass: EUROPA_MASS,
            id: 'camEuropa',
            name: 'Europa',
            trailColor: 0xccddee,
            maxTrail: 1000,
            yVariation: 164,
            metalness: 0.95,
        })
    );

    // Ganymede (largest moon in solar system) - Start at 180 degrees
    simulationState.bodies.push(
        jupiter.createMoon(scene, {
            angle: Math.PI,
            distance: GANYMEDE_DIST_FROM_JUPITER,
            radius: GANYMEDE_RADIUS, // 1.517 × Moon (largest moon!)
            color: 0xaaaaaa,
            mass: GANYMEDE_MASS,
            id: 'camGanymede',
            name: 'Ganymede',
            trailColor: 0xcccccc,
            maxTrail: 1200,
            yVariation: 219,
            metalness: 0.95,
        })
    );

    // Callisto (outermost Galilean moon) - Start at 270 degrees
    simulationState.bodies.push(
        jupiter.createMoon(scene, {
            angle: (Math.PI * 3) / 2,
            distance: CALLISTO_DIST_FROM_JUPITER,
            radius: CALLISTO_RADIUS, // 1.387 × Moon
            color: 0x998877,
            mass: CALLISTO_MASS,
            id: 'camCallisto',
            name: 'Callisto',
            trailColor: 0xaa9988,
            maxTrail: 1500,
            yVariation: 273,
            metalness: 0.95,
        })
    );

    // Saturn
    simulationState.bodies.push(new Saturn(dependencies, scene, saturnTexture));

    // Uranus
    simulationState.bodies.push(new Uranus(dependencies, scene, uranusTexture));

    // Neptune
    simulationState.bodies.push(new Neptune(dependencies, scene, neptuneTexture));

    // Pluto
    simulationState.bodies.push(new Pluto(dependencies, scene, plutoTexture));

    // Comet
    simulationState.bodies.push(new Halley(dependencies, scene));

    selectedBody = null;
}

function getAcc(p1, p2, m2) {
    const diff = new THREE.Vector3().subVectors(p2, p1);
    const r = diff.length();

    // Prevent division by zero
    if (r < 0.01) return new THREE.Vector3(0, 0, 0);

    // Gravitational acceleration: a = G * m / r²
    const accMag = (G * m2) / (r * r);

    // Normalize and scale
    diff.normalize();

    // Return acceleration vector
    return diff.multiplyScalar(accMag);
}

function togglePause() {
    isPaused = !isPaused;

    if (isPaused) {
        // Remember the current speed and set to 0
        savedTimeScale = timeScale;
        timeScale = 0;
        const direction = savedTimeScale < 0 ? ' REVERSE' : '';
        mainPanel.updateTimeScaleDisplay(
            '0.0x (PAUSED - next: ' + Math.abs(savedTimeScale) + 'x' + direction + ')'
        );
        mainPanel.setPauseState(true);
        // Keep slider enabled so user can adjust speed while paused
    } else {
        // Restore the saved speed (which may have been adjusted while paused)
        timeScale = savedTimeScale;
        const direction = savedTimeScale < 0 ? ' REVERSE' : '';
        mainPanel.updateTimeScaleDisplay(Math.abs(savedTimeScale) + 'x' + direction);
        mainPanel.setPauseState(false);
    }
}

function toggleShadows(enabled: boolean) {
    renderer.shadowMap.enabled = enabled;

    // Update all celestial bodies
    simulationState.bodies.forEach((body) => {
        if (body && body.mesh) {
            if (isBodyType(body, BodyType.Star) && typeof body.setShadowsEnabled === 'function') {
                // Call setShadowsEnabled on Star instances
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
    // Surface mode RMB look uses the global mousemove handler (onSurfaceMouseMove).
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
        showPositionIndicators('both');
        updateVelocityArcs();

        return;
    }

    // Right mouse button activates mouse look
    if (event.button === 2) {
        if (surfaceState?.isActive) {
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
        showPositionIndicators('both');
        updateVelocityArcs();

        return;
    }

    // Check for Gizmo first
    const gizmoIntersects = raycaster.intersectObjects(gizmo.group.children, true);
    if (gizmoIntersects.length > 0 && gizmo?.target) {
        // Gravity arrow is informational-only (shows net gravitational acceleration).
        // Ignore clicks/drags on it so it can't be used to move the body.
        if (gizmoIntersects[0].object?.userData?.isGravityGizmo) {
            return;
        }

        isRepositioning = true;
        activeAxis = gizmoIntersects[0].object.userData.axis;
        // Inside onMouseDown, when an arrow is clicked:
        gizmo.arrows.forEach((a) => (a.line.material.opacity = 0.2)); // Dim others
        gizmoIntersects[0].object.parent.line.material.opacity = 1.0; // Highlight active
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
        showPositionIndicators('position');

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
            managementPanel.setSelectedBody(clickedBody);

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
        managementPanel.setSelectedBody(null);

        refreshBodiesTable();
        forceHintRefresh();
    }
}

function onMouseMove(event) {
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

                updateVelocityArcs();
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

    // Handle position gizmo dragging
    if (isRepositioning && gizmo.target) {
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
        if (gizmo.target.rings) {
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

function onMouseUp(event) {
    // Middle mouse button release
    if (event.button === 1) {
        isMiddleMouseVelocity = false;

        // If LMB velocity drag is still active, do NOT hide the grid/indicators/arcs.
        // This prevents "grid disappearing" when the user releases MMB while still dragging with LMB.
        if (!isChangingVelocity) {
            hidePositionIndicators();

            // Hide arc helper for middle-mouse velocity drag as well
            velocityArcXZ.visible = false;
            velocityArcY.visible = false;
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

        isRepositioning = false;
        isChangingVelocity = false;
        activeAxis = null;
        gizmo.arrows.forEach((a) => (a.line.material.opacity = 1.0));
        controls.enabled = !isFreeCameraMode;
        hidePositionIndicators();

        velocityArcXZ.visible = false;
        velocityArcY.visible = false;

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
            if (cameraState.isLookAtMode && getFocusObject()) {
                controls.target.copy(getFocusObject().mesh.position);
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

function calcFitDistanceForBody(body) {
    const radius = body && !body._isDisposed && body.mesh ? Math.max(1e-6, body.radius || 1) : 1;
    // Fit a sphere of size `radius` inside the camera's vertical FOV, with margin.
    const fovRad = THREE.MathUtils.degToRad(camera.fov || 60);
    const margin = 1.6;
    const dist = (radius * margin) / Math.tan(fovRad / 2);

    const minDist = Math.max(radius * 2.2, 10);
    const maxDist = MAX_ZOOM_OUT_DISTANCE;
    const worldRadius = body?.mesh ? body.mesh.position.length() + radius : radius;
    const farMargin = Math.max(worldRadius * 2, radius * 20, 100000 * SCALE_FACTOR);
    return THREE.MathUtils.clamp(dist, minDist, Math.min(maxDist, farMargin));
}

function triggerZoomToBody(bodyOrNull) {
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

function setFocusBody(bodyOrNull, { zoom = false } = {}) {
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

function animate() {
    const now = performance.now();
    requestAnimationFrame(animate);
    const tScale = timeScale;
    const steps = SIM.STEPS_PER_FRAME;
    const dt = (SIM.BASE_FRAME_DT * tScale) / steps;
    const dtTotal = dt * steps;

    // Surface camera transform update.
    // IMPORTANT: when surface mode is active, it fully owns camera position + orientation.
    // We still run physics (so the planet rotates under you), but we must skip any other
    // camera-follow / look-at / orbit-controls logic later in this frame.
    const isSurfaceModeActive = !!surfaceState?.isActive;
    if (isSurfaceModeActive) {
        updateSurfaceCameraTransform();
    }

    // WASD camera movement (works in both free camera and normal mode)
    const speed = keys.shift ? cameraSpeed * 10 : cameraSpeed;
    const direction = new THREE.Vector3();

    camera.getWorldDirection(direction);
    const right = new THREE.Vector3();
    right.crossVectors(camera.up, direction).normalize();

    const movement = new THREE.Vector3();
    if (keys.w) movement.add(direction.clone().multiplyScalar(speed));
    if (keys.s) movement.add(direction.clone().multiplyScalar(-speed));
    if (keys.a) movement.add(right.clone().multiplyScalar(speed));
    if (keys.d) movement.add(right.clone().multiplyScalar(-speed));
    if (keys.space) movement.y += speed;
    if (keys.c) movement.y -= speed;

    const didMove = movement.length() > 0;

    if (didMove) {
        camera.position.add(movement);

        // In normal mode (except 'None'), also move the orbit controls target to maintain relative position
        // For 'None' mode, keep target fixed at center [0,0,0]
        if (!isFreeCameraMode && focusID !== 'camNone') {
            controls.target.add(movement);
        }

        // If dragging gizmo arrow, move the planet along that specific axis
        if (isRepositioning && gizmo.target && activeAxis) {
            if (activeAxis === 'x') {
                gizmo.target.mesh.position.x += movement.x;
            } else if (activeAxis === 'y') {
                gizmo.target.mesh.position.y += movement.y;
            } else if (activeAxis === 'z') {
                gizmo.target.mesh.position.z += movement.z;
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

    const focusObj = getFocusObject();
    const oldPos = focusObj && focusObj.mesh ? focusObj.mesh.position.clone() : new THREE.Vector3();

    // Physics integration loop
    for (let i = 0; i < steps; i++) {
        // Calculate accelerations for all bodies
        for (const body of simulationState.bodies) {
            const totalAcc = new THREE.Vector3(0, 0, 0);

            // Calculate pull from ALL OTHER bodies (n-body simulation)
            for (const other of simulationState.bodies) {
                if (other !== body && !other?._isDisposed && other.mesh) {
                    const accFromOther = getAcc(
                        body.mesh.position,
                        other.mesh.position,
                        other.mass
                    );
                    totalAcc.add(accFromOther);
                }
            }

            // Store the accumulated force to apply in the update step
            body.tempAcc = totalAcc;
        }

        // Apply accelerations to positions
        for (const body of simulationState.bodies) {
            if (body && !body._isDisposed && body.mesh) {
                body.update(body.tempAcc, dt);
            }
        }
    }

    // Collision detection and trail updates (outside integration loop for performance)
    if (!isRepositioning) {
        // NOTE: collision resolution can remove bodies from the `bodies` array mid-iteration.
        // Do NOT cache `bodies.length` (or rely on `bodies[j]` being non-undefined) in this loop.
        // Otherwise we can end up with `b1 === undefined` and crash on `b1.updateTrail()`.
        for (let j = 0; j < simulationState.bodies.length; j++) {
            const b1 = simulationState.bodies[j];
            if (!b1) continue;

            // Update the trail position for b1
            if (typeof b1.updateTrail === 'function') b1.updateTrail();

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
                        managementPanel?.setSelectedBody?.(winner);
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
                        triggerZoom('camNone');
                    }
                }
            }
        }
    }

    // Update material brightness based on distance from star (inverse square law)
    const sunBody = simulationState.bodies.find(
        (b) => b && !b._isDisposed && isBodyType(b, BodyType.Star)
    );
    if (sunBody) {
        for (const body of simulationState.bodies) {
            if (
                body &&
                !body._isDisposed &&
                body.mesh &&
                !isBodyType(body, BodyType.Star) &&
                body.baseColor
            ) {
                // Calculate distance from sun
                const dx = body.mesh.position.x - sunBody.mesh.position.x;
                const dy = body.mesh.position.y - sunBody.mesh.position.y;
                const dz = body.mesh.position.z - sunBody.mesh.position.z;
                const distanceFromSun = Math.sqrt(dx * dx + dy * dy + dz * dz);

                // Use inverse square law with a reference distance (Earth's orbit)
                const referenceDistance = 21850; // Earth's distance
                const minBrightness = 0.05; // Pluto will be quite dim but still visible
                const brightness = Math.max(
                    minBrightness,
                    (referenceDistance * referenceDistance) / (distanceFromSun * distanceFromSun)
                );

                // Apply brightness to material color
                body.mesh.material.color.copy(body.baseColor).multiplyScalar(brightness);
            }
        }
    }

    // Keep skydome centered on the camera so it appears infinitely far away
    skydome.position.copy(camera.position);

    gizmo.update();
    updateVelocityArcs();

    // Update grid size while dragging so it expands/contracts as needed.
    if (
        (isRepositioning || isChangingVelocity || isMiddleMouseVelocity) &&
        gizmo.target &&
        !gizmo.target._isDisposed &&
        gizmo.target.mesh
    ) {
        ensureGridHelperSizedToTarget(gizmo.target);

        if (
            yAxisIndicator &&
            yAxisRing &&
            (isChangingVelocity || isMiddleMouseVelocity || isRepositioning)
        ) {
            updatePositionIndicator(yAxisIndicator, yAxisRing, gizmo.target.mesh.position);
        }

        if (
            (isChangingVelocity || isMiddleMouseVelocity) &&
            velocityTipIndicator &&
            velocityTipRing
        ) {
            const speed = gizmo.target.velocity.length();
            const arrowScale = 50;
            const direction =
                speed > 0 ? gizmo.target.velocity.clone().normalize() : new THREE.Vector3(1, 0, 0);
            const arrowTip = gizmo.target.mesh.position
                .clone()
                .add(direction.multiplyScalar(speed * arrowScale));
            updatePositionIndicator(velocityTipIndicator, velocityTipRing, arrowTip);
        }
    }

    // Filter dead explosions
    simulationState.explosions = simulationState.explosions.filter((exp) => {
        exp.update(dtTotal);
        return exp.active;
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
            velocityTipIndicator &&
            velocityTipRing
        ) {
            const arrowTip = gizmo.target.mesh.position
                .clone()
                .add(direction.multiplyScalar(speed * arrowScale));
            updatePositionIndicator(velocityTipIndicator, velocityTipRing, arrowTip);
        }

        if ((isChangingVelocity || isMiddleMouseVelocity) && yAxisIndicator && yAxisRing) {
            updatePositionIndicator(yAxisIndicator, yAxisRing, gizmo.target.mesh.position);
        }
    }

    // Update label scales based on distance from camera
    // Always update scale, visibility is controlled by checkbox
    const showNames = document.getElementById('showNames').checked;
    simulationState.bodies.forEach((body) => {
        if (body && !body._isDisposed && body.mesh && body.label) {
            body.label.visible = showNames;
            if (body.labelLine) {
                body.labelLine.visible = showNames;
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

    // Handle camera positioning (skip entirely in surface mode)
    if (!isSurfaceModeActive && !isFreeCameraMode) {
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

            if (document.getElementById('lockToSun').checked) {
                // Simply move the camera by the same delta as the planet
                camera.position.add(delta);

                // Set target to sun and look at it
                controls.target.set(0, 0, 0);
                camera.lookAt(0, 0, 0);
            } else {
                // Normal look-at follow: camera follows focused body
                if (!isRepositioning && !isChangingVelocity) {
                    camera.position.add(delta);
                    controls.target.copy(focusObj.mesh.position);
                }
            }
        } else {
            // Look At OFF (or no valid focus body): keep orbit anchored to scene center.
            controls.target.copy(NONE_FOCUS_POSITION);
        }
    }

    if (!isSurfaceModeActive && !isFreeCameraMode) {
        controls.update();
    }

    syncPrimaryStarLightTarget();

    // Update hint sprite each frame (cheap; texture only updates when text changes)
    if (window.__updateHintSprite) {
        window.__updateHintSprite();
    }

    // Render 3D scene first, then UI overlay on top
    renderer.autoClear = true;
    renderer.render(scene, camera);

    renderer.autoClear = false;
    renderer.clearDepth(); // ensure 2D overlay draws on top even after rendering the 3D scene
    renderer.render(uiScene, uiCamera);
    renderer.autoClear = true;

    // Update FPS counter text
    if (now - fpsLastUpdate > 100) {
        // Update every 100ms
        const fps = Math.round(1000 / (now - lastT));
        if (fpsSprite) {
            fpsSprite.material.map.dispose();
            fpsSprite.material.map = createFPSTexture(fps);
            fpsSprite.material.needsUpdate = true;
        }

        // Update body stats if there's a selected body
        if (
            selectedBody &&
            simulationState.bodies.includes(selectedBody) &&
            !selectedBody._isDisposed &&
            statsSprite
        ) {
            statsSprite.material.map.dispose();
            statsSprite.material.map = createStatsTexture(selectedBody, simulationState.bodies);
            statsSprite.material.needsUpdate = true;
            statsSprite.visible = true;
        } else if (statsSprite) {
            statsSprite.visible = false;
        }

        // Update event log
        if (eventLogSprite) {
            eventLogSprite.material.map.dispose();
            eventLogSprite.material.map = createEventLogTexture();
            eventLogSprite.material.needsUpdate = true;
        }

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

function getBodyTypeLabel(b: Body) {
    if (!b) return 'Unknown';
    if (b.bodyType & BodyType.BlackHole) return 'Black Hole';
    if (isBodyType(b, BodyType.Star)) return 'Star';
    if (b.bodyType && b.bodyType & BodyType.GasGiant) return 'Gas Giant';
    if (b.bodyType && b.bodyType & BodyType.IceGiant) return 'Ice Giant';
    if (b.bodyType && b.bodyType & BodyType.DwarfPlanet) return 'Dwarf Planet';
    if (b.bodyType && b.bodyType & BodyType.Planet) return 'Planet';
    if (b.bodyType && b.bodyType & BodyType.Moon) return 'Moon';
    if (b.bodyType && b.bodyType & BodyType.Asteroid) return 'Asteroid';
    if (b.bodyType && b.bodyType & BodyType.Comet) return 'Comet';
    return 'Unknown';
}

function refreshBodiesTable() {
    if (!mainPanel) return;
    const rows = simulationState.bodies
        .filter((b) => b && !b._isDisposed && b.mesh)
        .map((b) => ({
            name: b.name || 'Unnamed',
            typeLabel: getBodyTypeLabel(b),
            body: b,
        }))
        .sort((a, b) => a.typeLabel.localeCompare(b.typeLabel) || a.name.localeCompare(b.name));

    // Keep table highlight in sync with current selection
    mainPanel.setSelectedBody(selectedBody || manuallySelectedBody || null);
    mainPanel.renderBodiesTable(rows);

    // Surface camera enablement depends on selection, so keep it in sync.
    try {
        updateSurfaceButtonEnabled?.();
    } catch (e) {
        // ignore
    }
}
function setF(id) {
    // Legacy helper kept for compatibility with existing call sites,
    // but camera behavior should no longer depend on id.
    focusID = id;
}

// --- UI PANEL INITIALIZATION ---

// Create and initialize panels
const startupModal = new StartupModal('startup-overlay');
const mainPanel = new MainPanel('ui-layer');
const managementPanel = new ManagementPanel('management-panel', { getFocusObject });

startupModal.initialize();
mainPanel.initialize();
managementPanel.initialize();

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

function zoomRelativeToTarget(target: Body, factor) {
    // target=null means "zoom around scene center" (used when Look At is OFF)
    const targetPos =
        target && simulationState.bodies.includes(target) && !target._isDisposed && target.mesh
            ? target.mesh.position
            : NONE_FOCUS_POSITION;

    // Direction from target -> camera
    const dir = new THREE.Vector3().subVectors(camera.position, targetPos);
    const currentDist = Math.max(1, dir.length());
    dir.normalize();

    // Keep a sensible minimum distance so we don't clip into the body (only if we have a body target)
    const minDist =
        target && simulationState.bodies.includes(target) && !target._isDisposed
            ? Math.max((target.radius || 1) * 2.2, 10)
            : 10;
    const maxDist = MAX_ZOOM_OUT_DISTANCE;
    const targetDistance =
        target && simulationState.bodies.includes(target) && !target._isDisposed && target.mesh
            ? target.mesh.position.length()
            : 0;
    const farLimit = Math.min(
        MAX_CAMERA_VIEW_DISTANCE,
        Math.max(targetDistance * 2, targetDistance + 500000 * SCALE_FACTOR, maxDist)
    );

    const zoomInLimit =
        target && simulationState.bodies.includes(target) && !target._isDisposed
            ? Math.max((target.radius || 1) * 2.2, 10)
            : 10;
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
const surfaceState = {
    isActive: false,
    body: null, // CelestialBody

    // Anchor point on the body's surface, expressed in the body's LOCAL space.
    // This is what makes the camera "fixed to the planet" while the planet spins.
    anchorLocalDir: new THREE.Vector3(0, 1, 0),

    // View orientation relative to the local tangent frame at the anchor.
    yaw: 0,
    pitch: 0,

    // Snapshot (for clean exit)
    prevCameraPos: new THREE.Vector3(),
    prevCameraQuat: new THREE.Quaternion(),
    prevCameraUp: new THREE.Vector3(0, 1, 0),
    prevControlsTarget: new THREE.Vector3(),

    // Tunables
    // Keep this very small so it reads as "standing on the surface" not hovering.
    // We still need a tiny offset to avoid z-fighting / clipping into the mesh.
    eyeHeight: 0.2, // world units above surface
    lookSensitivity: 0.002,
};

function isSurfaceEligibleBody(body) {
    if (!body || !simulationState.bodies.includes(body) || body._isDisposed || !body.mesh)
        return false;
    if (isBodyType(body, BodyType.Star)) return false;
    if (body.isBlackHole || (body.bodyType && body.bodyType & BodyType.BlackHole)) return false;
    // require some minimum radius so we don't go crazy on tiny asteroids
    return (body.radius || 0) >= 1.0;
}

function updateSurfaceButtonEnabled() {
    const selected =
        (selectedBody && simulationState.bodies.includes(selectedBody) && !selectedBody._isDisposed
            ? selectedBody
            : null) ||
        (manuallySelectedBody &&
        simulationState.bodies.includes(manuallySelectedBody) &&
        !manuallySelectedBody._isDisposed
            ? manuallySelectedBody
            : null);

    const isEnabled = isSurfaceEligibleBody(selected);
    mainPanel.setSurfaceCameraState({ isActive: surfaceState.isActive, isEnabled });
}

function exitSurfaceMode() {
    // Restore pre-surface camera/controls state (so exiting doesn't leave the camera at a weird angle)
    camera.position.copy(surfaceState.prevCameraPos);
    camera.quaternion.copy(surfaceState.prevCameraQuat);
    camera.up.copy(surfaceState.prevCameraUp);

    controls.target.copy(surfaceState.prevControlsTarget);
    controls.update();

    surfaceState.isActive = false;
    surfaceState.body = null;

    mainPanel.setSurfaceCameraState({ isActive: false, isEnabled: true });

    // restore default (non-free) controls behavior
    controls.enabled = true;

    // Stop any pointer lock (if we ever use it later)
    if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
    }

    forceHintRefresh();
}

function enterSurfaceMode(body) {
    if (!isSurfaceEligibleBody(body)) return;

    // Snapshot camera/controls state so exiting returns to the exact view.
    surfaceState.prevCameraPos.copy(camera.position);
    surfaceState.prevCameraQuat.copy(camera.quaternion);
    surfaceState.prevCameraUp.copy(camera.up);
    surfaceState.prevControlsTarget.copy(controls.target);

    // Surface mode is mutually exclusive with Free Camera + Look At.
    if (cameraState.isFreeCameraMode) {
        isFreeCameraMode = false;
        cameraState.isFreeCameraMode = false;
        mainPanel.setFreeCameraState(false);
    }
    if (cameraState.isLookAtMode) {
        cameraState.isLookAtMode = false;
        mainPanel.setLookAtState(false);
    }

    controls.enabled = false;

    surfaceState.isActive = true;
    surfaceState.body = body;
    surfaceState.yaw = 0;
    surfaceState.pitch = 0;

    // Anchor selection:
    // - If we have a selected body, pick the surface point directly under the current camera view.
    //   This makes it feel like you "land" where you're looking, not on a fixed pole.
    // - Store the anchor direction in BODY-LOCAL space so it rotates with the planet spin.
    const bodyCenter = body.mesh.position.clone();

    // From body -> camera direction (points at the currently viewed hemisphere)
    const fromBodyToCam = new THREE.Vector3().subVectors(camera.position, bodyCenter).normalize();

    // The closest visible surface point is on the opposite side of that vector:
    // body -> camera points outward; surface point facing camera is in that direction.
    // But we want the surface normal at the anchor to point outward, toward the camera.
    const surfaceNormalWorld = fromBodyToCam.clone().normalize();

    const invQ = body.mesh.quaternion.clone().invert();
    surfaceState.anchorLocalDir = surfaceNormalWorld.clone().applyQuaternion(invQ).normalize();

    // Immediately apply transform so first frame doesn't "snap".
    updateSurfaceCameraTransform();

    mainPanel.setSurfaceCameraState({ isActive: true, isEnabled: true });
    forceHintRefresh();
}

function updateSurfaceCameraTransform() {
    if (
        !surfaceState.isActive ||
        !surfaceState.body ||
        !simulationState.bodies.includes(surfaceState.body) ||
        surfaceState.body._isDisposed
    )
        return;

    const b = surfaceState.body;
    const center = b.mesh.position;

    // World-space surface normal ("gravity up") derived from the ANCHOR (stored in body-local space).
    // This keeps the CAMERA POSITION pinned to the same spot on the planet as it rotates.
    const gravityUp = surfaceState.anchorLocalDir
        .clone()
        .applyQuaternion(b.mesh.quaternion)
        .normalize();

    // Put the camera on the surface with a tiny epsilon above it (along gravity up).
    const worldRadius = (b.radius || 0) * (b.mesh?.scale?.x || 1);

    // Keep a small safety margin so numeric drift can never put the camera *inside* the body.
    // This directly prevents “seeing through” the planet when the surface rig updates each frame.
    const minEyeClearance = Math.max(worldRadius * 0.001, 0.05);
    const eyeOffset = Math.max(surfaceState.eyeHeight, minEyeClearance);

    const surfacePoint = center
        .clone()
        .add(gravityUp.clone().multiplyScalar(worldRadius + eyeOffset));

    // Build a STABLE tangent frame that does NOT depend on the planet's spin axis.
    // Depending on rotationAxis for "horizon up" can cause sudden flips near poles,
    // which reads as wild camera spinning/rolling.
    //
    // We instead:
    //  - Use gravityUp as the camera's up (like standing upright on the ground).
    //  - Derive a tangent "north" direction by projecting a fixed world reference onto the tangent plane.
    //  - Derive "east" from north × up.
    // Build a stable tangent basis (east/north) from a fixed world reference.
    // NOTE: "world north" itself is arbitrary, but it must be stable (not body-axis dependent).
    const worldRefA = new THREE.Vector3(0, 1, 0);
    const worldRefB = new THREE.Vector3(0, 0, 1);

    let north = worldRefA.clone().projectOnPlane(gravityUp);
    if (north.lengthSq() < 1e-10) {
        north = worldRefB.clone().projectOnPlane(gravityUp);
    }
    north.normalize();

    let east = new THREE.Vector3().crossVectors(gravityUp, north);
    if (east.lengthSq() < 1e-10) {
        east = new THREE.Vector3(1, 0, 0).projectOnPlane(gravityUp);
    }
    east.normalize();

    // Re-orthogonalize north (guards against precision drift)
    north = new THREE.Vector3().crossVectors(east, gravityUp).normalize();

    // Base forward: north (arbitrary but stable). Yaw rotates around gravityUp.
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(gravityUp, surfaceState.yaw);
    const forwardYawed = north.clone().applyQuaternion(yawQuat).normalize();

    // Right handed basis for pitch.
    const right = new THREE.Vector3().crossVectors(forwardYawed, gravityUp).normalize();
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, surfaceState.pitch);
    const forward = forwardYawed.clone().applyQuaternion(pitchQuat).normalize();

    const lookAtTarget = surfacePoint.clone().add(forward.multiplyScalar(1000));

    camera.position.copy(surfacePoint);
    camera.up.copy(gravityUp);
    camera.lookAt(lookAtTarget);
}

// Mouse look (RMB) while in surface mode: yaw/pitch, with pitch clamp.
function onSurfaceMouseMove(event) {
    if (!surfaceState.isActive) return;

    // Only apply surface look while RMB is held AND we're not pointer-locked.
    // (Pointer lock can feed very large deltas on some systems and makes surface mode feel "spun up".)
    const rmbDown = (event.buttons & 2) === 2;
    if (!rmbDown) return;
    if (document.pointerLockElement === renderer.domElement) return;

    const dx = event.movementX || 0;
    const dy = event.movementY || 0;

    surfaceState.yaw -= dx * surfaceState.lookSensitivity;
    surfaceState.pitch -= dy * surfaceState.lookSensitivity;
    surfaceState.pitch = THREE.MathUtils.clamp(
        surfaceState.pitch,
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01
    );
}

window.addEventListener('mousemove', onSurfaceMouseMove, { passive: true });

mainPanel.on('surfaceCameraToggle', () => {
    if (surfaceState.isActive) {
        exitSurfaceMode();
        updateSurfaceButtonEnabled();
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

    if (!isSurfaceEligibleBody(selected)) return;
    enterSurfaceMode(selected);
    updateSurfaceButtonEnabled();
});

mainPanel.on('freeCameraToggle', () => {
    // If turning on free camera, surface mode must exit.
    if (!surfaceState.isActive) {
        // noop
    } else {
        exitSurfaceMode();
    }

    isFreeCameraMode = !isFreeCameraMode;
    cameraState.isFreeCameraMode = isFreeCameraMode;
    mainPanel.setFreeCameraState(isFreeCameraMode);

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
        mainPanel.setLookAtState(false);

        controls.enabled = false;
    } else {
        // Turning OFF free camera behaves like Look At is OFF:
        // orbit/zoom around the scene center (0,0,0)
        cameraState.isLookAtMode = false;
        mainPanel.setLookAtState(false);

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
    managementPanel.setSelectedBody(selected);

    refreshBodiesTable();
    updateSurfaceButtonEnabled();
    forceHintRefresh();
});

mainPanel.on('zoomIn', () => {
    zoomIn();
});

mainPanel.on('zoomOut', () => {
    zoomOut();
});

mainPanel.on('lockToSunChange', ({ checked }) => {
    // Lock to sun checkbox - logic is already in animation loop
    // No additional action needed, just checked in the render loop
});

mainPanel.on('shadowsChange', ({ checked }) => {
    toggleShadows(checked);
});

managementPanel.on('kuiperBeltChange', ({ checked }) => {
    if (typeof kuiperBeltPoints !== 'undefined' && kuiperBeltPoints) {
        kuiperBeltPoints.visible = checked;
    }
});

const enableSkydomeCheckbox = document.getElementById('enableSkydome');
if (enableSkydomeCheckbox) {
    enableSkydomeCheckbox.onchange = () => {
        skydome.visible = enableSkydomeCheckbox.checked;
    };
}

mainPanel.on('trailsChange', ({ checked }) => {
    simulationState.bodies.forEach((body) => {
        if (body && body instanceof CelestialBody) {
            body.trail.visible = checked;
        }
    });
});

mainPanel.on('namesChange', ({ checked }) => {
    simulationState.bodies.forEach((body) => {
        if (body && body.label) {
            body.label.visible = checked;
            if (body.labelLine) {
                body.labelLine.visible = checked;
            }
        }
    });
});

mainPanel.on('timeScaleChange', ({ value }) => {
    const newSpeed = value;
    const direction = newSpeed < 0 ? ' REVERSE' : '';
    const absSpeed = Math.abs(newSpeed);
    if (isPaused) {
        // When paused, update the saved value that will be used on resume
        savedTimeScale = newSpeed;
        mainPanel.updateTimeScaleDisplay(
            '0.0x (PAUSED - next: ' + absSpeed + 'x' + direction + ')'
        );
    } else {
        // When running, immediately update the speed
        timeScale = newSpeed;
        mainPanel.updateTimeScaleDisplay(absSpeed + 'x' + direction);
    }
});

mainPanel.on('pause', () => {
    togglePause();
});

mainPanel.on('reset', () => {
    // Auto-close management UI and show launcher with Cancel
    managementPanel.hide();
    startupModal.open({ allowCancel: true });
});

mainPanel.on('manageSystem', () => {
    managementPanel.toggle();
});

// Manual selection from Bodies table
mainPanel.on('manualBodySelect', ({ body }) => {
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
        mainPanel.setFreeCameraState(true);
        controls.enabled = false;
    }

    // Selecting from the table should always refresh hints (selection-driven).
    setFocusBody(body, { zoom: cameraState.isLookAtMode });
    forceHintRefresh();

    // Gizmo visibility controlled by Target toggle
    if (cameraState.isTargetMode) {
        gizmo.attach(body);
    } else {
        gizmo.attach(null);
    }
    managementPanel.setSelectedBody(body);
});

// TARGET button (toggle):
// - OFF: selecting bodies does NOT show gizmo, but selection still works
// - ON: selected body shows gizmo (and switching selection moves gizmo)
// - Must NOT auto zoom/focus the camera
mainPanel.on('targetToggle', () => {
    const turningOn = !cameraState.isTargetMode;
    cameraState.isTargetMode = turningOn;
    mainPanel.setTargetState(turningOn);

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
            managementPanel.setSelectedBody(b);
        }
    } else {
        // Hide gizmo but keep selection
        gizmo.attach(null);
    }

    // Target toggle changes the "selected body" hint line, so force a refresh.
    forceHintRefresh();
});

// LOOK AT button (toggle): when enabled, orbit/zoom around selected body.
// When disabled, behave like "None camera": orbit/zoom around the scene center.
mainPanel.on('lookAtToggle', () => {
    // Turning Look At ON/OFF exits surface mode (mutually exclusive camera behaviors).
    if (surfaceState?.isActive) {
        exitSurfaceMode();
        updateSurfaceButtonEnabled();
    }
    const turningOn = !cameraState.isLookAtMode;
    // Look-at changes hint context (and camera focus behavior) so refresh.
    // We'll also refresh again after any selection changes.
    forceHintRefresh();

    // If we are turning Look At ON while Free Camera is ON, we implicitly disable Free Camera.
    // That transition must also refresh the hint (Free Camera hint -> Look At/selection hint).
    if (turningOn && isFreeCameraMode) {
        isFreeCameraMode = false;
        cameraState.isFreeCameraMode = false;
        mainPanel.setFreeCameraState(false);
        controls.enabled = true;
        forceHintRefresh();
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
            mainPanel.setFreeCameraState(false);
            controls.enabled = true;
        }

        cameraState.isLookAtMode = true;
        mainPanel.setLookAtState(true);

        // If no body is selected, behave like "auto look-at": keep center orbit until selection.
        if (!b) {
            cameraState.focusBody = null;
            controls.enabled = true;
            controls.target.copy(NONE_FOCUS_POSITION);
            controls.update();
            camera.lookAt(NONE_FOCUS_POSITION);

            // No selection => no gizmo attachment (Target still governs showing it later)
            gizmo.attach(null);
            managementPanel.setSelectedBody(null);
            refreshBodiesTable();
            return;
        }

        // Only show gizmo if Target is ON
        if (cameraState.isTargetMode) {
            gizmo.attach(b);
        } else {
            gizmo.attach(null);
        }
        managementPanel.setSelectedBody(b);

        setFocusBody(b, { zoom: true });
    } else {
        cameraState.isLookAtMode = false;
        mainPanel.setLookAtState(false);

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
managementPanel.on(
    'createBody',
    ({
        bodyType,
        planetType,
        orbitType,
        orbitalAngle,
        inclination,
        hasAtmosphere,
        customMass,
        customTemperature,
        customLightIntensity,
        customRadius,
    }) => {
        createNewBody(
            bodyType,
            planetType,
            orbitType,
            orbitalAngle,
            inclination,
            hasAtmosphere,
            customMass,
            customTemperature,
            customLightIntensity,
            customRadius
        );
        refreshBodiesTable();
    }
);

// Preset bodies (canonical solar-system objects)
managementPanel.on('createPresetBody', ({ presetKey }) => {
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

function keepCameraDistanceOnBodyScaleChange(body, oldRadius, newRadius) {
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

managementPanel.on('deleteBody', () => {
    deleteSelectedBody({ source: 'ui' });
});

managementPanel.on(
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
    }) => {
        if (!body || !simulationState.bodies.includes(body) || body._isDisposed) return;

        // Update name
        if (name !== null && name !== '') {
            body.updateLabel(name);
            // Update just the edit form label without repopulating the entire form
            if (managementPanel.editBodyName) {
                managementPanel.editBodyName.textContent = body.name;
            }
        }

        // Update mass
        // If this is a star, enforce minimum mass (0.08 solar masses)
        if (isBodyType(body, BodyType.Star)) {
            mass = Math.max(mass, MIN_STAR_MASS);
        }
        body.mass = mass;

        // Refill fuel for stars based on new mass
        if (isBodyType(body, BodyType.Star) && body.fuel !== null) {
            body.maxFuel = mass * 100000;
            body.fuel = body.maxFuel;
            // Reset to initial state (in case it was in red giant phase)
            body.initialMass = mass;
            body.temperature = body.temperature || 5778;
        }

        // Star-only updates (temperature, light) — radius handled globally below
        if (isBodyType(body, BodyType.Star)) {
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
                isBodyType(body, BodyType.Asteroid) &&
                typeof body.mass === 'number' &&
                body.mass < 1;

            if (managementPanel && managementPanel.editRadiusSlider) {
                const oldRadiusAll = body.radius || 1;
                const newRadiusAll = parseFloat(managementPanel.editRadiusSlider.value);
                if (!isNaN(newRadiusAll) && isFinite(newRadiusAll)) {
                    if (isLowMassAsteroid) {
                        body.mass = mass;
                        if (body === selectedBody) refreshSelectionVisuals();
                    } else {
                        setBodyRadius(body, newRadiusAll);
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

        // Apply new trajectory (velocity, orbital angle, and inclination)
        if (velocity !== undefined && orbitalAngle !== undefined && inclination !== undefined) {
            // Convert angles to radians
            const angleRad = (orbitalAngle * Math.PI) / 180;
            const inclinationRad = (inclination * Math.PI) / 180;

            // Create velocity vector based on angle and inclination
            // Start with velocity in the XZ plane
            const horizontalSpeed = velocity * Math.cos(inclinationRad);
            const verticalSpeed = velocity * Math.sin(inclinationRad);

            // Set velocity components
            body.velocity.x = horizontalSpeed * Math.cos(angleRad);
            body.velocity.y = verticalSpeed;
            body.velocity.z = horizontalSpeed * Math.sin(angleRad);
        }

        // Apply color change if provided and if body is not a star
        if (color && !isBodyType(body, BodyType.Star)) {
            try {
                // Convert hex string to THREE.Color
                const col = new THREE.Color(color);
                if (body.mesh && body.mesh.material) {
                    body.mesh.material.color.set(col);
                }
                if (body.baseColor) body.baseColor.set(col);
            } catch (e) {
                console.error('Error applying body color edit:', e);
            }
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
            statsSprite.material.map.dispose();
            statsSprite.material.map = createStatsTexture(selectedBody, simulationState.bodies);
            statsSprite.material.needsUpdate = true;
        }
    });
}

function deleteSelectedBody({ source = 'unknown' } = {}) {
    if (!selectedBody || !simulationState.bodies.includes(selectedBody) || selectedBody._isDisposed)
        return false;
    const bodyToDelete = selectedBody;

    // Check if this body is the camera's current focus (legacy id check kept)
    const wasCameraTarget = bodyToDelete.id === focusID;

    // For stars: delete immediately with NO supernova / black hole.
    // (Natural star death still triggers those effects via the fuel system.)
    const deletingStar = isBodyType(bodyToDelete, BodyType.Star);

    if (deletingStar) {
        // Star.die(true) is the single cleanup path (no supernova/black hole for manual deletion).
        bodyToDelete.die(true);

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
            addEvent?.('Sun deleted');
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

        addEvent?.(`${bodyToDelete.name} deleted`);

        if (wasCameraTarget) {
            setF('camNone');
            controls.enabled = true;
            controls.target.set(0, 0, 0);
            controls.mouseButtons.RIGHT = null;
            triggerZoom('camNone');
        }
    }

    // Update UI selection state (match existing empty-space click behavior)
    selectedBody = null;
    managementPanel?.setSelectedBody?.(null);
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

        updateVelocityArcs();
        // Prevent the key from doing anything else
        e.preventDefault();
        return;
    }

    if (key === 'w') {
        keys.w = true;
    }
    if (key === 'a') {
        keys.a = true;
    }
    if (key === 's') {
        keys.s = true;
    }
    if (key === 'd') {
        keys.d = true;
    }
    if (key === 'c') keys.c = true;
    if (key === ' ') {
        keys.space = true;
    }
    if (key === 'shift') {
        keys.shift = true;
    }

    // Delete key to remove selected body
    if (key === 'delete') {
        deleteSelectedBody({ source: 'keyboard' });
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w') keys.w = false;
    if (key === 'a') keys.a = false;
    if (key === 's') keys.s = false;
    if (key === 'd') keys.d = false;
    if (key === 'c') keys.c = false;
    if (key === ' ') keys.space = false;
    if (key === 'shift') keys.shift = false;

    if (key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown') {
        if (!isChangingVelocity && !isMiddleMouseVelocity && !isRepositioning) {
            hidePositionIndicators();
            velocityArcXZ.visible = false;
            velocityArcY.visible = false;
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
        if (uiContainer && e.target && uiContainer.contains(e.target)) {
            return;
        }

        // Disable wheel zoom while dragging gizmos (position or velocity).
        // Wheel zoom during a drag causes unstable interaction / weird cursor-plane mapping.
        if (isRepositioning || isChangingVelocity || isMiddleMouseVelocity) {
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
    updateArcResolution();

    // Reposition FPS counter
    if (fpsSprite) {
        fpsSprite.position.set(window.innerWidth / 2 - 110, window.innerHeight / 2 - 30, 0);
    }

    // Reposition stats display
    if (statsSprite) {
        statsSprite.position.set(window.innerWidth / 2 - 255, window.innerHeight / 2 - 270, 0);
    }

    // Reposition hint display (top-center)
    if (hintSprite) {
        hintSprite.position.set(0, window.innerHeight / 2 - 55, 0);
    }

    // Reposition event log
    if (eventLogSprite) {
        eventLogSprite.position.set(-window.innerWidth / 2 + 300, -window.innerHeight / 2 + 125, 0);
    }
});

// Apply initial background visibility (pre-launch view): kuiper off
if (typeof kuiperBeltPoints !== 'undefined' && kuiperBeltPoints) kuiperBeltPoints.visible = false;
if (managementPanel.enableKuiperBeltCheckbox)
    managementPanel.enableKuiperBeltCheckbox.checked = false;

if (skydome) skydome.visible = true;
if (enableSkydomeCheckbox) enableSkydomeCheckbox.checked = true;

function handleBodyBecameInvalid(body) {
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
            mainPanel?.setLookAtState(false);
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
    if (managementPanel && managementPanel.selectedBody === body) {
        managementPanel.setSelectedBody(null);
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

window.addEventListener('body:removed', (e) => {
    handleBodyBecameInvalid(e?.detail?.body);
    refreshBodiesTable();
});

window.addEventListener('body:dead', (e) => {
    const body = e?.detail?.body;
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
    managementPanel.setSelectedBody(null);
    refreshBodiesTable();
});

// --- Startup modal wiring ---
function applyDefaultCameraTogglesAfterSpawn() {
    // Default behavior:
    // - Target ON (so gizmo appears once a body is selected)
    // - Look At ON (button shows active), but with NO pre-selected body
    //   so camera still behaves like center-orbit until the user selects a body.
    cameraState.isTargetMode = true;
    mainPanel.setTargetState(true);

    cameraState.isLookAtMode = true;
    mainPanel.setLookAtState(true);

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
    syncPrimaryStarLightTarget();

    // No selection => no gizmo attachment yet.
    gizmo.attach(null);
    managementPanel.setSelectedBody(null);
    refreshBodiesTable();

    // Hint text depends on toggle state (Target/Look At).
    forceHintRefresh();
}

startupModal.on('launchDefault', () => {
    managementPanel.hide();
    startupModal.hide();
    spawn({ mode: SimulationStartMode.Default });
    applyDefaultCameraTogglesAfterSpawn();
});

startupModal.on('launchEmpty', () => {
    managementPanel.hide();
    startupModal.hide();
    spawn({ mode: SimulationStartMode.Empty });
    applyDefaultCameraTogglesAfterSpawn();
});

startupModal.on('cancel', () => {
    startupModal.hide();
});

// Block input while modal visible
const _origOnMouseDown = onMouseDown;
const _origOnMouseMove = onMouseMove;
const _origOnMouseUp = onMouseUp;

function modalBlocksInput() {
    return startupModal.isVisible();
}

function onMouseDownWrapped(e) {
    if (modalBlocksInput()) return;
    return _origOnMouseDown(e);
}
function onMouseMoveWrapped(e) {
    if (modalBlocksInput()) return;
    return _origOnMouseMove(e);
}
function onMouseUpWrapped(e) {
    if (modalBlocksInput()) return;
    return _origOnMouseUp(e);
}

window.removeEventListener('mousedown', onMouseDown);
window.removeEventListener('mousemove', onMouseMove);
window.removeEventListener('mouseup', onMouseUp);
window.addEventListener('mousedown', onMouseDownWrapped);
window.addEventListener('mousemove', onMouseMoveWrapped);
window.addEventListener('mouseup', onMouseUpWrapped);

window.addEventListener(
    'keydown',
    () => {
        if (modalBlocksInput()) return;
    },
    true
);

// Show modal initially; simulation starts after user choice
startupModal.open({ allowCancel: false });
refreshBodiesTable();
animate();
