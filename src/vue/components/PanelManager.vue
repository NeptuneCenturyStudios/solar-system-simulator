<template>
    <div class="vue-ui-panel-manager vue-ui-card" :class="{ expanded: isExpanded }">
        <div class="vue-ui-panel-manager-toolbar ">
            <div class="toolbar-group">
            <button
                class="btn toolbar-btn"
                title="About this simulator"
                aria-label="About this simulator"
                @click="openAbout"
            >
                <span class="material-symbols-outlined">info</span>
            </button>

            <button class="btn toolbar-btn btn-care" title="Support Neptune Century on Ko-fi">
                <span class="material-symbols-outlined">favorite</span>
            </button>

            <button class="btn toolbar-btn" title="Music Playlist">
                <span class="material-symbols-outlined">music_note</span>
            </button>

            <button class="btn toolbar-btn" title="Options">
                <span class="material-symbols-outlined">settings</span>
            </button>

            <button class="btn toolbar-btn" title="Edit Solar System">
                <span class="material-symbols-outlined">edit</span>
            </button>

            <button
                class="btn toolbar-btn"
                :class="{ active: activePanel === ActivePanel.FlightControls }"
                title="Flight Controls"
                @click="setActivePanel(ActivePanel.FlightControls)"
            >
                <span class="material-symbols-outlined">rocket</span>
            </button>

            <!-- <button
                        
                        class="btn toolbar-btn"
                        title="Texture Generator"
                    >
                        <span class="material-symbols-outlined">texture</span>
                    </button> -->

            <button class="btn toolbar-btn btn-warning" title="Re-launch System" @click="requestRelaunch()">
                <span class="material-symbols-outlined">refresh</span>
            </button>
            </div>
        </div>

        <div v-show="isExpanded" class="vue-ui-panel-manager-panels" >
            <SystemExplorer v-if="activePanel === ActivePanel.SystemExplorer" />
            <FlightControls v-if="activePanel === ActivePanel.FlightControls" />
            <AddEditBodyPanel v-if="activePanel === ActivePanel.BodyEditor" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ActivePanel, vueUiState } from '../ui-store';
import { requestRelaunch } from '../sim-bridge';
import { showAboutModal } from '../about-modal-service';
import SystemExplorer from '../components/SystemExplorer.vue';
import FlightControls from '../components/FlightControls.vue';
import AddEditBodyPanel from '../components/AddEditBodyPanel.vue';

const isExpanded = computed(() => {
    // TODO: Determine if the panel manager should be expanded based on the UI state. Currently, it is expanded if the explorer is visible.
    return vueUiState.activePanel !== ActivePanel.None;
});

const activePanel = computed(() => vueUiState.activePanel);

function setActivePanel(panel: ActivePanel): void {
    vueUiState.activePanel = panel;
}

function openAbout(): void {
    showAboutModal();
}
</script>
