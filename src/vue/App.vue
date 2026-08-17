<template>
    <div class="vue-ui-shell">
        
        <div id="vue-ui-overlay" class="vue-ui-overlay">
            <SimControls />
            <SystemExplorer />
        </div>

        <div id="vue-ui-sim-controls" style="background-color: blue">
            This is the simulation controls section.
        </div>
    </div>
</template>

<script setup lang="ts">
import SimControls from './components/SimControls.vue';
import SystemExplorer from './components/SystemExplorer.vue';

</script>
