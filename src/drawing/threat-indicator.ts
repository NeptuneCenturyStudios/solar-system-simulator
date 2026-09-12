import * as THREE from 'three';
import { ISimulationState } from '../interfaces';
import { TEXT_SPRITE_Z } from '../utilities/consts';

interface PoolEntry {
    sprite: THREE.Sprite;
    material: THREE.SpriteMaterial;
}

/** Floor for apparent on-screen radius so distant/tiny threats still get a visible ring. */
const MIN_APPARENT_R = 24;
/** Ring drawn this much larger than the body's apparent radius, so it doesn't hug the surface. */
const RING_PADDING_FACTOR = 1.35;
/** Seconds per pulse cycle. */
const PULSE_PERIOD = 1.2;

/** Red chevron texture, shared by every pooled off-screen sprite (built once, never mutated). */
function createRedChevronTexture(): THREE.CanvasTexture {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d')!;

    ctx.shadowBlur = 12;
    ctx.shadowColor = 'rgba(255, 60, 60, 0.95)';
    ctx.strokeStyle = '#ff3c3c';
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
 */
export class ThreatIndicator {
    private uiScene: THREE.Scene;
    private simulationState: ISimulationState;
    private offScreenPool: PoolEntry[] = [];
    private onScreenPool: PoolEntry[] = [];
    private chevronTexture: THREE.CanvasTexture | null = null;
    private ringTexture: THREE.CanvasTexture | null = null;
    private _scratch = new THREE.Vector3();

    constructor(uiScene: THREE.Scene, simulationState: ISimulationState) {
        this.uiScene = uiScene;
        this.simulationState = simulationState;
    }

    update(camera: THREE.PerspectiveCamera): void {
        const bodies = this.simulationState.bodies;
        const offScreen: { dx: number; dy: number }[] = [];
        const onScreen: { uiX: number; uiY: number; apparentR: number }[] = [];

        if (bodies.length > 0) {
            const halfW = window.innerWidth / 2;
            const halfH = window.innerHeight / 2;
            const tanHalfFovY = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));

            for (let i = 0; i < bodies.length; i++) {
                const body = bodies[i];
                if (!body || body._isDisposed || !body.mesh || !body.isThreat) continue;

                body.mesh.getWorldPosition(this._scratch);
                this._scratch.project(camera);

                const nx = this._scratch.x;
                const ny = this._scratch.y;
                const nz = this._scratch.z;

                if (nz < 1 && Math.abs(nx) <= 1 && Math.abs(ny) <= 1) {
                    const camDist = camera.position.distanceTo(body.mesh.position);
                    const apparentR = Math.max(
                        MIN_APPARENT_R,
                        (body.radius / camDist) * (halfH / tanHalfFovY)
                    );
                    onScreen.push({ uiX: nx * halfW, uiY: ny * halfH, apparentR });
                    continue;
                }

                let dx = nz >= 1 ? -nx : nx;
                const dy = nz >= 1 ? -ny : ny;
                if (dx === 0 && dy === 0) dx = 1;

                offScreen.push({ dx, dy });
            }
        }

        this.syncPool(this.offScreenPool, offScreen.length, () => this.createChevronEntry());
        this.syncPool(this.onScreenPool, onScreen.length, () => this.createRingEntry());

        const marginX = 30 / (window.innerWidth / 2);
        const marginY = 30 / (window.innerHeight / 2);
        const maxX = 1 - marginX;
        const maxY = 1 - marginY;

        for (let i = 0; i < offScreen.length; i++) {
            const { dx, dy } = offScreen[i];
            const entry = this.offScreenPool[i];

            const scale = Math.min(maxX / Math.abs(dx), maxY / Math.abs(dy));
            const clampedNdcX = dx * scale;
            const clampedNdcY = dy * scale;

            const uiX = clampedNdcX * (window.innerWidth / 2);
            const uiY = clampedNdcY * (window.innerHeight / 2);

            entry.sprite.position.set(uiX, uiY, TEXT_SPRITE_Z);
            entry.material.rotation = Math.atan2(dy, dx);
            entry.sprite.visible = true;
        }

        // Pulse phase shared by every on-screen ring, driven by wall-clock time so it keeps
        // animating smoothly regardless of simulation speed or pause state.
        const pulsePhase = (performance.now() / 1000 / PULSE_PERIOD) % 1;
        const pulse = 0.5 - 0.5 * Math.cos(pulsePhase * Math.PI * 2); // 0 → 1 → 0

        for (let i = 0; i < onScreen.length; i++) {
            const { uiX, uiY, apparentR } = onScreen[i];
            const entry = this.onScreenPool[i];

            const diameter = apparentR * 2 * RING_PADDING_FACTOR * (1 + pulse * 0.15);
            entry.sprite.scale.set(diameter, diameter, 1);
            entry.material.opacity = 0.4 + pulse * 0.6;
            entry.sprite.position.set(uiX, uiY, TEXT_SPRITE_Z);
            entry.sprite.visible = true;
        }
    }

    /** Free all GPU resources. */
    dispose(): void {
        for (const entry of [...this.offScreenPool, ...this.onScreenPool]) {
            entry.material.dispose();
            this.uiScene.remove(entry.sprite);
        }
        this.offScreenPool = [];
        this.onScreenPool = [];
        this.chevronTexture?.dispose();
        this.chevronTexture = null;
        this.ringTexture?.dispose();
        this.ringTexture = null;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private syncPool(pool: PoolEntry[], desired: number, createEntry: () => PoolEntry): void {
        while (pool.length > desired) {
            const entry = pool.pop()!;
            entry.sprite.visible = false;
        }
        while (pool.length < desired) {
            pool.push(createEntry());
        }
    }

    private createChevronEntry(): PoolEntry {
        if (!this.chevronTexture) this.chevronTexture = createRedChevronTexture();

        const material = new THREE.SpriteMaterial({
            map: this.chevronTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(44, 44, 1);
        sprite.visible = false;
        this.uiScene.add(sprite);

        return { sprite, material };
    }

    private createRingEntry(): PoolEntry {
        if (!this.ringTexture) this.ringTexture = createRedRingTexture();

        const material = new THREE.SpriteMaterial({
            map: this.ringTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        const sprite = new THREE.Sprite(material);
        sprite.visible = false;
        this.uiScene.add(sprite);

        return { sprite, material };
    }
}
