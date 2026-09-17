import * as THREE from 'three';
import { Body } from '../bodies/body';
import { IAutopilotState, ISimulationState } from '../interfaces';
import { formatDistance } from '../utilities/display-format';
import { HudSprite } from './hud/hud-sprite';
import { HudSpritePool } from './hud/hud-sprite-pool';
import {
    createScreenProjection,
    ProjectionBuffer,
    ScreenProjector,
    type ScreenProjection,
} from './hud/screen-projection';
import {
    CANCEL_RING_THEME,
    CANCEL_THEME,
    drawKeyPromptRing,
    drawPanelFrame,
    getMeasureContext,
    HUD_RING_THEME,
    panelThemeFor,
} from './hud/hud-paint';
import { Probe } from '../bodies/probe';

// ── Layout constants ────────────────────────────────────────────────────────
const PAD = 12;
const ACCENT_LEN = 10;
const NAME_Y = 40;
const DIST_Y = 78;
const BOTTOM_PAD = 18;

/** Minimum canvas width (avoids degenerate panels for short names). */
const MIN_CONTENT_W = 80;

/** Height of the panel without the autopilot ring section. */
const BASE_PANEL_H = DIST_Y + 20 + BOTTOM_PAD;
/** Extra height added when the ring section is shown. */
const RING_SECTION_H = 60;
/** Y position of the probe-scan countdown line, when shown. */
const SCAN_Y = DIST_Y + 34;
/** Extra height added when the probe-scan countdown line is shown. */
const SCAN_LINE_H = 34;

const RING_RADIUS = 20;
/** Ring is left-anchored inside the panel. */
const RING_CX = PAD + ACCENT_LEN + 4 + RING_RADIUS + 4;

const AUTOPILOT_LABEL = 'Autopilot here';
const CANCEL_LABEL = 'Cancel autopilot';
const CANCEL_PANEL_H = 56;

/** Minimum apparent screen radius for hover detection, so small distant bodies stay selectable. */
const MIN_HOVER_APPARENT_R = 50;

// ── Reference sprite scale ───────────────────────────────────────────────────
const REF_CANVAS_W = 512;
const REF_SPRITE_W = 320;
const REF_CANVAS_H = 120;
const REF_SPRITE_H = 75;

// ── Flight hover context ─────────────────────────────────────────────────────

/**
 * Context passed to PlanetNameIndicator.update() during flight mode.
 * Provides the steering line tip position and autopilot charge state
 * needed to render the E-key autopilot prompt below body panels.
 */
export interface IPlanetNameFlightContext {
    /** True when flight mode is active (panel will perform hover detection). */
    isActive: boolean;
    /** True when the steering line is currently visible (not during warp / alt-orbit). */
    steeringLineVisible: boolean;
    /** Steering-line tip X in UI screen-space coordinates (pixels from screen centre). */
    steeringTipX: number;
    /** Steering-line tip Y in UI screen-space coordinates (pixels from screen centre). */
    steeringTipY: number;
    /** Seconds the E key has been held on the current hovered body (0–chargeTime). */
    autopilotCharge: number;
    /** Total seconds required to fully charge (matches FLIGHT_AUTOPILOT_CHARGE_TIME). */
    chargeTime: number;
    /** The player's active ship — its name label is suppressed in flight mode. */
    activeShip: Body | null;
}

// ── Panel painting ───────────────────────────────────────────────────────────

/** Canvas dimensions needed to fit a name/distance panel, with or without the ring section. */
function measureNamePanel(
    name: string,
    distLabel: string,
    hasRing: boolean,
    scanLabel: string | null = null
): [number, number] {
    const ctx = getMeasureContext();

    ctx.font = 'bold 32px monospace';
    const nameW = ctx.measureText(name).width;

    ctx.font = '22px monospace';
    const distW = ctx.measureText(distLabel).width;

    ctx.font = '20px monospace';
    const scanW = scanLabel ? ctx.measureText(scanLabel).width : 0;

    // Ensure the canvas is wide enough for the ring label when active
    let minContentW = MIN_CONTENT_W;
    if (hasRing) {
        const ringLabelW = ctx.measureText(AUTOPILOT_LABEL).width;
        // circleLeftMargin(30) + diameter(40) + gap(8) + labelW + rightPad
        minContentW = Math.max(minContentW, 30 + 40 + 8 + ringLabelW + PAD);
    }

    const contentW = Math.max(nameW, distW, scanW, minContentW);
    const innerW = contentW + PAD * 2;
    const fullW = innerW + ACCENT_LEN * 2 + 4;
    const baseH = scanLabel ? BASE_PANEL_H + SCAN_LINE_H : BASE_PANEL_H;
    const totalH = hasRing ? baseH + RING_SECTION_H : baseH;

    return [fullW, totalH];
}

/**
 * Draw the name+distance panel, plus the E-key autopilot prompt when `ringFill` is >= 0.
 * @param ringFill -1 = no ring section; 0–1 = ring visible with that fill progress.
 */
function paintNamePanel(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    name: string,
    distLabel: string,
    ringFill: number,
    isThreat: boolean,
    scanLabel: string | null = null
): void {
    ctx.clearRect(0, 0, width, height);

    const theme = panelThemeFor(isThreat);
    drawPanelFrame(ctx, width, height, PAD, ACCENT_LEN, theme);

    const cx = width / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Name — bold, glowing accent
    ctx.font = 'bold 32px monospace';
    ctx.shadowBlur = 12;
    ctx.shadowColor = theme.glow;
    ctx.fillStyle = theme.accent;
    ctx.fillText(name, cx, NAME_Y);

    // Distance — dim white
    ctx.font = '22px monospace';
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(distLabel, cx, DIST_Y);

    // Probe scan countdown — cyan, below the distance line
    let contentBaseH = BASE_PANEL_H;
    if (scanLabel) {
        ctx.font = '20px monospace';
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.fillStyle = 'rgba(0, 255, 204, 0.9)';
        ctx.fillText(scanLabel, cx, SCAN_Y);
        contentBaseH = BASE_PANEL_H + SCAN_LINE_H;
    }

    if (ringFill < 0) return;

    // Separator line between the name/dist area and the ring row
    const sepY = contentBaseH - BOTTOM_PAD / 2;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD + 6, sepY);
    ctx.lineTo(width - PAD - 6, sepY);
    ctx.stroke();

    drawKeyPromptRing(ctx, {
        cx: RING_CX,
        cy: contentBaseH + RING_SECTION_H / 2,
        radius: RING_RADIUS,
        fill: ringFill,
        key: 'E',
        label: AUTOPILOT_LABEL,
        theme: HUD_RING_THEME,
    });
}

/** Width of the compact cancel-autopilot panel. Constant, since its label never changes. */
function measureCancelPanel(): number {
    const ctx = getMeasureContext();
    ctx.font = '20px monospace';
    const labelW = ctx.measureText(CANCEL_LABEL).width;
    return Math.ceil(RING_CX + RING_RADIUS + 10 + labelW + PAD);
}

/**
 * Draw a compact cancel-autopilot ring widget (no name/distance header).
 * Shows a red-orange "E" ring with "Cancel autopilot" label.
 */
function paintCancelPanel(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.clearRect(0, 0, width, height);

    drawPanelFrame(ctx, width, height, PAD, ACCENT_LEN, CANCEL_THEME);

    drawKeyPromptRing(ctx, {
        cx: RING_CX,
        cy: height / 2,
        radius: RING_RADIUS,
        fill: -1,
        key: 'E',
        label: CANCEL_LABEL,
        theme: CANCEL_RING_THEME,
        keyColor: '#ffffff',
    });
}

// ── PlanetNameIndicator ──────────────────────────────────────────────────────

export class PlanetNameIndicator {
    private readonly uiScene: THREE.Scene;
    private readonly simulationState: ISimulationState;

    /** Pooled panel sprites, one per visible named body. */
    private readonly pool: HudSpritePool<HudSprite>;

    /** Dedicated sprite for the flight-hover panel when showNames is OFF. */
    private hoverSprite: HudSprite | null = null;

    /** Dedicated sprite for the cancel-autopilot ring shown when hovering the active autopilot target. */
    private cancelSprite: HudSprite | null = null;

    /**
     * While the user is holding E to charge autopilot, this is locked to the body
     * that was hovered when charging began.  Prevents the hover display from
     * vanishing if the mouse drifts slightly off the body mid-charge.
     */
    private chargeLockedBody: Body | null = null;

    /** Reused per-frame projection buffer — no object literals allocated per body. */
    private readonly visible = new ProjectionBuffer();
    /** Scratch projection struct for the hover / cancel probes, which look at one body at a time. */
    private readonly probe: ScreenProjection = createScreenProjection();

    /**
     * Set each frame by update(). The body whose projected position is nearest
     * the steering-line tip (within its apparent screen radius). Null when none.
     */
    public steeringHoveredBody: Body | null = null;

    constructor(uiScene: THREE.Scene, simulationState: ISimulationState) {
        this.uiScene = uiScene;
        this.simulationState = simulationState;
        this.pool = new HudSpritePool(() => new HudSprite(this.uiScene));
    }

    /**
     * Called every animation frame.
     *
     * @param projector      Shared projector, already primed for this frame via `beginFrame`.
     * @param autopilotState Suppresses the name label for the current autopilot target to
     *                       avoid duplication with the target indicator.
     * @param flightContext  When provided and active, enables hover detection (steering tip
     *                       vs. body screen position) and renders the E-key autopilot prompt
     *                       on the hovered body. Runs regardless of the showNames setting.
     */
    update(
        projector: ScreenProjector,
        autopilotState?: IAutopilotState,
        flightContext?: IPlanetNameFlightContext
    ): void {
        const bodies = this.simulationState.bodies;
        const showNames = this.simulationState.showNames;

        // ── Hover detection (always runs in flight mode, independent of showNames) ──
        const isFlightHoverActive = !!(
            flightContext?.isActive && flightContext.steeringLineVisible
        );
        const isCharging = !!(flightContext && flightContext.autopilotCharge > 0);

        let hoveredBody: Body | null;

        if (!isCharging) {
            // No active charge — normal hover detection, and clear any stale lock
            this.chargeLockedBody = null;
            hoveredBody = this.findHoveredBody(projector, isFlightHoverActive, flightContext);
        } else if (this.chargeLockedBody && !this.chargeLockedBody._isDisposed) {
            // Charging is active and a lock exists — hold hover on the locked body
            // regardless of where the steering tip currently is.
            hoveredBody = this.chargeLockedBody;
        } else {
            // Charging just started (no lock set yet) — run detection once to establish the lock
            hoveredBody = this.findHoveredBody(projector, isFlightHoverActive, flightContext);
            if (hoveredBody) this.chargeLockedBody = hoveredBody;
        }

        this.steeringHoveredBody = hoveredBody;

        // Whether the autopilot target indicator is already covering its target
        const apTargetHidden = !!(
            autopilotState?.isActive &&
            autopilotState.targetBody != null &&
            autopilotState.phase !== 'TIDAL_LOCK'
        );

        // Ring fill for the hovered body (–1 = no ring section shown).
        // Suppressed entirely while autopilot is active to avoid cluttering the view.
        let computedRingFill = -1;
        if (isFlightHoverActive && hoveredBody && !apTargetHidden) {
            computedRingFill = Math.min(
                1,
                flightContext!.autopilotCharge / flightContext!.chargeTime
            );
        }

        // ── Regular names pass (gated by showNames) ───────────────────────
        this.visible.reset();

        if (showNames) {
            for (let i = 0; i < bodies.length; i++) {
                const body = bodies[i];
                if (!body || !body.name) continue;
                // Skip the autopilot target — the target indicator already shows name+dist
                if (apTargetHidden && body === autopilotState!.targetBody) continue;
                // In flight mode, suppress the player ship's own label
                if (isFlightHoverActive && body === flightContext!.activeShip) continue;

                const slot = this.visible.next();
                if (!projector.project(body, slot) || !slot.onScreen) {
                    this.visible.rollback();
                }
            }
        }

        const sprites = this.pool.acquire(this.visible.length);

        for (let i = 0; i < this.visible.length; i++) {
            const p = this.visible.at(i);
            // Pass ring fill only for the hovered body
            const ringFill = isFlightHoverActive && p.body === hoveredBody ? computedRingFill : -1;
            this.renderPanel(sprites[i], p.body, p.camDist, ringFill, p.uiX, p.uiY);
        }

        this.updateHoverSprite(
            projector,
            isFlightHoverActive,
            hoveredBody,
            showNames,
            apTargetHidden,
            computedRingFill
        );
        this.updateCancelSprite(projector, flightContext, autopilotState, apTargetHidden);
    }

    /** Free all GPU resources. */
    dispose(): void {
        this.pool.dispose();
        this.hoverSprite?.dispose();
        this.hoverSprite = null;
        this.cancelSprite?.dispose();
        this.cancelSprite = null;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * The body whose projected centre is nearest the steering-line tip and within its own
     * apparent screen radius, or null when nothing qualifies.
     *
     * Unlike the names pass this deliberately accepts bodies outside the NDC box — only the
     * behind-camera test applies — so a body partly off the edge can still be targeted.
     */
    private findHoveredBody(
        projector: ScreenProjector,
        isFlightHoverActive: boolean,
        flightContext?: IPlanetNameFlightContext
    ): Body | null {
        if (!isFlightHoverActive || !flightContext) return null;

        const bodies = this.simulationState.bodies;
        if (bodies.length === 0) return null;

        const tipX = flightContext.steeringTipX;
        const tipY = flightContext.steeringTipY;

        let best: Body | null = null;
        let bestScreenDist = Infinity;

        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (!body) continue;
            if (body === flightContext.activeShip) continue; // skip own ship

            const p = this.probe;
            if (!projector.project(body, p)) continue;
            if (p.nz >= 1) continue; // behind camera

            const apparentR = projector.apparentRadius(
                body.radius,
                p.camDist,
                MIN_HOVER_APPARENT_R
            );
            const screenDist = Math.hypot(p.uiX - tipX, p.uiY - tipY);

            if (screenDist < apparentR && screenDist < bestScreenDist) {
                bestScreenDist = screenDist;
                best = body;
            }
        }

        return best;
    }

    /** Size, paint and place one name panel. */
    private renderPanel(
        sprite: HudSprite,
        body: Body,
        camDist: number,
        ringFill: number,
        uiX: number,
        uiY: number
    ): void {
        const name = body.name;
        const distLabel = formatDistance(camDist);
        const isThreat = body.isThreat;
        const hasRing = ringFill >= 0;
        
        // Set the current probe scan status
        let scanLabel = null;
        if (body instanceof Probe) {
            if (body.activeScan) {
                scanLabel = `Scanning… ${Math.ceil(body.activeScan.remainingSeconds)}s`;
            } else if (body.scanComplete) {
                scanLabel = `Scan complete`;
            } else {
                scanLabel = `Out of scan range`;
            }
        }

        const [fullW, totalH] = measureNamePanel(name, distLabel, hasRing, scanLabel);
        sprite.setCanvasSize(fullW, totalH);
        sprite.draw(
            `${name}|${distLabel}|${ringFill.toFixed(3)}|${isThreat}|${scanLabel}`,
            (ctx, w, h) => paintNamePanel(ctx, w, h, name, distLabel, ringFill, isThreat, scanLabel)
        );

        const spriteW = (fullW / REF_CANVAS_W) * REF_SPRITE_W;
        const spriteH = (totalH / REF_CANVAS_H) * REF_SPRITE_H;
        sprite.setScale(spriteW, spriteH);
        sprite.setScreenPos(uiX, uiY + spriteH / 2 + 10);
        sprite.visible = true;
    }

    /** The hover-only panel, shown when a body is hovered in flight mode while showNames is OFF. */
    private updateHoverSprite(
        projector: ScreenProjector,
        isFlightHoverActive: boolean,
        hoveredBody: Body | null,
        showNames: boolean,
        apTargetHidden: boolean,
        ringFill: number
    ): void {
        // Suppress the hover panel while autopilot is active — the target indicator
        // and cancel-ring sprite already provide all the needed context.
        if (!isFlightHoverActive || !hoveredBody || showNames || apTargetHidden) {
            if (this.hoverSprite) this.hoverSprite.visible = false;
            return;
        }

        if (!this.hoverSprite) this.hoverSprite = new HudSprite(this.uiScene);

        const p = this.probe;
        if (!projector.project(hoveredBody, p)) {
            this.hoverSprite.visible = false;
            return;
        }

        this.renderPanel(this.hoverSprite, hoveredBody, p.camDist, ringFill, p.uiX, p.uiY);
    }

    /** The cancel-autopilot ring, shown whenever the active autopilot target is on screen. */
    private updateCancelSprite(
        projector: ScreenProjector,
        flightContext: IPlanetNameFlightContext | undefined,
        autopilotState: IAutopilotState | undefined,
        apTargetHidden: boolean
    ): void {
        const targetBody = apTargetHidden ? autopilotState!.targetBody : null;

        if (!flightContext?.isActive || !targetBody) {
            if (this.cancelSprite) this.cancelSprite.visible = false;
            return;
        }

        const p = this.probe;
        if (!projector.project(targetBody, p)) {
            if (this.cancelSprite) this.cancelSprite.visible = false;
            return;
        }

        // Show as long as the target is in front of the camera and roughly on screen
        if (p.nz >= 1 || Math.abs(p.nx) > 1.1 || Math.abs(p.ny) > 1.1) {
            if (this.cancelSprite) this.cancelSprite.visible = false;
            return;
        }

        if (!this.cancelSprite) this.cancelSprite = new HudSprite(this.uiScene);

        const width = measureCancelPanel();
        this.cancelSprite.setCanvasSize(width, CANCEL_PANEL_H);
        this.cancelSprite.draw('cancel', (ctx, w, h) => paintCancelPanel(ctx, w, h));

        const spriteW = (width / REF_CANVAS_W) * REF_SPRITE_W;
        const spriteH = (CANCEL_PANEL_H / REF_CANVAS_H) * REF_SPRITE_H;
        this.cancelSprite.setScale(spriteW, spriteH);
        // Position below the body (the target indicator sits above it)
        this.cancelSprite.setScreenPos(p.uiX, p.uiY - spriteH / 2 - 10);
        this.cancelSprite.visible = true;
    }
}
