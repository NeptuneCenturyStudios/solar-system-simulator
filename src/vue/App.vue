<template>
    <div class="vue-ui-shell gap-3">

        <PanelManager v-show="vueUiState.panelManagerVisible" />

        <div class="vue-ui-toolbar-slot">
            <SimControls />
        </div>
    </div>

    <StartupModal />
    <ProceduralModal />
    <AboutModal />
</template>

<script setup lang="ts">
import SimControls from './components/SimControls.vue';
import PanelManager from './components/PanelManager.vue';
import StartupModal from './components/modals/StartupModal.vue';
import ProceduralModal from './components/modals/ProceduralModal.vue';
import AboutModal from './components/modals/AboutModal.vue';

import { vueUiState } from './ui-store';

</script>
