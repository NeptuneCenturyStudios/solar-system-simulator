<template>
    <div class="toolbar toolbar-bottom visible" :class="{ paused: simStore.isPaused }">
        <!-- Main menu button: toggles PanelManager visibility without changing the active panel -->
        <button
            class="btn toolbar-btn"
            title="Toggle Menu"
            aria-label="Toggle Menu"
            @click="togglePanelManager"
        >
            <svg-icon type="mdi" :path="mdiMenu"></svg-icon>
        </button>

        <!-- Explorer -->
        <button
            class="btn toolbar-btn"
            :class="{ active: vueUiState.activePanel === ActivePanel.SystemExplorer }"
            title="Open System Explorer"
            aria-label="Open System Explorer"
            @click="toggleExplorer"
        >
            <svg-icon type="mdi" :path="mdiMagnifyScan"></svg-icon>
        </button>

        <!-- Simulation controls -->
        <button
            class="btn toolbar-btn"
            title="Slow"
            aria-label="Halve time scale"
            @click="stepTimeScale(0.5)"
        >
            <svg-icon type="mdi" :path="mdiRewind"></svg-icon>
        </button>

        <button
            class="btn toolbar-btn"
            :class="{ active: simStore.isPaused }"
            :title="simStore.isPaused ? 'Resume (P)' : 'Pause (P)'"
            aria-label="Toggle pause"
            @click="onTogglePause"
        >
            <svg-icon type="mdi" :path="mdiPause"></svg-icon>
        </button>

        <button
            class="btn toolbar-btn"
            title="Normal"
            aria-label="Reset time scale to 1x"
            @click="setTimeScale(1)"
        >
            <svg-icon type="mdi" :path="mdiPlay"></svg-icon>
        </button>

        <button
            class="btn toolbar-btn"
            title="Forward"
            aria-label="Double time scale"
            @click="stepTimeScale(2)"
        >
            <svg-icon type="mdi" :path="mdiFastForward"></svg-icon>
        </button>

        <span class="vue-ui-speed-val" :title="speedTitle">{{ speedText }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { formatTimeScale, setTimeScale, simStore, stepTimeScale, togglePause } from '../sim-bridge';
import { ActivePanel, setActivePanel, togglePanelManager, vueUiState } from '../ui-store';
import SvgIcon from '@jamescoyle/vue-icon';
import { mdiFastForward, mdiMagnifyScan, mdiMenu, mdiPause, mdiPlay, mdiRewind } from '@mdi/js';

const speedText = computed(() => formatTimeScale(simStore.timeScale));
const speedTitle = computed(() => {
    if (simStore.isPaused) {
        return `Paused — resumes at ${Math.abs(simStore.savedTimeScale).toFixed(1)}x`;
    }
    return simStore.timeScale < 0
        ? `Running in reverse at ${Math.abs(simStore.timeScale).toFixed(1)}x`
        : `Running at ${formatTimeScale(simStore.timeScale)}`;
});

function onTogglePause(): void {
    togglePause();
}

function toggleExplorer(): void {
    // Show the PanelManager and switch to the System Explorer view.
    setActivePanel(ActivePanel.SystemExplorer);
}
</script>
