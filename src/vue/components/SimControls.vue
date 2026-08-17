<template>
    <section class="vue-ui-card">
        <header class="vue-ui-card-header">
            <span>Simulation</span>
            <span class="vue-ui-value">{{ formatTimeScale(simStore.timeScale) }}</span>
        </header>

        <div class="vue-ui-grid">
            <button
                class="vue-ui-button"
                :class="{ 'vue-ui-button-active': !simStore.isPaused }"
                type="button"
                @click="onTogglePause"
            >
                {{ simStore.isPaused ? 'Resume' : 'Pause' }}
            </button>
            <button class="vue-ui-button" type="button" @click="onNormalSpeed">Normal Speed</button>
        </div>

        <div class="vue-ui-row vue-ui-slider-row">
            <label class="vue-ui-label" for="vue-ui-time-scale">Speed</label>
            <input
                id="vue-ui-time-scale"
                v-model.number="timeScaleInput"
                class="vue-ui-range"
                type="range"
                min="0.01"
                max="1024"
                step="0.01"
                @input="onTimeScaleInput"
            />
        </div>

        <div class="vue-ui-row vue-ui-slider-row">
            <label class="vue-ui-label" for="vue-ui-g-mult">Gravity ×</label>
            <input
                id="vue-ui-g-mult"
                v-model.number="gMultiplierInput"
                class="vue-ui-range"
                type="range"
                min="0"
                max="10000000"
                step="0.1"
                @input="onGMultiplierInput"
            />
        </div>
    </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

import { simStore } from '../sim-bridge';
import { formatTimeScale, setGMultiplier, setTimeScale, togglePause } from '../sim-bridge';

const timeScaleInput = ref(simStore.timeScale);
const gMultiplierInput = ref(simStore.gMultiplier);

// Keep the local slider positions in sync when the store changes externally
// (e.g. P key or the old bottom toolbar buttons change the time scale).
watch(
    () => [simStore.timeScale, simStore.gMultiplier] as const,
    ([timeScale, gMultiplier]) => {
        timeScaleInput.value = timeScale;
        gMultiplierInput.value = gMultiplier;
    }
);

function onTogglePause(): void {
    togglePause();
}

function onNormalSpeed(): void {
    setTimeScale(1);
}

function onTimeScaleInput(): void {
    setTimeScale(timeScaleInput.value);
}

function onGMultiplierInput(): void {
    setGMultiplier(gMultiplierInput.value);
}
</script>

<style scoped>
.vue-ui-slider-row {
    margin-top: 0.5rem;
}
</style>
