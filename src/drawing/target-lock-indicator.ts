import * as THREE from 'three';
import { Body } from '../bodies/body';
import { SharedTextureSprite } from './hud/hud-sprite';
import {
    createEdgeMarker,
    createScreenProjection,
    ScreenProjector,
    type EdgeMarker,
    type ScreenProjection,
} from './hud/screen-projection';
import { createChevronTexture } from './hud/hud-paint';

/** Seconds per inward-slide cycle. */
const LOCK_PERIOD = 0.9;
/** Floor for the on-screen apparent radius the bracket gap is measured from. */
const MIN_APPARENT_R = 24;
/** Extra clearance kept between the target's apparent edge and the resting bracket gap. */
const ON_SCREEN_GAP = 10;
/** How far the on-screen brackets sweep outward from their resting gap. */
const ON_SCREEN_SWEEP = 50;
/** Bracket gap bounds when the target is off screen, flanking the shared threat edge chevron. */
const OFF_SCREEN_MIN_OFFSET = 26;
const OFF_SCREEN_MAX_OFFSET = 52;
/** Pixels of clearance kept between the edge marker and the viewport edge (matches ThreatIndicator). */
const EDGE_MARGIN_PX = 30;

/**
 * Marks the flight-mode "locked" target (set by TAB/Shift+TAB cycling, see
 * `src/simulation/target-lock.ts`) with a pair of chevron brackets — `>` `<` — that slide
 * inward toward it and then snap back out, repeatedly. On screen they close in on the
 * target's own screen position; off screen they close in on the same edge point the shared
 * red threat chevron already occupies for that body.
 *
 * Tracks exactly one target, so — like `AutopilotTargetIndicator` — it owns two fixed
 * sprites rather than pooling. It never mutates `flightState.selectedTarget` itself;
 * clearing a stale lock (target destroyed, no longer a threat) is a per-frame guard in
 * `animation-loop.ts`, mirroring how autopilot target invalidation works there.
 */
export class TargetLockIndicator {
    private readonly uiScene: THREE.Scene;
    private readonly flightState: { selectedTarget: Body | null };

    private chevronTexture: THREE.CanvasTexture | null = null;
    private spriteA: SharedTextureSprite | null = null;
    private spriteB: SharedTextureSprite | null = null;

    private readonly projection: ScreenProjection = createScreenProjection();
    private readonly edge: EdgeMarker = createEdgeMarker();

    constructor(uiScene: THREE.Scene, flightState: { selectedTarget: Body | null }) {
        this.uiScene = uiScene;
        this.flightState = flightState;
    }

    init(): void {
        this.chevronTexture = createChevronTexture('#ffd23c', 'rgba(255, 210, 60, 0.95)');
        this.spriteA = new SharedTextureSprite(this.uiScene, this.chevronTexture);
        this.spriteB = new SharedTextureSprite(this.uiScene, this.chevronTexture);
    }

    /** @param projector Shared projector, already primed for this frame via `beginFrame`. */
    update(projector: ScreenProjector): void {
        const a = this.spriteA;
        const b = this.spriteB;
        if (!a || !b) return;

        const target = this.flightState.selectedTarget;
        if (!target?.mesh || !projector.project(target, this.projection)) {
            a.visible = false;
            b.visible = false;
            return;
        }

        // Ease-out sawtooth: fast inward slide that decelerates into the target, then snaps
        // back out to start again — a distinct read from the threat ring's cosine breathing.
        const phase = (performance.now() / 1000 / LOCK_PERIOD) % 1;
        const eased = 1 - (1 - phase) ** 2;
        const opacity = 0.35 + 0.65 * eased;

        if (this.projection.onScreen) {
            this.updateOnScreen(a, b, projector, eased, opacity);
        } else {
            this.updateOffScreen(a, b, projector, eased, opacity);
        }
    }

    dispose(): void {
        this.spriteA?.dispose();
        this.spriteA = null;
        this.spriteB?.dispose();
        this.spriteB = null;
        this.chevronTexture?.dispose();
        this.chevronTexture = null;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private updateOnScreen(
        a: SharedTextureSprite,
        b: SharedTextureSprite,
        projector: ScreenProjector,
        eased: number,
        opacity: number
    ): void {
        const p = this.projection;
        const angle = p.nx === 0 && p.ny === 0 ? 0 : Math.atan2(p.ny, p.nx);
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);

        const minOffset =
            projector.apparentRadius(p.body.radius, p.camDist, MIN_APPARENT_R) + ON_SCREEN_GAP;
        const maxOffset = minOffset + ON_SCREEN_SWEEP;
        const offset = maxOffset - (maxOffset - minOffset) * eased;

        a.setScale(36, 36);
        a.setScreenPos(p.uiX - dirX * offset, p.uiY - dirY * offset);
        a.rotation = angle;
        a.opacity = opacity;
        a.visible = true;

        b.setScale(36, 36);
        b.setScreenPos(p.uiX + dirX * offset, p.uiY + dirY * offset);
        b.rotation = angle + Math.PI;
        b.opacity = opacity;
        b.visible = true;
    }

    private updateOffScreen(
        a: SharedTextureSprite,
        b: SharedTextureSprite,
        projector: ScreenProjector,
        eased: number,
        opacity: number
    ): void {
        const p = this.projection;
        projector.clampToEdge(p.nx, p.ny, p.nz, EDGE_MARGIN_PX, this.edge);

        const angle = this.edge.rotation;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);

        const offset =
            OFF_SCREEN_MAX_OFFSET - (OFF_SCREEN_MAX_OFFSET - OFF_SCREEN_MIN_OFFSET) * eased;

        a.setScale(32, 32);
        a.setScreenPos(this.edge.uiX - dirX * offset, this.edge.uiY - dirY * offset);
        a.rotation = angle;
        a.opacity = opacity;
        a.visible = true;

        b.setScale(32, 32);
        b.setScreenPos(this.edge.uiX + dirX * offset, this.edge.uiY + dirY * offset);
        b.rotation = angle + Math.PI;
        b.opacity = opacity;
        b.visible = true;
    }
}
