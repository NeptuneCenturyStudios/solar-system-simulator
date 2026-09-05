import * as THREE from 'three';
import { Body } from '../bodies/body';
import { ISimulationState } from '../interfaces';
import { TEXT_SPRITE_Z } from '../utilities/consts';

// ── Layout constants ────────────────────────────────────────────────────────
const CANVAS_W = 140;
const CANVAS_H = 20;
const SPRITE_W = 90;
const SPRITE_H = (CANVAS_H / CANVAS_W) * SPRITE_W;
const BAR_PAD = 3;

/** Floor for apparent on-screen radius so distant/tiny bodies still get a bar just above them. */
const MIN_APPARENT_R = 20;

interface PoolEntry {
    sprite: THREE.Sprite;
    material: THREE.SpriteMaterial;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
}

/**
 * Draws a small color-coded HP bar above any body whose healthPoints has
 * dropped below maxHealthPoints. Undamaged and fully-destroyed bodies show
 * nothing. Uses the same pooled-sprite-in-uiScene approach as
 * PlanetNameIndicator / AutopilotTargetIndicator.
 */
export class HealthBarIndicator {
    private uiScene: THREE.Scene;
    private simulationState: ISimulationState;
    private pool: PoolEntry[] = [];
    private _scratch = new THREE.Vector3();

    constructor(uiScene: THREE.Scene, simulationState: ISimulationState) {
        this.uiScene = uiScene;
        this.simulationState = simulationState;
    }

    update(camera: THREE.PerspectiveCamera): void {
        const bodies = this.simulationState.bodies;
        const visible: { body: Body; uiX: number; uiY: number; apparentR: number }[] = [];

        if (bodies.length > 0) {
            const halfW = window.innerWidth / 2;
            const halfH = window.innerHeight / 2;
            const tanHalfFovY = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));

            for (let i = 0; i < bodies.length; i++) {
                const body = bodies[i];
                if (!body || body._isDisposed || !body.mesh) continue;
                if (body.healthPoints <= 0 || body.healthPoints >= body.maxHealthPoints) continue;

                body.mesh.getWorldPosition(this._scratch);
                this._scratch.project(camera);
                const nx = this._scratch.x;
                const ny = this._scratch.y;
                const nz = this._scratch.z;
                if (nz >= 1 || Math.abs(nx) > 1 || Math.abs(ny) > 1) continue;

                const camDist = camera.position.distanceTo(body.mesh.position);
                const apparentR = Math.max(
                    MIN_APPARENT_R,
                    (body.radius / camDist) * (halfH / tanHalfFovY)
                );

                visible.push({ body, uiX: nx * halfW, uiY: ny * halfH, apparentR });
            }
        }

        this.syncPool(visible.length);

        for (let i = 0; i < visible.length; i++) {
            const v = visible[i];
            const entry = this.pool[i];
            const fraction = Math.max(
                0,
                Math.min(1, v.body.healthPoints / v.body.maxHealthPoints)
            );

            this.drawBar(entry, fraction);
            entry.texture.needsUpdate = true;

            entry.sprite.scale.set(SPRITE_W, SPRITE_H, 1);
            entry.sprite.position.set(
                v.uiX,
                v.uiY + v.apparentR + SPRITE_H / 2 + 6,
                TEXT_SPRITE_Z
            );
            entry.sprite.visible = true;
        }
    }

    /** Free all GPU resources. */
    dispose(): void {
        for (const entry of this.pool) {
            entry.texture.dispose();
            entry.material.dispose();
            this.uiScene.remove(entry.sprite);
        }
        this.pool = [];
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private syncPool(desired: number): void {
        while (this.pool.length > desired) {
            const entry = this.pool.pop()!;
            entry.sprite.visible = false;
        }
        while (this.pool.length < desired) {
            this.pool.push(this.createPoolEntry());
        }
    }

    private createPoolEntry(): PoolEntry {
        const canvas = document.createElement('canvas');
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        const ctx = canvas.getContext('2d')!;

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        const sprite = new THREE.Sprite(material);
        sprite.visible = false;
        this.uiScene.add(sprite);

        return { sprite, material, canvas, ctx, texture };
    }

    /** Draw the background panel and health fill onto the sprite's canvas. */
    private drawBar(entry: PoolEntry, fraction: number): void {
        const ctx = entry.ctx;
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
}
