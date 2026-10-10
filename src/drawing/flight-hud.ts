import * as THREE from 'three';
import { Body } from '../bodies/body';
import type { Spaceship } from '../bodies/ships/spaceship';
import {
    AUTOPILOT_ORBIT_ALTITUDE_FACTOR,
    AUTOPILOT_ORBIT_NOTIFY_DURATION,
} from '../utilities/consts';
import { formatDistance } from '../utilities/display-format';
import { IAutopilotState } from '../interfaces';
import { HudSprite } from './hud/hud-sprite';
import { drawGaugeTrack } from './hud/hud-paint';

export type AutopilotHudState =
    | 'ALIGN'
    | 'APPROACH_WARP'
    | 'APPROACH_BOOST'
    | 'APPROACH'
    | 'BRAKE'
    | 'CIRCULARIZE'
    | 'TIDAL_LOCK'
    | 'ORBIT'
    | 'BLOCKED'
    | 'NONE';

// Fixed pixel offset to the right of the gray steering-origin ring (radius ~120-124px).
const THERMAL_GAUGE_OFFSET_X = 160;

// ── Canvas sizes ─────────────────────────────────────────────────────────────
const WARP_CHARGE_W = 512;
const WARP_CHARGE_H = 128;
const WARP_ACTIVE_W = 512;
const WARP_ACTIVE_H = 96;
const THERMAL_W = 90;
const THERMAL_H = 170;

// ── Weapon selector label ─────────────────────────────────────────────────────
// Sits in the same column as the heat gauge, directly above it, naming whichever
// mounted weapon is currently selected to fire (cycled with G in flight).
const WEAPON_LABEL_W = 320;
const WEAPON_LABEL_H = 72;
const WEAPON_LABEL_SCALE_W = 200;
const WEAPON_LABEL_SCALE_H = (WEAPON_LABEL_H / WEAPON_LABEL_W) * WEAPON_LABEL_SCALE_W;
/** Same column as the heat gauge. */
const WEAPON_LABEL_OFFSET_X = THERMAL_GAUGE_OFFSET_X;
/** Vertical gap from the heat gauge centre up to the label centre, clearing the gauge's top. */
const WEAPON_LABEL_OFFSET_Y = 78;
const PHASE_W = 900;
const PHASE_H = 100;
const HINT_W = 2200;
const HINT_H = 140;

// ── Ship vitals panel ────────────────────────────────────────────────────────
// Shield-over-hull bars, pinned directly above the speed readout (bottom-right).
const SHIP_STATUS_CANVAS_W = 640;
const SHIP_STATUS_CANVAS_H = 132;
/** 640-wide canvas at the speed sprite's 0.625 ratio → 400 screen pixels wide. */
const SHIP_STATUS_SPRITE_W = 400;
const SHIP_STATUS_SPRITE_H = (SHIP_STATUS_CANVAS_H / SHIP_STATUS_CANVAS_W) * SHIP_STATUS_SPRITE_W;
/** Same centre X as the speed sprite, and just above its 400px-tall top edge. */
const SHIP_STATUS_OFFSET_X = -210;
const SHIP_STATUS_OFFSET_Y = 465;
/** Shield bar colour — matches the world-space health bar's shield row. */
const SHIELD_BAR_COLOR = '#4fc3ff';

// ── Private painters ─────────────────────────────────────────────────────────
//
// Each painter draws onto a persistent HudSprite canvas that has already been sized.
// They used to be texture factories that built a fresh canvas and CanvasTexture on every
// call — up to every frame for the warp bar and thermal gauge.

/** Renders the charging progress bar (fill = 0..1) with label above. */
function paintWarpCharge(ctx: CanvasRenderingContext2D, fill: number): void {
    const W = WARP_CHARGE_W,
        H = WARP_CHARGE_H;
    ctx.clearRect(0, 0, W, H);

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
    drawGaugeTrack(ctx, barX, barY, barW, barH);

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
}

/** Renders the pulsing "WARP ACTIVE" text (pulse = 0..1 sine wave). */
function paintWarpActive(ctx: CanvasRenderingContext2D, pulse: number): void {
    const W = WARP_ACTIVE_W,
        H = WARP_ACTIVE_H;
    ctx.clearRect(0, 0, W, H);

    const alpha = 0.55 + 0.45 * pulse; // 0.55–1.0
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 52px monospace';
    ctx.shadowBlur = 20 + 20 * pulse;
    ctx.shadowColor = `rgba(255,120,0,${alpha})`;
    ctx.fillStyle = `rgba(255,${Math.round(180 + 75 * pulse)},0,${alpha})`;
    ctx.fillText('WARP ACTIVE', W / 2, H / 2);
}

/**
 * Renders the vertical thermal-load gauge (fill = 0..1), with an overheat flash state.
 * @param flashPulse 0..1 phase of the overheat flash; only used while `overheated`.
 */
function paintThermalGauge(
    ctx: CanvasRenderingContext2D,
    fill: number,
    overheated: boolean,
    flashPulse: number
): void {
    const W = THERMAL_W,
        H = THERMAL_H;
    ctx.clearRect(0, 0, W, H);

    // Label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 14px monospace';
    ctx.shadowBlur = 6;
    ctx.fillStyle = overheated ? '#ff3344' : '#00ffcc';
    ctx.shadowColor = overheated ? 'rgba(255,51,68,0.9)' : 'rgba(0,255,204,0.7)';
    ctx.fillText('HEAT', W / 2, 14);

    // Bar track (vertical; fills bottom-up)
    const barX = 20,
        barY = 28,
        barW = W - 40,
        barH = H - 44;
    drawGaugeTrack(ctx, barX, barY, barW, barH);

    // Bar fill — gradient cyan (cool) → orange → red (hot), growing from the bottom
    const clampedFill = Math.max(0, Math.min(1, fill));
    if (clampedFill > 0) {
        const fillH = barH * clampedFill;
        const fillY = barY + barH - fillH;
        const grad = ctx.createLinearGradient(0, barY + barH, 0, barY);
        grad.addColorStop(0, 'rgba(0,200,180,0.9)');
        grad.addColorStop(0.6, 'rgba(255,180,0,0.9)');
        grad.addColorStop(1, 'rgba(255,60,40,1.0)');
        ctx.fillStyle = grad;
        ctx.shadowBlur = 8;
        ctx.shadowColor = clampedFill > 0.85 ? 'rgba(255,60,40,0.9)' : 'rgba(0,255,204,0.6)';
        ctx.fillRect(barX, fillY, barW, fillH);
        ctx.shadowBlur = 0;
    }

    // Overheat flash overlay + label
    if (overheated) {
        const pulse = flashPulse;
        ctx.fillStyle = `rgba(255,40,40,${0.25 + 0.35 * pulse})`;
        ctx.fillRect(barX, barY, barW, barH);
        ctx.font = 'bold 13px monospace';
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(255,51,68,0.9)';
        ctx.fillStyle = `rgba(255,80,80,${0.7 + 0.3 * pulse})`;
        ctx.fillText('OVERHEAT', W / 2, H - 10);
    }
}

/**
 * Renders the weapon-selector label: the selected weapon's name over its slot
 * index (e.g. "BOLT CANNON" / "2 / 2"). Turns red while that weapon is
 * overheated, matching the heat gauge beside it.
 */
function paintWeaponLabel(
    ctx: CanvasRenderingContext2D,
    name: string,
    index: number,
    count: number,
    overheated: boolean
): void {
    const W = WEAPON_LABEL_W;
    const H = WEAPON_LABEL_H;
    ctx.clearRect(0, 0, W, H);

    const color = overheated ? '#ff3344' : '#7ef0ff';
    const glow = overheated ? 'rgba(255,51,68,0.9)' : 'rgba(100,220,255,0.75)';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Weapon name.
    ctx.font = 'bold 30px monospace';
    ctx.shadowBlur = 10;
    ctx.shadowColor = glow;
    ctx.fillStyle = color;
    ctx.fillText(name.toUpperCase(), W / 2, H / 2 - 8);

    // Slot indicator beneath, so the pilot knows where they are in the loadout.
    ctx.font = 'bold 20px monospace';
    ctx.shadowBlur = 6;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`${index} / ${count}`, W / 2, H / 2 + 24);
}

function paintAutopilotPhase(
    ctx: CanvasRenderingContext2D,
    state: AutopilotHudState,
    distanceLabel = ''
): void {
    // Canvas is deliberately wide so no label ever clips.
    // Two rows: phase label on top, distance on the bottom.
    const W = PHASE_W,
        H = PHASE_H;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let text: string;
    let color: string;
    let glow: string;
    switch (state) {
        case 'ALIGN':
            text = '◎ AUTOPILOT: ALIGNING TO TARGET';
            color = '#88ddff';
            glow = 'rgba(136,221,255,0.85)';
            break;
        case 'APPROACH_WARP':
            text = '▶▶▶ AUTOPILOT: WARPING';
            color = '#ff4488';
            glow = 'rgba(255,68,136,0.9)';
            break;
        case 'APPROACH_BOOST':
            text = '▶▶ AUTOPILOT: APPROACHING TARGET (BOOST)';
            color = '#ff9944';
            glow = 'rgba(255,153,68,0.85)';
            break;
        case 'APPROACH':
            text = '▶ AUTOPILOT: APPROACHING TARGET';
            color = '#00ffcc';
            glow = 'rgba(0,255,204,0.85)';
            break;
        case 'BRAKE':
            text = '↻ AUTOPILOT: ESTABLISHING ORBIT TRAJECTORY';
            color = '#00ffcc';
            glow = 'rgba(0,255,204,0.85)';
            break;
        case 'CIRCULARIZE':
            text = '↻ AUTOPILOT: ENTERING ORBIT';
            color = '#00ffcc';
            glow = 'rgba(0,255,204,0.85)';
            break;
        case 'TIDAL_LOCK':
            text = '↻ AUTOPILOT: ORBIT LOCK ACTIVE';
            color = '#7ef0ff';
            glow = 'rgba(100,220,255,0.9)';
            break;
        case 'ORBIT':
            text = '✓ STABLE ORBIT ESTABLISHED';
            color = '#7ef0ff';
            glow = 'rgba(100,220,255,0.9)';
            break;
        case 'BLOCKED':
            text = '⚠ AUTOPILOT BLOCKED';
            color = '#ff3344';
            glow = 'rgba(255,51,68,0.9)';
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
    if (distanceLabel && state !== 'TIDAL_LOCK' && state !== 'ORBIT') {
        ctx.font = '24px monospace';
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.fillText(distanceLabel, W / 2, 72);
    }
}

function paintHint(context: CanvasRenderingContext2D, lines: string[]): void {
    context.clearRect(0, 0, HINT_W, HINT_H);

    // 28pt hint text (slightly smaller to avoid clipping)
    context.font = '28px monospace';
    context.fillStyle = '#aaaaaa';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // A fresh canvas started with no shadow; a reused one must be told explicitly.
    context.shadowBlur = 0;

    const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
    if (safeLines.length === 0) return;

    const lineY = safeLines.length > 1 ? [50, 100] : [75];
    for (let i = 0; i < Math.min(safeLines.length, 2); i++) {
        context.fillText(safeLines[i], HINT_W / 2, lineY[i]);
    }
}

/** Hull bar colour by severity — the same thresholds the world-space health bar uses. */
function hullBarColor(fraction: number): string {
    return fraction > 0.6 ? '#4caf50' : fraction > 0.3 ? '#ffb300' : '#ff4d4d';
}

/** One labelled fill bar: shared cyan track, coloured fill, centred label. */
function paintVitalsBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    fraction: number,
    color: string,
    label: string
): void {
    drawGaugeTrack(ctx, x, y, width, height);

    const clamped = Math.max(0, Math.min(1, fraction));
    if (clamped > 0) {
        ctx.fillStyle = color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
        ctx.fillRect(x, y, width * clamped, height);
        ctx.shadowBlur = 0;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px monospace';
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(label, x + width / 2, y + height / 2 + 1);
    ctx.shadowBlur = 0;
}

/**
 * Ship vitals panel: a shield bar above a hull bar, each showing its fill and percent.
 * The canvas must already be `SHIP_STATUS_CANVAS_W × SHIP_STATUS_CANVAS_H`.
 */
function paintShipStatus(
    ctx: CanvasRenderingContext2D,
    shieldFraction: number,
    hullFraction: number
): void {
    const W = SHIP_STATUS_CANVAS_W;
    const H = SHIP_STATUS_CANVAS_H;
    ctx.clearRect(0, 0, W, H);

    const barX = 24;
    const barW = W - 48;
    const barH = 44;
    const shieldY = 18;
    const hullY = 72;
    const shieldPct = Math.round(Math.max(0, Math.min(1, shieldFraction)) * 100);
    const hullPct = Math.round(Math.max(0, Math.min(1, hullFraction)) * 100);

    paintVitalsBar(
        ctx,
        barX,
        shieldY,
        barW,
        barH,
        shieldFraction,
        SHIELD_BAR_COLOR,
        `SHIELD  ${shieldPct}%`
    );
    paintVitalsBar(
        ctx,
        barX,
        hullY,
        barW,
        barH,
        hullFraction,
        hullBarColor(hullFraction),
        `HULL  ${hullPct}%`
    );
}

// ── FlightHUD class ──────────────────────────────────────────────────────────

export class FlightHUD {
    // Public — accessed directly from index.ts flight logic
    warpSprite: HudSprite | null = null;
    orbitNotifySprite: HudSprite | null = null;
    hintSprite: HudSprite | null = null;
    thermalSprite: HudSprite | null = null;
    weaponSprite: HudSprite | null = null;
    shipStatusSprite: HudSprite | null = null;
    autopilotBlockedNotifyTimer = 0;
    autopilotBlockedByName = '';

    private uiScene: THREE.Scene;
    private autopilotState: IAutopilotState;
    private interactionState: {
        isChangingVelocity: boolean;
        isMiddleMouseVelocity: boolean;
        velocityEditMode: string;
    };
    private cameraState: { isFreeCameraMode: boolean; isTargetMode: boolean };
    private simulationState: { bodies: Body[] };
    private flightState: {
        knownShip: (Body & { warpActive?: boolean }) | null;
        isActive: boolean;
        isCockpitView: boolean;
        steeringHoveredBody: Body | null;
        altOrbitActive: boolean;
    };
    private getSelectedBody: () => Body | null;

    constructor(
        uiScene: THREE.Scene,
        autopilotState: IAutopilotState,
        interactionState: {
            isChangingVelocity: boolean;
            isMiddleMouseVelocity: boolean;
            velocityEditMode: string;
        },
        cameraState: { isFreeCameraMode: boolean; isTargetMode: boolean },
        simulationState: { bodies: Body[] },
        flightState: {
            knownShip: (Body & { warpActive?: boolean }) | null;
            isActive: boolean;
            isCockpitView: boolean;
            steeringHoveredBody: Body | null;
            altOrbitActive: boolean;
        },
        getSelectedBody: () => Body | null
    ) {
        this.uiScene = uiScene;
        this.autopilotState = autopilotState;
        this.interactionState = interactionState;
        this.cameraState = cameraState;
        this.simulationState = simulationState;
        this.flightState = flightState;
        this.getSelectedBody = getSelectedBody;
    }

    /** Create all HUD sprites and add them to uiScene. Call once after construction. */
    init(): void {
        this._initWarp();
        this._initOrbitNotify();
        this._initHint();
        this._initThermal();
        this._initWeapon();
        this._initShipStatus();
    }

    private _initWarp(): void {
        this.warpSprite = new HudSprite(this.uiScene);
        this.setWarpChargeContent(0);
        // Bottom-center of the screen
        this.warpSprite.setAnchor({ corner: 'bottom-center', offsetX: 0, offsetY: 50 });
    }

    private _initOrbitNotify(): void {
        this.orbitNotifySprite = new HudSprite(this.uiScene);
        this.orbitNotifySprite.setCanvasSize(PHASE_W, PHASE_H);
        this.orbitNotifySprite.draw('NONE|', (ctx) => paintAutopilotPhase(ctx, 'NONE'));
        // 900×100 canvas → 800×80 screen-pixel sprite (two-line display).
        this.orbitNotifySprite.setScale(800, 80);
        // Bottom-center, above the warp bar
        this.orbitNotifySprite.setAnchor({ corner: 'bottom-center', offsetX: 0, offsetY: 120 });
    }

    private _initHint(): void {
        this.hintSprite = new HudSprite(this.uiScene);
        this.hintSprite.setCanvasSize(HINT_W, HINT_H);
        this.hintSprite.draw('', (ctx) => paintHint(ctx, []));
        this.hintSprite.setScale(1100, 95); // allow 1-2 lines (wider to avoid clipping)
        // Top-center of the screen (slightly below top edge)
        this.hintSprite.setAnchor({ corner: 'top-center', offsetX: 0, offsetY: -55 });
    }

    private _initThermal(): void {
        this.thermalSprite = new HudSprite(this.uiScene);
        this.thermalSprite.setCanvasSize(THERMAL_W, THERMAL_H);
        this.thermalSprite.draw('0.000|false', (ctx) => paintThermalGauge(ctx, 0, false, 0));
        // 90×170 canvas → 48×90 screen pixels; positioned each frame beside the gray steering ring
        this.thermalSprite.setScale(48, 90);
    }

    private _initWeapon(): void {
        this.weaponSprite = new HudSprite(this.uiScene);
        this.weaponSprite.setCanvasSize(WEAPON_LABEL_W, WEAPON_LABEL_H);
        this.weaponSprite.draw('||false', (ctx) => paintWeaponLabel(ctx, '', 1, 1, false));
        this.weaponSprite.setScale(WEAPON_LABEL_SCALE_W, WEAPON_LABEL_SCALE_H);
        // Positioned each frame above the heat gauge, beside the steering ring (setScreenPos).
    }

    private _initShipStatus(): void {
        this.shipStatusSprite = new HudSprite(this.uiScene);
        this.shipStatusSprite.setCanvasSize(SHIP_STATUS_CANVAS_W, SHIP_STATUS_CANVAS_H);
        this.shipStatusSprite.draw('1.000|1.000', (ctx) => paintShipStatus(ctx, 1, 1));
        this.shipStatusSprite.setScale(SHIP_STATUS_SPRITE_W, SHIP_STATUS_SPRITE_H);
        // Bottom-right, in the same column as the speed readout and directly above it.
        this.shipStatusSprite.setAnchor({
            corner: 'bottom-right',
            offsetX: SHIP_STATUS_OFFSET_X,
            offsetY: SHIP_STATUS_OFFSET_Y,
        });
    }

    /** Reposition the screen-anchored HUD sprites for a new viewport size. */
    layout(width: number, height: number): void {
        this.warpSprite?.layout(width, height);
        this.orbitNotifySprite?.layout(width, height);
        this.hintSprite?.layout(width, height);
        this.shipStatusSprite?.layout(width, height);
    }

    /** Show the orbit-notify sprite and reset its timer. */
    showOrbitNotify(): void {
        if (!this.orbitNotifySprite) return;
        this.orbitNotifySprite.visible = true;
        this.autopilotState.orbitNotifyTimer = AUTOPILOT_ORBIT_NOTIFY_DURATION;
    }

    /** Update warp sprite to show charge-bar state; makes it visible. */
    setWarpCharge(fill: number): void {
        if (!this.warpSprite) return;
        this.setWarpChargeContent(fill);
        this.warpSprite.visible = true;
    }

    /** Update warp sprite to show "WARP ACTIVE" pulse; makes it visible. */
    setWarpActive(pulse: number): void {
        const sprite = this.warpSprite;
        if (!sprite) return;
        sprite.setCanvasSize(WARP_ACTIVE_W, WARP_ACTIVE_H);
        sprite.draw(`active|${pulse.toFixed(3)}`, (ctx) => paintWarpActive(ctx, pulse));
        sprite.setScale(320, 60);
        sprite.visible = true;
    }

    /** Hide the warp sprite. */
    hideWarpSprite(): void {
        if (this.warpSprite) this.warpSprite.visible = false;
    }

    private setWarpChargeContent(fill: number): void {
        const sprite = this.warpSprite!;
        sprite.setCanvasSize(WARP_CHARGE_W, WARP_CHARGE_H);
        // Keyed at 3 decimals — the bar is ~432 px wide, so this is sub-pixel.
        sprite.draw(`charge|${fill.toFixed(3)}`, (ctx) => paintWarpCharge(ctx, fill));
        // 512×128 canvas at 0.625 ratio → 320×80 screen pixels
        sprite.setScale(320, 80);
    }

    /** Update the thermal gauge fill/overheat state and anchor it beside `anchorPos` (the gray steering ring). */
    updateThermalHUD(heat: number, overheated: boolean, anchorPos: THREE.Vector3): void {
        const sprite = this.thermalSprite;
        if (!sprite) return;
        sprite.setScreenPos(anchorPos.x + THERMAL_GAUGE_OFFSET_X, anchorPos.y);

        const fill = Math.max(0, Math.min(1, heat));
        // The overheat flash animates on wall-clock time, so it must be part of the key.
        const flashPulse = overheated ? (Math.sin(Date.now() * 0.012) + 1) * 0.5 : 0;
        const key = `${fill.toFixed(3)}|${overheated}|${flashPulse.toFixed(3)}`;
        sprite.draw(key, (ctx) => paintThermalGauge(ctx, heat, overheated, flashPulse));
        sprite.visible = true;
    }

    /** Hide the thermal gauge. */
    hideThermalSprite(): void {
        if (this.thermalSprite) this.thermalSprite.visible = false;
    }

    /**
     * Update the weapon-selector label and position it above the heat gauge (which
     * shares `anchorPos`, the gray steering ring). `index` is 1-based, matching what
     * the pilot reads.
     */
    updateWeaponHUD(
        name: string,
        index: number,
        count: number,
        overheated: boolean,
        anchorPos: THREE.Vector3
    ): void {
        const sprite = this.weaponSprite;
        if (!sprite) return;
        sprite.setScreenPos(
            anchorPos.x + WEAPON_LABEL_OFFSET_X,
            anchorPos.y + WEAPON_LABEL_OFFSET_Y
        );
        sprite.draw(`${name}|${index}|${count}|${overheated}`, (ctx) =>
            paintWeaponLabel(ctx, name, index, count, overheated)
        );
        sprite.visible = true;
    }

    /** Hide the weapon-selector label. */
    hideWeaponSprite(): void {
        if (this.weaponSprite) this.weaponSprite.visible = false;
    }

    /**
     * Update the ship vitals panel (shield over hull) from `ship` and make it visible.
     * The bars are always drawn while flying — a full shield/hull reads as a full bar —
     * unlike the world-space health bar, which only appears once a body is damaged.
     */
    updateShipStatusHUD(ship: Spaceship): void {
        const sprite = this.shipStatusSprite;
        if (!sprite) return;

        const shieldFraction =
            ship.maxShieldPoints > 0
                ? Math.max(0, Math.min(1, ship.shieldPoints / ship.maxShieldPoints))
                : 0;
        const hullFraction =
            ship.maxHealthPoints > 0
                ? Math.max(0, Math.min(1, ship.healthPoints / ship.maxHealthPoints))
                : 0;

        // Keyed at 3 decimals: the bars are ~370px wide, so this is well below one pixel.
        sprite.draw(`${shieldFraction.toFixed(3)}|${hullFraction.toFixed(3)}`, (ctx) =>
            paintShipStatus(ctx, shieldFraction, hullFraction)
        );
        sprite.visible = true;
    }

    /** Hide the ship vitals panel (called whenever flight mode is not active). */
    hideShipStatus(): void {
        if (this.shipStatusSprite) this.shipStatusSprite.visible = false;
    }

    /**
     * Unified warp-sprite update for both flight-mode and background.
     * Call once per frame instead of duplicating charge/active/hide logic.
     *
     * @param ship  The spaceship (or null if disposed).
     * @param chargeFill  Current charge fill in [0, 1]. Passed in so caller can
     *                    compute it once (avoids duplicating the fill calculation).
     */
    updateWarpHUD(warpCharging: boolean, warpActive: boolean, chargeFill: number): void {
        if (warpCharging) {
            this.setWarpCharge(chargeFill);
        } else if (warpActive) {
            const pulse = (Math.sin(Date.now() * 0.005) + 1) * 0.5;
            this.setWarpActive(pulse);
        } else {
            this.hideWarpSprite();
        }
    }

    /**
     * Update the autopilot phase HUD sprite. Call once per animate frame.
     * @param dt Elapsed seconds since last frame.
     */
    updateAutopilotHUD(dt: number): void {
        if (!this.orbitNotifySprite) return;

        // Determine desired HUD state
        let desiredHud: AutopilotHudState = 'NONE';
        if (this.autopilotState.isActive) {
            if (this.autopilotState.phase === 'ALIGN') {
                desiredHud = 'ALIGN';
            } else if (
                this.autopilotState.phase === 'WARP_CHARGING' ||
                this.autopilotState.phase === 'WARP'
            ) {
                desiredHud = 'APPROACH_WARP';
            } else if (this.autopilotState.phase === 'CIRCULARIZE') {
                desiredHud = 'CIRCULARIZE';
            } else if (this.autopilotState.phase === 'TIDAL_LOCK') {
                desiredHud = 'TIDAL_LOCK';
            } else if (this.autopilotState.phase === 'BRAKE') {
                desiredHud = 'BRAKE';
            } else if (this.autopilotState.isBoostActive) {
                desiredHud = 'APPROACH_BOOST';
            } else {
                desiredHud = 'APPROACH';
            }
        } else if (this.autopilotBlockedNotifyTimer > 0) {
            desiredHud = 'BLOCKED';
        } else if (this.autopilotState.orbitNotifyTimer > 0) {
            desiredHud = 'ORBIT';
        }

        if (desiredHud === 'NONE') {
            this.orbitNotifySprite.visible = false;
        } else {
            this.orbitNotifySprite.visible = true;

            // Build label for the autopilot HUD sprite.
            let distLabel = '';
            if (desiredHud === 'BLOCKED') {
                distLabel = this.autopilotBlockedByName
                    ? `Blocked by: ${this.autopilotBlockedByName}`
                    : '';
            } else if (this.autopilotState.isActive && this.autopilotState.targetBody?.mesh) {
                const ship = this.flightState.knownShip;
                if (ship?.mesh) {
                    const rawDist = ship.mesh.position.distanceTo(
                        this.autopilotState.targetBody.mesh.position
                    );
                    const orbitRadius =
                        this.autopilotState.targetBody.radius * AUTOPILOT_ORBIT_ALTITUDE_FACTOR;
                    const distToOrbit = Math.max(0, rawDist - orbitRadius);
                    distLabel = `Distance to target: ${formatDistance(distToOrbit)}`;
                }
            }

            // Repainted only when the phase or the formatted distance actually changes.
            this.orbitNotifySprite.draw(`${desiredHud}|${distLabel}`, (ctx) =>
                paintAutopilotPhase(ctx, desiredHud, distLabel)
            );

            // Tick down the autopilot HUD timers
            if (desiredHud === 'ORBIT') {
                this.autopilotState.orbitNotifyTimer -= dt;
            } else if (desiredHud === 'BLOCKED') {
                this.autopilotBlockedNotifyTimer -= dt;
                if (this.autopilotBlockedNotifyTimer <= 0) {
                    this.autopilotBlockedNotifyTimer = 0;
                    this.autopilotBlockedByName = '';
                }
            }
        }
    }

    /** Update hint sprite each frame (texture only redrawn when text changes). */
    updateHintSprite(): void {
        if (!this.hintSprite) return;

        const hint = this._getActiveContextHint();
        this.hintSprite.visible = hint.visible;
        if (!hint.visible) return;

        const lines = hint.lines;
        this.hintSprite.draw(lines.join('\n'), (ctx) => paintHint(ctx, lines));
    }

    /** Force an immediate re-render of the hint sprite (call after camera/selection changes). */
    forceHintRefresh(): void {
        try {
            // Always recompute the hint, and force-apply both visibility and texture.
            // This avoids "stuck" hint sprites when switching camera modes.
            if (!this.hintSprite) return;

            const hint = this._getActiveContextHint();
            this.hintSprite.visible = hint.visible;

            // Ensure we don't keep stale text around when hidden
            const lines = hint.visible ? hint.lines : [];
            this.hintSprite.invalidate();
            this.hintSprite.draw(lines.join('\n'), (ctx) => paintHint(ctx, lines));
        } catch (e) {
            console.error('Error refreshing flight HUD hint:', e);
        }
    }

    private _getActiveContextHint(): { visible: boolean; lines: string[] } {
        // Highest priority: velocity dragging hint (existing behavior)
        const draggingVel =
            this.interactionState.isChangingVelocity || this.interactionState.isMiddleMouseVelocity;
        if (draggingVel) {
            const mode = this.interactionState.velocityEditMode || 'xz';
            return {
                visible: true,
                lines: [
                    `Dragging velocity — press G to switch modes (XZ ↔ Y) | Mode: ${mode.toUpperCase()}`,
                ],
            };
        }

        // Flight mode hints (active spaceship steering)
        if (this.flightState.isActive) {
            if (this.flightState.knownShip?.warpActive) {
                return {
                    visible: true,
                    lines: ['WARP ACTIVE — Press [Space] to disengage'],
                };
            }

            if (this.autopilotState.isActive) {
                return {
                    visible: true,
                    lines: [
                        'AUTOPILOT ENGAGED — Press [E] to cancel',
                        'Hold ALT to orbit camera around ship',
                    ],
                };
            }

            if (this.flightState.altOrbitActive) {
                return {
                    visible: true,
                    lines: [
                        'ALT orbit camera — Mouse rotates around ship',
                        'Release ALT to return to steering controls',
                    ],
                };
            }

            // Check if there's a hovered body (potential autopilot target)
            const hovered = this.flightState.steeringHoveredBody;
            if (hovered && !hovered._isDisposed) {
                return {
                    visible: true,
                    lines: [
                        `W Thrust | S Brake | A/D Roll | Shift Boost | [Space] Warp | [G] Weapon`,
                        `Hold [E] → ${hovered.name} | [C] View | [Esc] Exit | LMB Fire`,
                    ],
                };
            }

            // Default flight controls hint
            return {
                visible: true,
                lines: [
                    'W Thrust | S Brake | A/D Roll | Shift Boost | [Space] Warp | [G] Weapon',
                    `[C] View (${this.flightState.isCockpitView ? 'cockpit' : '3rd person'}) | [E] Autopilot target | [Esc] Exit | LMB Fire`,
                ],
            };
        }

        const selectedBody = this.getSelectedBody();
        const selected =
            selectedBody && this.simulationState.bodies.includes(selectedBody)
                ? selectedBody
                : null;

        const isFree = !!this.cameraState.isFreeCameraMode;
        const isTarget = !!this.cameraState.isTargetMode;

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
}
