import * as THREE from 'three';
import { ISimulationState } from '../interfaces';
import { SharedTextureSprite } from './hud/hud-sprite';
import { HudSpritePool } from './hud/hud-sprite-pool';
import {
    createEdgeMarker,
    ProjectionBuffer,
    ScreenProjector,
    type EdgeMarker,
} from './hud/screen-projection';
import { createChevronTexture } from './hud/hud-paint';

/** Floor for apparent on-screen radius so distant/tiny threats still get a visible ring. */
const MIN_APPARENT_R = 24;
/** Ring drawn this much larger than the body's apparent radius, so it doesn't hug the surface. */
const RING_PADDING_FACTOR = 1.35;
/** Seconds per pulse cycle. */
const PULSE_PERIOD = 1.2;
/** Pixels of clearance kept between an edge chevron and the viewport edge. */
const EDGE_MARGIN_PX = 30;

/** Red ring texture, shared by every pooled on-screen sprite (pulsed via scale/opacity, not redrawn). */
function createRedRingTexture(): THREE.CanvasTexture {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d')!;

    const cx = S / 2;
    const cy = S / 2;
    const r = S / 2 - 8;

    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(255, 60, 60, 0.9)';
    ctx.strokeStyle = '#ff3c3c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

/**
 * Highlights every body with `isThreat` set, so threats (e.g. incoming asteroids) stay easy to
 * spot and locate. Runs independent of the "Show Planet Names" setting and of autopilot state:
 * - Off-screen threats get a red edge chevron pointing at them (same mechanism as the autopilot
 *   off-screen indicator).
 * - On-screen threats get a pulsing red ring drawn around the body.
 *
 * Both artworks are static textures built once and shared by every pooled sprite; the pulse is
 * driven purely through sprite scale and material opacity, so no canvas is repainted per frame.
 */
export class ThreatIndicator {
    private readonly uiScene: THREE.Scene;
    private readonly simulationState: ISimulationState;

    private readonly offScreenPool: HudSpritePool<SharedTextureSprite>;
    private readonly onScreenPool: HudSpritePool<SharedTextureSprite>;

    private chevronTexture: THREE.CanvasTexture | null = null;
    private ringTexture: THREE.CanvasTexture | null = null;

    /** Reused per-frame projection buffers — no object literals allocated per body. */
    private readonly onScreen = new ProjectionBuffer();
    private readonly offScreen = new ProjectionBuffer();
    private readonly edge: EdgeMarker = createEdgeMarker();

    constructor(uiScene: THREE.Scene, simulationState: ISimulationState) {
        this.uiScene = uiScene;
        this.simulationState = simulationState;

        this.offScreenPool = new HudSpritePool(() => this.createChevronSprite());
        this.onScreenPool = new HudSpritePool(() => this.createRingSprite());
    }

    /** @param projector Shared projector, already primed for this frame via `beginFrame`. */
    update(projector: ScreenProjector): void {
        const bodies = this.simulationState.bodies;

        this.onScreen.reset();
        this.offScreen.reset();

        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (!body || !body.isThreat) continue;

            // Fill straight into whichever buffer the projection turns out to belong in,
            // rolling back the borrowed slot if the body can't be projected at all.
            const slot = this.onScreen.next();
            if (!projector.project(body, slot)) {
                this.onScreen.rollback();
                continue;
            }

            if (slot.onScreen) continue;

            // Off screen after all — move it across to the other buffer.
            this.onScreen.rollback();
            const offSlot = this.offScreen.next();
            offSlot.body = slot.body;
            offSlot.nx = slot.nx;
            offSlot.ny = slot.ny;
            offSlot.nz = slot.nz;
        }

        const chevrons = this.offScreenPool.acquire(this.offScreen.length);
        const rings = this.onScreenPool.acquire(this.onScreen.length);

        for (let i = 0; i < this.offScreen.length; i++) {
            const p = this.offScreen.at(i);
            const sprite = chevrons[i];

            projector.clampToEdge(p.nx, p.ny, p.nz, EDGE_MARGIN_PX, this.edge);
            sprite.setScreenPos(this.edge.uiX, this.edge.uiY);
            sprite.rotation = this.edge.rotation;
            sprite.visible = true;
        }

        // Pulse phase shared by every on-screen ring, driven by wall-clock time so it keeps
        // animating smoothly regardless of simulation speed or pause state.
        const pulsePhase = (performance.now() / 1000 / PULSE_PERIOD) % 1;
        const pulse = 0.5 - 0.5 * Math.cos(pulsePhase * Math.PI * 2); // 0 → 1 → 0

        for (let i = 0; i < this.onScreen.length; i++) {
            const p = this.onScreen.at(i);
            const sprite = rings[i];

            const apparentR = projector.apparentRadius(p.body.radius, p.camDist, MIN_APPARENT_R);
            const diameter = apparentR * 2 * RING_PADDING_FACTOR * (1 + pulse * 0.15);

            sprite.setScale(diameter, diameter);
            sprite.opacity = 0.4 + pulse * 0.6;
            sprite.setScreenPos(p.uiX, p.uiY);
            sprite.visible = true;
        }
    }

    /** Free all GPU resources. */
    dispose(): void {
        this.offScreenPool.dispose();
        this.onScreenPool.dispose();
        this.chevronTexture?.dispose();
        this.chevronTexture = null;
        this.ringTexture?.dispose();
        this.ringTexture = null;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private createChevronSprite(): SharedTextureSprite {
        if (!this.chevronTexture) {
            this.chevronTexture = createChevronTexture('#ff3c3c', 'rgba(255, 60, 60, 0.95)');
        }
        const sprite = new SharedTextureSprite(this.uiScene, this.chevronTexture);
        sprite.setScale(44, 44);
        return sprite;
    }

    private createRingSprite(): SharedTextureSprite {
        if (!this.ringTexture) this.ringTexture = createRedRingTexture();
        return new SharedTextureSprite(this.uiScene, this.ringTexture);
    }
}
