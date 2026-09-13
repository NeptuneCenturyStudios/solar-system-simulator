import * as THREE from 'three';
import { getBodyTypeLabel } from '../utilities/utilities';
import { Body } from '../bodies/body';
import { Star } from '../bodies/star';
import { MainSequenceStar } from '../bodies/main-sequence-star';
import { Moon } from '../bodies/moon';
import { MoonTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';
import { Planet } from '../bodies/planet';
import { DwarfPlanet } from '../bodies/dwarf-planet';
import { environmentState } from '../simulation/environment-state';
import { formatMass, formatRadius, formatSpeed } from '../utilities/display-format';
import { C } from '../utilities/consts';

// These are painters for persistent HudSprite canvases, not texture factories. Each used to
// build a new canvas and CanvasTexture on every call — ten times a second for all three.

// ── Canvas sizes ─────────────────────────────────────────────────────────────

// Speed canvas is sized so that sprite scale = canvas × 0.625 matches the FPS counter pixel
// density: 640×640 canvas → 400×400 sprite pixels on screen.
export const SPEED_CANVAS_W = 640;
export const FPS_CANVAS_W = 256;
export const FPS_CANVAS_H = 64;
export const STATS_CANVAS_W = 700;
export const STATS_CANVAS_H = 700;

/** Speed canvas height — taller when the position/velocity rows are shown. */
export function speedCanvasHeight(hasExtra: boolean): number {
    return hasExtra ? 640 : 240;
}

export interface SpeedHudParams {
    /** The current speed of the spacecraft. */
    speed: number;
    /** Whether the spacecraft is currently boosting. */
    isBoosting: boolean;
    /** Optional position vector of the spacecraft. */
    pos?: THREE.Vector3;
    /** Optional velocity vector of the spacecraft. */
    vel?: THREE.Vector3;
    /** Whether the spacecraft is in warp mode. */
    isWarp: boolean;
    /** Whether the spacecraft is actively decelerating (boost decel, warp decel, autopilot brake, or S-key braking). */
    isBraking: boolean;
    /** The ship's effective accel/decel rate in u/s² (0 = coasting or warp-active). */
    shipThrustRate: number;
    /** Total gravitational acceleration magnitude on the ship in u/s². */
    gravRate: number;
}

/**
 * Flight speed HUD — drawn in the same style as the FPS counter.
 * The canvas must already be sized to `SPEED_CANVAS_W × speedCanvasHeight(hasExtra)`.
 */
export function paintSpeed(ctx: CanvasRenderingContext2D, params: SpeedHudParams): void {
    const { speed, isBoosting, pos, vel, isWarp, isBraking, shipThrustRate, gravRate } = params;
    const hasExtra = !!(pos && vel);
    const W = SPEED_CANVAS_W;
    const H = speedCanvasHeight(hasExtra);
    ctx.clearRect(0, 0, W, H);

    const color = isWarp ? '#ff4488' : isBraking ? '#ff6644' : isBoosting ? '#ff9944' : '#00ffcc';
    const glow = isWarp
        ? 'rgba(255,68,136,0.9)'
        : isBraking
          ? 'rgba(255,102,68,0.9)'
          : isBoosting
            ? 'rgba(255,153,68,0.85)'
            : 'rgba(0,255,204,0.85)';
    const dim = 'rgba(0,255,204,0.5)';

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // ── Mode label ────────────────────────────────────────────────────────────
    ctx.fillStyle = color;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
    ctx.font = '36px monospace';
    if (isWarp) {
        ctx.fillText('WARP', W - 24, hasExtra ? 44 : 56);
    } else if (isBraking) {
        ctx.fillText('SPEED - BRAKING', W - 24, hasExtra ? 44 : 56);
    } else if (isBoosting) {
        ctx.fillText('BOOST', W - 24, hasExtra ? 44 : 56);
    } else {
        ctx.fillText('SPEED', W - 24, hasExtra ? 44 : 56);
    }

    // ── Thrust rate vs Gravity rate ───────────────────────────────────────────
    // Shows the ship's effective accel/decel force against the gravitational pull.
    // Gravity turns red when it exceeds the ship's thrust rate.
    {
        const accelY = hasExtra ? 82 : 100;
        ctx.font = '26px monospace';
        ctx.shadowBlur = 0;

        const thrustStr = shipThrustRate.toFixed(1);
        const sepStr = '  —  '; // em-dash separator
        const gravStr = gravRate.toFixed(1);

        const gravColor = gravRate > shipThrustRate + 0.001 ? '#ff4444' : 'rgba(200,200,200,0.45)';

        // Draw right-to-left to preserve textAlign = 'right'
        ctx.fillStyle = gravColor;
        ctx.shadowColor = gravRate > shipThrustRate + 0.001 ? 'rgba(255,68,68,0.7)' : 'transparent';
        ctx.shadowBlur = gravRate > shipThrustRate + 0.001 ? 6 : 0;
        ctx.fillText(gravStr, W - 24, accelY);

        const gravWidth = ctx.measureText(gravStr).width;
        ctx.fillStyle = 'rgba(200,200,200,0.3)';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.fillText(sepStr, W - 24 - gravWidth, accelY);

        const sepWidth = ctx.measureText(sepStr).width;
        ctx.fillStyle = shipThrustRate > 0 ? color : 'rgba(200,200,200,0.35)';
        ctx.shadowColor = shipThrustRate > 0 ? glow : 'transparent';
        ctx.shadowBlur = shipThrustRate > 0 ? 6 : 0;
        ctx.fillText(thrustStr, W - 24 - gravWidth - sepWidth, accelY);
    }

    // ── Speed value ───────────────────────────────────────────────────────────
    ctx.fillStyle = color;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 28;
    ctx.font = 'bold 68px monospace';
    const useWarp = isWarp || isBoosting || Math.abs(speed) >= C;
    ctx.fillText(formatSpeed(Math.abs(speed), useWarp), W - 24, hasExtra ? 140 : 172);

    if (pos && vel) {
        const lh = 56; // canvas-pixel line height for data rows

        // ── Position ──────────────────────────────────────────────────────────
        let y = 214;
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
        ctx.fillText(`X  ${pos.x.toFixed(1)}`, W - 24, y);
        y += lh;
        ctx.fillText(`Y  ${pos.y.toFixed(1)}`, W - 24, y);
        y += lh;
        ctx.fillText(`Z  ${pos.z.toFixed(1)}`, W - 24, y);
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
        ctx.fillText(`X  ${vel.x.toFixed(2)}`, W - 24, y);
        y += lh;
        ctx.fillText(`Y  ${vel.y.toFixed(2)}`, W - 24, y);
        y += lh;
        ctx.fillText(`Z  ${vel.z.toFixed(2)}`, W - 24, y);
    }
}

/** Draw the current FPS. The canvas must already be `FPS_CANVAS_W × FPS_CANVAS_H`. */
export function paintFPS(context: CanvasRenderingContext2D, fps: number): void {
    context.clearRect(0, 0, FPS_CANVAS_W, FPS_CANVAS_H);

    // Setup text style (monospace for numbers)
    context.font = '27px monospace';
    context.fillStyle = '#00ffcc';
    context.textAlign = 'right';
    context.textBaseline = 'middle';

    // Add glow effect
    context.shadowColor = 'rgba(0, 255, 204, 0.8)';
    context.shadowBlur = 8;

    context.fillText(`FPS: ${fps}`, FPS_CANVAS_W - 10, FPS_CANVAS_H / 2);
}

// ── Stats panel ──────────────────────────────────────────────────────────────

const STATS_LINE_HEIGHT = 40;
const STATS_RIGHT_PADDING = 10;

/** Intl formatters are expensive to construct, so one is kept per fraction-digit combination. */
const numberFormatters = new Map<string, Intl.NumberFormat>();

function getNumberFormatter(minimumFractionDigits: number, maximumFractionDigits: number) {
    const key = `${minimumFractionDigits}|${maximumFractionDigits}`;
    let formatter = numberFormatters.get(key);
    if (!formatter) {
        formatter = new Intl.NumberFormat(undefined, {
            minimumFractionDigits,
            maximumFractionDigits,
        });
        numberFormatters.set(key, formatter);
    }
    return formatter;
}

/** Format numbers with locale separators, and scientific notation for very small values. */
function formatNumber(
    num: number,
    options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {}
): string {
    const { minimumFractionDigits = 2, maximumFractionDigits = 2 } = options;

    if (!Number.isFinite(num)) return '—';
    // The original formatted zero with a default Intl.NumberFormat, which is (0, 3) digits.
    if (num === 0) return getNumberFormatter(0, 3).format(0);

    if (Math.abs(num) < 0.01) {
        return num.toExponential(2);
    }

    return getNumberFormatter(minimumFractionDigits, maximumFractionDigits).format(num);
}

/** Draw label + value right-aligned (normal font weight). */
function drawStat(ctx: CanvasRenderingContext2D, label: string, value: string, y: number): void {
    ctx.font = '27px monospace';
    ctx.fillText(label + value, STATS_CANVAS_W - STATS_RIGHT_PADDING, y);
}

function planetSubTypeLabel(planetType: PlanetTypeEnum): string {
    switch (planetType) {
        case PlanetTypeEnum.GasGiant:
            return 'Gas Giant';
        case PlanetTypeEnum.IceGiant:
            return 'Ice Giant';
        case PlanetTypeEnum.Terrestrial:
            return 'Terrestrial';
        case PlanetTypeEnum.Volcanic:
            return 'Volcanic';
        case PlanetTypeEnum.Ocean:
            return 'Ocean';
        case PlanetTypeEnum.Frozen:
            return 'Frozen';
        case PlanetTypeEnum.Desert:
            return 'Desert';
        case PlanetTypeEnum.Temperate:
            return 'Temperate';
        default:
            return 'Unknown';
    }
}

function moonSubTypeLabel(moonType: MoonTypeEnum): string {
    switch (moonType) {
        case MoonTypeEnum.Terrestrial:
            return 'Terrestrial';
        case MoonTypeEnum.Temperate:
            return 'Temperate';
        case MoonTypeEnum.Volcanic:
            return 'Volcanic';
        case MoonTypeEnum.Ocean:
            return 'Ocean';
        case MoonTypeEnum.Frozen:
            return 'Frozen';
        case MoonTypeEnum.Desert:
            return 'Desert';
        default:
            return 'Unknown';
    }
}

/**
 * Draw detailed stats about a celestial body, such as mass, radius, velocity, etc.
 * The canvas must already be `STATS_CANVAS_W × STATS_CANVAS_H`.
 */
export function paintStats(context: CanvasRenderingContext2D, body: Body): void {
    context.clearRect(0, 0, STATS_CANVAS_W, STATS_CANVAS_H);

    // Setup text style
    context.fillStyle = '#aaaaaa'; // Light gray
    context.textAlign = 'right';
    context.textBaseline = 'top';
    // A fresh canvas started with no shadow; a reused one must be told explicitly.
    context.shadowBlur = 0;

    let y = 5;
    const row = (label: string, value: string): void => {
        drawStat(context, label, value, y);
        y += STATS_LINE_HEIGHT;
    };

    row('Name: ', body.name);
    row('Type: ', getBodyTypeLabel(body));

    // Planet / Moon Type (shows the "sub type" like planets already do)
    if (body instanceof Planet || body instanceof DwarfPlanet) {
        row('Sub Type: ', planetSubTypeLabel(body.planetType));
    } else if (body instanceof Moon) {
        row('Sub Type: ', moonSubTypeLabel(body.moonType));
    }

    row('Mass: ', formatMass(body.mass));
    row('Radius: ', formatRadius(body.radius));

    // Temperature (for stars and stellar remnants)
    if (body instanceof Star) {
        row(
            'Temperature: ',
            formatNumber(body.temperature, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) +
                'K'
        );
    }

    // Fuel (for stars with fuel system, only if star death is enabled)
    if (
        environmentState.starDeathEnabled &&
        body instanceof MainSequenceStar &&
        body.fuel !== null &&
        body.maxFuel !== null
    ) {
        row('Fuel: ', `${((body.fuel / body.maxFuel) * 100).toFixed(1)}%`);
    }

    const pos = body.mesh.position;
    row('Position: ', `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);

    const vel = body.velocity;
    row('Velocity: ', `(${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)})`);

    // Speed (velocity magnitude)
    const speed = vel.length();
    row('Speed: ', formatSpeed(speed, speed >= C));

    // Net gravitational force (force experienced FROM other bodies, F = m * a)
    if (body.tempAcc) {
        row('Net Force: ', formatNumber(body.tempAcc.length() * body.mass));
    }

    // Orbital inclination (angle of velocity from xy-plane, in degrees)
    const velXY = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    row('Inclination: ', (Math.atan2(vel.z, velXY) * (180 / Math.PI)).toFixed(1) + '°');

    // Longitude (angle in xy-plane, in degrees)
    row('Longitude: ', (Math.atan2(pos.y, pos.x) * (180 / Math.PI)).toFixed(1) + '°');
}
