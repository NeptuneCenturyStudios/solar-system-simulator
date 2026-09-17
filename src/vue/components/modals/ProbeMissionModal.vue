<template>
    <ModalBase
        :visible="modal.isVisible.value"
        title="Launch Probe"
        :allow-close="true"
        @cancel="onCancel"
    >
        <div class="d-flex flex-column gap-3">
            <div class="scenario-description">
                Send a probe to a celestial body to unlock its hidden science data. Scanning
                begins automatically once the probe comes within
                {{ scanRangeKm.toLocaleString() }} km of the surface — it doesn't need to be in a
                stable orbit yet, though the requested altitude below is still where it will try
                to park itself afterward.
            </div>

            <div v-if="targets.length === 0" class="scenario-description">
                No eligible targets in the system yet.
            </div>

            <template v-else>
                <div class="control-group">
                    <label for="vueProbeTargetSelect">Target</label>
                    <select id="vueProbeTargetSelect" v-model="targetId">
                        <option v-for="t in targets" :key="t.id" :value="t.id">
                            {{ t.name }} ({{ t.typeLabel }})
                        </option>
                    </select>
                </div>

                <div class="control-group">
                    <label for="vueProbeAltitudeInput">Orbital Altitude (km)</label>
                    <input
                        id="vueProbeAltitudeInput"
                        v-model.number="altitudeKm"
                        type="number"
                        class="text-input"
                        min="1"
                        max="500000"
                        step="any"
                    />
                </div>
            </template>

            <button
                class="old-ui btn-with-icon"
                type="button"
                :disabled="targets.length === 0 || !targetId || altitudeKm <= 0"
                @click="onLaunch"
            >
                <span class="material-symbols-outlined">rocket_launch</span>
                LAUNCH
            </button>
            <button class="old-ui btn-with-icon btn-danger" type="button" @click="onCancel">
                <span class="material-symbols-outlined">arrow_back</span>
                CANCEL
            </button>
        </div>
    </ModalBase>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { useAsyncModal } from '../../composables/useAsyncModal';
import {
    registerProbeMissionModalController,
    type ProbeMissionModalController,
    type ProbeMissionModalResult,
} from '../../probe-mission-modal-service';
import { simStore } from '../../sim-bridge';
import { simRadiusToKm } from '../../../utilities/display-format';
import { DIST_SCALE, PROBE_SCAN_RANGE_KM } from '../../../utilities/consts';
import ModalBase from './ModalBase.vue';

const modal = useAsyncModal<ProbeMissionModalResult>();
const scanRangeKm = PROBE_SCAN_RANGE_KM * DIST_SCALE;

const targets = computed(() => simStore.bodies.filter((b) => b.isProbeTarget));

const targetId = ref<string>('');
const altitudeKm = ref<number>(1000);

watch(targetId, (id) => {
    const target = targets.value.find((t) => t.id === id);
    altitudeKm.value = target ? Math.max(1, Math.round(simRadiusToKm(target.radius))) : 1000;
});

watch(
    () => modal.isVisible.value,
    (visible) => {
        if (!visible) return;
        // Re-seed the default target/altitude each time the modal opens.
        const first = targets.value[0];
        targetId.value = first ? first.id : '';
        altitudeKm.value = first ? Math.max(1, Math.round(simRadiusToKm(first.radius))) : 1000;
    }
);

function onLaunch(): void {
    if (!targetId.value || altitudeKm.value <= 0) return;
    modal.close({ targetId: targetId.value, altitudeKm: altitudeKm.value });
}

function onCancel(): void {
    modal.close(null);
}

const controller: ProbeMissionModalController = {
    show(): Promise<ProbeMissionModalResult | null> {
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
    registerProbeMissionModalController(controller);
});
</script>
