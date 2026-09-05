<template>
    <PanelBase title="Texture Generator">
        <div class="texture-gen-scroll">
            <div class="texture-gen-preview-frame">
                <canvas ref="previewCanvas" class="texture-gen-preview-canvas" width="512" height="256" />
                <div v-if="previewLoading" class="texture-gen-preview-loading">
                    <span class="material-symbols-outlined loading-icon">progress_activity</span>
                    Generating…
                </div>
            </div>

            <div class="control-group">
                <label for="textureTypeSelect">Texture Type</label>
                <select id="textureTypeSelect">
                    <option value="gas_giant" selected>Gas Giant</option>
                </select>
            </div>

            <div class="control-group">
                <label for="textureGenSeedInput">Seed</label>
                <div class="texture-gen-seed-row">
                    <input
                        id="textureGenSeedInput"
                        v-model.trim="params.seed"
                        type="text"
                        class="text-input"
                        placeholder="Seed string"
                    />
                    <button
                        class="old-ui btn-icon-only"
                        type="button"
                        title="Randomize seed"
                        @click="randomizeSeed"
                    >
                        <span class="material-symbols-outlined">casino</span>
                    </button>
                </div>
            </div>

            <div class="control-group">
                <label for="textureGenResolutionSelect">Resolution</label>
                <select id="textureGenResolutionSelect" v-model="resolution">
                    <option value="2048x1024">2048 × 1024</option>
                    <option value="4096x2048">4096 × 2048</option>
                    <option value="8192x4096">8192 × 4096</option>
                </select>
            </div>

            <div class="control-group">
                <label for="textureGenPaletteSelect">Colour Palette</label>
                <select id="textureGenPaletteSelect" v-model="params.palette">
                    <option value="jupiter">Jupiter</option>
                    <option value="saturn">Saturn</option>
                    <option value="ice">Ice Giant</option>
                    <option value="alien">Alien</option>
                    <option value="custom">Custom</option>
                </select>
            </div>

            <template v-if="params.palette === 'custom'">
                <div class="control-group">
                    <label>Band Colours</label>
                    <div class="texture-gen-color-grid">
                        <div>
                            <div class="texture-gen-color-label">Color 1</div>
                            <input
                                v-model="params.customBandColor1"
                                type="color"
                                class="texture-gen-color-input"
                            />
                        </div>
                        <div>
                            <div class="texture-gen-color-label">Color 2</div>
                            <input
                                v-model="params.customBandColor2"
                                type="color"
                                class="texture-gen-color-input"
                            />
                        </div>
                        <div>
                            <div class="texture-gen-color-label">Color 3</div>
                            <input
                                v-model="params.customBandColor3"
                                type="color"
                                class="texture-gen-color-input"
                            />
                        </div>
                    </div>
                </div>
                <div class="control-group">
                    <label>Equatorial Colours</label>
                    <div class="texture-gen-color-grid">
                        <div>
                            <div class="texture-gen-color-label">Color 1</div>
                            <input
                                v-model="params.customEquatorialColor1"
                                type="color"
                                class="texture-gen-color-input"
                            />
                        </div>
                        <div>
                            <div class="texture-gen-color-label">Color 2</div>
                            <input
                                v-model="params.customEquatorialColor2"
                                type="color"
                                class="texture-gen-color-input"
                            />
                        </div>
                        <div>
                            <div class="texture-gen-color-label">Color 3</div>
                            <input
                                v-model="params.customEquatorialColor3"
                                type="color"
                                class="texture-gen-color-input"
                            />
                        </div>
                    </div>
                </div>
            </template>

            <div class="control-group">
                <label
                    >Color Variation
                    <span class="val-display">{{ params.colorVariation.toFixed(2) }}</span></label
                >
                <div class="slider-row">
                    <input
                        v-model.number="params.colorVariation"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        title="How much palette colours diverge from the average (0 = monochromatic, 1 = full variation)"
                    />
                </div>
            </div>

            <div class="control-group">
                <label
                    >Band Scale <span class="val-display">{{ params.bandScale }}</span></label
                >
                <div class="slider-row">
                    <input
                        v-model.number="params.bandScale"
                        type="range"
                        min="1"
                        max="20"
                        step="1"
                        title="Number of horizontal band cycles"
                    />
                </div>
            </div>

            <div class="control-group">
                <label
                    >Turbulence
                    <span class="val-display">{{ params.turbulence.toFixed(2) }}</span></label
                >
                <div class="slider-row">
                    <input
                        v-model.number="params.turbulence"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        title="How wavy or distorted the bands appear"
                    />
                </div>
            </div>

            <div class="control-group">
                <label
                    >Detail
                    <span class="val-display">{{ params.detailStrength.toFixed(2) }}</span></label
                >
                <div class="slider-row">
                    <input
                        v-model.number="params.detailStrength"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        title="High-frequency noise within each band"
                    />
                </div>
            </div>

            <div class="control-group">
                <label
                    >Storm Count <span class="val-display">{{ params.stormCount }}</span></label
                >
                <div class="slider-row">
                    <input
                        v-model.number="params.stormCount"
                        type="range"
                        min="0"
                        max="5"
                        step="1"
                        title="Number of oval storm features"
                    />
                </div>
            </div>

            <div class="control-group">
                <label
                    >Storm Size <span class="val-display">{{ params.stormSize.toFixed(2) }}</span></label
                >
                <div class="slider-row">
                    <input
                        v-model.number="params.stormSize"
                        type="range"
                        min="0.02"
                        max="0.25"
                        step="0.01"
                        title="Relative radius of each storm"
                    />
                </div>
            </div>

            <div class="control-group">
                <label
                    >Contrast <span class="val-display">{{ params.contrast.toFixed(1) }}</span></label
                >
                <div class="slider-row">
                    <input
                        v-model.number="params.contrast"
                        type="range"
                        min="0.5"
                        max="3"
                        step="0.1"
                        title="Contrast between adjacent bands"
                    />
                </div>
            </div>

            <div class="control-group">
                <label
                    >Equatorial Width
                    <span class="val-display">{{ params.equatorialWidth.toFixed(2) }}</span></label
                >
                <div class="slider-row">
                    <input
                        v-model.number="params.equatorialWidth"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        title="How far from the equator the secondary colour palette extends (0 = none, 1 = full sphere)"
                    />
                </div>
            </div>
        </div>

        <div class="texture-gen-download-row mt-auto">
            <button
                class="old-ui btn-with-icon"
                type="button"
                :disabled="downloading"
                @click="generateAndDownload"
            >
                <span class="material-symbols-outlined">download</span>
                DOWNLOAD
            </button>
            <span v-if="downloading" class="texture-gen-download-status">
                <span class="material-symbols-outlined loading-icon">progress_activity</span>
                Rendering…
            </span>
        </div>
    </PanelBase>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
    DEFAULT_GAS_GIANT_PARAMS,
    GasGiantTextureParams,
    renderGasGiantTexture,
} from '../../procedural/gas-giant/gas-giant-texture-generator';
import PanelBase from './PanelBase.vue';

type ResolutionKey = '2048x1024' | '4096x2048' | '8192x4096';

const RESOLUTIONS: Record<ResolutionKey, { width: number; height: number }> = {
    '2048x1024': { width: 2048, height: 1024 },
    '4096x2048': { width: 4096, height: 2048 },
    '8192x4096': { width: 8192, height: 4096 },
};

const PREVIEW_WIDTH = 512;
const PREVIEW_HEIGHT = 256;
const DEBOUNCE_MS = 220;

const params = reactive<GasGiantTextureParams>({ ...DEFAULT_GAS_GIANT_PARAMS });
const resolution = ref<ResolutionKey>('2048x1024');

const previewCanvas = ref<HTMLCanvasElement | null>(null);
const previewLoading = ref(false);
const downloading = ref(false);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let previewBusy = false;
let pendingPreview = false;

function randomizeSeed(): void {
    params.seed = Math.random().toString(16).slice(2, 10);
}

function schedulePreviewUpdate(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void updatePreview();
    }, DEBOUNCE_MS);
}

async function updatePreview(): Promise<void> {
    if (previewBusy) {
        pendingPreview = true;
        return;
    }
    previewBusy = true;
    pendingPreview = false;
    previewLoading.value = true;

    try {
        const rendered = await renderGasGiantTexture(params, PREVIEW_WIDTH, PREVIEW_HEIGHT);
        const canvas = previewCanvas.value;
        if (canvas) {
            canvas.width = PREVIEW_WIDTH;
            canvas.height = PREVIEW_HEIGHT;
            canvas.getContext('2d')!.drawImage(rendered, 0, 0);
        }
    } catch (err) {
        console.error('[TextureGeneratorPanel] Preview error:', err);
    } finally {
        previewLoading.value = false;
        previewBusy = false;
    }

    if (pendingPreview) {
        pendingPreview = false;
        void updatePreview();
    }
}

async function generateAndDownload(): Promise<void> {
    const { width, height } = RESOLUTIONS[resolution.value];
    downloading.value = true;

    try {
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
        downloading.value = false;
    }
}

watch(params, schedulePreviewUpdate, { deep: true });
onMounted(() => schedulePreviewUpdate());
onBeforeUnmount(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
});
</script>

<style scoped>
.texture-gen-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    padding-right: 2px;
}

.texture-gen-preview-frame {
    position: relative;
    margin-bottom: var(--new-ui-gap-3);
    border: 1px solid var(--new-ui-border);
    border-radius: 4px;
    overflow: hidden;
    background: #000;
    line-height: 0;
}

.texture-gen-preview-canvas {
    width: 100%;
    height: auto;
    display: block;
}

.texture-gen-preview-loading {
    display: flex;
    position: absolute;
    inset: 0;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgba(0, 0, 0, 0.55);
    font-size: 0.8em;
    color: #00ffcc;
}

.texture-gen-seed-row {
    display: flex;
    gap: 6px;
    align-items: center;
}

.texture-gen-seed-row .text-input {
    flex: 1 1 auto;
    margin-bottom: 0;
}

.texture-gen-color-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
}

.texture-gen-color-label {
    font-size: 0.75em;
    color: #aaa;
    margin-bottom: 3px;
}

.texture-gen-color-input {
    width: 100%;
    height: 32px;
    padding: 2px;
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--new-ui-border);
    border-radius: 4px;
}

.texture-gen-download-row {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--new-ui-border);
    display: flex;
    align-items: center;
    gap: 8px;
}

.texture-gen-download-row .btn-with-icon {
    flex: 1 1 auto;
}

.texture-gen-download-status {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #00ffcc;
    font-size: 0.8em;
    white-space: nowrap;
}
</style>
