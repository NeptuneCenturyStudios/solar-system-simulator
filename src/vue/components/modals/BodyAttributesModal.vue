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

                <p v-if="!snapshot.hasScienceData" class="attribute-note">None</p>

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
                <svg-icon type="mdi" :path="mdiClose"></svg-icon>
                CLOSE
            </button>
        </div>
    </ModalBase>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { bodyAttributesStore, closeBodyAttributes } from '../../sim-bridge';
import type { BodyAttributesSnapshot } from '../../sim-bridge';
import SvgIcon from '@jamescoyle/vue-icon';
import { mdiClose } from '@mdi/js';
import ModalBase from './ModalBase.vue';

/** The modal is a pure view over the bridge store: it is open exactly while a snapshot is
 *  loaded, and the bridge keeps that snapshot live so a probe scan finishing mid-view
 *  replaces the "???" rows in place. */
const snapshot = computed<BodyAttributesSnapshot | null>(() => bodyAttributesStore.snapshot);

const isOpen = computed<boolean>(() => snapshot.value !== null);

const title = computed<string>(() => {
    const current = snapshot.value;
    if (!current) return 'Object Data';
    return current.bodyName;
});

/** True when at least one science row is still unscanned, which is what a probe would unlock. */
const hasUndiscovered = computed<boolean>(
    () => !!snapshot.value?.scienceRows.some((row) => !row.discovered)
);

function onClose(): void {
    closeBodyAttributes();
}
</script>
