<template>
    <div class="toolbar toolbar-bottom visible">
        <!-- Main menu button -->
        <button class="btn toolbar-btn" title="Toggle Menu">
            <span class="material-symbols-outlined">menu</span>
        </button>
        <!-- Explorer -->
        <button class="btn toolbar-btn" title="Open System Explorer">
            <span class="material-symbols-outlined">travel_explore</span>
        </button>

        <!-- Simulation controls -->
        <button class="btn toolbar-btn" title="Slow/Reverse">
            <span class="material-symbols-outlined">fast_rewind</span>
        </button>

        <button class="btn toolbar-btn" title="Pause (P)">
            <span class="material-symbols-outlined">pause</span>
        </button>

        <button class="btn toolbar-btn" title="Normal">
            <span class="material-symbols-outlined">play_arrow</span>
        </button>

        <button class="btn toolbar-btn" title="Forward">
            <span class="material-symbols-outlined">fast_forward</span>
        </button>

        <span id="speed-val">1x</span>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

import { simStore } from '../sim-bridge';

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


</script>

<style scoped>
.vue-ui-slider-row {
    margin-top: 0.5rem;
}
</style>
