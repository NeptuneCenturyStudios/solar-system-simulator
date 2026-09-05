<template>
    <div
        v-show="vueUiState.systemReady"
        class="vue-ui-shell gap-3"
        
    >
        <PanelManager v-show="vueUiState.panelManagerVisible" />

        <div class="vue-ui-toolbar-slot">
            <SimControls />
        </div>
    </div>

    <WhatsNewModal />
    <StartupModal />
    <ProceduralModal />
    <ScenariosModal />
    <AboutModal />
</template>

<script setup lang="ts">
import SimControls from './components/SimControls.vue';
import PanelManager from './components/PanelManager.vue';
import WhatsNewModal from './components/modals/WhatsNewModal.vue';
import StartupModal from './components/modals/StartupModal.vue';
import ProceduralModal from './components/modals/ProceduralModal.vue';
import ScenariosModal from './components/modals/ScenariosModal.vue';
import AboutModal from './components/modals/AboutModal.vue';

import { vueUiState } from './ui-store';

</script>
