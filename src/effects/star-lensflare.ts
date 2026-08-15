import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import {
    LENSFLARE_CARDINAL_SPIKE_LENGTH,
    LENSFLARE_CARDINAL_SPIKE_WIDTH,
    LENSFLARE_CORE_SIZE,
    LENSFLARE_DIAGONAL_SPIKE_LENGTH,
    LENSFLARE_DIAGONAL_SPIKE_WIDTH,
    LENSFLARE_HALO_SIZE,
    LENSFLARE_STARBURST_SIZE,
    LENSFLARE_STARBURST_FLICKER_AMPLITUDE,
    LENSFLARE_STARBURST_FLICKER_FREQ_A,
    LENSFLARE_STARBURST_FLICKER_FREQ_B,
} from '../utilities/consts';

/**
 * Canvas texture size (px). 256 keeps all flare textures crisp yet cheap.
 */
const TEXTURE_SIZE = 256;

/** Natural photographic lens flare: 8-spike warm starburst, large soft warm halo, scattered warm bokeh blobs. */
export class StarLensflare {
    private readonly _light: THREE.PointLight;
    private readonly _flares: Lensflare[] = [];
    private _starburstElement: LensflareElement | null = null;
    private _coreElement: LensflareElement | null = null;
    private _haloElement: LensflareElement | null = null;
    /** Accumulated simulation time (s) driving the starburst flicker. */
    private _visualTime = 0;
    private readonly _starburstBaseColor = new THREE.Color(0xffffff);
    private readonly _coreBaseColor = new THREE.Color(0xffffff);
    private readonly _haloBaseColor = new THREE.Color(0xffffff);
    private readonly _tintedElements: LensflareElement[] = [];
    private readonly _tintedBaseColors: THREE.Color[] = [];

    constructor(light: THREE.PointLight, _radius: number) {
        this._light = light;

        const texture = {
            starburst: createCanvasTexture((ctx) => drawStarburst(ctx)),
            core: createCanvasTexture((ctx) => drawSoftDisc(ctx, 0.12, 0.9)),
            warmHalo: createCanvasTexture((ctx) => drawWarmHalo(ctx)),
            softBlob: createCanvasTexture((ctx) => drawSoftBlob(ctx)),
        };

        const main = new Lensflare();

        const starburstEl = new LensflareElement(
            texture.starburst,
            LENSFLARE_STARBURST_SIZE,
            0,
            new THREE.Color(0xffffff)
        );
        this._starburstElement = starburstEl;
        main.addElement(starburstEl);

        const coreEl = new LensflareElement(
            texture.core,
            LENSFLARE_CORE_SIZE,
            0,
            new THREE.Color(0xffffff)
        );
        this._coreElement = coreEl;
        main.addElement(coreEl);

        const haloEl = new LensflareElement(
            texture.warmHalo,
            LENSFLARE_HALO_SIZE,
            0,
            new THREE.Color(0xffffff)
        );
        this._haloElement = haloEl;
        main.addElement(haloEl);

        // Bokeh blobs scattered along the lens axis via the distance param (white base, tinted by star color).
        const blobSpecs: ReadonlyArray<readonly [number, number, number]> = [
            [60, 0.3, 0xffffff],
            [40, 0.5, 0xffffff],
            [28, 0.7, 0xffffff],
            [50, 0.9, 0xffffff],
        ];
        for (const [size, distance, hex] of blobSpecs) {
            const base = new THREE.Color(hex);
            const element = new LensflareElement(texture.softBlob, size, distance, base.clone());
            this._tintedElements.push(element);
            this._tintedBaseColors.push(base);
            main.addElement(element);
        }

        this._flares.push(main);
        this._light.add(main);
    }

    setColor(hex: number): void {
        // Full star color on starburst and halo; white core for contrast; 20% tint on bokeh blobs.
        this._starburstElement?.color.copy(this._starburstBaseColor).setHex(hex);
        this._coreElement?.color.copy(this._coreBaseColor).setHex(0xffffff);
        this._haloElement?.color.copy(this._haloBaseColor).setHex(hex);
        const tint = new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.8);
        for (let i = 0; i < this._tintedElements.length; i++) {
            this._tintedElements[i].color.copy(this._tintedBaseColors[i]).multiply(tint);
        }
    }

    setVisible(visible: boolean): void {
        for (const flare of this._flares) {
            flare.visible = visible;
        }
    }

    /**
     * Per-frame starburst flicker. Advances an internal clock by `dt` (real
     * simulation time, so the shimmer freezes while paused) and perturbs the
     * starburst element's `size` with two incommensurate sines — a subtle
     * ±LENSFLARE_STARBURST_FLICKER_AMPLITUDE shimmer that never repeats.
     */
    update(dt: number): void {
        if (!this._starburstElement) return;

        this._visualTime += dt;

        const shimmer =
            Math.sin(this._visualTime * LENSFLARE_STARBURST_FLICKER_FREQ_A) * 0.6 +
            Math.sin(this._visualTime * LENSFLARE_STARBURST_FLICKER_FREQ_B) * 0.4;

        this._starburstElement.size =
            LENSFLARE_STARBURST_SIZE * (1 + LENSFLARE_STARBURST_FLICKER_AMPLITUDE * shimmer);
    }

    dispose(): void {
        for (const flare of this._flares) {
            flare.removeFromParent();
            flare.dispose();
            // The addon's dispose() frees element textures and internal materials,
            // but not the base MeshBasicMaterial created by the Lensflare ctor.
            (flare.material as THREE.Material)?.dispose?.();
        }
        this._flares.length = 0;
    }
}

// ─── canvas texture helpers ──────────────────────────────────────────────────

function createCanvasTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('StarLensflare: 2D canvas context unavailable');
    }
    draw(ctx);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

/**
 * Soft disc with a quick bright core and a long diffused falloff. White so the
 * addon's per-element colour can multiply it.
 */
function drawSoftDisc(
    ctx: CanvasRenderingContext2D,
    radiusFraction: number,
    innerAlpha: number
): void {
    const c = TEXTURE_SIZE / 2;
    const r = Math.max(1, TEXTURE_SIZE * radiusFraction);
    const grad = ctx.createRadialGradient(c, c, 0, c, c, r);
    grad.addColorStop(0, `rgba(255, 255, 255, ${innerAlpha})`);
    grad.addColorStop(0.4, `rgba(255, 255, 255, ${innerAlpha * 0.4})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
}

/** 8-spike starburst: 4 long cardinal + 4 shorter diagonal, white (tinted by star color). */
function drawStarburst(ctx: CanvasRenderingContext2D): void {
    const c = TEXTURE_SIZE / 2;
    const S2 = Math.SQRT1_2;

    // White core glow (color applied via setColor).
    const core = ctx.createRadialGradient(c, c, 0, c, c, TEXTURE_SIZE * 0.16);
    core.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    core.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    core.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

    const cardinalLen = TEXTURE_SIZE * LENSFLARE_CARDINAL_SPIKE_LENGTH;
    const cardinalWidth = TEXTURE_SIZE * LENSFLARE_CARDINAL_SPIKE_WIDTH;
    const diagonalLen = TEXTURE_SIZE * LENSFLARE_DIAGONAL_SPIKE_LENGTH;
    const diagonalWidth = TEXTURE_SIZE * LENSFLARE_DIAGONAL_SPIKE_WIDTH;

    // [dx, dy, tipLen, halfWidth, drawSpine]
    const spikes: ReadonlyArray<readonly [number, number, number, number, boolean]> = [
        [1, 0, cardinalLen, cardinalWidth, true],
        [-1, 0, cardinalLen, cardinalWidth, true],
        [0, 1, cardinalLen, cardinalWidth, true],
        [0, -1, cardinalLen, cardinalWidth, true],
        [S2, S2, diagonalLen, diagonalWidth, false],
        [-S2, S2, diagonalLen, diagonalWidth, false],
        [S2, -S2, diagonalLen, diagonalWidth, false],
        [-S2, -S2, diagonalLen, diagonalWidth, false],
    ];

    for (const [dx, dy, tipLen, halfWidth, drawSpine] of spikes) {
        const baseX = c + dx * TEXTURE_SIZE * 0.06;
        const baseY = c + dy * TEXTURE_SIZE * 0.06;
        const tipX = c + dx * tipLen;
        const tipY = c + dy * tipLen;

        const perpX = -dy;
        const perpY = dx;

        const grad = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.75)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(baseX + perpX * halfWidth, baseY + perpY * halfWidth);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(baseX - perpX * halfWidth, baseY - perpY * halfWidth);
        ctx.closePath();
        ctx.fill();

        if (drawSpine) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(baseX, baseY);
            ctx.lineTo(c + dx * tipLen * 0.92, c + dy * tipLen * 0.92);
            ctx.stroke();
        }
    }
}

/** Large soft halo disc with white radial gradient; color applied via setColor. */
function drawWarmHalo(ctx: CanvasRenderingContext2D): void {
    const c = TEXTURE_SIZE / 2;
    const r = TEXTURE_SIZE * 0.5;
    const grad = ctx.createRadialGradient(c, c, 0, c, c, r);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.25)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.05)');
    grad.addColorStop(1, 'rgba(  0,   0,  0,  0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
}

function drawSoftBlob(ctx: CanvasRenderingContext2D): void {
    drawSoftDisc(ctx, 0.38, 0.9);
}
