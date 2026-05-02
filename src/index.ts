import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

// Tell typescript about our custom events that has detail property
declare global {
    interface WindowEventMap {
        'body:added': CustomEvent<{ body: Body; id: string; name: string }>;
        'body:removed': CustomEvent<{ body: Body; id: string; name: string }>;
        'body:selected': CustomEvent<{ body: Body; id: string; name: string }>;
        'body:deselected': CustomEvent<{ body: Body; id: string; name: string }>;
        'camera:focusChanged': CustomEvent<{
            body: Body | null;
            id: string | null;
            name: string | null;
        }>;
    }

    interface Event {
        detail?: { body: Body; id: string; name: string };
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
    SUN_RADIUS,
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
    VESTA_MASS,
    VESTA_DISTANCE,
    VESTA_RADIUS,
    PALLAS_MASS,
    PALLAS_DISTANCE,
    PALLAS_RADIUS,
    HYGIEA_MASS,
    HYGIEA_DISTANCE,
    HYGIEA_RADIUS,
    SimulationStartMode,
} from './utilities/consts.js';
import { CoordinateGizmo } from './gizmos/coordinate-gizmo.js';
import {
    isBodyType,
    pickRandom,
    createUniqueId,
    BodyTypeEnum,
} from './utilities/utilities.js';
import { calculateTrajectory } from './physics/physics.js';
import { loadSrgbTexture, fictionalTextures } from './drawing/textures.js';
import { Supernova } from './effects/supernova.js';
import { ParticleExplosion } from './effects/particle-explosion.js';
import { WarpEffect } from './effects/warp-effect.js';
import { triggerScreenFlash } from './effects/screen-flash.js';
import { GravitationalLensingEffect } from './effects/gravitational-lensing.js';
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
import { Ceres } from './bodies/ceres.js';
import { BlackHole } from './bodies/black-hole.js';
import { Star } from './bodies/star';
import { Asteroid } from './bodies/asteroid.js';
import { Comet } from './bodies/comet.js';

import { Spaceship } from './bodies/spaceship.js';
import { MainPanel } from './ui/main-panel.js';
import { ManagementPanel } from './ui/management-panel.js';
import { FlightControlsPanel } from './ui/flight-controls-panel.js';
import { StartupModal } from './ui/startup-modal.js';
import { AboutModal } from './ui/about-modal.js';
import { EventLogEntry } from './event-log/event-log.js';
import { Halley } from './bodies/halley.js';
import { IStateDependencies } from './interfaces.js';

const jupiterTexture = loadSrgbTexture('./assets/textures/jupiter.jpg');
const saturnTexture = loadSrgbTexture('./assets/textures/saturn.jpg');
const uranusTexture = loadSrgbTexture('./assets/textures/uranus.jpg');
const neptuneTexture = loadSrgbTexture('./assets/textures/neptune.jpg');
const plutoTexture = loadSrgbTexture('./assets/textures/pluto.jpg');
const ceresTexture = loadSrgbTexture('./assets/textures/ceres.jpg');
const sunTexture = loadSrgbTexture('./assets/textures/sun.jpg');
const blueStarTexture = loadSrgbTexture('./assets/textures/blue-star.jpg');
const redStarTexture = loadSrgbTexture('./assets/textures/red-star.jpg');
const orangeStarTexture = loadSrgbTexture('./assets/textures/orange_star.jpg');
const whiteStarTexture = loadSrgbTexture('./assets/textures/white_star.jpg');
const whiteDwarfTexture = loadSrgbTexture('./assets/textures/white_dwarf.jpg');
const brownDwarfTexture = loadSrgbTexture('./assets/textures/brown_dwarf.jpg');

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
 * Set the visual radius for any body. Delegates to the body's setRadius method.
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

    body.setRadius(newRadius);
}

function collisionScoreEscapeVelocity(body: Body) {
    // Winner heuristic: compare escape velocity (constants cancel):
    //   v_esc = sqrt(2GM/R)  => ordering is equivalent to M/R
    const m = Math.max(0, body?.mass || 0);
    const r = Math.max(
        1e-6,
        typeof body?.radius === 'number' && isFinite(body.radius) && body.radius > 0
            ? body.radius
            : 0
    );

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

// Flight speed HUD texture — drawn in the same style as the FPS counter
function createSpeedTexture(
    speed: number,
    isBoosting: boolean,
    pos?: THREE.Vector3,
    vel?: THREE.Vector3,
    isWarp = false
) {
    const hasExtra = !!(pos && vel);
    // Canvas is sized so that sprite scale = canvas × 0.625 matches the FPS counter pixel density.
    // 640×640 canvas → 400×400 sprite pixels on screen.
    const W = 640;
    const H = hasExtra ? 640 : 200;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const color = isWarp ? '#ff4488' : isBoosting ? '#ff9944' : '#00ffcc';
    const glow = isWarp
        ? 'rgba(255,68,136,0.9)'
        : isBoosting
          ? 'rgba(255,153,68,0.85)'
          : 'rgba(0,255,204,0.85)';
    const dim = 'rgba(0,255,204,0.5)';

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // ── Speed ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = color;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
    ctx.font = '36px monospace';
    ctx.fillText(isWarp ? 'WARP' : isBoosting ? 'BOOST' : 'SPEED', W - 24, hasExtra ? 44 : 56);

    ctx.shadowBlur = 28;
    ctx.font = 'bold 68px monospace';
    ctx.fillText(Math.abs(speed).toFixed(1), W - 24, hasExtra ? 120 : 140);

    if (hasExtra) {
        const lh = 56; // canvas-pixel line height for data rows

        // ── Position ──────────────────────────────────────────────────────────
        let y = 194;
        ctx.shadowBlur = 8;
        ctx.font = '32px monospace';
        ctx.fillStyle = dim;
        ctx.shadowColor = dim;
        ctx.fillText('POSITION', W - 24, y);
        y += lh;

        ctx.shadowBlur = 16;
        ctx.font = '34px monospace';
        ctx.fillStyle = color;
        ctx.shadowColor = glow;
        ctx.fillText(`X  ${pos!.x.toFixed(1)}`, W - 24, y);
        y += lh;
        ctx.fillText(`Y  ${pos!.y.toFixed(1)}`, W - 24, y);
        y += lh;
        ctx.fillText(`Z  ${pos!.z.toFixed(1)}`, W - 24, y);
        y += lh + 12;

        // ── Velocity ──────────────────────────────────────────────────────────
        ctx.shadowBlur = 8;
        ctx.font = '32px monospace';
        ctx.fillStyle = dim;
        ctx.shadowColor = dim;
        ctx.fillText('VELOCITY', W - 24, y);
        y += lh;

        ctx.shadowBlur = 16;
        ctx.font = '34px monospace';
        ctx.fillStyle = color;
        ctx.shadowColor = glow;
        ctx.fillText(`X  ${vel!.x.toFixed(2)}`, W - 24, y);
        y += lh;
        ctx.fillText(`Y  ${vel!.y.toFixed(2)}`, W - 24, y);
        y += lh;
        ctx.fillText(`Z  ${vel!.z.toFixed(2)}`, W - 24, y);
    }

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

// Event log system for tracking body deaths
const eventLog: EventLogEntry[] = [];
const MAX_EVENTS = 5;
const EVENT_DISPLAY_TIME = 5000; // Show for 5 seconds
const EVENT_FADE_START = 3000; // Start fading after 3 seconds

function addEvent(message: string) {
    eventLog.push(new EventLogEntry(message));
    // Keep only recent events
    while (eventLog.length > MAX_EVENTS) {
        eventLog.shift();
    }
}

function createEventLogTexture() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;

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

let eventLogSprite: THREE.Sprite | null = null;
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
const CROSSHAIR_SIZE = 10; // half-arm length in screen pixels
const crosshairPositions = new Float32Array([
    -CROSSHAIR_SIZE,
    0,
    0,
    CROSSHAIR_SIZE,
    0,
    0, // horizontal arm
    0,
    -CROSSHAIR_SIZE,
    0,
    0,
    CROSSHAIR_SIZE,
    0, // vertical arm
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

// End-circle marker at the pointer end of the steering line.
const steeringEndMarker = new THREE.Mesh(
    new THREE.RingGeometry(4, 6, 24),
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

// (Ship engine trail is owned by each Spaceship via its ShipTrail property)

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
    showNames: false,
};

// --- Flight mode state ---
const flightState = {
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
};

// --- Autopilot state ---
type AutopilotPhase = 'WARP_CHARGING' | 'WARP' | 'APPROACH' | 'BRAKE' | 'CIRCULARIZE';
const autopilotState = {
    isActive: false,
    targetBody: null as Body | null,
    phase: null as AutopilotPhase | null,
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

// Flight tuning constants
const FLIGHT_MAX_SPEED = 100 * SCALE_FACTOR; // normal max speed cap (units/s)
const FLIGHT_BOOST_MAX_SPEED = 10 * FLIGHT_MAX_SPEED; // boost ceiling = 10× normal max speed
const FLIGHT_THRUST_ACCEL = FLIGHT_MAX_SPEED / 10; // acceleration rate while W/S held (u/s²)
const FLIGHT_THRUST_DECEL = FLIGHT_MAX_SPEED / 10; // deceleration rate while W/S held (u/s²)
const FLIGHT_BOOST_ACCEL = FLIGHT_BOOST_MAX_SPEED / 10; // acceleration rate while Shift held (u/s²)
const FLIGHT_BOOST_DECEL = FLIGHT_BOOST_MAX_SPEED / 10; // decel rate after boost ends (u/s²)
const FLIGHT_WARP_SPEED = 10 * FLIGHT_BOOST_MAX_SPEED; // top warp speed (u/s) — FLIGHT_BOOST_MAX_SPEED already contains SCALE_FACTOR
const FLIGHT_WARP_DECEL = FLIGHT_WARP_SPEED / 2; // decel rate after warp ends (u/s²)
/** Camera distance (u) at which the warp tunnel is still fully opaque. */
const WARP_FULL_VIS_DIST = 50 * SCALE_FACTOR;
/** Camera distance (u) at which the warp tunnel has fully faded out. */
const WARP_FADE_DIST = 200 * SCALE_FACTOR;
/** Peak camera shake displacement (u) applied each frame during warp. */
const WARP_SHAKE_MAG = 0.002; // No scale factor here; shake is in camera-local space so should feel consistent at all scales.

// Autopilot tuning constants
/** Thrust acceleration used by autopilot during approach (u/s²). */
const AUTOPILOT_ACCEL = FLIGHT_THRUST_ACCEL;
/** Braking deceleration — moderate so the stop feels gradual rather than jarring. */
const AUTOPILOT_DECEL = FLIGHT_THRUST_DECEL;
/** High deceleration rate used to scrub boost speed quickly during approach.
 *  AUTOPILOT_DECEL alone would take 99,000 u to shed boost speed — BOOST_DECEL
 *  brings that down to a reasonable ~4,000 u. */
const AUTOPILOT_BOOST_DECEL = FLIGHT_BOOST_DECEL;
/** Orbit-insertion rate — gentler than AUTOPILOT_DECEL so the turn into orbit is
 *  visually smooth rather than a sharp snap.  Lower = longer arc, higher = snappier. */
const AUTOPILOT_CIRCULARIZE_RATE = 2 * SCALE_FACTOR;
/** Safety multiplier for the physics-derived minimum circularize rate.  Near massive bodies
 *  (like the Sun) gravity is strong enough to swallow the ship before it builds orbital
 *  velocity at the aesthetic rate above.  This factor scales a gravity-derived floor:
 *  effectiveRate = max(CIRCULARIZE_RATE, GRAVITY_MARGIN × v_orbit × sqrt(g / altitude))
 *  Raise to give more headroom; lower to allow a more gradual arc near large bodies. */
const AUTOPILOT_CIRCULARIZE_GRAVITY_MARGIN = 16 * SCALE_FACTOR;
/** Safety pad multiplier on brake distance. Higher = start braking earlier / more gradually.
 *  At 1.2 the ship begins braking at 1.2× the theoretical stopping distance — smooth
 *  but ends up at approximately orbitRadius + 0.2×stoppingDist from the target. */
const AUTOPILOT_BRAKE_PAD = 1.2;
/** Target orbit altitude expressed as a multiple of the target body's radius.
 *  1.5 = tight low orbit just above the surface (moon-like proximity). */
const AUTOPILOT_ORBIT_ALTITUDE_FACTOR = 1.5;
/** Relative-speed threshold at which BRAKE hands off to CIRCULARIZE (u/s). */
const AUTOPILOT_BRAKE_DONE_SPEED = 5 * SCALE_FACTOR;
/** Maximum timeScale at which autopilot may engage. Above this it refuses with a warning. */
const AUTOPILOT_MAX_TIMESCALE = 50;
/** Duration (seconds) to show the "Stable Orbit" HUD notification. */
const AUTOPILOT_ORBIT_NOTIFY_DURATION = 3.0;
// AUTOPILOT_BOOST_THRESHOLD is declared after the FLIGHT_* constants it depends on.

/** Rate at which cross-axis (gravity-accumulated) velocity decays while thrusting in simple mode.
 *  Higher = quicker normalisation. At 1.5 the perpendicular component halves in ~0.46 s. */
const FLIGHT_PERP_DECAY = 0.5; // per second
const FLIGHT_MAX_POINTER_OFFSET = 260; // pixels before reaching full turn rate
const FLIGHT_MAX_TURN_RATE = 0.6; // radians/s at full pointer deflection
const FLIGHT_ROLL_SPEED = 2.0; // max roll angular velocity (rad/s)
const FLIGHT_ROLL_ACCEL = 0.4; // how fast roll ramps up (rad/s²) — lower = slower start
const FLIGHT_ROLL_FRICTION = 0.4; // how fast roll decays when key released (rad/s²)
const FLIGHT_STEER_SMOOTHING = 0.004; // lerp factor per frame — lower = heavier feel
const FLIGHT_STEER_DEADZONE = 0.05; // normalised dead zone (0–1); input below this is zeroed
const FLIGHT_WARP_CHARGE_TIME = 2.0; // seconds to hold Space before warp engages

/** Maximum visual roll of ship relative to camera at full lateral mouse deflection (rad ~20°). */
const FLIGHT_MAX_BANK_ANGLE = 0.35;
/** Maximum visual pitch of ship relative to camera at full vertical mouse deflection (rad ~11.5°). */
const FLIGHT_MAX_BANK_PITCH = 0.2;
/** Per-frame lerp factor for banking animation. Higher = snappier return to neutral. */
const FLIGHT_BANK_LERP_RATE = 0.08;

/** Distance (u) above which autopilot switches to boost speed for faster transit.
 *  Computed as 1.5× the two-phase stopping distance: first shed boost speed at
 *  AUTOPILOT_BOOST_DECEL, then shed normal speed at AUTOPILOT_DECEL.  This
 *  guarantees the ship always has enough runway to fully brake before the orbit. */
const AUTOPILOT_BOOST_THRESHOLD =
    1.5 *
    ((FLIGHT_BOOST_MAX_SPEED * FLIGHT_BOOST_MAX_SPEED - FLIGHT_MAX_SPEED * FLIGHT_MAX_SPEED) /
        (2 * AUTOPILOT_BOOST_DECEL) +
        (FLIGHT_MAX_SPEED * FLIGHT_MAX_SPEED) / (2 * AUTOPILOT_DECEL));
/** Deceleration rate used to scrub warp speed during autopilot approach.
 *  Matches FLIGHT_WARP_DECEL so the feel is consistent with manual warp decel. */
const AUTOPILOT_WARP_DECEL = FLIGHT_WARP_DECEL;
/** Minimum runway (u) that APPROACH needs to safely brake from normal speed to a stop.
 *  When the gap between the ship and orbitRadius is shorter than this, autopilot skips
 *  APPROACH and enters BRAKE directly so the ship doesn't arrive with too much speed.
 *  Derived from: BRAKE_PAD × v² / (2 × decel) at FLIGHT_MAX_SPEED. */
const AUTOPILOT_APPROACH_MIN_DISTANCE =
    AUTOPILOT_BRAKE_PAD * ((FLIGHT_MAX_SPEED * FLIGHT_MAX_SPEED) / (2 * AUTOPILOT_DECEL));
/** Distance (u) above which autopilot engages warp for fast transit.
 *  Computed as 1.5× the stopping distance from warp speed down to boost speed,
 *  plus AUTOPILOT_BOOST_THRESHOLD (the runway still needed once warp ends). */
const AUTOPILOT_WARP_THRESHOLD =
    1.5 *
        ((FLIGHT_WARP_SPEED * FLIGHT_WARP_SPEED - FLIGHT_BOOST_MAX_SPEED * FLIGHT_BOOST_MAX_SPEED) /
            (2 * AUTOPILOT_WARP_DECEL)) +
    AUTOPILOT_BOOST_THRESHOLD;

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

// Physics accuracy: adjustable substeps per frame (16–128, default 64)
let stepsPerFrame = 64;

// --- Velocity editing arc helpers ---
// NOTE: We use Line2 (fat lines) because LineBasicMaterial.linewidth is ignored on most WebGL platforms.
const VEL_ARC_SEGMENTS = 64;
const VEL_ARC_COLOR = 0x00ff00;
const VEL_ARC_OPACITY = 0.25;
const VEL_ARC_ACTIVE_OPACITY = 0.35;
const VEL_ARC_LINEWIDTH_PX = 22;

// Arc is centered on the VELOCITY TIP (not the body), and its radius is based on body radius.
// This creates a "mouse path preview" near where the tip will sweep as you drag.
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

function calcVelArcRadius(body: Body) {
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
        0
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
        0
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
    speedSprite.position.set(window.innerWidth / 2 - 210, -(window.innerHeight / 2 - 210), 0);
    speedSprite.visible = false;
    uiScene.add(speedSprite);
}
createSpeedSprite();

// ── Warp HUD sprite ───────────────────────────────────────────────────────────
// Bottom-center canvas sprite. Shows progress bar while charging, pulsing
// "WARP ACTIVE" text once warp is engaged.
let warpSprite: THREE.Sprite | null = null;
const warpEffect = new WarpEffect(scene);

/** Renders the charging progress bar (fill = 0..1) with label above. */
function createWarpChargeTexture(fill: number): THREE.CanvasTexture {
    const W = 512,
        H = 128;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;

    // Label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 36px monospace';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = 'rgba(0,255,204,0.9)';
    ctx.fillText('INITIATING WARP', W / 2, 34);

    // Bar track
    const barX = 40,
        barY = 68,
        barW = W - 80,
        barH = 28;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,255,204,0.12)';
    ctx.strokeStyle = 'rgba(0,255,204,0.5)';
    ctx.lineWidth = 2;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeRect(barX, barY, barW, barH);

    // Bar fill — gradient cyan→white at tip
    if (fill > 0) {
        const fillW = barW * fill;
        const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
        grad.addColorStop(0, 'rgba(0,200,180,0.9)');
        grad.addColorStop(0.8, 'rgba(0,255,220,1.0)');
        grad.addColorStop(1, 'rgba(255,255,255,1.0)');
        ctx.fillStyle = grad;
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(0,255,204,0.9)';
        ctx.fillRect(barX, barY, fillW, barH);
        ctx.shadowBlur = 0;
    }

    // Percentage label inside bar
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowBlur = 0;
    ctx.fillText(`${Math.round(fill * 100)}%`, W / 2, barY + barH / 2);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

/** Renders the pulsing "WARP ACTIVE" text (pulse = 0..1 sine wave). */
function createWarpActiveTexture(pulse: number): THREE.CanvasTexture {
    const W = 512,
        H = 96;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;

    const alpha = 0.55 + 0.45 * pulse; // 0.55–1.0
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 52px monospace';
    ctx.shadowBlur = 20 + 20 * pulse;
    ctx.shadowColor = `rgba(255,120,0,${alpha})`;
    ctx.fillStyle = `rgba(255,${Math.round(180 + 75 * pulse)},0,${alpha})`;
    ctx.fillText('⚡ WARP ACTIVE ⚡', W / 2, H / 2);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

function createWarpSprite() {
    const texture = createWarpChargeTexture(0);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    warpSprite = new THREE.Sprite(material);
    // 512×128 canvas at 0.625 ratio → 320×80 screen pixels; center at bottom
    warpSprite.scale.set(320, 80, 1);
    warpSprite.position.set(0, -(window.innerHeight / 2 - 50), 0);
    warpSprite.visible = false;
    uiScene.add(warpSprite);
}
createWarpSprite();

// ── Autopilot phase-status HUD sprite ───────────────────────────────────────
// Shows the current autopilot phase while active, and a brief "STABLE ORBIT"
// confirmation for AUTOPILOT_ORBIT_NOTIFY_DURATION seconds after completion.
let orbitNotifySprite: THREE.Sprite | null = null;

type AutopilotHudState =
    | 'APPROACH_WARP'
    | 'APPROACH_BOOST'
    | 'APPROACH'
    | 'BRAKE'
    | 'CIRCULARIZE'
    | 'ORBIT'
    | 'NONE';
let _lastAutopilotHudState: AutopilotHudState = 'NONE';

function createAutopilotPhaseTexture(
    state: AutopilotHudState,
    distanceLabel = ''
): THREE.CanvasTexture {
    // Canvas is deliberately wide (800px) so no label ever clips.
    // Two rows: phase label on top, distance on the bottom.
    const W = 900,
        H = 100;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let text: string;
    let color: string;
    let glow: string;
    switch (state) {
        case 'APPROACH_WARP':
            text = '⚡  AUTOPILOT: WARPING';
            color = '#ff4488';
            glow = 'rgba(255,68,136,0.9)';
            break;
        case 'APPROACH_BOOST':
            text = '▶▶  AUTOPILOT: APPROACHING TARGET (BOOST)';
            color = '#ff9944';
            glow = 'rgba(255,153,68,0.85)';
            break;
        case 'APPROACH':
            text = '▶  AUTOPILOT: APPROACHING TARGET';
            color = '#00ffcc';
            glow = 'rgba(0,255,204,0.85)';
            break;
        case 'BRAKE':
            text = '◼  AUTOPILOT: ESTABLISHING ORBIT TRAJECTORY';
            color = '#00ffcc';
            glow = 'rgba(0,255,204,0.85)';
            break;
        case 'CIRCULARIZE':
            text = '↻  AUTOPILOT: ENTERING ORBIT';
            color = '#00ffcc';
            glow = 'rgba(0,255,204,0.85)';
            break;
        case 'ORBIT':
            text = '✓  STABLE ORBIT ESTABLISHED';
            color = '#7ef0ff';
            glow = 'rgba(100,220,255,0.9)';
            break;
        default:
            text = '';
            color = '#ffffff';
            glow = 'transparent';
    }

    // Phase label
    ctx.font = 'bold 34px monospace';
    ctx.shadowBlur = 14;
    ctx.shadowColor = glow;
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, 34);

    // Distance sub-label
    if (distanceLabel) {
        ctx.font = '24px monospace';
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.fillText(distanceLabel, W / 2, 72);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

function createOrbitNotifySprite() {
    const material = new THREE.SpriteMaterial({
        map: createAutopilotPhaseTexture('NONE'),
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    orbitNotifySprite = new THREE.Sprite(material);
    // 800×100 canvas → 800×80 screen-pixel sprite (two-line display).
    orbitNotifySprite.scale.set(800, 80, 1);
    orbitNotifySprite.position.set(0, -(window.innerHeight / 2 - 120), 0);
    orbitNotifySprite.visible = false;
    uiScene.add(orbitNotifySprite);
}
createOrbitNotifySprite();

function showOrbitNotifySprite() {
    if (!orbitNotifySprite) return;
    orbitNotifySprite.visible = true;
    autopilotState.orbitNotifyTimer = AUTOPILOT_ORBIT_NOTIFY_DURATION;
}

// --- Context hint system (top-center HUD text) ---
let hintSprite: THREE.Sprite | null = null;
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

function createHintTexture({ lines }: { lines: string[] }) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to create canvas context for hint texture');

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
let gridHelper: THREE.GridHelper | null = null;
const gridState = {
    size: 0,
    divisions: 0,

    // While dragging, the grid is anchored at the body's position at drag start (but does not move after).
    dragAnchor: new THREE.Vector3(),

    // Base cell size to use for the drag session (fixed; derived from body radius at drag start).
    dragCellSize: null as number | null,

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

function createGridHelper({
    size,
    divisions,
    center,
}: {
    size: number;
    divisions: number;
    center: THREE.Vector3 | null;
}) {
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

function calcGridRequiredSize(targetBody: Body | null) {
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
    // Then EXPAND ONLY as the body moves away from the anchor.
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

function ensureGridHelperSizedToTarget(targetBody: Body | null) {
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
let yAxisIndicator: THREE.Line | null = null;
let yAxisRing: THREE.Mesh | null = null;
let velocityTipIndicator: THREE.Line | null = null;
let velocityTipRing: THREE.Mesh | null = null;

function createPositionIndicator(color: number) {
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

function updatePositionIndicator(
    line: THREE.Line | null,
    ring: THREE.Mesh | null,
    position: THREE.Vector3 | null
) {
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

function setIndicatorMode(mode: string) {
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

    const circularSpeed = Math.sqrt((G * parentMass) / distance);
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
    let newBody: CelestialBody | null = null;

    switch (key) {
        case 'sun': {
            // First star goes to world center; additional stars spawn near the camera.
            // Also treat an existing black hole as occupying the center so we don't
            // immediately destroy the new star by placing it at (0,0,0).
            const hasCentralBody =
                !!primaryStar ||
                simulationState.bodies.some(
                    (b) => b && !b._isDisposed && b instanceof BlackHole
                );
            const pos = hasCentralBody ? getNearCameraSpawnPos() : new THREE.Vector3(0, 0, 0);

            newBody = new Star(
                dependencies,
                scene,
                {
                    radius: SUN_RADIUS,
                    pos,
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
                    brownDwarfTexture,
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
            }

            newBody = earth.createMoon(scene, {
                distance: MOON_DIST_FROM_EARTH,
                radius: MOON_RADIUS,
                mass: MOON_MASS,
                id: createUniqueId('moon'),
                name: 'Moon',
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

function createNewBody(
    bodyType: string,
    planetType = 'solid',
    orbitType = 'circular',
    inclination = 0,
    hasAtmosphere = false,
    customMass: number | null = null,
    customTemperature: number | null = null,
    customLightIntensity: number | null = null,
    customRadius: number | null = null,
    orbitParent: Body | null = null
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
        const maxRadius = 200000 * SCALE_FACTOR;
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
                brownDwarfTexture,
            }
        );

        if (typeof customLightIntensity === 'number' && isFinite(customLightIntensity)) {
            try {
                newBody.setLightIntensity(customLightIntensity);
            } catch (e) {
                console.error('Error applying custom star light intensity:', e);
            }
        }
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
            ? BodyTypeEnum.GasGiant
            : isIceGiant
              ? BodyTypeEnum.IceGiant
              : BodyTypeEnum.Planet;

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
            spawnPos,
            spawnVel,
            planetMass,
            createUniqueId('planet'),
            generateIAUName(customPlanetBodyType),
            customPlanetBodyType,
            0x888888,
            3000,
            false,
            { axis: new THREE.Vector3(0, 1, 0), speed: 0.1 + Math.random() * 0.4 },
            undefined,
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
            const moonDistance = focusedBody.radius * 5 + Math.random() * focusedBody.radius * 10;

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
            const circularSpeed = Math.sqrt((G * focusedBody.mass) / moonDistance);
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

            newBody = new CelestialBody(
                dependencies,
                scene,
                moonRadius,
                0xffffff,
                moonSpawnPos,
                moonSpawnVel,
                moonMass,
                createUniqueId('moon'),
                generateIAUName(BodyTypeEnum.Moon, focusedBody),
                BodyTypeEnum.Moon,
                0x666666,
                1000,
                false,
                { axis: new THREE.Vector3(0, 1, 0), speed: 0.15 + Math.random() * 0.35 },
                undefined,
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

        newBody = new Asteroid(dependencies, scene, {
            pos: asteroidSpawnPos.toArray(),
            vel: asteroidVel.toArray(),
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
                pos: cometSpawnPos,
                vel: cometOrbitVel,
                mass: cometMass,
                id: createUniqueId('comet'),
                name: generateIAUName(BodyTypeEnum.Comet),
            },
            cometMaterial
        );
    } else if (bodyType === 'black_hole') {
        const bhSpawnPos = getNearCameraSpawnPos();

        // Mass: use customMass only if it meets the 3-solar-mass minimum
        const BH_MIN_MASS = 3 * SUN_MASS;
        const BH_MAX_MASS = 50 * SUN_MASS;
        const t = Math.random();
        const randomBhMass = BH_MIN_MASS * Math.pow(BH_MAX_MASS / BH_MIN_MASS, t);
        const bhMass =
            typeof customMass === 'number' && isFinite(customMass) && customMass >= BH_MIN_MASS
                ? customMass
                : randomBhMass;

        newBody = new BlackHole(
            dependencies,
            scene,
            bhSpawnPos,
            bhMass,
            createUniqueId('black_hole'),
            generateIAUName(BodyTypeEnum.BlackHole),
            { axis: new THREE.Vector3(0, 1, 0), speed: 0 }
        );

        // Apply custom radius if the user overrode the slider
        if (typeof customRadius === 'number' && isFinite(customRadius) && customRadius > 0) {
            setBodyRadius(newBody as unknown as CelestialBody, customRadius);
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

        // For moons: keep selection/focus on the parent so the user can keep adding
        // moons to the same body without re-selecting it each time.
        if (moonCreationParent) {
            managementPanel.setSelectedBody(moonCreationParent);
            setFocusBody(moonCreationParent, { zoom: false });
        } else {
            managementPanel.setSelectedBody(newBody);
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
            (explosion.flashSphere.material as THREE.MeshBasicMaterial)?.dispose();
        }
    });
    simulationState.explosions = [];

    // Clean up all supernova effects
    for (const supernova of supernovas) {
        supernova.dispose();
    }
    supernovas = [];

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

    // Recreate the primary star for default mode (local, not global)
    const sun = new Star(
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
            brownDwarfTexture,
        }
    );

    // Default mode: build the solar system
    simulationState.bodies = [sun];
    syncAllStarLightTargets();

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
            mass: MOON_MASS,
            id: 'camMoon',
            name: 'Moon',
            trailColor: 0xffffff,
            maxTrail: 1500,
        })
    );

    // Mars
    simulationState.bodies.push(new Mars(dependencies, scene));

    // Ceres - dwarf planet, ~2.77 AU
    simulationState.bodies.push(new Ceres(dependencies, scene, ceresTexture));

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
            mass: IO_MASS,
            id: 'camIo',
            name: 'Io',
            trailColor: 0xffdd77,
            maxTrail: 800,
            yVariation: 109,
        })
    );

    // Europa - Start at 90 degrees
    simulationState.bodies.push(
        jupiter.createMoon(scene, {
            angle: Math.PI / 2,
            distance: EUROPA_DIST_FROM_JUPITER,
            radius: EUROPA_RADIUS, // 0.899 × Moon
            mass: EUROPA_MASS,
            id: 'camEuropa',
            name: 'Europa',
            trailColor: 0xccddee,
            maxTrail: 1000,
            yVariation: 164,
        })
    );

    // Ganymede (largest moon in solar system) - Start at 180 degrees
    simulationState.bodies.push(
        jupiter.createMoon(scene, {
            angle: Math.PI,
            distance: GANYMEDE_DIST_FROM_JUPITER,
            radius: GANYMEDE_RADIUS, // 1.517 × Moon (largest moon!)
            mass: GANYMEDE_MASS,
            id: 'camGanymede',
            name: 'Ganymede',
            trailColor: 0xcccccc,
            maxTrail: 1200,
            yVariation: 219,
        })
    );

    // Callisto (outermost Galilean moon) - Start at 270 degrees
    simulationState.bodies.push(
        jupiter.createMoon(scene, {
            angle: (Math.PI * 3) / 2,
            distance: CALLISTO_DIST_FROM_JUPITER,
            radius: CALLISTO_RADIUS, // 1.387 × Moon
            mass: CALLISTO_MASS,
            id: 'camCallisto',
            name: 'Callisto',
            trailColor: 0xaa9988,
            maxTrail: 1500,
            yVariation: 273,
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

    // Initialise castShadow / receiveShadow on all newly spawned bodies so shadows work
    // immediately without requiring the user to toggle the checkbox.
    const shadowCheckbox = document.getElementById('enableShadows') as HTMLInputElement;
    toggleShadows(shadowCheckbox ? shadowCheckbox.checked : true);
}

function getAcc(p1: THREE.Vector3, p2: THREE.Vector3, m2: number) {
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
    // In flight mode: block all LMB interactions (selection, gizmo, velocity editing).
    // Only allow RMB (which just sets isMouseLookActive that flight mode ignores anyway).
    if (flightState.isActive && event.button !== 2) return;

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

function onMouseMove(event: MouseEvent) {
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
        gizmo.arrows.forEach((a) => ((a.line.material as THREE.LineBasicMaterial).opacity = 1.0));
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

    const minDist = Math.max(radius * 2.2, 10);
    const maxDist = MAX_ZOOM_OUT_DISTANCE;
    const worldRadius = body?.mesh ? body.mesh.position.length() + radius : radius;
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

function animate() {
    const now = performance.now();
    requestAnimationFrame(animate);
    const tScale = timeScale;
    const steps = stepsPerFrame;
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
        updateFlightControls(SIM.BASE_FRAME_DT);
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

        // Apply autopilot thrust impulse each substep so it scales correctly with timeScale.
        // Running once per frame at BASE_FRAME_DT would let the ship fly through brake zones
        // at high time-warp without ever triggering phase transitions.
        if (autopilotState.isActive) updateAutopilot(dt);

        // Apply accelerations to positions
        for (const body of simulationState.bodies) {
            if (body && !body._isDisposed && body.mesh && body.tempAcc) {
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
            if (b1 instanceof CelestialBody) b1.updateTrail();

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
                const brightness = Math.max(
                    minBrightness,
                    (referenceDistance * referenceDistance) / (distanceFromSun * distanceFromSun)
                );

                // Apply brightness to material color
                (body.mesh.material as THREE.MeshStandardMaterial).color
                    .copy(body.baseColor)
                    .multiplyScalar(brightness);
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

    // Keep steering end marker synced with the line endpoint
    if (flightState.isActive && flightSteeringLine.visible) {
        const endX = steeringLinePositions[3];
        const endY = steeringLinePositions[4];
        steeringEndMarker.position.set(endX, endY, 0);
        steeringEndMarker.visible = true;
    } else {
        steeringEndMarker.visible = false;
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
    const trailShip = flightState.activeShip ?? flightState.knownShip ?? null;

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
            dtTotal
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

    if (!isSurfaceModeActive && !isFreeCameraMode && !isFlightModeActive) {
        controls.update();
    }

    syncAllStarLightTargets();

    // Update hint sprite each frame (cheap; texture only updates when text changes)
    if (window.__updateHintSprite) {
        window.__updateHintSprite();
    }

    // Distance-fade the warp streaks based on camera proximity to the ship.
    // Speed-based opacity is handled inside warpEffect.update(); here we only
    // apply the distance multiplier and handle the case where no ship exists.
    const _visShip = flightState.activeShip ?? flightState.knownShip;
    if (_visShip && !_visShip._isDisposed && _visShip.mesh) {
        if (isFlightModeActive) {
            warpEffect.setOpacity(1.0);
        } else {
            const shipIsLookAtTarget =
                cameraState.isLookAtMode &&
                cameraState.focusBody !== null &&
                cameraState.focusBody === _visShip;
            if (shipIsLookAtTarget) {
                const dist = camera.position.distanceTo(_visShip.mesh.position);
                if (dist >= WARP_FADE_DIST) {
                    warpEffect.setOpacity(0.0);
                } else {
                    const t = Math.max(
                        0,
                        (dist - WARP_FULL_VIS_DIST) / (WARP_FADE_DIST - WARP_FULL_VIS_DIST)
                    );
                    warpEffect.setOpacity(1.0 - t);
                }
            } else {
                warpEffect.setOpacity(0.0);
            }
        }
    } else {
        warpEffect.setOpacity(0.0);
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
            statsSprite.material.map = createStatsTexture(selectedBody, simulationState.bodies);
            statsSprite.material.needsUpdate = true;
            statsSprite.visible = true;
        } else if (statsSprite) {
            statsSprite.visible = false;
        }

        // Autopilot phase status HUD — update canvas texture whenever the phase changes,
        // then hide the sprite once the stable-orbit timer expires.
        if (orbitNotifySprite) {
            // Determine desired HUD state
            let desiredHud: AutopilotHudState = 'NONE';
            if (autopilotState.isActive) {
                if (autopilotState.phase === 'WARP_CHARGING' || autopilotState.phase === 'WARP') {
                    desiredHud = 'APPROACH_WARP';
                } else if (autopilotState.phase === 'CIRCULARIZE') {
                    desiredHud = 'CIRCULARIZE';
                } else if (autopilotState.phase === 'BRAKE') {
                    desiredHud = 'BRAKE';
                } else if (autopilotState.isBoostActive) {
                    desiredHud = 'APPROACH_BOOST';
                } else {
                    desiredHud = 'APPROACH';
                }
            } else if (autopilotState.orbitNotifyTimer > 0) {
                desiredHud = 'ORBIT';
            }

            if (desiredHud === 'NONE') {
                orbitNotifySprite.visible = false;
                _lastAutopilotHudState = 'NONE';
            } else {
                orbitNotifySprite.visible = true;

                // Build distance label whenever autopilot is active.
                let distLabel = '';
                if (autopilotState.isActive && autopilotState.targetBody?.mesh) {
                    const ship = flightState.knownShip;
                    if (ship?.mesh) {
                        const dist = ship.mesh.position.distanceTo(
                            autopilotState.targetBody.mesh.position
                        );
                        // Format: show as integer with thousands separator, strip tiny noise.
                        const distRounded = Math.max(0, Math.round(dist));
                        distLabel = `Distance to target: ${distRounded.toLocaleString()} u`;
                    }
                }

                // Re-render canvas every frame while active (distance changes continuously),
                // but only on phase changes when the stable-orbit message is showing.
                const needsRedraw = autopilotState.isActive
                    ? true // distance always changes
                    : desiredHud !== _lastAutopilotHudState;

                if (needsRedraw) {
                    orbitNotifySprite.material.map?.dispose();
                    orbitNotifySprite.material.map = createAutopilotPhaseTexture(
                        desiredHud,
                        distLabel
                    );
                    orbitNotifySprite.material.needsUpdate = true;
                    _lastAutopilotHudState = desiredHud;
                }

                // Tick down the stable-orbit timer
                if (desiredHud === 'ORBIT') {
                    autopilotState.orbitNotifyTimer -= (now - lastT) / 1000;
                }
            }
        }

        // Update event log
        if (eventLogSprite) {
            eventLogSprite.material.map?.dispose();
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
    if (b.bodyType & BodyTypeEnum.BlackHole) return 'Black Hole';
    if (isBodyType(b, BodyTypeEnum.Star)) return 'Star';
    if (b.bodyType && b.bodyType & BodyTypeEnum.GasGiant) return 'Gas Giant';
    if (b.bodyType && b.bodyType & BodyTypeEnum.IceGiant) return 'Ice Giant';
    if (b.bodyType && b.bodyType & BodyTypeEnum.DwarfPlanet) return 'Dwarf Planet';
    if (b.bodyType && b.bodyType & BodyTypeEnum.Planet) return 'Planet';
    if (b.bodyType && b.bodyType & BodyTypeEnum.Moon) return 'Moon';
    if (b.bodyType && b.bodyType & BodyTypeEnum.Asteroid) return 'Asteroid';
    if (b.bodyType && b.bodyType & BodyTypeEnum.Comet) return 'Comet';
    if (b.bodyType && b.bodyType & BodyTypeEnum.SpaceShip) return 'Spaceship';
    return 'Unknown';
}

function refreshBodiesTable() {
    if (!mainPanel) return;

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
    mainPanel.setSelectedBody(selectedBody || manuallySelectedBody || null);
    mainPanel.renderBodiesTable(rows, hasShip, autopilotState.targetBody);

    // Surface camera enablement depends on selection, so keep it in sync.
    try {
        updateSurfaceButtonEnabled?.();
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
const startupModal = new StartupModal('startup-overlay');
const mainPanel = new MainPanel('ui-layer');
const aboutModal = new AboutModal('about-overlay', 'aboutBtn', 'aboutCloseBtn');
const managementPanel = new ManagementPanel('management-panel', {
    getFocusObject: () => {
        const body = cameraState.focusBody;
        return body && !body._isDisposed && simulationState.bodies.includes(body) ? body : null;
    },
});
const flightControlsPanel = new FlightControlsPanel('flight-controls-panel');

startupModal.initialize();
mainPanel.initialize();
aboutModal.initialize();
managementPanel.initialize();
flightControlsPanel.initialize();

// Wire Flight Controls button and panel events
{
    const flightControlsBtn = document.getElementById('flightControlsBtn');
    if (flightControlsBtn) {
        flightControlsBtn.onclick = () => {
            flightControlsPanel.toggle();
            // Update spawn button label to reflect whether there is a re-enterable ship
            updateFlightSpawnBtnLabel();
        };
    }
    flightControlsPanel.on('spawnShip', () => spawnShip());
    flightControlsPanel.on('toggleView', () => {
        flightState.isCockpitView = !flightState.isCockpitView;
        flightControlsPanel.setViewState(flightState.isCockpitView);
    });
    flightControlsPanel.on('exitFlight', () => exitFlightMode());

    // Autopilot toggle from the flight controls panel (targets currently selected body)
    flightControlsPanel.on('autopilot', () => {
        if (autopilotState.isActive) {
            cancelAutopilot('Autopilot disengaged.');
            return;
        }
        const target = selectedBody || manuallySelectedBody;
        if (!target || target._isDisposed) {
            addEvent('Autopilot: select a target body first.');
            return;
        }
        engageAutopilot(target);
    });

    // Advanced flight mode checkbox
    const advancedModeChk = document.getElementById(
        'flightAdvancedMode'
    ) as HTMLInputElement | null;
    if (advancedModeChk) {
        advancedModeChk.checked = flightState.isAdvancedMode;
        advancedModeChk.addEventListener('change', () => {
            flightState.isAdvancedMode = advancedModeChk.checked;
        });
    }
}

/** Update the spawn/re-enter button label based on whether a live ship exists. */
function updateFlightSpawnBtnLabel() {
    const btn = document.getElementById('flightSpawnBtn');
    if (!btn) return;
    const existing = flightState.knownShip;
    const canReenter =
        existing && !existing._isDisposed && simulationState.bodies.includes(existing);
    const iconEl = btn.querySelector('.material-symbols-outlined');
    if (iconEl) iconEl.textContent = canReenter ? 'login' : 'rocket_launch';
    while (iconEl && iconEl.nextSibling) btn.removeChild(iconEl.nextSibling);
    if (iconEl)
        btn.appendChild(document.createTextNode(canReenter ? ' ENTER SHIP' : ' SPAWN SPACESHIP'));
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
    const currentDist = Math.max(1, dir.length());
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
        Math.max(targetDistance * 2, targetDistance + 500000 * SCALE_FACTOR, maxDist)
    );

    const zoomInLimit =
        target && simulationState.bodies.includes(target) && !target._isDisposed ? 0.01 : 10;
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
    body: null as Body | null, // CelestialBody

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

function isSurfaceEligibleBody(body: Body | null) {
    if (!body || !simulationState.bodies.includes(body) || body._isDisposed || !body.mesh)
        return false;
    if (isBodyType(body, BodyTypeEnum.Star)) return false;
    if (body instanceof BlackHole) return false;
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

function enterSurfaceMode(body: Body | null) {
    if (!body) return;
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
function onSurfaceMouseMove(event: MouseEvent) {
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
                  FLIGHT_MAX_SPEED * FLIGHT_MAX_SPEED) /
                  (2 * AUTOPILOT_BOOST_DECEL) +
              (FLIGHT_MAX_SPEED * FLIGHT_MAX_SPEED) / (2 * AUTOPILOT_DECEL)
            : approachSpeed > FLIGHT_MAX_SPEED
              ? (approachSpeed * approachSpeed - FLIGHT_MAX_SPEED * FLIGHT_MAX_SPEED) /
                    (2 * AUTOPILOT_BOOST_DECEL) +
                (FLIGHT_MAX_SPEED * FLIGHT_MAX_SPEED) / (2 * AUTOPILOT_DECEL)
              : (approachSpeed * approachSpeed) / (2 * AUTOPILOT_DECEL);
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
        if (distance <= orbitRadius + brakeDistance) {
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

    if (autopilotState.phase === 'WARP_CHARGING') {
        // Reuse the same charge progress bar shown during manual warp.
        autopilotState.warpChargeTimer = Math.min(
            autopilotState.warpChargeTimer + dt,
            FLIGHT_WARP_CHARGE_TIME
        );
        const fill = autopilotState.warpChargeTimer / FLIGHT_WARP_CHARGE_TIME;
        if (warpSprite) {
            warpSprite.material.map?.dispose();
            warpSprite.material.map = createWarpChargeTexture(fill);
            warpSprite.material.needsUpdate = true;
            warpSprite.scale.set(320, 80, 1);
            warpSprite.visible = true;
        }
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
            if (warpSprite) warpSprite.visible = false;
            warpEffect.start();
            triggerScreenFlash(200, 0.01, 2.5);
            addEvent('⚡ Autopilot warp engaged.');
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
        const useBoost = distance > AUTOPILOT_BOOST_THRESHOLD;
        autopilotState.isBoostActive = useBoost;
        const targetSpeed = useBoost ? FLIGHT_BOOST_MAX_SPEED : FLIGHT_MAX_SPEED;

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
                    : approachSpeed > FLIGHT_MAX_SPEED
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
    } else if (autopilotState.phase === 'BRAKE') {
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

        const vOrbit = Math.sqrt((G * target.mass) / r);

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
        // Cap the inward speed to what AUTOPILOT_DECEL can stop in the available brakeSpan.
        // Without this cap, short-distance entries (e.g. Moon → Earth) target FLIGHT_MAX_SPEED
        // inward but only have ~86 u to stop — causing the ship to crash through the target.
        const maxInwardForSpan = Math.sqrt(2 * AUTOPILOT_DECEL * brakeSpan);
        const inwardSpeed = Math.min(FLIGHT_MAX_SPEED, maxInwardForSpan) * (1 - alpha);
        const desiredVel = new THREE.Vector3()
            .copy(target.velocity)
            .addScaledVector(tangential, vOrbit * alpha) // tangential: 0 → vOrbit
            .addScaledVector(toTargetDir, inwardSpeed); // inward: FLIGHT_MAX_SPEED → 0

        // Explicit gravity compensation — same taper as CIRCULARIZE.
        // Prevents gravity accumulating inward velocity faster than thrust can counter it.
        const gravAccel = (G * target.mass) / (r * r);
        const tangentialSpeed = relVel.dot(tangential);
        const speedRatio = Math.max(0, Math.min(1, tangentialSpeed / vOrbit));
        const gravCompFraction = 1 - speedRatio * speedRatio;
        ship.velocity.addScaledVector(radial, gravAccel * gravCompFraction * dt);

        // Desired-velocity controller.
        const velDelta = new THREE.Vector3().subVectors(desiredVel, ship.velocity);
        const deltaLen = velDelta.length();

        if (deltaLen > 1e-6) {
            const thrustDir = velDelta.clone().normalize();
            const brakeMag = Math.min(AUTOPILOT_DECEL * dt, deltaLen);
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
    } else if (autopilotState.phase === 'CIRCULARIZE') {
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

        const vOrbit = Math.sqrt((G * target.mass) / r);

        // ── Gravity-scaled minimum rate for velocity rotation ─────────────────
        const bodyRadius = target.radius ?? 10;
        const altitude = Math.max(r - bodyRadius, 1);
        const gravAccel = (G * target.mass) / (r * r);
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
            addEvent(`✓ Autopilot: Stable orbit around ${targetName} achieved.`);
            autopilotState.orbitNotifyTimer = AUTOPILOT_ORBIT_NOTIFY_DURATION;
            showOrbitNotifySprite();

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
        if (warpSprite) warpSprite.visible = false;
        autopilotState.warpChargeTimer = 0;
    }
    autopilotState.isActive = false;
    autopilotState.isBoostActive = false;
    autopilotState.phase = null;
    autopilotState.targetBody = null;
    flightState.thrustActive = false;
    if (message) addEvent(message);
    // Defer DOM update — this may be called from inside the physics substep loop.
    setTimeout(() => updateAutopilotUI(), 0);
}

/** Engage the autopilot toward a specific target body. */
function engageAutopilot(target: Body) {
    if (!target || target._isDisposed) return;

    const ship = flightState.knownShip;
    if (!ship || ship._isDisposed || !simulationState.bodies.includes(ship)) {
        addEvent('Autopilot: no ship found. Spawn a spaceship first.');
        return;
    }

    if (simulationState.timeScale > AUTOPILOT_MAX_TIMESCALE) {
        addEvent(
            `Autopilot: time scale is too high (>${AUTOPILOT_MAX_TIMESCALE}×). Reduce time scale first.`
        );
        return;
    }

    // If already engaged on the same target, cancel (toggle)
    if (autopilotState.isActive && autopilotState.targetBody === target) {
        cancelAutopilot('Autopilot disengaged.');
        return;
    }

    // Guard: refuse to engage while manual warp is live.
    if (flightState.warpActive || flightState.warpDecelerating || flightState.warpCharging) {
        addEvent('Autopilot: disengage warp before engaging autopilot.');
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
    // Skip APPROACH when the available braking room is shorter than the stopping distance
    // from full normal speed — e.g. Moon → Earth (110 u) where APPROACH would need ~1,200 u.
    const startInBrake = !startWithWarp && dist0 <= orbitRadius0 + AUTOPILOT_APPROACH_MIN_DISTANCE;

    autopilotState.isActive = true;
    autopilotState.targetBody = target;
    autopilotState.isWarpActive = false;
    autopilotState.warpChargeTimer = 0;
    if (startWithWarp) {
        autopilotState.phase = 'WARP_CHARGING';
    } else if (startInBrake) {
        autopilotState.phase = 'BRAKE';
        autopilotState.brakeEntryDistance = dist0;
    } else {
        autopilotState.phase = 'APPROACH';
    }
    flightState.thrustActive = false;

    if (startWithWarp) {
        addEvent(`Autopilot engaged: initiating warp to ${target.name || 'target'}.`);
    } else if (startInBrake) {
        addEvent(`Autopilot engaged: direct approach to ${target.name || 'target'}.`);
    } else {
        addEvent(`Autopilot engaged: flying to ${target.name || 'target'}.`);
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
    // After warp ends, rapidly decelerate toward FLIGHT_MAX_SPEED, then hand
    // back to normal flight controls (steering/roll still work during decel).
    // If Shift is held and speed has already fallen into boost range, end early
    // so boost can engage immediately rather than coasting all the way to normal max.
    if (flightState.warpDecelerating) {
        const fwdSpd = ship.velocity.dot(forward);
        const boostHandoff = keys.shift && fwdSpd <= FLIGHT_BOOST_MAX_SPEED;
        if (!boostHandoff && fwdSpd > FLIGHT_MAX_SPEED) {
            const newSpd = Math.max(FLIGHT_MAX_SPEED, fwdSpd - FLIGHT_WARP_DECEL * dt);
            ship.velocity.copy(forward).multiplyScalar(newSpd);
            flightState.currentSpeed = newSpd;
        } else {
            flightState.warpDecelerating = false;
            // On boost handoff keep current speed; on natural end clamp to normal max.
            flightState.currentSpeed = boostHandoff ? fwdSpd : Math.min(fwdSpd, FLIGHT_MAX_SPEED);
            warpEffect.stop();
            // Restore steering HUD now that warp deceleration is complete.
            flightSteeringLine.visible = true;
            flightCrosshair.visible = true;
        }
        flightState.thrustActive = false;
        if (warpSprite) warpSprite.visible = false;
        // Fall through to steering/roll below (no early return)
    }

    // ── Boost deceleration ───────────────────────────────────────────────────
    // When Shift is released above FLIGHT_MAX_SPEED, rapidly decelerate back down.
    if (flightState.boostDecelerating) {
        const fwdSpd = ship.velocity.dot(forward);
        if (fwdSpd > FLIGHT_MAX_SPEED) {
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
        // Pulsing warp-active text (update every call is cheap since canvas is small)
        if (warpSprite) {
            const pulse = (Math.sin(Date.now() * 0.005) + 1) * 0.5;
            warpSprite.material.map?.dispose();
            warpSprite.material.map = createWarpActiveTexture(pulse);
            warpSprite.material.needsUpdate = true;
            warpSprite.scale.set(320, 60, 1);
            warpSprite.visible = true;
        }
        return; // Skip all flight controls below
    }

    // ── Warp charging ────────────────────────────────────────────────────────
    if (flightState.warpCharging && !flightState.warpDecelerating && !autopilotState.isWarpActive) {
        flightState.warpCharge = Math.min(flightState.warpCharge + dt, FLIGHT_WARP_CHARGE_TIME);
        const fill = flightState.warpCharge / FLIGHT_WARP_CHARGE_TIME;
        if (warpSprite) {
            warpSprite.material.map?.dispose();
            warpSprite.material.map = createWarpChargeTexture(fill);
            warpSprite.material.needsUpdate = true;
            warpSprite.scale.set(320, 80, 1);
            warpSprite.visible = true;
        }
        if (flightState.warpCharge >= FLIGHT_WARP_CHARGE_TIME) {
            // Engage warp!
            flightState.warpActive = true;
            flightState.warpCharging = false;
            flightState.warpCharge = 0;
            warpEffect.start();
            triggerScreenFlash(200, 0.01, 2.5);
            addEvent('⚡ Warp engaged! Press Space to disengage.');
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

    // Trigger boost decel when Shift is released while still above normal max speed
    if (
        manualInput &&
        !keys.shift &&
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
    // Exponential lerp — gives a weighted, inertia-like feel to the controls
    if (manualInput) {
        flightState.steerX += (rawX - flightState.steerX) * FLIGHT_STEER_SMOOTHING;
        flightState.steerY += (rawY - flightState.steerY) * FLIGHT_STEER_SMOOTHING;

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
        flightState.shipBankRoll +=
            (flightState.steerX * FLIGHT_MAX_BANK_ANGLE - flightState.shipBankRoll) *
            FLIGHT_BANK_LERP_RATE;
        flightState.shipBankPitch +=
            (flightState.steerY * FLIGHT_MAX_BANK_PITCH - flightState.shipBankPitch) *
            FLIGHT_BANK_LERP_RATE;

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
    steeringLinePositions[2] = 0;
    steeringLinePositions[3] = noseScreenX + displayOffX;
    steeringLinePositions[4] = noseScreenY - displayOffY;
    steeringLinePositions[5] = 0;
    steeringLineGeo.attributes.position.needsUpdate = true;

    // Move the static crosshair to the projected nose position
    flightCrosshair.position.set(noseScreenX, noseScreenY, 0);
    steeringEndMarker.position.set(noseScreenX + displayOffX, noseScreenY - displayOffY, 0);
    steeringEndMarker.visible = true;
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
            createUniqueId('spaceship')
        );
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
        mainPanel.setLookAtState(true);
        setFocusBody(ship, { zoom: true });
        managementPanel.setSelectedBody(ship);

        // Update button label to "RE-ENTER SHIP"
        updateFlightSpawnBtnLabel();

        addEvent('Spaceship spawned. Click RE-ENTER SHIP to pilot it.');
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
        managementPanel.setSelectedBody(null);
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
    flightCrosshair.visible = true;
    steeringEndMarker.visible = true;
    if (warpSprite) warpSprite.visible = false;
    flightControlsPanel.setFlightActive(true);
    flightControlsPanel.setViewState(flightState.isCockpitView);
    // Enable the autopilot button now that a ship is active
    flightControlsPanel.setAutopilotState(autopilotState.isActive, true);
    refreshBodiesTable();

    addEvent('Entered spaceship.');
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
    if (warpSprite) warpSprite.visible = false;
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
    flightControlsPanel.setViewState(false);
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
            updateFlightSpawnBtnLabel();
        } catch {
            // Empty
        }
    }, 0);
    addEvent('Flight mode exited.');
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

mainPanel.on('lockToSunChange', ({ checked }: { checked: boolean }) => {
    cameraState.lockToSun = checked;
});

mainPanel.on('shadowsChange', ({ checked }: { checked: boolean }) => {
    toggleShadows(checked);
});

managementPanel.on('kuiperBeltChange', ({ checked }: { checked: boolean }) => {
    if (typeof kuiperBeltPoints !== 'undefined' && kuiperBeltPoints) {
        kuiperBeltPoints.visible = checked;
    }
});

const enableSkydomeCheckbox = document.getElementById('enableSkydome') as HTMLInputElement;
if (enableSkydomeCheckbox) {
    enableSkydomeCheckbox.onchange = () => {
        skydome.visible = enableSkydomeCheckbox.checked;
    };
}

mainPanel.on('trailsChange', ({ checked }: { checked: boolean }) => {
    simulationState.bodies.forEach((body) => {
        if (body && body instanceof CelestialBody && body.trail) {
            body.trail.visible = checked;
        }
    });
});

mainPanel.on('namesChange', ({ checked }: { checked: boolean }) => {
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

mainPanel.on('substepsChange', ({ value }: { value: number }) => {
    stepsPerFrame = value;
});

mainPanel.on('timeScaleChange', ({ value }: { value: number }) => {
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

// "Fly Here" button from the bodies table
mainPanel.on('autopilot', ({ body }: { body: Body }) => {
    if (!body || body._isDisposed) return;
    engageAutopilot(body);
});

// Manual selection from Bodies table
mainPanel.on('manualBodySelect', ({ body }: { body: Body }) => {
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
        inclination,
        hasAtmosphere,
        customMass,
        customTemperature,
        customLightIntensity,
        customRadius,
        orbitParent,
    }: {
        bodyType: string;
        planetType: string;
        orbitType: string;
        inclination: number;
        hasAtmosphere: boolean;
        customMass: number | null;
        customTemperature: number | null;
        customLightIntensity: number | null;
        customRadius: number | null;
        orbitParent: Body | null;
    }) => {
        createNewBody(
            bodyType,
            planetType,
            orbitType,
            inclination,
            hasAtmosphere,
            customMass,
            customTemperature,
            customLightIntensity,
            customRadius,
            orbitParent ?? null
        );
        refreshBodiesTable();
    }
);

// Preset bodies (canonical solar-system objects)
managementPanel.on('createPresetBody', ({ presetKey }: { presetKey: string }) => {
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

managementPanel.on('deleteBody', () => {
    deleteSelectedBody();
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

        // Update mass — setMass handles brown dwarf transition for stars
        body.setMass(mass);

        // Refill fuel for stars based on new mass (skipped automatically for brown dwarfs since fuel is null)
        if (body instanceof Star && body.fuel !== null) {
            body.maxFuel = mass * 100000;
            body.fuel = body.maxFuel;
            // Reset to initial state (in case it was in red giant phase)
            body.initialMass = mass;
            body.temperature = body.temperature || 5778;
        }

        // Star-only updates (temperature, light) — radius handled globally below
        if (body instanceof Star) {
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

            if (managementPanel && managementPanel.editRadiusSlider) {
                const oldRadiusAll = body.radius || 1;
                const newRadiusAll = parseFloat(
                    (managementPanel.editRadiusSlider as HTMLInputElement).value
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
            const currentAngleDeg = ((Math.atan2(currentVel.z, currentVel.x) * 180) / Math.PI + 360) % 360;
            const currentHorizSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.z * currentVel.z);
            const currentInclinationDeg = (Math.atan2(currentVel.y, currentHorizSpeed) * 180) / Math.PI;

            const resolvedSpeed = velocity !== null ? velocity : currentSpeed;
            const resolvedAngleDeg = orbitalAngle !== null ? orbitalAngle : currentAngleDeg;
            const resolvedInclinationDeg = inclination !== null ? inclination : currentInclinationDeg;

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
            statsSprite.material.map = createStatsTexture(selectedBody, simulationState.bodies);
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
            triggerZoomToBody(null);
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
            flightControlsPanel.setViewState(flightState.isCockpitView);
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
                flightCrosshair.visible = true;
                addEvent('Warp disengaged. Decelerating...');
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
        const showNamesCheckbox = mainPanel.showNamesCheckbox as HTMLInputElement | null;
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
                if (warpSprite) warpSprite.visible = false;
            }
        }
    }
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
        if (uiContainer && e.target instanceof Node && uiContainer.contains(e.target)) {
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

    warpEffect.resize(window.innerWidth, window.innerHeight);
    lensingEffect.resize(window.innerWidth, window.innerHeight);
});

// Apply initial background visibility (pre-launch view): kuiper off
if (typeof kuiperBeltPoints !== 'undefined' && kuiperBeltPoints) kuiperBeltPoints.visible = false;
if (managementPanel.enableKuiperBeltCheckbox)
    managementPanel.enableKuiperBeltCheckbox.checked = false;

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
    const removedBody = e?.detail?.body;
    // If the deleted body was the player's known ship, clear the reference
    // so the button reverts to "SPAWN SPACESHIP" rather than "ENTER SHIP".
    if (removedBody && removedBody === flightState.knownShip) {
        flightState.knownShip = null;
        setTimeout(() => {
            try {
                updateFlightSpawnBtnLabel();
            } catch {
                // Empty
            }
        }, 0);
    }
    handleBodyBecameInvalid(removedBody);
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
    // - Target OFF by default
    // - Look At ON (button shows active), but with NO pre-selected body
    //   so camera still behaves like center-orbit until the user selects a body.
    cameraState.isTargetMode = false;
    mainPanel.setTargetState(false);

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
    syncAllStarLightTargets();

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

// Show modal initially; simulation starts after user choice
startupModal.open({ allowCancel: false });
refreshBodiesTable();
animate();
