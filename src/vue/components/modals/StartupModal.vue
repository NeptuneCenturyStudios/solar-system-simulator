<template>
    <ModalBase
        :visible="modal.isVisible.value"
        :title="modalTitle"
        :allow-close="allowCancel || view === 'options'"
        @cancel="onCancel"
    >
        <div v-if="view === 'launch'" class="d-flex flex-column gap-3">
            <div class="control-group startup-g-control">
                <label for="vueStartupGMultiplierSlider">
                    Gravity Multiplier (G)
                    <span class="val-display">{{ gMultiplierDisplay }}</span>
                </label>
                <input
                    id="vueStartupGMultiplierSlider"
                    v-model.number="gMultiplierIndex"
                    type="range"
                    min="0"
                    max="4"
                    step="1"
                />
                <div class="startup-g-labels">
                    <span title="Lower gravity is ideal for flight simulation and exploration"
                        >Normal</span
                    >
                    <span title="Higher gravity is ideal for simulation and experiments"
                        >10,000,000×</span
                    >
                </div>
            </div>

            <button class="old-ui btn-with-icon" type="button" @click="launch('launchDefault')">
                <svg-icon type="mdi" :path="mdiOrbit"></svg-icon>
                LAUNCH SOLAR SYSTEM
            </button>
            <button class="old-ui btn-with-icon" type="button" @click="launch('launchEmpty')">
                <svg-icon type="mdi" :path="mdiWrenchOutline"></svg-icon>
                BUILD YOUR OWN SYSTEM
            </button>
            <button class="old-ui btn-with-icon" type="button" @click="launch('generate')">
                <svg-icon type="mdi" :path="mdiAutoFix"></svg-icon>
                GENERATE
            </button>
            <button
                class="old-ui btn-dark btn-with-icon badge-anchor"
                type="button"
                @click="launch('scenarios')"
            >
                <svg-icon type="mdi" :path="mdiGamepadVariantOutline"></svg-icon>
                SCENARIOS
                <span class="badge badge--left badge--new" aria-hidden="true">New!</span>
            </button>
            <button class="old-ui btn-dark btn-with-icon" type="button" @click="view = 'options'">
                <svg-icon type="mdi" :path="mdiCog"></svg-icon>
                OPTIONS
            </button>
            <button
                v-show="allowCancel"
                class="old-ui btn-with-icon btn-danger"
                type="button"
                @click="onCancel"
            >
                <svg-icon type="mdi" :path="mdiClose"></svg-icon>
                CANCEL
            </button>
        </div>
        <div v-else class="d-flex flex-column gap-3">
            <OptionsFields />
            <button class="old-ui btn-with-icon" type="button" @click="view = 'launch'">
                <svg-icon type="mdi" :path="mdiArrowLeft"></svg-icon>
                BACK
            </button>
        </div>
    </ModalBase>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { useAsyncModal } from '../../composables/useAsyncModal';
import {
    registerStartupModalController,
    type StartupModalController,
    type StartupModalOptions,
    type StartupModalResult,
} from '../../startup-modal-service';
import OptionsFields from '../OptionsFields.vue';
import SvgIcon from '@jamescoyle/vue-icon';
import {
    mdiArrowLeft,
    mdiAutoFix,
    mdiClose,
    mdiCog,
    mdiGamepadVariantOutline,
    mdiOrbit,
    mdiWrenchOutline,
} from '@mdi/js';
import ModalBase from './ModalBase.vue';

const G_MULTIPLIER_STEPS = [1, 2500000, 5000000, 7500000, 10000000];

const modal = useAsyncModal<StartupModalResult>();
const allowCancel = ref(false);
const gMultiplierIndex = ref(0);
/** Which page of the modal is showing: the launch buttons or the Options fields. */
const view = ref<'launch' | 'options'>('launch');

const modalTitle = computed(() => (view.value === 'options' ? 'Options' : 'Launch Control'));

const gMultiplierDisplay = computed(() => {
    const value = G_MULTIPLIER_STEPS[gMultiplierIndex.value] ?? 1;
    if (value === 1) return 'Normal (1×)';
    return `${value.toLocaleString()}×`;
});

function launch(action: StartupModalResult['action']): void {
    modal.close({ action });
}

function onCancel(): void {
    // Esc / X / backdrop on the Options page returns to the launch page rather than closing.
    if (view.value === 'options') {
        view.value = 'launch';
        return;
    }
    if (!allowCancel.value) return;
    modal.close(null);
}

const controller: StartupModalController = {
    show(options: StartupModalOptions = {}): Promise<StartupModalResult | null> {
        allowCancel.value = options.allowCancel ?? false;
        view.value = 'launch';
        return modal.show();
    },
    hide(): void {
        modal.close(null);
    },
    isVisible(): boolean {
        return modal.isVisible.value;
    },
    getGMultiplier(): number {
        return G_MULTIPLIER_STEPS[gMultiplierIndex.value] ?? 1;
    },
    isAllowCancel(): boolean {
        return allowCancel.value;
    },
};

onMounted(() => {
    registerStartupModalController(controller);
});
</script>
