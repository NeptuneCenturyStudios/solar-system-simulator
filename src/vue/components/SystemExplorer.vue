<template>
    <section class="vue-ui-panel vue-ui-explorer">
        <header class="vue-ui-card-header">
            <span>System Explorer</span>
            <span class="vue-ui-body-count">{{ simStore.bodies.length }}</span>
        </header>

        <div>
            Camera controls go here.
        </div>

        <input
            v-model="searchQuery"
            type="search"
            class="vue-ui-input"
            placeholder="Search bodies…"
            aria-label="Search bodies"
        />

        <hr class="vue-ui-hr" />

        <div class="vue-ui-body-list" role="listbox" aria-label="Celestial bodies">
            <p v-if="filteredBodies.length === 0" class="vue-ui-empty">
                No bodies yet — launch a system first.
            </p>
            <button
                v-for="body in filteredBodies"
                :key="body.id"
                class="vue-ui-body-row"
                :class="{ 'vue-ui-body-row-selected': body.id === simStore.selectedId }"
                type="button"
                role="option"
                :aria-selected="body.id === simStore.selectedId"
                @click="onSelect(body)"
            >
                <span class="vue-ui-body-name" :title="body.name">{{ body.name }}</span>
                <span class="vue-ui-body-type">{{ body.typeLabel }}</span>
                <span class="vue-ui-body-stats">
                    <span>M {{ formatNumber(body.mass) }}</span>
                    <span>R {{ formatNumber(body.radius) }}</span>
                    <span>v {{ formatNumber(body.speed) }}</span>
                </span>
            </button>
        </div>

        <div>
            Other controls go here like checkboxes for trails and names and other display options.
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { simStore } from '../sim-bridge';
import type { BodySnapshot } from '../sim-bridge';
import { formatNumber, selectBodyById } from '../sim-bridge';

const searchQuery = ref('');

const filteredBodies = computed<BodySnapshot[]>(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return simStore.bodies;
    return simStore.bodies.filter(
        (b) => b.name.toLowerCase().includes(q) || b.typeLabel.toLowerCase().includes(q)
    );
});

function onSelect(body: BodySnapshot): void {
    selectBodyById(body.id);
}
</script>

<style scoped>
.vue-ui-explorer {
    flex: 1;
    min-height: 0;
}

.vue-ui-body-count {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.7rem;
}
</style>
