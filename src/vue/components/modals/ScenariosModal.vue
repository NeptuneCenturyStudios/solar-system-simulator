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
                <svg-icon type="mdi" :path="mdiCircle"></svg-icon>
                BLACK HOLE
            </button>
            <button
                class="old-ui btn-dark btn-with-icon"
                type="button"
                @click="selectScenario('testAiShips')"
            >
                <svg-icon type="mdi" :path="mdiRobotOutline"></svg-icon>
                TEST AI SHIPS
            </button>
            <button
                class="old-ui btn-dark btn-with-icon"
                type="button"
                @click="selectScenario('wormholeShortcut')"
            >
                <svg-icon type="mdi" :path="mdiSwapHorizontal"></svg-icon>
                WORMHOLE SHORTCUT
            </button>
            <button
                class="old-ui btn-dark btn-with-icon"
                type="button"
                @click="selectScenario('asteroidField')"
            >
                <svg-icon type="mdi" :path="mdiGrain"></svg-icon>
                ASTEROID FIELD
            </button>
            <button
                class="old-ui btn-dark btn-with-icon"
                type="button"
                @click="selectScenario('asteroidDefense')"
            >
                <svg-icon type="mdi" :path="mdiShieldOutline"></svg-icon>
                ASTEROID DEFENSE
            </button>
            <button
                class="old-ui btn-dark btn-with-icon"
                type="button"
                @click="selectScenario('extinctionEvent')"
            >
                <svg-icon type="mdi" :path="mdiAlertOutline"></svg-icon>
                EXTINCTION EVENT
            </button>
            <button class="old-ui btn-with-icon btn-danger" type="button" @click="onCancel">
                <svg-icon type="mdi" :path="mdiArrowLeft"></svg-icon>
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
import SvgIcon from '@jamescoyle/vue-icon';
import {
    mdiAlertOutline,
    mdiArrowLeft,
    mdiCircle,
    mdiGrain,
    mdiRobotOutline,
    mdiShieldOutline,
    mdiSwapHorizontal,
} from '@mdi/js';
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
