<template>
    <div class="toolbar toolbar-bottom visible">
        <!-- Main menu button (no-op for now) -->
        <button class="btn toolbar-btn" title="Toggle Menu" aria-label="Toggle Menu">
            <span class="material-symbols-outlined">menu</span>
        </button>

        <!-- Explorer -->
        <button
            class="btn toolbar-btn"
            :class="{ active: vueUiState.explorerVisible }"
            title="Open System Explorer"
            aria-label="Open System Explorer"
            @click="toggleExplorer"
        >
            <span class="material-symbols-outlined">travel_explore</span>
        </button>

        <!-- Simulation controls -->
        <button
            class="btn toolbar-btn"
            title="Slow/Reverse"
            aria-label="Halve time scale"
            @click="stepTimeScale(0.5)"
        >
            <span class="material-symbols-outlined">fast_rewind</span>
        </button>

        <button
            class="btn toolbar-btn"
            :class="{ active: simStore.isPaused }"
            :title="simStore.isPaused ? 'Resume (P)' : 'Pause (P)'"
            aria-label="Toggle pause"
            @click="onTogglePause"
        >
            <span class="material-symbols-outlined">pause</span>
        </button>

        <button
            class="btn toolbar-btn"
            title="Normal"
            aria-label="Reset time scale to 1x"
            @click="setTimeScale(1)"
        >
            <span class="material-symbols-outlined">play_arrow</span>
        </button>

        <button
            class="btn toolbar-btn"
            title="Forward"
            aria-label="Double time scale"
            @click="stepTimeScale(2)"
        >
            <span class="material-symbols-outlined">fast_forward</span>
        </button>

        <span class="vue-ui-speed-val" :title="speedTitle">{{ speedText }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { formatTimeScale, setTimeScale, simStore, togglePause } from '../sim-bridge';
import { vueUiState } from '../ui-store';

// Same bounds the old bottom toolbar used (ui-manager.ts).
const MIN_TIME_SCALE = 0.01;
const MAX_TIME_SCALE = 2 ** 10;

const speedText = computed(() => formatTimeScale(simStore.timeScale));
const speedTitle = computed(() => {
    if (simStore.isPaused) {
        return `Paused — resumes at ${Math.abs(simStore.savedTimeScale).toFixed(1)}x`;
    }
    return simStore.timeScale < 0
        ? `Running in reverse at ${Math.abs(simStore.timeScale).toFixed(1)}x`
        : `Running at ${simStore.timeScale.toFixed(1)}x`;
});

function onTogglePause(): void {
    togglePause();
}

/**
 * Halve/double the time scale, mirroring the old toolbar.
 * While paused the sim's active scale is 0, so we operate on `savedTimeScale`
 * (the speed that will be restored on resume) — exactly what the old
 * `timeScaleChange` handler does.
 */
function stepTimeScale(factor: number): void {
    const base = simStore.isPaused ? simStore.savedTimeScale : simStore.timeScale;
    const next = base * factor;
    const clamped =
        factor < 1
            ? Math.max(MIN_TIME_SCALE, next)
            : Math.min(MAX_TIME_SCALE, next);
    setTimeScale(clamped);
}

function toggleExplorer(): void {
    vueUiState.explorerVisible = !vueUiState.explorerVisible;
}
</script>
