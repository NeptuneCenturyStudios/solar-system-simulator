import * as THREE from 'three';
import { ISimulationState } from '../interfaces';
import { Body } from '../bodies/body';
import { BodyTypeEnum } from '../bodies/body-enums';
import type { Spaceship } from '../bodies/ships/spaceship';
import { HudSprite } from './hud/hud-sprite';
import { HudSpritePool } from './hud/hud-sprite-pool';
import { ProjectionBuffer, ScreenProjector } from './hud/screen-projection';

// ── Layout constants ────────────────────────────────────────────────────────
const CANVAS_W = 140;
/** Canvas height for a hull-only bar. */
const CANVAS_H = 20;
/** Canvas height for a ship: shield bar stacked above the hull bar. */
const SHIP_CANVAS_H = 30;
const SPRITE_W = 90;
const BAR_PAD = 3;
/** Gap between the shield and hull bars on a ship canvas. */
const BAR_GAP = 2;
const SHIELD_COLOR = '#4fc3ff';

/** Floor for apparent on-screen radius so distant/tiny bodies still get a bar just above them. */
const MIN_APPARENT_R = 20;

/** Shield fraction [0–1] for ships, or null for bodies without shields. */
function shieldFractionOf(body: Body): number | null {
    if (body.bodyType !== BodyTypeEnum.SpaceShip) return null;
    const ship = body as Spaceship;
    if (!(ship.maxShieldPoints > 0)) return null;
    return Math.max(0, Math.min(1, ship.shieldPoints / ship.maxShieldPoints));
}

/** Fill one bar row with a glowing color. */
function fillRow(
    ctx: CanvasRenderingContext2D,
    y: number,
    h: number,
    fraction: number,
    color: string
): void {
    const innerW = CANVAS_W - BAR_PAD * 2;
    ctx.fillStyle = color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = color;
    ctx.fillRect(BAR_PAD, y, innerW * fraction, h);
    ctx.shadowBlur = 0;
}

/**
 * Draw the background panel and fills onto a bar canvas. When `shieldFraction` is
 * non-null the shield bar is drawn above the hull bar.
 */
function drawBar(
    ctx: CanvasRenderingContext2D,
    height: number,
    hullFraction: number,
    shieldFraction: number | null
): void {
    ctx.clearRect(0, 0, CANVAS_W, height);

    // Background panel
    ctx.fillStyle = 'rgba(0, 8, 16, 0.55)';
    ctx.fillRect(0, 0, CANVAS_W, height);
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, CANVAS_W - 1.5, height - 1.5);

    // Health fill — green / amber / red by severity
    const hullColor = hullFraction > 0.6 ? '#4caf50' : hullFraction > 0.3 ? '#ffb300' : '#ff4d4d';
    const innerH = height - BAR_PAD * 2;

    if (shieldFraction === null) {
        fillRow(ctx, BAR_PAD, innerH, hullFraction, hullColor);
        return;
    }

    const rowH = (innerH - BAR_GAP) / 2;
    fillRow(ctx, BAR_PAD, rowH, shieldFraction, SHIELD_COLOR);
    fillRow(ctx, BAR_PAD + rowH + BAR_GAP, rowH, hullFraction, hullColor);
}

/**
 * Draws a small color-coded HP bar above any body whose healthPoints has
 * dropped below maxHealthPoints. Ships additionally show a shield bar, and are
 * drawn whenever either their shield or hull is below max. Undamaged and
 * fully-destroyed bodies show nothing. Uses the same pooled-sprite-in-uiScene approach as
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
            if (body.healthPoints <= 0) continue;
            const shield = shieldFractionOf(body);
            const hullDamaged = body.healthPoints < body.maxHealthPoints;
            const shieldDamaged = shield !== null && shield < 1;
            if (!hullDamaged && !shieldDamaged) continue;

            const slot = this.visible.next();
            if (!projector.project(body, slot) || !slot.onScreen) {
                this.visible.rollback();
            }
        }

        const sprites = this.pool.acquire(this.visible.length);

        for (let i = 0; i < this.visible.length; i++) {
            const p = this.visible.at(i);
            const sprite = sprites[i];

            const hull = Math.max(0, Math.min(1, p.body.healthPoints / p.body.maxHealthPoints));
            const shield = shieldFractionOf(p.body);
            const canvasH = shield === null ? CANVAS_H : SHIP_CANVAS_H;
            const spriteH = (canvasH / CANVAS_W) * SPRITE_W;

            // No-op when unchanged; a resize invalidates the sprite so the draw below repaints.
            sprite.setCanvasSize(CANVAS_W, canvasH);
            sprite.draw(`${hull.toFixed(3)}|${shield === null ? '-' : shield.toFixed(3)}`, (ctx) =>
                drawBar(ctx, canvasH, hull, shield)
            );

            const apparentR = projector.apparentRadius(p.body.radius, p.camDist, MIN_APPARENT_R);
            sprite.setScale(SPRITE_W, spriteH);
            sprite.setScreenPos(p.uiX, p.uiY + apparentR + spriteH / 2 + 6);
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
