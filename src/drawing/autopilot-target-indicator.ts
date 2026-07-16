import * as THREE from 'three';
import { Body } from '../bodies/body';
import { IAutopilotState } from '../interfaces';
import { AUTOPILOT_ORBIT_ALTITUDE_FACTOR, TEXT_SPRITE_Z } from '../utilities/consts';

// ── Private texture helpers ──────────────────────────────────────────────────
const W = 512,
        H = 160;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const _ctx = c.getContext('2d')!;
/**
 * Renders the on-screen info panel: body name, distance, and ETA inside a
 * semi-transparent dark box with cyan corner accents.
 */
function createInfoTexture(
    name: string,
    distLabel: string,
    etaLabel: string
): THREE.CanvasTexture {
    
    _ctx.clearRect(0, 0, W, H);

    // Background panel
    // const pad = 8;
    // ctx.fillStyle = 'rgba(0, 8, 16, 0.70)';
    // ctx.fillRect(pad, pad, W - pad * 2, H - pad * 2);

    // // Outer border (dim cyan)
    // ctx.strokeStyle = 'rgba(0, 255, 204, 0.35)';
    // ctx.lineWidth = 1.5;
    // ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);

    // Corner accent brackets
    // const accentLen = 14;
    // ctx.strokeStyle = '#00ffcc';
    // ctx.lineWidth = 2;
    // // top-left
    // ctx.beginPath();
    // ctx.moveTo(pad, pad + accentLen);
    // ctx.lineTo(pad, pad);
    // ctx.lineTo(pad + accentLen, pad);
    // ctx.stroke();
    // // top-right
    // ctx.beginPath();
    // ctx.moveTo(W - pad - accentLen, pad);
    // ctx.lineTo(W - pad, pad);
    // ctx.lineTo(W - pad, pad + accentLen);
    // ctx.stroke();
    // // bottom-left
    // ctx.beginPath();
    // ctx.moveTo(pad, H - pad - accentLen);
    // ctx.lineTo(pad, H - pad);
    // ctx.lineTo(pad + accentLen, H - pad);
    // ctx.stroke();
    // // bottom-right
    // ctx.beginPath();
    // ctx.moveTo(W - pad - accentLen, H - pad);
    // ctx.lineTo(W - pad, H - pad);
    // ctx.lineTo(W - pad, H - pad - accentLen);
    // ctx.stroke();

    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';

    // Body name — large bold cyan with glow
    _ctx.font = 'bold 38px monospace';
    _ctx.shadowBlur = 14;
    _ctx.shadowColor = 'rgba(0, 255, 204, 0.9)';
    _ctx.fillStyle = '#00ffcc';
    _ctx.fillText(name, W / 2, 52);

    // Distance
    _ctx.font = '25px monospace';
    _ctx.shadowBlur = 5;
    _ctx.shadowColor = 'rgba(0,0,0,0.6)';
    _ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
    _ctx.fillText(distLabel, W / 2, 100);

    // ETA
    _ctx.font = '23px monospace';
    _ctx.fillStyle = 'rgba(130, 255, 210, 0.85)';
    _ctx.fillText(etaLabel, W / 2, 135);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

/**
 * Renders a right-facing chevron ">" in cyan.
 * The caller rotates the sprite via SpriteMaterial.rotation to point at the target.
 * This texture is created once and reused for the lifetime of the indicator.
 */
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

    // ">" shape centred in the canvas, pointing right
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

// ── Pure helper functions ────────────────────────────────────────────────────

/**
 * Returns the closing speed (units/s) of the ship toward the target.
 * A positive value means the ship is approaching; 0 if moving away or stationary.
 */
function computeClosingSpeed(ship: Body, target: Body): number {
    const dir = target.mesh.position.clone().sub(ship.mesh.position);
    const dist = dir.length();
    if (dist === 0) return 0;
    dir.divideScalar(dist); // normalise in-place
    const relVel = ship.velocity.clone().sub(target.velocity);
    return Math.max(0, relVel.dot(dir));
}

/**
 * Formats a duration in seconds into a compact d/h/m/s string.
 * Returns "∞" when the ship is not closing on the target.
 */
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

// ── AutopilotTargetIndicator ─────────────────────────────────────────────────

export class AutopilotTargetIndicator {
    private uiScene: THREE.Scene;
    private autopilotState: IAutopilotState;
    private flightState: { knownShip: Body | null };

    private _infoSprite: THREE.Sprite | null = null;
    private _edgeSprite: THREE.Sprite | null = null;

    /** Cached static chevron texture — created once in init(), disposed in dispose(). */
    private _chevronTexture: THREE.CanvasTexture | null = null;

    /** Pre-allocated scratch vector to avoid per-frame allocations. */
    private readonly _scratch = new THREE.Vector3();

    constructor(
        uiScene: THREE.Scene,
        autopilotState: IAutopilotState,
        flightState: { knownShip: Body | null }
    ) {
        this.uiScene = uiScene;
        this.autopilotState = autopilotState;
        this.flightState = flightState;
    }

    /** Create both sprites and add them to the uiScene. Call exactly once after construction. */
    init(): void {
        this._initInfoSprite();
        this._initEdgeSprite();
    }

    private _initInfoSprite(): void {
        const mat = new THREE.SpriteMaterial({
            map: createInfoTexture('', '', ''),
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        this._infoSprite = new THREE.Sprite(mat);
        // 512×160 canvas → 360×112 screen-pixel sprite
        this._infoSprite.scale.set(360, 112, 1);
        this._infoSprite.visible = false;
        this.uiScene.add(this._infoSprite);
    }

    private _initEdgeSprite(): void {
        this._chevronTexture = createChevronTexture();
        const mat = new THREE.SpriteMaterial({
            map: this._chevronTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        this._edgeSprite = new THREE.Sprite(mat);
        // 64×64 canvas → 44×44 screen-pixel sprite
        this._edgeSprite.scale.set(44, 44, 1);
        this._edgeSprite.visible = false;
        this.uiScene.add(this._edgeSprite);
    }

    /**
     * Update the target indicator sprites. Call once per animation frame.
     * @param camera The active perspective camera used for world-to-screen projection.
     */
    update(camera: THREE.PerspectiveCamera): void {
        if (!this._infoSprite || !this._edgeSprite) return;

        // Nothing to show when autopilot is inactive, has no target, or is in orbit-locked phase
        if (
            !this.autopilotState.isActive ||
            !this.autopilotState.targetBody?.mesh ||
            this.autopilotState.phase === 'TIDAL_LOCK'
        ) {
            this._infoSprite.visible = false;
            this._edgeSprite.visible = false;
            return;
        }

        const target = this.autopilotState.targetBody;
        const ship = this.flightState.knownShip;

        // Project target's world position into NDC space [-1, 1]
        target.mesh.getWorldPosition(this._scratch);
        this._scratch.project(camera);
        const nx = this._scratch.x; // NDC x: -1 = left edge,  +1 = right edge
        const ny = this._scratch.y; // NDC y: -1 = bottom edge, +1 = top edge
        const nz = this._scratch.z; // NDC z: > 1 means behind the camera

        // Build distance and ETA labels
        let distLabel = '';
        let etaLabel = 'ETA: ∞';
        if (ship?.mesh) {
            const rawDist = ship.mesh.position.distanceTo(target.mesh.position);
            const orbitRadius = target.radius * AUTOPILOT_ORBIT_ALTITUDE_FACTOR;
            const distToOrbit = Math.max(0, rawDist - orbitRadius);
            distLabel = `${Math.round(distToOrbit).toLocaleString()} u`;
            const closingSpeed = computeClosingSpeed(ship, target);
            etaLabel = closingSpeed > 0 ? formatETA(distToOrbit / closingSpeed) : 'ETA: ∞';
        }

        const onScreen = nz < 1 && Math.abs(nx) <= 1 && Math.abs(ny) <= 1;

        if (onScreen) {
            this._showOnScreen(nx, ny, target.name, distLabel, etaLabel);
        } else {
            this._showOffScreen(nx, ny, nz);
        }
    }

    /**
     * Position the info label sprite above the body's screen position.
     * Re-renders the canvas texture each frame since distance/ETA change continuously.
     */
    private _showOnScreen(
        nx: number,
        ny: number,
        name: string,
        distLabel: string,
        etaLabel: string
    ): void {
        if (!this._infoSprite || !this._edgeSprite) return;

        // Convert NDC to UI orthographic space (camera covers ±width/2, ±height/2)
        const uiX = nx * (window.innerWidth / 2);
        const uiY = ny * (window.innerHeight / 2);

        // Refresh canvas texture (distance and ETA update every frame)
        this._infoSprite.material.map?.dispose();
        this._infoSprite.material.map = createInfoTexture(name, distLabel, etaLabel);
        this._infoSprite.material.needsUpdate = true;

        // Float the sprite centre 70px above the body's screen position
        this._infoSprite.position.set(uiX, uiY + 70, TEXT_SPRITE_Z);
        this._infoSprite.visible = true;
        this._edgeSprite.visible = false;
    }

    /**
     * Clamp the chevron sprite to the viewport edge and rotate it to point toward
     * the off-screen target.
     */
    private _showOffScreen(nx: number, ny: number, nz: number): void {
        if (!this._infoSprite || !this._edgeSprite) return;

        // Direction from screen centre toward the target.
        // Flip when the target is behind the camera (nz >= 1).
        let dx = nz >= 1 ? -nx : nx;
        const dy = nz >= 1 ? -ny : ny;

        // Degenerate guard: target is exactly behind us with zero lateral offset
        if (dx === 0 && dy === 0) dx = 1;

        // NDC margin equivalent to 30 screen pixels from each edge
        const marginX = 30 / (window.innerWidth / 2);
        const marginY = 30 / (window.innerHeight / 2);
        const maxX = 1 - marginX;
        const maxY = 1 - marginY;

        // Scale the direction vector until it hits the viewport rectangle boundary
        const scale = Math.min(maxX / Math.abs(dx), maxY / Math.abs(dy));
        const clampedNdcX = dx * scale;
        const clampedNdcY = dy * scale;

        // Convert clamped NDC to UI orthographic space
        const uiX = clampedNdcX * (window.innerWidth / 2);
        const uiY = clampedNdcY * (window.innerHeight / 2);

        this._edgeSprite.position.set(uiX, uiY, TEXT_SPRITE_Z);

        // SpriteMaterial.rotation rotates the sprite counterclockwise (radians).
        // atan2(dy, dx) gives the angle of the direction vector from the x-axis,
        // which matches the default right-facing chevron at rotation = 0.
        this._edgeSprite.material.rotation = Math.atan2(dy, dx);

        this._edgeSprite.visible = true;
        this._infoSprite.visible = false;
    }

    /** Remove sprites from the scene and free all GPU resources. */
    dispose(): void {
        if (this._infoSprite) {
            this._infoSprite.material.map?.dispose();
            this._infoSprite.material.dispose();
            this.uiScene.remove(this._infoSprite);
            this._infoSprite = null;
        }
        if (this._edgeSprite) {
            this._chevronTexture?.dispose();
            this._chevronTexture = null;
            this._edgeSprite.material.dispose();
            this.uiScene.remove(this._edgeSprite);
            this._edgeSprite = null;
        }
    }
}
