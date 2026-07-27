import * as THREE from 'three';
import { Body } from '../bodies/body';
import { IAutopilotState, ISimulationState } from '../interfaces';
import { TEXT_SPRITE_Z } from '../utilities/consts';

// ── Layout constants ────────────────────────────────────────────────────────
const PAD = 12;
const ACCENT_LEN = 10;
const NAME_Y = 40;
const DIST_Y = 78;
const BOTTOM_PAD = 18;

/** Minimum canvas width (avoids degenerate panels for short names). */
const MIN_CONTENT_W = 80;

// ── Reference sprite scale ───────────────────────────────────────────────────
const REF_CANVAS_W = 512;
const REF_SPRITE_W = 320;
const REF_CANVAS_H = 120;
const REF_SPRITE_H = 75;

// ── Sprite pool item — each entry owns its own canvas ────────────────────────

interface PoolEntry {
    sprite: THREE.Sprite;
    material: THREE.SpriteMaterial;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    canvasW: number;
    canvasH: number;
    texture: THREE.CanvasTexture;
}

// ── ETA helpers (wired but not displayed) ────────────────────────────────────

function computeClosingSpeed(
    cameraPos: THREE.Vector3,
    cameraVel: THREE.Vector3,
    bodyPos: THREE.Vector3,
    bodyVel: THREE.Vector3
): number {
    const dir = new THREE.Vector3().subVectors(bodyPos, cameraPos);
    const dist = dir.length();
    if (dist < 1e-10) return 0;
    dir.divideScalar(dist);
    const relVel = new THREE.Vector3().subVectors(cameraVel, bodyVel);
    return Math.max(0, -relVel.dot(dir));
}

function formatETA(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return '∞';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d >= 1) return '1 Day+';
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// ── PlanetNameIndicator ──────────────────────────────────────────────────────

export class PlanetNameIndicator {
    private uiScene: THREE.Scene;
    private simulationState: ISimulationState;

    /** Active sprites — grown/shrunk each frame. */
    private spritePool: PoolEntry[] = [];

    /** Scratch vector to avoid per-frame allocation. */
    private _scratch = new THREE.Vector3();

    constructor(uiScene: THREE.Scene, simulationState: ISimulationState) {
        this.uiScene = uiScene;
        this.simulationState = simulationState;
    }

    /**
     * Called every animation frame.
     *
     * @param camera  The main perspective camera (used for NDC projection).
     * @param cameraVelocity  The camera's current velocity (world u/s), computed
     *                        from the per-frame position delta.
     * @param showEta  When true, the panel will also render the ETA line.
     *                 (Currently reserved for flight mode – defaults false.)
     * @param autopilotState  Optional autopilot state. When provided and the
     *                        autopilot is actively showing a target indicator
     *                        (i.e. active and not in TIDAL_LOCK), the target
     *                        body's normal name label is suppressed to avoid
     *                        duplicate indicators on the same body.
     */
    update(
        camera: THREE.PerspectiveCamera,
        cameraVelocity: THREE.Vector3,
        showEta = false,
        autopilotState?: IAutopilotState
    ): void {
        const bodies = this.simulationState.bodies;
        const showNames = this.simulationState.showNames;
        if (!showNames || bodies.length === 0) {
            this.hideAll();
            return;
        }

        // Determine whether the autopilot indicator is currently covering its target.
        // We skip the target body in PlanetNameIndicator so it doesn't double-up.
        const apTargetHidden =
            autopilotState?.isActive &&
            autopilotState.targetBody != null &&
            autopilotState.phase !== 'TIDAL_LOCK';

        // Determine which bodies get indicators
        const visible: { body: Body; nx: number; ny: number; dist: number }[] = [];

        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (!body || body._isDisposed || !body.mesh) continue;
            if (!body.name) continue;

            // Skip the autopilot target — the autopilot indicator panel already
            // shows name + distance for it.
            if (apTargetHidden && body === autopilotState!.targetBody) continue;

            // Project body world position to NDC
            body.mesh.getWorldPosition(this._scratch);
            this._scratch.project(camera);
            const nx = this._scratch.x;
            const ny = this._scratch.y;
            const nz = this._scratch.z;

            // Off-screen or behind camera
            if (nz >= 1 || Math.abs(nx) > 1 || Math.abs(ny) > 1) continue;

            const dist = camera.position.distanceTo(body.mesh.position);
            visible.push({ body, nx, ny, dist });
        }

        // Synchronise the sprite pool to match the visible count
        this.syncPool(visible.length);

        // Update each sprite — always redraw and recreate texture each frame
        // (same proven pattern as AutopilotTargetIndicator)
        for (let i = 0; i < visible.length; i++) {
            const v = visible[i];
            const entry = this.spritePool[i];

            const uiX = v.nx * (window.innerWidth / 2);
            const uiY = v.ny * (window.innerHeight / 2);

            // Build distance label
            const distLabel = `${Math.round(v.dist).toLocaleString()} u`;

            // ETA computed infra reserved for future flight-mode use
            if (showEta) {
                const closingSpeed = computeClosingSpeed(
                    camera.position,
                    cameraVelocity,
                    v.body.mesh.position,
                    v.body.velocity
                );
                void (closingSpeed > 0.001 ? formatETA(v.dist / closingSpeed) : '∞');
            }

            // Draw onto this sprite's own canvas
            const canvasResized = this.drawPanel(entry, v.body.name, distLabel);

            // Autopilot indicator pattern: recreate texture on resize, otherwise
            // reassign .image and flag dirty. This guarantees Three.js re-reads
            // the canvas content even after a resize.
            if (canvasResized) {
                entry.texture.dispose();
                entry.texture = new THREE.CanvasTexture(entry.canvas);
                entry.texture.needsUpdate = true;
                entry.material.map = entry.texture;
                entry.material.needsUpdate = true;
            } else {
                entry.texture.image = entry.canvas;
                entry.texture.needsUpdate = true;
            }

            this.updateSprite(entry, uiX, uiY);
        }
    }

    /** Free all GPU resources. */
    dispose(): void {
        for (const entry of this.spritePool) {
            entry.texture.dispose();
            entry.material.dispose();
            this.uiScene.remove(entry.sprite);
        }
        this.spritePool = [];
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private hideAll(): void {
        for (const entry of this.spritePool) {
            entry.sprite.visible = false;
        }
    }

    /**
     * Grow or shrink the sprite pool to match the desired count.
     */
    private syncPool(desired: number): void {
        while (this.spritePool.length > desired) {
            const entry = this.spritePool.pop()!;
            entry.sprite.visible = false;
        }
        while (this.spritePool.length < desired) {
            const entry = this.createPoolEntry();
            this.spritePool.push(entry);
        }
    }

    private createPoolEntry(): PoolEntry {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
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

        return { sprite, material, canvas, ctx, canvasW: 1, canvasH: 1, texture };
    }

    /**
     * Draw the name+distance panel onto the sprite's canvas.
     * Returns true if the canvas was resized (texture must be recreated).
     */
    private drawPanel(entry: PoolEntry, name: string, distLabel: string): boolean {
        const ctx = entry.ctx;

        // Measure text
        ctx.font = 'bold 32px monospace';
        const nameW = ctx.measureText(name).width;

        ctx.font = '22px monospace';
        const distW = ctx.measureText(distLabel).width;

        const maxTextW = Math.max(nameW, distW);

        // Compute canvas dimensions
        const contentW = Math.max(maxTextW, MIN_CONTENT_W);
        const innerW = contentW + PAD * 2;
        const fullW = innerW + ACCENT_LEN * 2 + 4;
        const fullH = DIST_Y + 20 + BOTTOM_PAD;

        const resized = entry.canvasW !== fullW || entry.canvasH !== fullH;

        if (resized) {
            ctx.clearRect(0, 0, entry.canvasW, entry.canvasH);
            entry.canvas.width = fullW;
            entry.canvas.height = fullH;
            entry.canvasW = fullW;
            entry.canvasH = fullH;
        } else {
            ctx.clearRect(0, 0, fullW, fullH);
        }

        // ── Background panel ──────────────────────────────────────────────
        ctx.fillStyle = 'rgba(0, 8, 16, 0.50)';
        ctx.fillRect(PAD, PAD, fullW - PAD * 2, fullH - PAD * 2);

        ctx.strokeStyle = 'rgba(0, 255, 204, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(PAD, PAD, fullW - PAD * 2, fullH - PAD * 2);

        // ── Corner accent brackets ────────────────────────────────────────
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 2;
        // top-left
        ctx.beginPath();
        ctx.moveTo(PAD, PAD + ACCENT_LEN);
        ctx.lineTo(PAD, PAD);
        ctx.lineTo(PAD + ACCENT_LEN, PAD);
        ctx.stroke();
        // top-right
        ctx.beginPath();
        ctx.moveTo(fullW - PAD - ACCENT_LEN, PAD);
        ctx.lineTo(fullW - PAD, PAD);
        ctx.lineTo(fullW - PAD, PAD + ACCENT_LEN);
        ctx.stroke();
        // bottom-left
        ctx.beginPath();
        ctx.moveTo(PAD, fullH - PAD - ACCENT_LEN);
        ctx.lineTo(PAD, fullH - PAD);
        ctx.lineTo(PAD + ACCENT_LEN, fullH - PAD);
        ctx.stroke();
        // bottom-right
        ctx.beginPath();
        ctx.moveTo(fullW - PAD - ACCENT_LEN, fullH - PAD);
        ctx.lineTo(fullW - PAD, fullH - PAD);
        ctx.lineTo(fullW - PAD, fullH - PAD - ACCENT_LEN);
        ctx.stroke();

        // ── Name — bold, cyan glow ────────────────────────────────────────
        const cx = fullW / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 32px monospace';
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(0, 255, 204, 0.9)';
        ctx.fillStyle = '#00ffcc';
        ctx.fillText(name, cx, NAME_Y);

        // ── Distance — dim white ──────────────────────────────────────────
        ctx.font = '22px monospace';
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillText(distLabel, cx, DIST_Y);

        return resized;
    }

    private updateSprite(entry: PoolEntry, uiX: number, uiY: number): void {
        const spriteW = (entry.canvasW / REF_CANVAS_W) * REF_SPRITE_W;
        const spriteH = (entry.canvasH / REF_CANVAS_H) * REF_SPRITE_H;
        entry.sprite.scale.set(spriteW, spriteH, 1);
        entry.sprite.position.set(uiX, uiY + spriteH / 2 + 10, TEXT_SPRITE_Z);
        entry.sprite.visible = true;
    }
}
