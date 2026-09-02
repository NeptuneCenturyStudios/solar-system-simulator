<template>
    <ModalBase
        :visible="modal.isVisible.value"
        title="Scenarios"
        :allow-close="false"
        @cancel="onCancel"
    >
        <div class="d-flex flex-column gap-3">
            <div class="scenario-description">
                Choose a scenario to explore. More scenarios will be added in the future.
            </div>
            <button
                class="old-ui btn-dark btn-with-icon"
                type="button"
                @click="selectScenario('blackHole')"
            >
                <span class="material-symbols-outlined">brightness_1</span>
                BLACK HOLE
            </button>
            <button
                class="old-ui btn-dark btn-with-icon"
                type="button"
                @click="selectScenario('testAiShips')"
            >
                <span class="material-symbols-outlined">smart_toy</span>
                TEST AI SHIPS
            </button>
            <button
                class="old-ui btn-with-icon btn-danger"
                type="button"
                @click="onCancel"
            >
                <span class="material-symbols-outlined">arrow_back</span>
                CANCEL
            </button>
        </div>
    </ModalBase>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';

import { useAsyncModal } from '../../composables/useAsyncModal';
import {
    registerScenariosModalController,
    type ScenariosModalController,
    type ScenariosModalResult,
} from '../../scenarios-modal-service';
import ModalBase from './ModalBase.vue';

const modal = useAsyncModal<ScenariosModalResult>();

function selectScenario(scenario: ScenariosModalResult['scenario']): void {
    modal.close({ scenario });
}

function onCancel(): void {
    modal.close(null);
}

const controller: ScenariosModalController = {
    show(): Promise<ScenariosModalResult | null> {
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
    registerScenariosModalController(controller);
});
</script>
