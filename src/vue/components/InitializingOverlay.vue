<template>
    <div v-if="vueUiState.initializing" class="vue-initializing" role="status" aria-live="polite">
        <svg-icon type="mdi" :path="mdiLoading" class="loading-icon" width="2rem" height="2rem"></svg-icon>
        <span class="vue-initializing-text">Initializing…</span>
    </div>
</template>

<script setup lang="ts">
import SvgIcon from '@jamescoyle/vue-icon';
import { mdiLoading } from '@mdi/js';

import { vueUiState } from '../ui-store';
</script>

<style scoped>
.vue-initializing {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--new-ui-gap-3);
    color: var(--new-ui-label-color);
    pointer-events: none;
}

.vue-initializing-text {
    font-size: 2em;
    letter-spacing: 1px;
    text-transform: uppercase;
}
</style>
