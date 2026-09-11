<template>
    <ModalBase
        :visible="modal.isVisible.value"
        :title="request?.title ?? ''"
        :variant="request?.variant ?? 'info'"
        :allow-close="false"
    >
        <div v-if="request" class="d-flex flex-column gap-3">
            <div class="scenario-dialog-message">{{ request.message }}</div>

            <dl v-if="request.stats && request.stats.length > 0" class="scenario-dialog-stats">
                <div v-for="stat in request.stats" :key="stat.label" class="scenario-dialog-stat">
                    <dt>{{ stat.label }}</dt>
                    <dd>{{ stat.value }}</dd>
                </div>
            </dl>

            <div class="d-flex flex-column gap-3">
                <button
                    v-for="action in request.actions"
                    :key="action.id"
                    class="old-ui btn-with-icon"
                    :class="action.danger ? 'btn-danger' : 'btn-dark'"
                    type="button"
                    @click="choose(action.id)"
                >
                    <span class="material-symbols-outlined">{{ action.icon }}</span>
                    {{ action.label }}
                </button>
            </div>
        </div>
    </ModalBase>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { useAsyncModal } from '../../composables/useAsyncModal';
import {
    registerScenarioOutcomeModalController,
    type ScenarioDialogActionId,
    type ScenarioDialogRequest,
    type ScenarioDialogResult,
    type ScenarioOutcomeModalController,
} from '../../scenario-outcome-modal-service';
import ModalBase from './ModalBase.vue';

// The dialog is non-dismissible (no close button, backdrop click is inert): a
// scenario has ended and the player must pick what to do next, so there is no
// meaningful "cancel" outcome.
const modal = useAsyncModal<ScenarioDialogResult>();
const request = ref<ScenarioDialogRequest | null>(null);

function choose(action: ScenarioDialogActionId): void {
    modal.close({ action });
}

const controller: ScenarioOutcomeModalController = {
    show(next: ScenarioDialogRequest): Promise<ScenarioDialogResult | null> {
        request.value = next;
        return modal.show();
    },
    hide(): void {
        modal.close(null);
    },
    isVisible(): boolean {
        return modal.isVisible.value;
    },
};

onMounted(() => {
    registerScenarioOutcomeModalController(controller);
});
</script>
