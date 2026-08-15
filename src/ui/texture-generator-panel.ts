import { Panel } from './panel';
import {
    DEFAULT_GAS_GIANT_PARAMS,
    GasGiantTextureParams,
    renderGasGiantTexture,
} from '../procedural/gas-giant/gas-giant-texture-generator';

type ResolutionKey = '2048x1024' | '4096x2048' | '8192x4096';

const RESOLUTIONS: Record<ResolutionKey, { width: number; height: number }> = {
    '2048x1024': { width: 2048, height: 1024 },
    '4096x2048': { width: 4096, height: 2048 },
    '8192x4096': { width: 8192, height: 4096 },
};

const PREVIEW_WIDTH = 512;
const PREVIEW_HEIGHT = 256;
const DEBOUNCE_MS = 220;

/**
 * Panel for generating procedural planet textures.
 * Currently supports Gas Giant. More types can be added to the texture-type dropdown.
 */
export class TextureGeneratorPanel extends Panel {
    // Header
    btnClose: HTMLButtonElement | null = null;

    // Top controls
    textureTypeSelect: HTMLSelectElement | null = null;
    seedInput: HTMLInputElement | null = null;
    btnRandomizeSeed: HTMLButtonElement | null = null;
    resolutionSelect: HTMLSelectElement | null = null;

    // Preview
    previewCanvas: HTMLCanvasElement | null = null;
    previewLoading: HTMLElement | null = null;

    // Palette
    paletteSelect: HTMLSelectElement | null = null;
    customColorRow: HTMLElement | null = null;
    customBandColor1Input: HTMLInputElement | null = null;
    customBandColor2Input: HTMLInputElement | null = null;
    customBandColor3Input: HTMLInputElement | null = null;
    customEquatorialColor1Input: HTMLInputElement | null = null;
    customEquatorialColor2Input: HTMLInputElement | null = null;
    customEquatorialColor3Input: HTMLInputElement | null = null;

    // Parameter sliders
    bandScaleSlider: HTMLInputElement | null = null;
    bandScaleDisplay: HTMLElement | null = null;

    turbulenceSlider: HTMLInputElement | null = null;
    turbulenceDisplay: HTMLElement | null = null;

    detailSlider: HTMLInputElement | null = null;
    detailDisplay: HTMLElement | null = null;

    stormCountSlider: HTMLInputElement | null = null;
    stormCountDisplay: HTMLElement | null = null;

    stormSizeSlider: HTMLInputElement | null = null;
    stormSizeDisplay: HTMLElement | null = null;

    contrastSlider: HTMLInputElement | null = null;
    contrastDisplay: HTMLElement | null = null;

    equatorialWidthSlider: HTMLInputElement | null = null;
    equatorialWidthDisplay: HTMLElement | null = null;

    colorVariationSlider: HTMLInputElement | null = null;
    colorVariationDisplay: HTMLElement | null = null;

    // Download
    btnDownload: HTMLButtonElement | null = null;
    downloadLoading: HTMLElement | null = null;

    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _previewBusy = false;
    private _pendingPreview = false;

    constructor(elementId: string) {
        super(elementId);
    }

    initialize() {
        this.btnClose = document.getElementById(
            'btn-close-texture-generator-panel'
        ) as HTMLButtonElement | null;

        this.textureTypeSelect = document.getElementById(
            'textureTypeSelect'
        ) as HTMLSelectElement | null;

        this.seedInput = document.getElementById('textureGenSeedInput') as HTMLInputElement | null;

        this.btnRandomizeSeed = document.getElementById(
            'btn-texture-gen-randomize-seed'
        ) as HTMLButtonElement | null;

        this.resolutionSelect = document.getElementById(
            'textureGenResolutionSelect'
        ) as HTMLSelectElement | null;

        this.previewCanvas = document.getElementById(
            'texture-generator-preview'
        ) as HTMLCanvasElement | null;

        this.previewLoading = document.getElementById('texture-gen-preview-loading');

        this.paletteSelect = document.getElementById(
            'textureGenPaletteSelect'
        ) as HTMLSelectElement | null;

        this.customColorRow = document.getElementById('textureGenCustomColorRow');

        this.customBandColor1Input = document.getElementById(
            'textureGenCustomBandColor1'
        ) as HTMLInputElement | null;

        this.customBandColor2Input = document.getElementById(
            'textureGenCustomBandColor2'
        ) as HTMLInputElement | null;

        this.customBandColor3Input = document.getElementById(
            'textureGenCustomBandColor3'
        ) as HTMLInputElement | null;

        this.customEquatorialColor1Input = document.getElementById(
            'textureGenCustomEquatorialColor1'
        ) as HTMLInputElement | null;

        this.customEquatorialColor2Input = document.getElementById(
            'textureGenCustomEquatorialColor2'
        ) as HTMLInputElement | null;

        this.customEquatorialColor3Input = document.getElementById(
            'textureGenCustomEquatorialColor3'
        ) as HTMLInputElement | null;

        this.contrastSlider = document.getElementById(
            'textureGenContrastSlider'
        ) as HTMLInputElement | null;
        this.contrastDisplay = document.getElementById('textureGenContrastVal');

        this.equatorialWidthSlider = document.getElementById(
            'textureGenEquatorialWidthSlider'
        ) as HTMLInputElement | null;
        this.equatorialWidthDisplay = document.getElementById('textureGenEquatorialWidthVal');
        this.colorVariationSlider = document.getElementById(
            'textureGenColorVariationSlider'
        ) as HTMLInputElement | null;
        this.colorVariationDisplay = document.getElementById('textureGenColorVariationVal');
        this.bandScaleSlider = document.getElementById(
            'textureGenBandScaleSlider'
        ) as HTMLInputElement | null;
        this.bandScaleDisplay = document.getElementById('textureGenBandScaleVal');

        this.turbulenceSlider = document.getElementById(
            'textureGenTurbulenceSlider'
        ) as HTMLInputElement | null;
        this.turbulenceDisplay = document.getElementById('textureGenTurbulenceVal');

        this.detailSlider = document.getElementById(
            'textureGenDetailSlider'
        ) as HTMLInputElement | null;
        this.detailDisplay = document.getElementById('textureGenDetailVal');

        this.stormCountSlider = document.getElementById(
            'textureGenStormCountSlider'
        ) as HTMLInputElement | null;
        this.stormCountDisplay = document.getElementById('textureGenStormCountVal');

        this.stormSizeSlider = document.getElementById(
            'textureGenStormSizeSlider'
        ) as HTMLInputElement | null;
        this.stormSizeDisplay = document.getElementById('textureGenStormSizeVal');

        this.contrastSlider = document.getElementById(
            'textureGenContrastSlider'
        ) as HTMLInputElement | null;
        this.contrastDisplay = document.getElementById('textureGenContrastVal');

        this.btnDownload = document.getElementById(
            'btn-texture-gen-download'
        ) as HTMLButtonElement | null;

        this.downloadLoading = document.getElementById('texture-gen-download-loading');

        // ── Wire events ────────────────────────────────────────────────────────

        if (this.btnClose) {
            this.btnClose.onclick = () => {
                this.toggle();
                this.emit('closed');
            };
        }

        const scheduleOnInput = () => this.schedulePreviewUpdate();

        if (this.seedInput) {
            this.seedInput.oninput = scheduleOnInput;
        }

        if (this.btnRandomizeSeed) {
            this.btnRandomizeSeed.onclick = () => {
                const hex = Math.random().toString(16).slice(2, 10);
                if (this.seedInput) this.seedInput.value = hex;
                this.schedulePreviewUpdate();
            };
        }

        if (this.paletteSelect) {
            this.paletteSelect.onchange = () => {
                this.syncCustomColorVisibility();
                this.schedulePreviewUpdate();
            };
        }

        if (this.customBandColor1Input) this.customBandColor1Input.oninput = scheduleOnInput;
        if (this.customBandColor2Input) this.customBandColor2Input.oninput = scheduleOnInput;
        if (this.customBandColor3Input) this.customBandColor3Input.oninput = scheduleOnInput;
        if (this.customEquatorialColor1Input)
            this.customEquatorialColor1Input.oninput = scheduleOnInput;
        if (this.customEquatorialColor2Input)
            this.customEquatorialColor2Input.oninput = scheduleOnInput;
        if (this.customEquatorialColor3Input)
            this.customEquatorialColor3Input.oninput = scheduleOnInput;

        for (const slider of [
            this.bandScaleSlider,
            this.turbulenceSlider,
            this.detailSlider,
            this.stormCountSlider,
            this.stormSizeSlider,
            this.contrastSlider,
            this.equatorialWidthSlider,
            this.colorVariationSlider,
        ]) {
            if (slider)
                slider.oninput = () => {
                    this.syncDisplayValues();
                    scheduleOnInput();
                };
        }

        if (this.btnDownload) {
            this.btnDownload.onclick = () => void this.generateAndDownload();
        }

        // Sync display labels from initial HTML values
        this.syncDisplayValues();
        this.syncCustomColorVisibility();

        // Render initial preview
        this.schedulePreviewUpdate();
    }

    // ── Parameter helpers ───────────────────────────────────────────────────

    private syncDisplayValues() {
        if (this.bandScaleSlider && this.bandScaleDisplay) {
            this.bandScaleDisplay.textContent = this.bandScaleSlider.value;
        }
        if (this.turbulenceSlider && this.turbulenceDisplay) {
            const v = (parseInt(this.turbulenceSlider.value, 10) / 100).toFixed(2);
            this.turbulenceDisplay.textContent = v;
        }
        if (this.detailSlider && this.detailDisplay) {
            const v = (parseInt(this.detailSlider.value, 10) / 100).toFixed(2);
            this.detailDisplay.textContent = v;
        }
        if (this.stormCountSlider && this.stormCountDisplay) {
            this.stormCountDisplay.textContent = this.stormCountSlider.value;
        }
        if (this.stormSizeSlider && this.stormSizeDisplay) {
            const v = (parseInt(this.stormSizeSlider.value, 10) / 100).toFixed(2);
            this.stormSizeDisplay.textContent = v;
        }
        if (this.contrastSlider && this.contrastDisplay) {
            const v = (parseInt(this.contrastSlider.value, 10) / 10).toFixed(1);
            this.contrastDisplay.textContent = v;
        }
        if (this.equatorialWidthSlider && this.equatorialWidthDisplay) {
            const v = (parseInt(this.equatorialWidthSlider.value, 10) / 100).toFixed(2);
            this.equatorialWidthDisplay.textContent = v;
        }
        if (this.colorVariationSlider && this.colorVariationDisplay) {
            const v = (parseInt(this.colorVariationSlider.value, 10) / 100).toFixed(2);
            this.colorVariationDisplay.textContent = v;
        }
    }

    private syncCustomColorVisibility() {
        if (!this.customColorRow) return;
        const isCustom = this.paletteSelect?.value === 'custom';
        this.customColorRow.style.display = isCustom ? '' : 'none';
    }

    private buildParams(): GasGiantTextureParams {
        const p = DEFAULT_GAS_GIANT_PARAMS;
        return {
            seed: this.seedInput?.value.trim() || p.seed,
            bandScale: parseInt(this.bandScaleSlider?.value ?? '8', 10),
            turbulence: parseInt(this.turbulenceSlider?.value ?? '40', 10) / 100,
            detailStrength: parseInt(this.detailSlider?.value ?? '30', 10) / 100,
            stormCount: parseInt(this.stormCountSlider?.value ?? '2', 10),
            stormSize: parseInt(this.stormSizeSlider?.value ?? '10', 10) / 100,
            contrast: parseInt(this.contrastSlider?.value ?? '15', 10) / 10,
            palette: (this.paletteSelect?.value ?? 'jupiter') as GasGiantTextureParams['palette'],
            customBandColor1: this.customBandColor1Input?.value ?? '#c2884a',
            customBandColor2: this.customBandColor2Input?.value ?? '#4a88c2',
            customBandColor3: this.customBandColor3Input?.value ?? '#c24a4a',
            customEquatorialColor1: this.customEquatorialColor1Input?.value ?? '#6ab0e0',
            customEquatorialColor2: this.customEquatorialColor2Input?.value ?? '#e0a060',
            customEquatorialColor3: this.customEquatorialColor3Input?.value ?? '#60e090',
            equatorialWidth: parseInt(this.equatorialWidthSlider?.value ?? '30', 10) / 100,
            colorVariation: parseInt(this.colorVariationSlider?.value ?? '100', 10) / 100,
        };
    }

    // ── Debounced preview ───────────────────────────────────────────────────

    schedulePreviewUpdate() {
        if (this._debounceTimer !== null) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            void this.updatePreview();
        }, DEBOUNCE_MS);
    }

    private async updatePreview() {
        if (this._previewBusy) {
            this._pendingPreview = true;
            return;
        }
        this._previewBusy = true;
        this._pendingPreview = false;

        if (this.previewLoading) this.previewLoading.style.display = 'flex';

        try {
            const params = this.buildParams();
            const offscreen = await renderGasGiantTexture(params, PREVIEW_WIDTH, PREVIEW_HEIGHT);

            if (this.previewCanvas) {
                this.previewCanvas.width = PREVIEW_WIDTH;
                this.previewCanvas.height = PREVIEW_HEIGHT;
                const ctx = this.previewCanvas.getContext('2d')!;
                ctx.drawImage(offscreen, 0, 0);
            }
        } catch (err) {
            console.error('[TextureGeneratorPanel] Preview error:', err);
        } finally {
            if (this.previewLoading) this.previewLoading.style.display = 'none';
            this._previewBusy = false;
        }

        // A new update was requested while we were busy — run it now
        if (this._pendingPreview) {
            this._pendingPreview = false;
            void this.updatePreview();
        }
    }

    // ── Full-resolution download ────────────────────────────────────────────

    private async generateAndDownload() {
        const resKey = (this.resolutionSelect?.value ?? '2048x1024') as ResolutionKey;
        const { width, height } = RESOLUTIONS[resKey] ?? RESOLUTIONS['2048x1024'];

        if (this.btnDownload) this.btnDownload.disabled = true;
        if (this.downloadLoading) this.downloadLoading.style.display = 'flex';

        try {
            const params = this.buildParams();
            const canvas = await renderGasGiantTexture(params, width, height);

            await new Promise<void>((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('toBlob returned null'));
                        return;
                    }
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `gas-giant-${params.seed}-${width}x${height}.png`;
                    a.click();
                    URL.revokeObjectURL(url);
                    resolve();
                }, 'image/png');
            });
        } catch (err) {
            console.error('[TextureGeneratorPanel] Download error:', err);
        } finally {
            if (this.btnDownload) this.btnDownload.disabled = false;
            if (this.downloadLoading) this.downloadLoading.style.display = 'none';
        }
    }
}
