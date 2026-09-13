import * as THREE from 'three';
import { Body } from '../bodies/body';
import { IAutopilotState } from '../interfaces';
import { AUTOPILOT_ORBIT_ALTITUDE_FACTOR } from '../utilities/consts';
import { formatDistance, formatETA } from '../utilities/display-format';
import { HudSprite, SharedTextureSprite } from './hud/hud-sprite';
import {
    createEdgeMarker,
    createScreenProjection,
    ScreenProjector,
    type EdgeMarker,
    type ScreenProjection,
} from './hud/screen-projection';
import {
    createChevronTexture,
    drawPanelFrame,
    getMeasureContext,
    panelThemeFor,
} from './hud/hud-paint';

// ── Layout constants ─────────────────────────────────────────────────────────
const PAD = 15;
const ACCENT_LEN = 14;
// Text Y positions measured from top of padded area (like original layout)
const NAME_Y = 52;
const DIST_Y = 100;
const ETA_Y = 135;
// Total bottom padding after ETA (matching original ~25px bottom margin)
const BOTTOM_PAD = 25;

// Reference sprite scale from the original fixed canvas (512×160 → 360×112).
// Used as a baseline so dynamic sizing matches the same pixel density.
const REF_CANVAS_W = 512;
const REF_SPRITE_W = 360;
const REF_CANVAS_H = 160;
const REF_SPRITE_H = 112;

/** Pixels of clearance kept between the edge chevron and the viewport edge. */
const EDGE_MARGIN_PX = 30;

// ── Helpers ──────────────────────────────────────────────────────────────────

// Module scratch, so the per-frame closing-speed calculation allocates nothing.
const _closingDir = new THREE.Vector3();
const _closingRelVel = new THREE.Vector3();

function computeClosingSpeed(ship: Body, target: Body): number {
    _closingDir.subVectors(target.mesh.position, ship.mesh.position);
    const dist = _closingDir.length();
    if (dist === 0) return 0;
    _closingDir.divideScalar(dist);
    _closingRelVel.subVectors(ship.velocity, target.velocity);
    return Math.max(0, _closingRelVel.dot(_closingDir));
}

/** Canvas dimensions needed to fit the panel's three text rows. */
function measurePanel(name: string, distLabel: string, etaLabel: string): [number, number] {
    const ctx = getMeasureContext();

    ctx.font = 'bold 38px monospace';
    const nameW = ctx.measureText(name).width;

    ctx.font = '25px monospace';
    const distW = ctx.measureText(distLabel).width;

    ctx.font = '23px monospace';
    const etaW = ctx.measureText(etaLabel).width;

    // Content area: text centred, with PAD on each side; floor is 100px wide
    const contentW = Math.max(nameW, distW, etaW, 100);
    const innerW = contentW + PAD * 2;
    // Full canvas width: inner area + accent bracket width on both sides (+4 for border linewidth room)
    const fullW = innerW + ACCENT_LEN * 2 + 4;
    // Height: fixed Y positions + bottom pad (23 ≈ half font height, matches the original 160)
    const fullH = ETA_Y + 23 + BOTTOM_PAD;

    return [fullW, fullH];
}

function paintInfoPanel(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    name: string,
    distLabel: string,
    etaLabel: string,
    isThreat: boolean
): void {
    ctx.clearRect(0, 0, width, height);

    const theme = panelThemeFor(isThreat);
    drawPanelFrame(ctx, width, height, PAD, ACCENT_LEN, theme);

    const cx = width / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Name
    ctx.font = 'bold 38px monospace';
    ctx.shadowBlur = 14;
    ctx.shadowColor = theme.glow;
    ctx.fillStyle = theme.accent;
    ctx.fillText(name, cx, NAME_Y);

    // Distance
    ctx.font = '25px monospace';
    ctx.shadowBlur = 5;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
    ctx.fillText(distLabel, cx, DIST_Y);

    // ETA
    ctx.font = '23px monospace';
    ctx.fillStyle = 'rgba(130, 255, 210, 0.85)';
    ctx.fillText(etaLabel, cx, ETA_Y);
}

// ── AutopilotTargetIndicator ─────────────────────────────────────────────────

/**
 * Shows where the autopilot is heading: an info panel above the target while it is on
 * screen, or a chevron riding the screen edge and pointing at it when it is not.
 *
 * The panel canvas is repainted only when its text changes, so holding a steady approach
 * costs nothing beyond repositioning the sprite.
 */
export class AutopilotTargetIndicator {
    private readonly uiScene: THREE.Scene;
    private readonly autopilotState: IAutopilotState;
    private readonly flightState: { knownShip: Body | null };

    private infoSprite: HudSprite | null = null;
    private edgeSprite: SharedTextureSprite | null = null;
    private chevronTexture: THREE.CanvasTexture | null = null;

    private readonly projection: ScreenProjection = createScreenProjection();
    private readonly edge: EdgeMarker = createEdgeMarker();

    constructor(
        uiScene: THREE.Scene,
        autopilotState: IAutopilotState,
        flightState: { knownShip: Body | null }
    ) {
        this.uiScene = uiScene;
        this.autopilotState = autopilotState;
        this.flightState = flightState;
    }

    init(): void {
        this.infoSprite = new HudSprite(this.uiScene);

        this.chevronTexture = createChevronTexture('#00ffcc', 'rgba(0, 255, 204, 0.95)');
        this.edgeSprite = new SharedTextureSprite(this.uiScene, this.chevronTexture);
        this.edgeSprite.setScale(44, 44);
    }

    /** @param projector Shared projector, already primed for this frame via `beginFrame`. */
    update(projector: ScreenProjector): void {
        if (!this.infoSprite || !this.edgeSprite) return;

        const target = this.autopilotState.targetBody;

        if (
            !this.autopilotState.isActive ||
            !target?.mesh ||
            this.autopilotState.phase === 'TIDAL_LOCK'
        ) {
            this.infoSprite.visible = false;
            this.edgeSprite.visible = false;
            return;
        }

        if (!projector.project(target, this.projection)) {
            this.infoSprite.visible = false;
            this.edgeSprite.visible = false;
            return;
        }

        if (this.projection.onScreen) {
            this.showOnScreen(target);
        } else {
            this.showOffScreen(projector);
        }
    }

    dispose(): void {
        this.infoSprite?.dispose();
        this.infoSprite = null;
        this.edgeSprite?.dispose();
        this.edgeSprite = null;
        this.chevronTexture?.dispose();
        this.chevronTexture = null;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private showOnScreen(target: Body): void {
        const sprite = this.infoSprite!;
        const ship = this.flightState.knownShip;

        let distLabel = '';
        let etaLabel = 'ETA: ∞';

        if (ship?.mesh) {
            const rawDist = ship.mesh.position.distanceTo(target.mesh.position);
            const orbitRadius = target.radius * AUTOPILOT_ORBIT_ALTITUDE_FACTOR;
            const distToOrbit = Math.max(0, rawDist - orbitRadius);

            distLabel = formatDistance(distToOrbit);

            const closingSpeed = computeClosingSpeed(ship, target);
            etaLabel =
                closingSpeed > 0.001 ? `ETA: ${formatETA(distToOrbit / closingSpeed)}` : 'ETA: ∞';
        }

        const name = target.name;
        const isThreat = target.isThreat;

        const [fullW, fullH] = measurePanel(name, distLabel, etaLabel);
        sprite.setCanvasSize(fullW, fullH);
        sprite.draw(`${name}|${distLabel}|${etaLabel}|${isThreat}`, (ctx, w, h) =>
            paintInfoPanel(ctx, w, h, name, distLabel, etaLabel, isThreat)
        );

        // Scale the sprite to keep the same visual pixel density as the original fixed canvas
        sprite.setScale(
            (fullW / REF_CANVAS_W) * REF_SPRITE_W,
            (fullH / REF_CANVAS_H) * REF_SPRITE_H
        );
        sprite.setScreenPos(this.projection.uiX, this.projection.uiY + 70);
        sprite.visible = true;
        this.edgeSprite!.visible = false;
    }

    private showOffScreen(projector: ScreenProjector): void {
        const sprite = this.edgeSprite!;
        const p = this.projection;

        projector.clampToEdge(p.nx, p.ny, p.nz, EDGE_MARGIN_PX, this.edge);

        sprite.setScreenPos(this.edge.uiX, this.edge.uiY);
        sprite.rotation = this.edge.rotation;
        sprite.visible = true;
        this.infoSprite!.visible = false;
    }
}
