<template>
    <section class="vue-ui-panel vue-ui-explorer">
        <header class="vue-ui-card-header">
            <span>{{ props.title }}</span>
            <button
                class="vue-modal-close"
                type="button"
                title="Close"
                aria-label="Close"
                @click="vueUiState.panelManagerVisible = false"
            >
                <span class="material-symbols-outlined">close</span>
            </button>
        </header>

        <slot />
    </section>
</template>

<script setup lang="ts">
import { vueUiState } from '../ui-store';

const props = defineProps<{
    title: string;
}>();
</script>
