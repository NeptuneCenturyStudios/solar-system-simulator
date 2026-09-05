<template>
    <section class="vue-ui-panel vue-ui-explorer">
        <header class="vue-ui-card-header">
            <span>{{ props.title }}</span>
            <button
                class="vue-modal-close"
                type="button"
                title="Close"
                aria-label="Close"
                @click="closePanel"
            >
                <span class="material-symbols-outlined">close</span>
            </button>
        </header>

        <slot />
    </section>
</template>

<script setup lang="ts">
import { ActivePanel, vueUiState } from '../ui-store';

const props = defineProps<{
    title: string;
}>();

function closePanel() {
    vueUiState.panelManagerVisible = false;
    // Set the active panel to none
    vueUiState.activePanel = ActivePanel.None;
}

</script>
