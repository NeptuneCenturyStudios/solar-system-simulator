<template>
    <PanelBase title="Options">

        <div class="vue-ui-options-fields">
            <label class="checkbox-row">
                <input
                    type="checkbox"
                    :checked="simStore.particleEffectsEnabled"
                    @change="onParticleEffectsChange"
                />
                Enable Particle Effects
            </label>

            <label class="checkbox-row">
                <input
                    type="checkbox"
                    :checked="simStore.lensflareEnabled"
                    @change="onLensflareChange"
                />
                Lens Flares
            </label>

            <div class="control-group">
                <label>
                    Physics Accuracy
                    <span class="val-display">{{ simStore.substeps }}</span>
                </label>
                <div class="slider-row">
                    <input
                        type="range"
                        min="1"
                        max="512"
                        step="1"
                        :value="simStore.substeps"
                        title="Controls how many physics steps are calculated per frame. Higher values improve orbital accuracy but use more CPU. Lower values are faster but less precise."
                        @input="onSubstepsInput"
                    />
                    <button
                        class="old-ui btn-slider-reset"
                        title="Reset to default (64)"
                        @click="resetSubsteps"
                    >
                        <span class="material-symbols-outlined">replay</span>
                    </button>
                </div>
            </div>

            <div class="control-group">
                <label>
                    Sound Effects Volume
                    <span class="val-display">{{ simStore.sfxVolumePercent }}%</span>
                </label>
                <div class="slider-row">
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        :value="simStore.sfxVolumePercent"
                        title="Controls the volume of weapon sounds, impacts, and warp loop effects."
                        @input="onSfxVolumeInput"
                    />
                    <button
                        class="old-ui btn-slider-reset"
                        title="Reset to 100%"
                        @click="resetSfxVolume"
                    >
                        <span class="material-symbols-outlined">replay</span>
                    </button>
                </div>
            </div>

            <div class="control-group">
                <label>
                    Background Music Volume
                    <span class="val-display">{{ simStore.musicVolumePercent }}%</span>
                </label>
                <div class="slider-row">
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        :value="simStore.musicVolumePercent"
                        title="Controls the volume of background music."
                        @input="onMusicVolumeInput"
                    />
                    <button
                        class="old-ui btn-slider-reset"
                        title="Reset to 50%"
                        @click="resetMusicVolume"
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
    setLensflareEnabled,
    setMusicVolume,
    setParticleEffectsEnabled,
    setSfxVolume,
    setSubsteps,
    simStore,
} from '../sim-bridge';

import PanelBase from './PanelBase.vue';

/** Same defaults as the legacy panel's reset buttons. */
const DEFAULT_SUBSTEPS = 64;
const DEFAULT_SFX_VOLUME_PERCENT = 100;
const DEFAULT_MUSIC_VOLUME_PERCENT = 50;

function onParticleEffectsChange(e: Event): void {
    setParticleEffectsEnabled((e.target as HTMLInputElement).checked);
}

function onLensflareChange(e: Event): void {
    setLensflareEnabled((e.target as HTMLInputElement).checked);
}

function onSubstepsInput(e: Event): void {
    setSubsteps(parseInt((e.target as HTMLInputElement).value, 10));
}

function onSfxVolumeInput(e: Event): void {
    setSfxVolume(parseInt((e.target as HTMLInputElement).value, 10));
}

function onMusicVolumeInput(e: Event): void {
    setMusicVolume(parseInt((e.target as HTMLInputElement).value, 10));
}

function resetSubsteps(): void {
    setSubsteps(DEFAULT_SUBSTEPS);
}

function resetSfxVolume(): void {
    setSfxVolume(DEFAULT_SFX_VOLUME_PERCENT);
}

function resetMusicVolume(): void {
    setMusicVolume(DEFAULT_MUSIC_VOLUME_PERCENT);
}
</script>

<style scoped>
.vue-ui-options {
    flex: 1;
    min-height: 0;
}

.vue-ui-options-fields {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}
</style>
