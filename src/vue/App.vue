<template>
    <div class="vue-ui-shell gap-3">

        <PanelManager />

        <div class="vue-ui-toolbar-slot">
            <SimControls />
        </div>
    </div>

    <StartupModal />
</template>

<script setup lang="ts">
import SimControls from './components/SimControls.vue';
import PanelManager from './components/PanelManager.vue';
import StartupModal from './components/modals/StartupModal.vue';
</script>
