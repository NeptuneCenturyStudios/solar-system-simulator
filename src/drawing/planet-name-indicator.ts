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

// ── PlanetNameIndicator ──────────────────────────────────────────────────────

export class PlanetNameIndicator {
    private uiScene: THREE.Scene;
    private simulationState: ISimulationState;

    /** Active sprites — grown/shrunk each frame. */
    private spritePool: PoolEntry[] = [];

    /** Dedicated sprite for the flight-hover panel when showNames is OFF. */
    private _hoverEntry: PoolEntry | null = null;

    /** Dedicated sprite for the cancel-autopilot ring shown when hovering over the active autopilot target. */
    private _cancelEntry: PoolEntry | null = null;

    /**
     * While the user is holding E to charge autopilot, this is locked to the body
     * that was hovered when charging began.  Prevents the hover display from
     * vanishing if the mouse drifts slightly off the body mid-charge.
     */
    private _chargeLockedBody: Body | null = null;

    /** Scratch vector to avoid per-frame allocation. */
    private _scratch = new THREE.Vector3();

    /**
     * Set each frame by update(). The body whose projected position is nearest
     * the steering-line tip (within its apparent screen radius). Null when none.
     */
    public steeringHoveredBody: Body | null = null;

    constructor(uiScene: THREE.Scene, simulationState: ISimulationState) {
        this.uiScene = uiScene;
        this.simulationState = simulationState;
    }

    /**
     * Called every animation frame.
     *
     * @param camera  The main perspective camera (used for NDC projection).
     * @param cameraVelocity  The camera's current velocity (world u/s).
     * @param showEta  Reserved for future use; defaults false.
     * @param autopilotState  Suppresses the name label for the current autopilot
     *                        target to avoid duplication with the target indicator.
     * @param flightContext  When provided and active, enables hover detection
     *                       (steering tip vs. body screen position) and renders
     *                       the E-key autopilot prompt section on the hovered body.
     *                       Runs regardless of the showNames setting.
     */
    update(
        camera: THREE.PerspectiveCamera,
        cameraVelocity: THREE.Vector3,
        showEta = false,
        autopilotState?: IAutopilotState,
        flightContext?: IPlanetNameFlightContext
    ): void {
        const bodies = this.simulationState.bodies;
        const showNames = this.simulationState.showNames;

        // ── Hover detection (always runs in flight mode, independent of showNames) ──
        let hoveredBody: Body | null = null;
        const isFlightHoverActive = !!(flightContext?.isActive && flightContext.steeringLineVisible);
        const isCharging = !!(flightContext && flightContext.autopilotCharge > 0);

        if (!isCharging) {
            // No active charge — normal hover detection and clear any stale lock
            this._chargeLockedBody = null;
            if (isFlightHoverActive && bodies.length > 0) {
                const tipX = flightContext!.steeringTipX;
                const tipY = flightContext!.steeringTipY;
                const halfW = window.innerWidth / 2;
                const halfH = window.innerHeight / 2;
                const tanHalfFovY = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));

                let bestScreenDist = Infinity;
                for (const body of bodies) {
                    if (!body || body._isDisposed || !body.mesh) continue;
                    if (body === flightContext!.activeShip) continue; // skip own ship
                    body.mesh.getWorldPosition(this._scratch);
                    this._scratch.project(camera);
                    if (this._scratch.z >= 1) continue; // behind camera
                    const uiX = this._scratch.x * halfW;
                    const uiY = this._scratch.y * halfH;
                    const camDist = camera.position.distanceTo(body.mesh.position);
                    // Apparent screen radius — at least 50 px so small distant bodies are still selectable
                    const apparentR = Math.max(50, (body.radius / camDist) * (halfH / tanHalfFovY));
                    const screenDist = Math.hypot(uiX - tipX, uiY - tipY);
                    if (screenDist < apparentR && screenDist < bestScreenDist) {
                        bestScreenDist = screenDist;
                        hoveredBody = body;
                    }
                }
            }
        } else if (this._chargeLockedBody && !this._chargeLockedBody._isDisposed) {
            // Charging is active and a lock exists — hold hover on the locked body
            // regardless of where the steering tip currently is.
            hoveredBody = this._chargeLockedBody;
        } else {
            // Charging just started (no lock set yet) — run detection once to establish the lock
            if (isFlightHoverActive && bodies.length > 0) {
                const tipX = flightContext!.steeringTipX;
                const tipY = flightContext!.steeringTipY;
                const halfW = window.innerWidth / 2;
                const halfH = window.innerHeight / 2;
                const tanHalfFovY = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));

                let bestScreenDist = Infinity;
                for (const body of bodies) {
                    if (!body || body._isDisposed || !body.mesh) continue;
                    if (body === flightContext!.activeShip) continue;
                    body.mesh.getWorldPosition(this._scratch);
                    this._scratch.project(camera);
                    if (this._scratch.z >= 1) continue;
                    const uiX = this._scratch.x * halfW;
                    const uiY = this._scratch.y * halfH;
                    const camDist = camera.position.distanceTo(body.mesh.position);
                    const apparentR = Math.max(50, (body.radius / camDist) * (halfH / tanHalfFovY));
                    const screenDist = Math.hypot(uiX - tipX, uiY - tipY);
                    if (screenDist < apparentR && screenDist < bestScreenDist) {
                        bestScreenDist = screenDist;
                        hoveredBody = body;
                    }
                }
            }
            if (hoveredBody) this._chargeLockedBody = hoveredBody;
        }
        this.steeringHoveredBody = hoveredBody;

        // Whether the autopilot target indicator is already covering its target
        const apTargetHidden =
            autopilotState?.isActive &&
            autopilotState.targetBody != null &&
            autopilotState.phase !== 'TIDAL_LOCK';

        // Ring fill for the hovered body (–1 = no ring section shown)
        // Suppressed entirely while autopilot is active to avoid cluttering the view.
        let computedRingFill = -1;
        if (isFlightHoverActive && hoveredBody && !apTargetHidden) {
            computedRingFill = Math.min(
                1,
                flightContext!.autopilotCharge / flightContext!.chargeTime
            );
        }

        // ── Regular names pass (gated by showNames) ───────────────────────
        const visible: { body: Body; nx: number; ny: number; dist: number }[] = [];

        if (showNames && bodies.length > 0) {
            for (let i = 0; i < bodies.length; i++) {
                const body = bodies[i];
                if (!body || body._isDisposed || !body.mesh) continue;
                if (!body.name) continue;
                // Skip the autopilot target — target indicator already shows name+dist
                if (apTargetHidden && body === autopilotState!.targetBody) continue;
                // In flight mode, suppress the player ship's own label
                if (isFlightHoverActive && body === flightContext!.activeShip) continue;

                body.mesh.getWorldPosition(this._scratch);
                this._scratch.project(camera);
                const nx = this._scratch.x;
                const ny = this._scratch.y;
                const nz = this._scratch.z;

                if (nz >= 1 || Math.abs(nx) > 1 || Math.abs(ny) > 1) continue;

                const dist = camera.position.distanceTo(body.mesh.position);
                visible.push({ body, nx, ny, dist });
            }
        }

        this.syncPool(visible.length);

        for (let i = 0; i < visible.length; i++) {
            const v = visible[i];
            const entry = this.spritePool[i];

            const uiX = v.nx * (window.innerWidth / 2);
            const uiY = v.ny * (window.innerHeight / 2);
            const distLabel = `${Math.round(v.dist).toLocaleString()} u`;

            if (showEta) {
                const closingSpeed = computeClosingSpeed(
                    camera.position,
                    cameraVelocity,
                    v.body.mesh.position,
                    v.body.velocity
                );
                void (closingSpeed > 0.001 ? formatETA(v.dist / closingSpeed) : '∞');
            }

            // Pass ring fill only for the hovered body
            const ringFill = isFlightHoverActive && v.body === hoveredBody ? computedRingFill : -1;
            const canvasResized = this.drawPanel(entry, v.body.name, distLabel, ringFill);
            this._applyTexture(entry, canvasResized);
            this.updateSprite(entry, uiX, uiY);
        }

        // ── Hover-only sprite (showNames OFF + body hovered in flight mode) ─
        if (isFlightHoverActive && hoveredBody && !showNames) {
            // Suppress the hover panel while autopilot is active — the target indicator
            // and cancel-ring entry already provide all the needed context.
            const suppressPanel = apTargetHidden;
            if (!suppressPanel) {
                if (!this._hoverEntry) this._hoverEntry = this.createPoolEntry();
                hoveredBody.mesh.getWorldPosition(this._scratch);
                this._scratch.project(camera);
                const uiX = this._scratch.x * (window.innerWidth / 2);
                const uiY = this._scratch.y * (window.innerHeight / 2);
                const dist = camera.position.distanceTo(hoveredBody.mesh.position);
                const distLabel = `${Math.round(dist).toLocaleString()} u`;
                const canvasResized = this.drawPanel(
                    this._hoverEntry,
                    hoveredBody.name,
                    distLabel,
                    computedRingFill
                );
                this._applyTexture(this._hoverEntry, canvasResized);
                this.updateSprite(this._hoverEntry, uiX, uiY);
            } else if (this._hoverEntry) {
                this._hoverEntry.sprite.visible = false;
            }
        } else if (this._hoverEntry) {
            this._hoverEntry.sprite.visible = false;
        }

        // ── Cancel-autopilot ring (visible whenever autopilot target is on screen) ─
        if (flightContext?.isActive && apTargetHidden) {
            const targetBody = autopilotState!.targetBody!;
            if (!targetBody._isDisposed && targetBody.mesh) {
                targetBody.mesh.getWorldPosition(this._scratch);
                this._scratch.project(camera);
                const nz = this._scratch.z;
                const nx = this._scratch.x;
                const ny = this._scratch.y;
                // Show as long as the target is in front of the camera
                if (nz < 1 && Math.abs(nx) <= 1.1 && Math.abs(ny) <= 1.1) {
                    if (!this._cancelEntry) this._cancelEntry = this.createPoolEntry();
                    const uiX = nx * (window.innerWidth / 2);
                    const uiY = ny * (window.innerHeight / 2);
                    const canvasResized = this.drawCancelRingOnly(this._cancelEntry);
                    this._applyTexture(this._cancelEntry, canvasResized);
                    // Position below the body (target indicator sits above it)
                    const spriteW = (this._cancelEntry.canvasW / REF_CANVAS_W) * REF_SPRITE_W;
                    const spriteH = (this._cancelEntry.canvasH / REF_CANVAS_H) * REF_SPRITE_H;
                    this._cancelEntry.sprite.scale.set(spriteW, spriteH, 1);
                    this._cancelEntry.sprite.position.set(uiX, uiY - spriteH / 2 - 10, TEXT_SPRITE_Z);
                    this._cancelEntry.sprite.visible = true;
                } else if (this._cancelEntry) {
                    this._cancelEntry.sprite.visible = false;
                }
            } else if (this._cancelEntry) {
                this._cancelEntry.sprite.visible = false;
            }
        } else if (this._cancelEntry) {
            this._cancelEntry.sprite.visible = false;
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
        if (this._hoverEntry) {
            this._hoverEntry.texture.dispose();
            this._hoverEntry.material.dispose();
            this.uiScene.remove(this._hoverEntry.sprite);
            this._hoverEntry = null;
        }
        if (this._cancelEntry) {
            this._cancelEntry.texture.dispose();
            this._cancelEntry.material.dispose();
            this.uiScene.remove(this._cancelEntry.sprite);
            this._cancelEntry = null;
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private hideAll(): void {
        for (const entry of this.spritePool) {
            entry.sprite.visible = false;
        }
    }

    /** Apply updated canvas to a pool entry's texture, recreating it if the canvas was resized. */
    private _applyTexture(entry: PoolEntry, canvasResized: boolean): void {
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
     * @param ringFill  -1 = no ring section; 0–1 = ring visible with that fill progress.
     * Returns true if the canvas was resized (texture must be recreated).
     */
    private drawPanel(entry: PoolEntry, name: string, distLabel: string, ringFill = -1): boolean {
        const ctx = entry.ctx;
        const RING_SECTION_H = 60;
        const hasRing = ringFill >= 0;

        // Measure text
        ctx.font = 'bold 32px monospace';
        const nameW = ctx.measureText(name).width;

        ctx.font = '22px monospace';
        const distW = ctx.measureText(distLabel).width;

        // Ensure canvas is wide enough for the ring label when active
        let minContentW = MIN_CONTENT_W;
        if (hasRing) {
            ctx.font = '20px monospace';
            const ringLabelW = ctx.measureText('Autopilot here').width;
            // circleLeftMargin(30) + diameter(40) + gap(8) + labelW + rightPad
            minContentW = Math.max(minContentW, 30 + 40 + 8 + ringLabelW + PAD);
        }

        const maxTextW = Math.max(nameW, distW);
        const contentW = Math.max(maxTextW, minContentW);
        const innerW = contentW + PAD * 2;
        const fullW = innerW + ACCENT_LEN * 2 + 4;

        const baseH = DIST_Y + 20 + BOTTOM_PAD;          // normal panel height
        const totalH = hasRing ? baseH + RING_SECTION_H : baseH;

        const resized = entry.canvasW !== fullW || entry.canvasH !== totalH;

        if (resized) {
            ctx.clearRect(0, 0, entry.canvasW, entry.canvasH);
            entry.canvas.width = fullW;
            entry.canvas.height = totalH;
            entry.canvasW = fullW;
            entry.canvasH = totalH;
        } else {
            ctx.clearRect(0, 0, fullW, totalH);
        }

        // ── Background panel ──────────────────────────────────────────────
        ctx.fillStyle = 'rgba(0, 8, 16, 0.50)';
        ctx.fillRect(PAD, PAD, fullW - PAD * 2, totalH - PAD * 2);

        ctx.strokeStyle = 'rgba(0, 255, 204, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(PAD, PAD, fullW - PAD * 2, totalH - PAD * 2);

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
        ctx.moveTo(PAD, totalH - PAD - ACCENT_LEN);
        ctx.lineTo(PAD, totalH - PAD);
        ctx.lineTo(PAD + ACCENT_LEN, totalH - PAD);
        ctx.stroke();
        // bottom-right
        ctx.beginPath();
        ctx.moveTo(fullW - PAD - ACCENT_LEN, totalH - PAD);
        ctx.lineTo(fullW - PAD, totalH - PAD);
        ctx.lineTo(fullW - PAD, totalH - PAD - ACCENT_LEN);
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

        // ── Ring / E-key prompt section ───────────────────────────────────
        if (hasRing) {
            // Separator line between the name/dist area and the ring row
            const sepY = baseH - BOTTOM_PAD / 2;
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0, 255, 204, 0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(PAD + 6, sepY);
            ctx.lineTo(fullW - PAD - 6, sepY);
            ctx.stroke();

            // Circle geometry
            const ringCY = baseH + RING_SECTION_H / 2; // vertical centre of ring row
            const circR = 20;                           // circle radius
            const circCX = PAD + ACCENT_LEN + 4 + circR + 4; // left-anchored

            // Subtle background fill inside the circle
            ctx.fillStyle = 'rgba(0, 255, 204, 0.07)';
            ctx.beginPath();
            ctx.arc(circCX, ringCY, circR, 0, Math.PI * 2);
            ctx.fill();

            // 4 px thick outer ring border
            ctx.strokeStyle = 'rgba(0, 255, 204, 0.55)';
            ctx.lineWidth = 4;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(circCX, ringCY, circR, 0, Math.PI * 2);
            ctx.stroke();

            // Clockwise fill arc drawn on top — white with glow
            if (ringFill > 0) {
                const startAngle = -Math.PI / 2;
                const endAngle = startAngle + ringFill * Math.PI * 2;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 4;
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
                ctx.beginPath();
                ctx.arc(circCX, ringCY, circR, startAngle, endAngle);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // "E" letter centred inside the circle
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 22px monospace';
            ctx.shadowBlur = 0;
            ctx.fillStyle = ringFill > 0 ? '#ffffff' : 'rgba(255,255,255,0.80)';
            ctx.fillText('E', circCX, ringCY);

            // "Autopilot here" label to the right of the circle
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = '20px monospace';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
            ctx.fillText('Autopilot here', circCX + circR + 10, ringCY);
        }

        return resized;
    }

    /**
     * Draw a compact cancel-autopilot ring widget (no name/distance header).
     * Shows a red-orange "E" ring with "Cancel autopilot" label.
     * Returns true if the canvas was resized.
     */
    private drawCancelRingOnly(entry: PoolEntry): boolean {
        const ctx = entry.ctx;
        const H = 56;
        const circR = 20;
        const circCX = PAD + ACCENT_LEN + 4 + circR + 4;
        const ringCY = H / 2;

        ctx.font = '20px monospace';
        const labelW = ctx.measureText('Cancel autopilot').width;
        const W = Math.ceil(circCX + circR + 10 + labelW + PAD);

        const resized = entry.canvasW !== W || entry.canvasH !== H;
        if (resized) {
            ctx.clearRect(0, 0, entry.canvasW, entry.canvasH);
            entry.canvas.width = W;
            entry.canvas.height = H;
            entry.canvasW = W;
            entry.canvasH = H;
        } else {
            ctx.clearRect(0, 0, W, H);
        }

        // Background
        ctx.fillStyle = 'rgba(0, 8, 16, 0.50)';
        ctx.fillRect(PAD, PAD, W - PAD * 2, H - PAD * 2);
        ctx.strokeStyle = 'rgba(255, 80, 60, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(PAD, PAD, W - PAD * 2, H - PAD * 2);

        // Corner accent brackets
        ctx.strokeStyle = 'rgba(255, 80, 60, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(PAD, PAD + ACCENT_LEN); ctx.lineTo(PAD, PAD); ctx.lineTo(PAD + ACCENT_LEN, PAD); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W - PAD - ACCENT_LEN, PAD); ctx.lineTo(W - PAD, PAD); ctx.lineTo(W - PAD, PAD + ACCENT_LEN); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(PAD, H - PAD - ACCENT_LEN); ctx.lineTo(PAD, H - PAD); ctx.lineTo(PAD + ACCENT_LEN, H - PAD); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W - PAD - ACCENT_LEN, H - PAD); ctx.lineTo(W - PAD, H - PAD); ctx.lineTo(W - PAD, H - PAD - ACCENT_LEN); ctx.stroke();

        // Circle background
        ctx.fillStyle = 'rgba(255, 80, 60, 0.07)';
        ctx.beginPath(); ctx.arc(circCX, ringCY, circR, 0, Math.PI * 2); ctx.fill();

        // Circle border
        ctx.strokeStyle = 'rgba(255, 80, 60, 0.65)';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(circCX, ringCY, circR, 0, Math.PI * 2); ctx.stroke();

        // "E" letter (the key to press)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 22px monospace';
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillText('E', circCX, ringCY);

        // Label
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '20px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
        ctx.fillText('Cancel autopilot', circCX + circR + 10, ringCY);

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
