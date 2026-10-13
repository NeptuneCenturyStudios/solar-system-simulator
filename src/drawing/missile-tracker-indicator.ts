import * as THREE from 'three';
import { IFlightState, ISimulationState } from '../interfaces';
import { MissileWeapon } from '../ship-effects/weapons/missile-weapon';
import { Weapon } from '../ship-effects/weapons/weapon';
import { SharedTextureSprite } from './hud/hud-sprite';
import { HudSpritePool } from './hud/hud-sprite-pool';
import {
    createEdgeMarker,
    ProjectionBuffer,
    ScreenProjector,
    type EdgeMarker,
} from './hud/screen-projection';
import { createChevronTexture, createTriangleTexture } from './hud/hud-paint';

/** On-screen size of a tracking triangle, in pixels. */
const TRIANGLE_SIZE_PX = 18;
/** How far above the missile the on-screen triangle is drawn, so its tip points down at it. */
const TRIANGLE_OFFSET_PX = 16;
/** On-screen size of an edge chevron, in pixels. */
const CHEVRON_SIZE_PX = 32;
/** Pixels of clearance kept between an edge chevron and the viewport edge. */
const EDGE_MARGIN_PX = 24;
/** Distance from an edge chevron back toward the screen centre where its triangle sits. */
const EDGE_TRIANGLE_INSET_PX = 22;

const COLOR = '#ff3c3c';
const GLOW = 'rgba(255, 60, 60, 0.95)';

/**
 * Tags every missile in flight — the player's and every NPC's, including missiles still
 * flying after their ship died — with a red triangle, one per missile:
 * - On screen, the triangle hovers just above the missile, pointing down at it.
 * - Off screen (or behind the camera), the triangle rides the viewport edge with a chevron
 *   between it and the edge, pointing toward the missile.
 *
 * Icons need no bookkeeping: missiles are read fresh each frame from the same weapon sources
 * the animation loop advances, so a missile that hits or expires simply stops being drawn.
 * Artwork is static and shared by every pooled sprite.
 */
export class MissileTrackerIndicator {
    private readonly uiScene: THREE.Scene;
    private readonly simulationState: ISimulationState;
    private readonly flightState: Pick<IFlightState, 'activeShip' | 'knownShip'>;

    private readonly trianglePool: HudSpritePool<SharedTextureSprite>;
    private readonly edgeTrianglePool: HudSpritePool<SharedTextureSprite>;
    private readonly edgeChevronPool: HudSpritePool<SharedTextureSprite>;

    private triangleTexture: THREE.CanvasTexture | null = null;
    private chevronTexture: THREE.CanvasTexture | null = null;

    /** Reused per-frame projection buffers — no object literals allocated per missile. */
    private readonly onScreen = new ProjectionBuffer();
    private readonly offScreen = new ProjectionBuffer();
    private readonly edge: EdgeMarker = createEdgeMarker();

    /** Projector for the frame in progress; read by the bound visitor below. */
    private projector: ScreenProjector | null = null;
    /** Bound once so walking every missile each frame allocates no closures. */
    private readonly visitMissile = (worldPos: THREE.Vector3): void => this.addMissile(worldPos);

    constructor(
        uiScene: THREE.Scene,
        simulationState: ISimulationState,
        flightState: Pick<IFlightState, 'activeShip' | 'knownShip'>
    ) {
        this.uiScene = uiScene;
        this.simulationState = simulationState;
        this.flightState = flightState;

        this.trianglePool = new HudSpritePool(() => this.createTriangleSprite());
        this.edgeTrianglePool = new HudSpritePool(() => this.createTriangleSprite());
        this.edgeChevronPool = new HudSpritePool(() => this.createChevronSprite());
    }

    /** @param projector Shared projector, already primed for this frame via `beginFrame`. */
    update(projector: ScreenProjector): void {
        this.onScreen.reset();
        this.offScreen.reset();
        this.projector = projector;

        // Same weapon sources the animation loop advances, so every live missile is covered once.
        const playerShip = this.flightState.activeShip ?? this.flightState.knownShip;
        if (playerShip && !playerShip._isDisposed) this.collectFrom(playerShip.weapons);

        const npcShips = this.simulationState.npcShips;
        for (let i = 0; i < npcShips.length; i++) {
            const npc = npcShips[i];
            if (!npc || npc === playerShip || npc._isDisposed) continue;
            this.collectFrom(npc.weapons);
        }

        const orphans = this.simulationState.orphanedWeapons;
        for (let i = 0; i < orphans.length; i++) this.collectWeapon(orphans[i].weapon);

        this.projector = null;

        const triangles = this.trianglePool.acquire(this.onScreen.length);
        for (let i = 0; i < this.onScreen.length; i++) {
            const p = this.onScreen.at(i);
            const sprite = triangles[i];
            sprite.setScreenPos(p.uiX, p.uiY + TRIANGLE_OFFSET_PX);
            sprite.visible = true;
        }

        const edgeTriangles = this.edgeTrianglePool.acquire(this.offScreen.length);
        const chevrons = this.edgeChevronPool.acquire(this.offScreen.length);
        for (let i = 0; i < this.offScreen.length; i++) {
            const p = this.offScreen.at(i);
            projector.clampToEdge(p.nx, p.ny, p.behind, EDGE_MARGIN_PX, this.edge);
            const { uiX, uiY, rotation } = this.edge;

            const chevron = chevrons[i];
            chevron.setScreenPos(uiX, uiY);
            chevron.rotation = rotation;
            chevron.visible = true;

            const triangle = edgeTriangles[i];
            triangle.setScreenPos(
                uiX - Math.cos(rotation) * EDGE_TRIANGLE_INSET_PX,
                uiY - Math.sin(rotation) * EDGE_TRIANGLE_INSET_PX
            );
            triangle.visible = true;
        }
    }

    /** Free all GPU resources. */
    dispose(): void {
        this.trianglePool.dispose();
        this.edgeTrianglePool.dispose();
        this.edgeChevronPool.dispose();
        this.triangleTexture?.dispose();
        this.triangleTexture = null;
        this.chevronTexture?.dispose();
        this.chevronTexture = null;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private collectFrom(weapons: readonly Weapon[]): void {
        for (let i = 0; i < weapons.length; i++) this.collectWeapon(weapons[i]);
    }

    private collectWeapon(weapon: Weapon): void {
        if (weapon instanceof MissileWeapon) weapon.forEachMissilePosition(this.visitMissile);
    }

    /** Project one missile into whichever buffer it belongs in. */
    private addMissile(worldPos: THREE.Vector3): void {
        const projector = this.projector;
        if (!projector) return;

        const slot = this.onScreen.next();
        if (!projector.projectPoint(worldPos, slot)) {
            this.onScreen.rollback();
            return;
        }
        if (slot.onScreen) return;

        // Off screen after all — move it across to the other buffer.
        this.onScreen.rollback();
        const offSlot = this.offScreen.next();
        offSlot.nx = slot.nx;
        offSlot.ny = slot.ny;
        offSlot.behind = slot.behind;
    }

    private createTriangleSprite(): SharedTextureSprite {
        if (!this.triangleTexture) this.triangleTexture = createTriangleTexture(COLOR, GLOW);
        const sprite = new SharedTextureSprite(this.uiScene, this.triangleTexture);
        sprite.setScale(TRIANGLE_SIZE_PX, TRIANGLE_SIZE_PX);
        return sprite;
    }

    private createChevronSprite(): SharedTextureSprite {
        if (!this.chevronTexture) this.chevronTexture = createChevronTexture(COLOR, GLOW);
        const sprite = new SharedTextureSprite(this.uiScene, this.chevronTexture);
        sprite.setScale(CHEVRON_SIZE_PX, CHEVRON_SIZE_PX);
        return sprite;
    }
}
