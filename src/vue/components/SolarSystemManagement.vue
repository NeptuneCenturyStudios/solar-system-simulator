<template>
    <PanelBase title="Solar System Management" >

        <div class="vue-ui-solar-management-fields">
            <label class="checkbox-row">
                <input
                    type="checkbox"
                    :checked="simStore.kuiperBeltVisible"
                    @change="onKuiperBeltChange"
                />
                Enable Kuiper Belt
            </label>

            <label class="checkbox-row">
                <input
                    type="checkbox"
                    :checked="simStore.spaceBackgroundVisible"
                    @change="onSpaceBackgroundChange"
                />
                Enable Background Texture
            </label>

            <div class="control-group">
                <label for="vueSpaceTextureSelect">Background Texture</label>
                <select
                    id="vueSpaceTextureSelect"
                    :value="simStore.spaceTextureFilename ?? ''"
                    @change="onSpaceTextureChange"
                >
                    <option value="" disabled>Select a texture…</option>
                    <option
                        v-for="texture in SPACE_TEXTURES"
                        :key="texture.filename"
                        :value="texture.filename"
                    >
                        {{ texture.name }}
                    </option>
                </select>
            </div>

            <label class="checkbox-row">
                <input
                    type="checkbox"
                    :checked="simStore.starDeathEnabled"
                    @change="onStarDeathChange"
                />
                Enable Natural Star Death
            </label>

            <div class="control-group">
                <label>
                    Gravity Multiplier (G)
                    <span class="val-display">{{ formatG(simStore.gMultiplier) }}</span>
                </label>
                <div class="slider-row">
                    <input
                        type="range"
                        min="0"
                        max="10000000"
                        step="0.1"
                        :value="simStore.gMultiplier"
                        @input="onGravityInput"
                    />
                    <button
                        class="old-ui btn-slider-reset"
                        title="Reset to 1x"
                        @click="resetGravity"
                    >
                        <span class="material-symbols-outlined">replay</span>
                    </button>
                </div>
            </div>
        </div>
    </PanelBase>
</template>

<script setup lang="ts">
import {
    setGMultiplier,
    setKuiperBeltVisible,
    setSpaceBackgroundVisible,
    setSpaceTexture,
    setStarDeathEnabled,
    simStore,
} from '../sim-bridge';
import { spaceTextures } from '../../drawing/textures';
import PanelBase from './PanelBase.vue';

/** Space background texture options (same list the legacy panel dropdown used). */
const SPACE_TEXTURES = spaceTextures;

function onKuiperBeltChange(e: Event): void {
    setKuiperBeltVisible((e.target as HTMLInputElement).checked);
}

function onSpaceBackgroundChange(e: Event): void {
    setSpaceBackgroundVisible((e.target as HTMLInputElement).checked);
}

function onSpaceTextureChange(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    if (value) setSpaceTexture(value);
}

function onStarDeathChange(e: Event): void {
    setStarDeathEnabled((e.target as HTMLInputElement).checked);
}

function onGravityInput(e: Event): void {
    setGMultiplier(parseFloat((e.target as HTMLInputElement).value));
}

function resetGravity(): void {
    setGMultiplier(1);
}

/** Matches the legacy panel's gravity display formatting. */
function formatG(value: number): string {
    return value.toFixed(value < 10 ? 2 : 0);
}
</script>

<style scoped>
.vue-ui-solar-management {
    flex: 1;
    min-height: 0;
}

.vue-ui-solar-management-fields {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}
</style>
