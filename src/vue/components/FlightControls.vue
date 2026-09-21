<template>
    <PanelBase title="Flight Controls">
        <p class="vue-ui-hint">
            W/S — speed &nbsp; A/D — roll &nbsp; Shift — boost<br />
            C — view &nbsp; Mouse steers &nbsp; Hold space — warp &nbsp; Esc — exit<br />
            Tab/Shift+Tab — lock target &nbsp; Hold S — chase (Shift — boost)
        </p>

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
            v-if="simStore.inFlight"
            class="old-ui btn-with-icon mb-3"
            @click="requestExitFlightMode()"
        >
            <span class="material-symbols-outlined">logout</span>
            EXIT FLIGHT MODE
        </button>

        <div class="vue-ui-card-header">Interface</div>

        <label
            class="checkbox-row"
            title="Closes this panel when you enter a ship and re-opens it when you leave flight mode."
        >
            <input
                type="checkbox"
                :checked="simStore.hidePanelManagerInFlight"
                @change="onHidePanelInFlightChange"
            />
            Hide Menu In Flight Mode
        </label>

        <label
            class="checkbox-row"
            title="While a target is locked (Tab), holding S pursues it instead of braking. Shift+S pursues at boost speed."
        >
            <input
                type="checkbox"
                :checked="simStore.chaseModeEnabled"
                @change="onChaseModeChange"
            />
            Chase Mode (Hold S)
        </label>
    </PanelBase>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { SHIP_TYPES } from '../../bodies/ships/ship-registry';
import {
    requestExitFlightMode,
    requestSpawnShip,
    setChaseModeEnabled,
    setHidePanelManagerInFlight,
    setSelectedShipTypeId,
    simStore,
} from '../sim-bridge';

import PanelBase from './PanelBase.vue';

const canReenter = computed(
    () => simStore.hasKnownShip && simStore.knownShipTypeId === simStore.selectedShipTypeId
);

const spawnIcon = computed(() => (canReenter.value ? 'login' : 'rocket_launch'));
const spawnLabel = computed(() => (canReenter.value ? 'ENTER SHIP' : 'SPAWN SPACESHIP'));

function onHidePanelInFlightChange(e: Event): void {
    setHidePanelManagerInFlight((e.target as HTMLInputElement).checked);
}

function onChaseModeChange(e: Event): void {
    setChaseModeEnabled((e.target as HTMLInputElement).checked);
}
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
