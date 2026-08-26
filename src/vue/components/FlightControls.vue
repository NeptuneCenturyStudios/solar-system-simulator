<template>
    <PanelBase title="Flight Controls">
        <p class="vue-ui-hint">
            W/S — speed &nbsp; A/D — roll &nbsp; Shift — boost<br />
            C — view &nbsp; Mouse steers &nbsp; Hold space — warp &nbsp; Esc — exit
        </p>

        <label class="checkbox-row">
            <input
                type="checkbox"
                :checked="simStore.isAdvancedMode"
                @change="setAdvancedMode(($event.target as HTMLInputElement).checked)"
            />
            Advanced Flight Mode
        </label>

        <div class="control-group">
            <label for="vueFlightShipTypeSelect">Ship Type</label>
            <select
                id="vueFlightShipTypeSelect"
                :value="simStore.selectedShipTypeId"
                @change="setSelectedShipTypeId(($event.target as HTMLSelectElement).value)"
            >
                <option v-for="shipType in SHIP_TYPES" :key="shipType.id" :value="shipType.id">
                    {{ shipType.label }}
                </option>
            </select>
        </div>

        <button
            class="old-ui btn-with-icon mb-3"
            :disabled="simStore.inFlight"
            @click="requestSpawnShip()"
        >
            <span class="material-symbols-outlined">{{ spawnIcon }}</span>
            {{ spawnLabel }}
        </button>

        <button
            class="old-ui btn-with-icon mb-3"
            :class="{ active: simStore.autopilotTargetId !== null }"
            :disabled="!simStore.hasKnownShip"
            @click="requestToggleAutopilot()"
        >
            <span class="material-symbols-outlined">{{
                simStore.autopilotTargetId !== null ? 'cancel' : 'rocket'
            }}</span>
            {{ simStore.autopilotTargetId !== null ? 'CANCEL AUTOPILOT' : 'AUTOPILOT' }}
        </button>
    </PanelBase>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { SHIP_TYPES } from '../../bodies/ships/ship-registry';
import {
    requestSpawnShip,
    requestToggleAutopilot,
    setAdvancedMode,
    setSelectedShipTypeId,
    simStore,
} from '../sim-bridge';

import PanelBase from './PanelBase.vue';

const canReenter = computed(
    () => simStore.hasKnownShip && simStore.knownShipTypeId === simStore.selectedShipTypeId
);

const spawnIcon = computed(() => (canReenter.value ? 'login' : 'rocket_launch'));
const spawnLabel = computed(() => (canReenter.value ? 'ENTER SHIP' : 'SPAWN SPACESHIP'));
</script>

<style scoped>
.vue-ui-flight-controls {
    flex: 1;
    min-height: 0;
}

.vue-ui-hint {
    color: #aaa;
    margin: 0 0 12px;
}
</style>
