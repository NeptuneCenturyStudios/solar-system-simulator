import * as THREE from 'three';
import { ISimulationState } from '../interfaces';
import { HudSprite } from './hud/hud-sprite';
import { HudSpritePool } from './hud/hud-sprite-pool';
import { ProjectionBuffer, ScreenProjector } from './hud/screen-projection';

// ── Layout constants ────────────────────────────────────────────────────────
const CANVAS_W = 140;
const CANVAS_H = 20;
const SPRITE_W = 90;
const SPRITE_H = (CANVAS_H / CANVAS_W) * SPRITE_W;
const BAR_PAD = 3;

/** Floor for apparent on-screen radius so distant/tiny bodies still get a bar just above them. */
const MIN_APPARENT_R = 20;

/** Draw the background panel and health fill onto a bar canvas. */
function drawBar(ctx: CanvasRenderingContext2D, fraction: number): void {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background panel
    ctx.fillStyle = 'rgba(0, 8, 16, 0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, CANVAS_W - 1.5, CANVAS_H - 1.5);

    // Health fill — green / amber / red by severity
    const innerX = BAR_PAD;
    const innerY = BAR_PAD;
    const innerW = CANVAS_W - BAR_PAD * 2;
    const innerH = CANVAS_H - BAR_PAD * 2;
    const fillW = innerW * fraction;

    const color = fraction > 0.6 ? '#4caf50' : fraction > 0.3 ? '#ffb300' : '#ff4d4d';
    ctx.fillStyle = color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = color;
    ctx.fillRect(innerX, innerY, fillW, innerH);
    ctx.shadowBlur = 0;
}

/**
 * Draws a small color-coded HP bar above any body whose healthPoints has
 * dropped below maxHealthPoints. Undamaged and fully-destroyed bodies show
 * nothing. Uses the same pooled-sprite-in-uiScene approach as
 * PlanetNameIndicator / AutopilotTargetIndicator.
 *
 * The canvas is only repainted when a body's health fraction actually changes, so a
 * damaged-but-stable body costs nothing beyond repositioning its sprite.
 */
export class HealthBarIndicator {
    private readonly uiScene: THREE.Scene;
    private readonly simulationState: ISimulationState;
    private readonly pool: HudSpritePool<HudSprite>;

    /** Reused per-frame projection buffer — no object literals allocated per body. */
    private readonly visible = new ProjectionBuffer();

    constructor(uiScene: THREE.Scene, simulationState: ISimulationState) {
        this.uiScene = uiScene;
        this.simulationState = simulationState;
        this.pool = new HudSpritePool(() => this.createBarSprite());
    }

    /** @param projector Shared projector, already primed for this frame via `beginFrame`. */
    update(projector: ScreenProjector): void {
        const bodies = this.simulationState.bodies;

        this.visible.reset();

        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (!body) continue;
            if (body.healthPoints <= 0 || body.healthPoints >= body.maxHealthPoints) continue;

            const slot = this.visible.next();
            if (!projector.project(body, slot) || !slot.onScreen) {
                this.visible.rollback();
            }
        }

        const sprites = this.pool.acquire(this.visible.length);

        for (let i = 0; i < this.visible.length; i++) {
            const p = this.visible.at(i);
            const sprite = sprites[i];

            const fraction = Math.max(0, Math.min(1, p.body.healthPoints / p.body.maxHealthPoints));

            sprite.draw(fraction.toFixed(3), (ctx) => drawBar(ctx, fraction));

            const apparentR = projector.apparentRadius(p.body.radius, p.camDist, MIN_APPARENT_R);
            sprite.setScale(SPRITE_W, SPRITE_H);
            sprite.setScreenPos(p.uiX, p.uiY + apparentR + SPRITE_H / 2 + 6);
            sprite.visible = true;
        }
    }

    /** Free all GPU resources. */
    dispose(): void {
        this.pool.dispose();
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private createBarSprite(): HudSprite {
        const sprite = new HudSprite(this.uiScene);
        sprite.setCanvasSize(CANVAS_W, CANVAS_H);
        return sprite;
    }
}
