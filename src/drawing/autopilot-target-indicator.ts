import * as THREE from 'three';
import { Body } from '../bodies/body';
import { IAutopilotState } from '../interfaces';
import { AUTOPILOT_ORBIT_ALTITUDE_FACTOR, TEXT_SPRITE_Z } from '../utilities/consts';

// ─────────────────────────────────────────────────────────────────────────────
// Canvas + context reused forever
// ─────────────────────────────────────────────────────────────────────────────
const W = 512;
const H = 160;

const infoCanvas = document.createElement('canvas');
infoCanvas.width = W;
infoCanvas.height = H;
const infoCtx = infoCanvas.getContext('2d')!;

// Pre‑set static drawing styles (only dynamic text changes)
function drawInfoPanel(name: string, distLabel: string, etaLabel: string) {
    infoCtx.clearRect(0, 0, W, H);

    infoCtx.textAlign = 'center';
    infoCtx.textBaseline = 'middle';

    // Name
    infoCtx.font = 'bold 38px monospace';
    infoCtx.shadowBlur = 14;
    infoCtx.shadowColor = 'rgba(0, 255, 204, 0.9)';
    infoCtx.fillStyle = '#00ffcc';
    infoCtx.fillText(name, W / 2, 52);

    // Distance
    infoCtx.font = '25px monospace';
    infoCtx.shadowBlur = 5;
    infoCtx.shadowColor = 'rgba(0,0,0,0.6)';
    infoCtx.fillStyle = 'rgba(255, 255, 255, 0.90)';
    infoCtx.fillText(distLabel, W / 2, 100);

    // ETA
    infoCtx.font = '23px monospace';
    infoCtx.fillStyle = 'rgba(130, 255, 210, 0.85)';
    infoCtx.fillText(etaLabel, W / 2, 135);
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
        // Info sprite
        this.infoTexture = new THREE.CanvasTexture(infoCanvas);
        this.infoTexture.needsUpdate = true;

        const infoMat = new THREE.SpriteMaterial({
            map: this.infoTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        this.infoSprite = new THREE.Sprite(infoMat);
        this.infoSprite.scale.set(360, 112, 1);
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

    // Always update because animate loop is already throttled
    let distLabel = '';
    let etaLabel = 'ETA: ∞';

    if (ship?.mesh) {
        const rawDist = ship.mesh.position.distanceTo(target.mesh.position);
        const orbitRadius = target.radius * AUTOPILOT_ORBIT_ALTITUDE_FACTOR;
        const distToOrbit = Math.max(0, rawDist - orbitRadius);

        distLabel = `${Math.round(distToOrbit).toLocaleString()} u`;

        const closingSpeed = computeClosingSpeed(ship, target);
        etaLabel =
            closingSpeed > 0
                ? formatETA(distToOrbit / closingSpeed)
                : 'ETA: ∞';
    }

    drawInfoPanel(target.name, distLabel, etaLabel);
    this.infoTexture.needsUpdate = true;

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
