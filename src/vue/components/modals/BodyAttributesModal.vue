<template>
    <ModalBase
        :visible="isOpen"
        :title="title"
        :allow-close="true"
        variant="info"
        @cancel="onClose"
    >
        <div v-if="snapshot" class="attribute-body">
            <section class="attribute-section">
                <h3 class="attribute-section-title">Basic Data</h3>
                <dl class="attribute-list">
                    <div v-for="row in snapshot.basicRows" :key="row.key" class="attribute-row">
                        <dt class="attribute-label">{{ row.label }}</dt>
                        <dd class="attribute-value">{{ row.value }}</dd>
                    </div>
                </dl>
            </section>

            <section class="attribute-section">
                <h3 class="attribute-section-title">Science Data</h3>

                <p v-if="!snapshot.hasScienceData" class="attribute-note">
                    None
                </p>

                <template v-else>
                    <dl class="attribute-list">
                        <div
                            v-for="row in snapshot.scienceRows"
                            :key="row.key"
                            class="attribute-row"
                            :class="{ 'attribute-row-unknown': !row.discovered }"
                        >
                            <dt class="attribute-label">{{ row.label }}</dt>
                            <dd class="attribute-value">{{ row.value }}</dd>
                        </div>
                    </dl>

                    <p v-if="hasUndiscovered" class="attribute-note attribute-note-hint">
                        Send a probe to this object to discover its properties.
                    </p>
                </template>
            </section>

            <button class="old-ui btn-with-icon" type="button" @click="onClose">
                <span class="material-symbols-outlined">close</span>
                CLOSE
            </button>
        </div>
    </ModalBase>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { bodyAttributesStore, closeBodyAttributes } from '../../sim-bridge';
import type { BodyAttributesSnapshot } from '../../sim-bridge';
import ModalBase from './ModalBase.vue';

/** The modal is a pure view over the bridge store: it is open exactly while a snapshot is
 *  loaded, and the bridge keeps that snapshot live so a probe scan finishing mid-view
 *  replaces the "???" rows in place. */
const snapshot = computed<BodyAttributesSnapshot | null>(() => bodyAttributesStore.snapshot);

const isOpen = computed<boolean>(() => snapshot.value !== null);

const title = computed<string>(() => {
    const current = snapshot.value;
    if (!current) return 'Object Data';
    return `${current.bodyName} — ${current.typeLabel}`;
});

/** True when at least one science row is still unscanned, which is what a probe would unlock. */
const hasUndiscovered = computed<boolean>(
    () => !!snapshot.value?.scienceRows.some((row) => !row.discovered)
);

function onClose(): void {
    closeBodyAttributes();
}
</script>

<style scoped>
.attribute-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 320px;
}

.attribute-section-title {
    margin: 0 0 8px;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--new-ui-label-color, rgba(255, 255, 255, 0.6));
}

.attribute-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.attribute-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.03);
}

.attribute-label {
    flex: 0 0 44%;
    margin: 0;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.65);
}

.attribute-value {
    flex: 1 1 auto;
    margin: 0;
    font-size: 0.85rem;
    color: #00ffcc;
    overflow-wrap: anywhere;
}

/* Unscanned readings read as dimmed placeholders rather than data. */
.attribute-row-unknown .attribute-value {
    color: rgba(255, 255, 255, 0.35);
}

.attribute-note {
    margin: 0 0 8px;
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.55);
}

.attribute-note-hint {
    margin: 8px 0 0;
    color: rgba(0, 255, 204, 0.7);
}
</style>
