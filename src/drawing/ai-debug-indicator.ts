import * as THREE from 'three';
import type { Spaceship } from '../bodies/ships/spaceship';
import { flightState, simulationState } from '../simulation/simulation';
import { settingsStore } from '../settings/settings-store';
import { HudSprite } from './hud/hud-sprite';
import { HudSpritePool } from './hud/hud-sprite-pool';
import { EdgeMarker, ProjectionBuffer, ScreenProjector } from './hud/screen-projection';

// ── Layout constants ────────────────────────────────────────────────────────
/** Canvas pixels are drawn at this multiple of on-screen pixels, so the text stays crisp. */
const SUPERSAMPLE = 1.6;
const FONT_PX = 20;
const FONT = `${FONT_PX}px monospace`;
const HEADER_FONT = `bold ${FONT_PX}px monospace`;
const LINE_H = 26;
const PAD = 10;
/** Gap (screen px) between the ship's apparent edge and the label. */
const SHIP_GAP = 8;
/** Clearance (screen px) kept between an off-screen label and the viewport edge. */
const EDGE_MARGIN = 12;
/** Floor for the ship's apparent radius, so the label clears even a distant ship's marker. */
const MIN_APPARENT_R = 20;

const COLOR_TEXT = '#d0f0ff';
const COLOR_ATTACK = '#ff6b6b';
const COLOR_EXTEND = '#ffb300';
const COLOR_APPROACH = '#4fc3ff';
const COLOR_FIRING = '#4caf50';

/** Shared canvas for measuring text before the label canvas is sized. */
let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
    measureCtx ??= document.createElement('canvas').getContext('2d');
    if (!measureCtx) return text.length * FONT_PX * 0.6;
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
}

/** Header colour by manoeuvre, so the state reads at a glance. */
function headerColor(header: string): string {
    if (header.includes('ATTACK')) return COLOR_ATTACK;
    if (header.includes('EXTEND')) return COLOR_EXTEND;
    return COLOR_APPROACH;
}

function paintLabel(ctx: CanvasRenderingContext2D, w: number, h: number, lines: string[]): void {
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(0, 8, 16, 0.7)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);

    ctx.textBaseline = 'middle';
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        ctx.font = i === 0 ? HEADER_FONT : FONT;
        ctx.fillStyle =
            i === 0 ? headerColor(line) : line === 'Gun FIRING' ? COLOR_FIRING : COLOR_TEXT;
        ctx.fillText(line, PAD, PAD + LINE_H * (i + 0.5));
    }
}

/**
 * On-screen readout of what each AI-piloted ship's controller is doing, shown while
 * Options → Show Ship AI Debug is on (the same switch as the avoidance gizmo).
 *
 * Each NPC gets a label pinned under its hull with the lines its controller reports through
 * `ShipAI.debugLines()` — manoeuvre, range, closing speed, throttle, why it is or isn't firing.
 * In a dogfight the NPC spends much of its time behind or beside the camera, which is exactly
 * when its behaviour is hardest to read, so an off-screen ship's label is clamped to the edge of
 * the screen on the side the ship lies, instead of vanishing.
 *
 * The canvas only repaints when the text changes; the controllers round their figures so that
 * isn't every frame.
 */
export class AiDebugIndicator {
    private readonly uiScene: THREE.Scene;
    private readonly pool: HudSpritePool<HudSprite>;
    private readonly projections = new ProjectionBuffer();
    private readonly edge: EdgeMarker = { uiX: 0, uiY: 0, rotation: 0 };

    constructor(uiScene: THREE.Scene) {
        this.uiScene = uiScene;
        this.pool = new HudSpritePool(() => new HudSprite(this.uiScene));
    }

    /** @param projector Shared projector, already primed for this frame via `beginFrame`. */
    update(projector: ScreenProjector): void {
        if (!settingsStore.settings.showAiDebug) {
            this.pool.releaseAll();
            return;
        }

        this.projections.reset();
        for (const ship of simulationState.npcShips) {
            if (!this.isPiloted(ship)) continue;
            const slot = this.projections.next();
            if (!projector.project(ship, slot)) this.projections.rollback();
        }

        const sprites = this.pool.acquire(this.projections.length);
        const halfW = projector.viewportHalfWidth;
        const halfH = projector.viewportHalfHeight;

        for (let i = 0; i < this.projections.length; i++) {
            const p = this.projections.at(i);
            const ship = p.body as Spaceship;
            const sprite = sprites[i];

            const lines = ship.ai ? ship.ai.debugLines() : [];
            if (!p.onScreen) lines[0] = `${lines[0] ?? ''}  [off-screen]`;

            // Size the canvas to the text.
            let textW = 0;
            for (let j = 0; j < lines.length; j++) {
                textW = Math.max(textW, measure(lines[j], j === 0 ? HEADER_FONT : FONT));
            }
            const canvasW = Math.ceil(textW + PAD * 2);
            const canvasH = Math.ceil(LINE_H * lines.length + PAD * 2);
            const spriteW = canvasW / SUPERSAMPLE;
            const spriteH = canvasH / SUPERSAMPLE;

            sprite.setCanvasSize(canvasW, canvasH);
            sprite.draw(lines.join('\n'), (ctx, w, h) => paintLabel(ctx, w, h, lines));
            sprite.setScale(spriteW, spriteH);

            let x: number;
            let y: number;
            if (p.onScreen) {
                // Below the hull, clear of the health bar that sits above it.
                const apparentR = projector.apparentRadius(ship.radius, p.camDist, MIN_APPARENT_R);
                x = p.uiX;
                y = p.uiY - apparentR - SHIP_GAP - spriteH / 2;
            } else {
                projector.clampToEdge(p.nx, p.ny, p.behind, EDGE_MARGIN, this.edge);
                x = this.edge.uiX;
                y = this.edge.uiY;
            }

            // Keep the whole label on screen, whichever way it was placed.
            const maxX = Math.max(0, halfW - spriteW / 2 - EDGE_MARGIN);
            const maxY = Math.max(0, halfH - spriteH / 2 - EDGE_MARGIN);
            sprite.setScreenPos(
                THREE.MathUtils.clamp(x, -maxX, maxX),
                THREE.MathUtils.clamp(y, -maxY, maxY)
            );
            sprite.visible = true;
        }
    }

    /** Free all GPU resources. */
    dispose(): void {
        this.pool.dispose();
    }

    /**
     * True when the ship's controller is actually flying it. It stands down while the player or
     * the autopilot has the ship, and its last report would then describe nothing.
     */
    private isPiloted(ship: Spaceship | undefined): ship is Spaceship {
        if (!ship || ship._isDisposed || !ship.mesh || !ship.ai) return false;
        return ship !== flightState.activeShip && !ship.autopilotActive;
    }
}
