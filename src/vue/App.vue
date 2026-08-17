<template>
    <div class="vue-ui-shell gap-3">
        <!-- <div id="vue-ui-overlay" class="vue-ui-overlay">
            <SystemExplorer v-show="vueUiState.explorerVisible" />
        </div> -->

        <PanelManager />

        <div class="vue-ui-toolbar-slot">
            <SimControls />
        </div>
    </div>
</template>

<script setup lang="ts">
import SimControls from './components/SimControls.vue';
import SystemExplorer from './components/SystemExplorer.vue';
import PanelManager from './components/PanelManager.vue';
import { vueUiState } from './ui-store';



</script>

<style scoped>
.vue-ui-toolbar-slot {
    margin-top: auto;
}
</style>
