<template>
    <div class="vue-ui-shell">
        <div id="vue-ui-overlay" class="vue-ui-overlay">
            <SystemExplorer />
        </div>

        <div >
            <SimControls />
        </div>
    </div>
</template>

<script setup lang="ts">
import SimControls from './components/SimControls.vue';
import SystemExplorer from './components/SystemExplorer.vue';
</script>
