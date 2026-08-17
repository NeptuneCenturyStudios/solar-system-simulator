<template>
    <div class="vue-ui-panel-manager vue-ui-card" :class="{ expanded: isExpanded }">
        <div class="vue-ui-panel-manager-toolbar ">
            <div class="toolbar-group">
            <button
                class="btn toolbar-btn"
                title="About this simulator"
                aria-label="About this simulator"
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

            <button class="btn toolbar-btn" title="Flight Controls">
                <span class="material-symbols-outlined">rocket</span>
            </button>

            <!-- <button
                        
                        class="btn toolbar-btn"
                        title="Texture Generator"
                    >
                        <span class="material-symbols-outlined">texture</span>
                    </button> -->

            <button class="btn toolbar-btn btn-warning" title="Re-launch System">
                <span class="material-symbols-outlined">refresh</span>
            </button>
            </div>
        </div>

        <div v-show="isExpanded" class="vue-ui-panel-manager-panels" >
            <SystemExplorer v-if="activePanel === ActivePanel.SystemExplorer" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ActivePanel, vueUiState } from '../ui-store';
import SystemExplorer from '../components/SystemExplorer.vue';

const isExpanded = computed(() => {
    // TODO: Determine if the panel manager should be expanded based on the UI state. Currently, it is expanded if the explorer is visible.
    return vueUiState.explorerVisible;
});

const activePanel = computed(() => vueUiState.activePanel);
</script>
