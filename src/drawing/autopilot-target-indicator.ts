import * as THREE from 'three';
import { Body } from '../bodies/body';
import { IAutopilotState } from '../interfaces';
import { AUTOPILOT_ORBIT_ALTITUDE_FACTOR, TEXT_SPRITE_Z } from '../utilities/consts';

// ─────────────────────────────────────────────────────────────────────────────
// Canvas + context reused forever (resized dynamically)
// ─────────────────────────────────────────────────────────────────────────────
let infoCanvas: HTMLCanvasElement | null = null;
let infoCtx: CanvasRenderingContext2D | null = null;
let currentCanvasW = 0;
let currentCanvasH = 0;

// Layout constants
const PAD = 15;
const ACCENT_LEN = 14;
// Text Y positions measured from top of padded area (like original layout)
const NAME_Y = 52;
const DIST_Y = 100;
const ETA_Y = 135;
// Total bottom padding after ETA (matching original ~25px bottom margin)
const BOTTOM_PAD = 25;

/**
 * Ensures the canvas is sized to w×h.
 * Clears the old canvas area BEFORE resizing so no ghost pixels remain.
 * Returns true if the dimensions actually changed.
 */
function ensureCanvas(w: number, h: number): boolean {
    if (!infoCanvas || !infoCtx) {
        infoCanvas = document.createElement('canvas');
        infoCtx = infoCanvas.getContext('2d')!;
        infoCanvas.width = w;
        infoCanvas.height = h;
        currentCanvasW = w;
        currentCanvasH = h;
        return true;
    }

    if (w === currentCanvasW && h === currentCanvasH) {
        return false; // no resize needed
    }

    // Clear the entire old canvas area before resizing
    infoCtx.clearRect(0, 0, currentCanvasW, currentCanvasH);

    // Set new dimensions (this also clears the canvas per spec, but the
    // explicit clearRect above handles edge cases)
    infoCanvas.width = w;
    infoCanvas.height = h;
    currentCanvasW = w;
    currentCanvasH = h;
    return true;
}

function drawInfoPanel(name: string, distLabel: string, etaLabel: string): boolean {
    // ── 1. Measure all text ──────────────────────────────────────────────
    const measureCtx = infoCtx || document.createElement('canvas').getContext('2d')!;

    measureCtx.font = 'bold 38px monospace';
    const nameW = measureCtx.measureText(name).width;

    measureCtx.font = '25px monospace';
    const distW = measureCtx.measureText(distLabel).width;

    measureCtx.font = '23px monospace';
    const etaW = measureCtx.measureText(etaLabel).width;

    const maxTextW = Math.max(nameW, distW, etaW);

    // ── 2. Compute canvas dimensions ─────────────────────────────────────
    // Content area: text centred, with PAD on each side
    const contentW = Math.max(maxTextW, 100); // floor is 100px wide
    const innerW = contentW + PAD * 2;
    // Full canvas width: inner area + accent bracket width on both sides
    const fullW = innerW + ACCENT_LEN * 2 + 4; // +4 for outer border linewidth room

    // Height: fixed Y positions + bottom pad
    const fullH = ETA_Y + 23 + BOTTOM_PAD; // 23 = half font height approx, matches original 160

    const resized = ensureCanvas(fullW, fullH);

    const ctx = infoCtx!;

    // Always clear the full current canvas (needed even without resize since
    // we reuse the canvas)
    ctx.clearRect(0, 0, currentCanvasW, currentCanvasH);

    // ── 3. Background panel ──────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0, 8, 16, 0.50)';
    ctx.fillRect(PAD, PAD, fullW - PAD * 2, fullH - PAD * 2);

    // Outer border (dim cyan)
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(PAD, PAD, fullW - PAD * 2, fullH - PAD * 2);

    // ── 4. Corner accent brackets ────────────────────────────────────────
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

    // ── 5. Text ──────────────────────────────────────────────────────────
    const cx = fullW / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Name
    ctx.font = 'bold 38px monospace';
    ctx.shadowBlur = 14;
    ctx.shadowColor = 'rgba(0, 255, 204, 0.9)';
    ctx.fillStyle = '#00ffcc';
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

    return resized;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static chevron texture (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function createChevronTexture(): THREE.CanvasTexture {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d')!;

    ctx.shadowBlur = 12;
    ctx.shadowColor = 'rgba(0, 255, 204, 0.95)';
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const cx = S / 2;
    const cy = S / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy - 15);
    ctx.lineTo(cx + 15, cy);
    ctx.lineTo(cx - 11, cy + 15);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function computeClosingSpeed(ship: Body, target: Body): number {
    const dir = target.mesh.position.clone().sub(ship.mesh.position);
    const dist = dir.length();
    if (dist === 0) return 0;
    dir.divideScalar(dist);
    const relVel = ship.velocity.clone().sub(target.velocity);
    return Math.max(0, relVel.dot(dir));
}

function formatETA(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return 'ETA: ∞';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `ETA: ${d}d ${h}h`;
    if (h > 0) return `ETA: ${h}h ${m}m`;
    if (m > 0) return `ETA: ${m}m ${s}s`;
    return `ETA: ${s}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Optimized AutopilotTargetIndicator
// ─────────────────────────────────────────────────────────────────────────────
export class AutopilotTargetIndicator {
    private uiScene: THREE.Scene;
    private autopilotState: IAutopilotState;
    private flightState: { knownShip: Body | null };

    private infoSprite: THREE.Sprite | null = null;
    private edgeSprite: THREE.Sprite | null = null;

    private infoTexture: THREE.CanvasTexture | null = null;
    private chevronTexture: THREE.CanvasTexture | null = null;

    // Reference sprite scale from the original fixed canvas (512×160 → 360×112)
    // Used as a baseline so dynamic sizing matches the same pixel density.
    private static readonly REF_CANVAS_W = 512;
    private static readonly REF_SPRITE_W = 360;
    private static readonly REF_CANVAS_H = 160;
    private static readonly REF_SPRITE_H = 112;

    private scratch = new THREE.Vector3();

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
        // Info sprite (initialised once; texture is replaced on resize)
        this.infoTexture = new THREE.CanvasTexture(document.createElement('canvas'));
        this.infoTexture.needsUpdate = true;

        const infoMat = new THREE.SpriteMaterial({
            map: this.infoTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        this.infoSprite = new THREE.Sprite(infoMat);
        this.infoSprite.visible = false;
        this.uiScene.add(this.infoSprite);

        // Chevron sprite
        this.chevronTexture = createChevronTexture();
        const edgeMat = new THREE.SpriteMaterial({
            map: this.chevronTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        this.edgeSprite = new THREE.Sprite(edgeMat);
        this.edgeSprite.scale.set(44, 44, 1);
        this.edgeSprite.visible = false;
        this.uiScene.add(this.edgeSprite);
    }

    update(camera: THREE.PerspectiveCamera): void {
        if (!this.infoSprite || !this.edgeSprite) return;

        if (
            !this.autopilotState.isActive ||
            !this.autopilotState.targetBody?.mesh ||
            this.autopilotState.phase === 'TIDAL_LOCK'
        ) {
            this.infoSprite.visible = false;
            this.edgeSprite.visible = false;
            return;
        }

        const target = this.autopilotState.targetBody;
        const ship = this.flightState.knownShip;

        // Project target to NDC
        target.mesh.getWorldPosition(this.scratch);
        this.scratch.project(camera);

        const nx = this.scratch.x;
        const ny = this.scratch.y;
        const nz = this.scratch.z;

        const onScreen = nz < 1 && Math.abs(nx) <= 1 && Math.abs(ny) <= 1;

        if (onScreen) {
            this.showOnScreen(nx, ny, target, ship);
        } else {
            this.showOffScreen(nx, ny, nz);
        }
    }

    private showOnScreen(
        nx: number,
        ny: number,
        target: Body,
        ship: Body | null
    ): void {
        if (!this.infoSprite || !this.infoTexture) return;

        const uiX = nx * (window.innerWidth / 2);
        const uiY = ny * (window.innerHeight / 2);

        let distLabel = '';
        let etaLabel = 'ETA: ∞';

        if (ship?.mesh) {
            const rawDist = ship.mesh.position.distanceTo(target.mesh.position);
            const orbitRadius = target.radius * AUTOPILOT_ORBIT_ALTITUDE_FACTOR;
            const distToOrbit = Math.max(0, rawDist - orbitRadius);

            distLabel = `${Math.round(distToOrbit).toLocaleString()} u`;

            const closingSpeed = computeClosingSpeed(ship, target);
            etaLabel =
                closingSpeed > 0.001
                    ? formatETA(distToOrbit / closingSpeed)
                    : 'ETA: ∞';
        }

        const canvasResized = drawInfoPanel(target.name, distLabel, etaLabel);

        // When the canvas is resized, the old Three.js texture may cache stale
        // backing-store data. Recreate the texture to guarantee clean output.
        if (canvasResized) {
            if (this.infoTexture) this.infoTexture.dispose();
            this.infoTexture = new THREE.CanvasTexture(infoCanvas!);
            this.infoTexture.needsUpdate = true;
            (this.infoSprite.material as THREE.SpriteMaterial).map = this.infoTexture;
        } else {
            this.infoTexture.image = infoCanvas!;
            this.infoTexture.needsUpdate = true;
        }

        // Scale sprite to maintain the same visual pixel density as the hardcoded version
        const spriteW = (currentCanvasW / AutopilotTargetIndicator.REF_CANVAS_W) *
            AutopilotTargetIndicator.REF_SPRITE_W;
        const spriteH = (currentCanvasH / AutopilotTargetIndicator.REF_CANVAS_H) *
            AutopilotTargetIndicator.REF_SPRITE_H;
        this.infoSprite.scale.set(spriteW, spriteH, 1);

        this.infoSprite.position.set(uiX, uiY + 70, TEXT_SPRITE_Z);
        this.infoSprite.visible = true;
        this.edgeSprite!.visible = false;
    }

    private showOffScreen(nx: number, ny: number, nz: number): void {
        if (!this.edgeSprite) return;

        let dx = nz >= 1 ? -nx : nx;
        const dy = nz >= 1 ? -ny : ny;

        if (dx === 0 && dy === 0) dx = 1;

        const marginX = 30 / (window.innerWidth / 2);
        const marginY = 30 / (window.innerHeight / 2);
        const maxX = 1 - marginX;
        const maxY = 1 - marginY;

        const scale = Math.min(maxX / Math.abs(dx), maxY / Math.abs(dy));
        const clampedNdcX = dx * scale;
        const clampedNdcY = dy * scale;

        const uiX = clampedNdcX * (window.innerWidth / 2);
        const uiY = clampedNdcY * (window.innerHeight / 2);

        this.edgeSprite.position.set(uiX, uiY, TEXT_SPRITE_Z);
        this.edgeSprite.material.rotation = Math.atan2(dy, dx);

        this.edgeSprite.visible = true;
        this.infoSprite!.visible = false;
    }

    dispose(): void {
        if (this.infoSprite) {
            this.infoTexture?.dispose();
            this.infoSprite.material.dispose();
            this.uiScene.remove(this.infoSprite);
            this.infoSprite = null;
        }
        if (this.edgeSprite) {
            this.chevronTexture?.dispose();
            this.edgeSprite.material.dispose();
            this.uiScene.remove(this.edgeSprite);
            this.edgeSprite = null;
        }
    }
}
