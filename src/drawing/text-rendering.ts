import * as THREE from 'three';
import { BodyTypeEnum, getBodyTypeLabel } from '../utilities/utilities';
import { Body } from '../bodies/body';
import { CelestialBody } from '../bodies/celestial-body';
import { Star } from '../bodies/star';
import { MainSequenceStar } from '../bodies/main-sequence-star';

/**
 * Creates a THREE.js texture from a string of text, rendered on a canvas with glow effect.
 * Used for rendering labels or UI text in the 3D scene.
 * @param text - The text to render.
 * @returns The resulting texture.
 */
export function createTextTexture(text: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D context');

    // Set canvas size
    canvas.width = 512;
    canvas.height = 128;

    // Setup text style
    context.font = '48px monospace';
    context.fillStyle = '#00ffcc';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Add glow effect
    context.shadowColor = 'rgba(0, 255, 204, 0.8)';
    context.shadowBlur = 15;

    // Draw text
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return texture;
}

/**
 * Flight speed HUD texture — drawn in the same style as the FPS counter
 * @param speed - The current speed of the spacecraft.
 * @param isBoosting - Whether the spacecraft is currently boosting.
 * @param pos - Optional position vector of the spacecraft.
 * @param vel - Optional velocity vector of the spacecraft.
 * @param isWarp - Whether the spacecraft is in warp mode.
 * @returns A THREE.js texture representing the speed HUD.
 */
export function createSpeedTexture(
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

/**
 * Creates a texture displaying the current FPS.
 * @param fps - The current frames per second.
 * @returns A THREE.js texture representing the FPS.
 */
export function createFPSTexture(fps: number) {
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

/**
 * Creates a texture displaying detailed stats about a celestial body, such as mass, radius, velocity, etc.
 * @param body - The celestial body for which to create the stats texture.
 * @returns A THREE.js texture representing the stats of the body.
 */
export function createStatsTexture(body: Body) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;

    // Set canvas size
    canvas.width = 700;
    // Increased height to fit Planet Type stat if needed
    canvas.height = 700;

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
    drawStat('Type: ', getBodyTypeLabel(body), y);
    y += lineHeight;

    // Planet Type (if planet or dwarf planet)
    // Check for planet type property (Planet or DwarfPlanet class or similar)
    if (
        body.bodyType &&
        (body.bodyType & BodyTypeEnum.Planet || body.bodyType & BodyTypeEnum.DwarfPlanet) &&
        'planetType' in body &&
        body.planetType
    ) {
        // Map enum/string to display label
        let planetTypeLabel: string;
        switch (body.planetType) {
            case 'gas_giant':
            case 'GasGiant':
                planetTypeLabel = 'Gas Giant';
                break;
            case 'ice_giant':
            case 'IceGiant':
                planetTypeLabel = 'Ice Giant';
                break;
            case 'solid':
            case 'Terrestrial':
                planetTypeLabel = 'Terrestrial';
                break;
            case 'volcanic':
                planetTypeLabel = 'Volcanic';
                break;
            case 'ocean':
                planetTypeLabel = 'Ocean';
                break;
            case 'frozen':
                planetTypeLabel = 'Frozen';
                break;
            case 'desert':
                planetTypeLabel = 'Desert';
                break;
            default:
                planetTypeLabel = String(body.planetType);
        }
        drawStat('Sub Type: ', planetTypeLabel, y);
        y += lineHeight;
    }

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
    if (
        starDeathEnabled &&
        body instanceof MainSequenceStar &&
        body.fuel !== null &&
        body.maxFuel !== null
    ) {
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

    // // Total gravitational force exerted ON other bodies
    // let totalForceExerted = 0;
    // for (const other of bodiesArray) {
    //     if (other !== body && !other?._isDisposed && other.mesh) {
    //         const diff = new THREE.Vector3().subVectors(other.mesh.position, body.mesh.position);
    //         const r = diff.length();
    //         if (r > 0.01) {
    //             const force = (G * simulationState.gMultiplier * body.mass * other.mass) / (r * r);
    //             totalForceExerted += force;
    //         }
    //     }
    // }
    // drawStat('Grav Output: ', formatNumber(totalForceExerted), y);
    // y += lineHeight;

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