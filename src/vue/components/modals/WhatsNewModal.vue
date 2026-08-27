<template>
    <ModalBase
        :visible="modal.isVisible.value"
        title="What's New"
        :allow-close="true"
        @cancel="onClose"
    >
        <div class="modal-body whats-new-body">
            <p class="whats-new-intro">Here's what's new in this update:</p>
            <ul class="whats-new-list">
                <li>
                    <span class="material-symbols-outlined whats-new-icon">hub</span>
                    <div>
                        <strong>New Wormhole Feature</strong>
                        <span>Link wormholes together to travel across the system instantly.</span>
                    </div>
                </li>
                <li>
                    <span class="material-symbols-outlined whats-new-icon">palette</span>
                    <div>
                        <strong>Revamped UI</strong>
                        <span>A fresh new look and feel for the interface.</span>
                    </div>
                </li>
                <li>
                    <span class="material-symbols-outlined whats-new-icon">bug_report</span>
                    <div>
                        <strong>Several Bug Fixes</strong>
                        <span>Stability and performance improvements throughout.</span>
                    </div>
                </li>
            </ul>
        </div>

        <template #actions>
            <button class="old-ui btn-with-icon" type="button" @click="onClose">
                <span class="material-symbols-outlined">check</span>
                GOT IT
            </button>
        </template>
    </ModalBase>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';

import { useAsyncModal } from '../../composables/useAsyncModal';
import {
    registerWhatsNewModalController,
    type WhatsNewModalController,
} from '../../whats-new-modal-service';
import ModalBase from './ModalBase.vue';

const modal = useAsyncModal<void>();

function onClose(): void {
    modal.close(undefined);
}

const controller: WhatsNewModalController = {
    show(): Promise<void | null> {
        return modal.show();
    },
    hide(): void {
        modal.close(undefined);
    },
    isVisible(): boolean {
        return modal.isVisible.value;
    },
};

onMounted(() => {
    registerWhatsNewModalController(controller);
});
</script>

<style scoped>
.whats-new-intro {
    margin: 0 0 12px;
}

.whats-new-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.whats-new-list li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
}

.whats-new-icon {
    flex-shrink: 0;
    margin-top: 2px;
}

.whats-new-list strong {
    display: block;
    margin-bottom: 2px;
}
</style>
