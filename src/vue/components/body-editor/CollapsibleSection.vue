<template>
    <section class="body-editor-section" :class="{ open }">
        <button
            class="body-editor-section-header"
            type="button"
            :aria-expanded="open"
            @click="open = !open"
        >
            <svg-icon type="mdi" :path="open ? mdiChevronDown : mdiChevronRight" size="18" />
            <span class="body-editor-section-title">{{ title }}</span>
            <span v-if="subtitle" class="body-editor-section-subtitle">{{ subtitle }}</span>
        </button>
        <div v-show="open" class="body-editor-section-body">
            <slot />
        </div>
    </section>
</template>

<script setup lang="ts">
import SvgIcon from '@jamescoyle/vue-icon';
import { mdiChevronDown, mdiChevronRight } from '@mdi/js';

defineProps<{
    title: string;
    /** Extra context shown dimmed after the title (e.g. the orbit parent's name). */
    subtitle?: string | null;
}>();

const open = defineModel<boolean>('open', { default: false });
</script>

<style scoped>
.body-editor-section {
    border: 1px solid var(--new-ui-border);
    border-radius: var(--new-ui-border-radius);
    margin-bottom: var(--new-ui-gap-3);
    background: rgba(6, 27, 47, 0.25);
}

.body-editor-section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--new-ui-panel-header-color);
    text-transform: uppercase;
    text-align: left;
    cursor: pointer;
}

.body-editor-section-header:hover {
    color: var(--new-ui-color);
    background: var(--new-ui-input-hover);
}

.body-editor-section.open .body-editor-section-header {
    border-bottom: 1px solid var(--new-ui-border);
}

.body-editor-section-title {
    flex-shrink: 0;
}

.body-editor-section-subtitle {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--new-ui-label-dim-color);
    text-transform: none;
}

.body-editor-section-body {
    padding: 10px 10px 0;
}
</style>
