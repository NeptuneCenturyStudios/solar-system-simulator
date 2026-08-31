<template>
    <div class="vue-ui-shell gap-3">

        <PanelManager v-show="vueUiState.panelManagerVisible && vueUiState.systemReady" />

        <div class="vue-ui-toolbar-slot">
            <SimControls v-show="vueUiState.systemReady" />
        </div>
    </div>

    <WhatsNewModal />
    <StartupModal />
    <ProceduralModal />
    <AboutModal />
</template>

<script setup lang="ts">
import SimControls from './components/SimControls.vue';
import PanelManager from './components/PanelManager.vue';
import WhatsNewModal from './components/modals/WhatsNewModal.vue';
import StartupModal from './components/modals/StartupModal.vue';
import ProceduralModal from './components/modals/ProceduralModal.vue';
import AboutModal from './components/modals/AboutModal.vue';

import { vueUiState } from './ui-store';

</script>
