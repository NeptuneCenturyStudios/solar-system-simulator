<template>
    <PanelBase title="Flight Controls">
        <p class="vue-ui-hint">
            W/S — speed &nbsp; A/D — roll &nbsp; Shift — boost<br />
            C — view &nbsp; Mouse steers &nbsp; Hold space — warp &nbsp; Esc — exit<br />
            Tab/Shift+Tab — lock target &nbsp; Hold S — chase (Shift — boost)<br />
            G — cycle weapon &nbsp; LMB — fire
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
            <svg-icon type="mdi" :path="spawnIcon"></svg-icon>
            {{ spawnLabel }}
        </button>

        <button
            v-if="simStore.inFlight"
            class="old-ui btn-with-icon mb-3"
            @click="requestExitFlightMode()"
        >
            <svg-icon type="mdi" :path="mdiLogout"></svg-icon>
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

        <label
            class="checkbox-row"
            title="While a threat is inside the steering circle, shots lead it automatically — the locked target (Tab) first, otherwise the one nearest the reticle. The reticle itself does not move."
        >
            <input
                type="checkbox"
                :checked="simStore.targetAssistEnabled"
                @change="onTargetAssistChange"
            />
            Target Assist
        </label>

        <div class="vue-ui-card-header">Autopilot</div>

        <div class="control-group">
            <label
                for="vueAutopilotModeSelect"
                title="Classic: the original autopilot, bodies only. Ship AI: flies the ship through the same controls a pilot uses, and can also target ships. Applies from the next engagement."
                >Autopilot</label
            >
            <select
                id="vueAutopilotModeSelect"
                :value="simStore.autopilotMode"
                @change="onAutopilotModeChange"
            >
                <option value="classic">Classic</option>
                <option value="shipAi">Ship AI</option>
            </select>
        </div>

        <div class="control-group">
            <label
                for="vueAutopilotOrbitModeSelect"
                title="How the Ship AI autopilot holds position around planets, moons and stars. Natural: a gravity orbit. Artificial: a powered circle at the orbit distance below. Ships are always circled under power."
                >Orbit Around Bodies</label
            >
            <select
                id="vueAutopilotOrbitModeSelect"
                :value="simStore.autopilotOrbitMode"
                :disabled="isClassic"
                @change="onAutopilotOrbitModeChange"
            >
                <option value="natural">Natural</option>
                <option value="artificial">Artificial</option>
            </select>
        </div>

        <div class="control-group">
            <label
                for="vueAutopilotOrbitDistanceInput"
                :title="`Distance the Ship AI autopilot circles at, surface to hull: always for ship targets, and for artificial orbits around bodies (never closer than the body's safe altitude). ${ORBIT_DISTANCE_MIN_M}–${ORBIT_DISTANCE_MAX_M} m.`"
                >Orbit Distance (m)</label
            >
            <input
                id="vueAutopilotOrbitDistanceInput"
                type="number"
                class="text-input"
                :min="ORBIT_DISTANCE_MIN_M"
                :max="ORBIT_DISTANCE_MAX_M"
                step="100"
                :value="simStore.autopilotOrbitDistanceM"
                :disabled="isClassic"
                @change="onAutopilotOrbitDistanceChange"
            />
        </div>

        <div class="vue-ui-card-header">Handling</div>

        <label
            class="checkbox-row"
            title="While coasting, sideways drift turns to follow the ship's nose. Turn off for free inertial drift (needed to free-fall into an orbit)."
        >
            <input
                type="checkbox"
                :checked="simStore.coastDriftAlignEnabled"
                @change="onCoastDriftAlignChange"
            />
            Nose-Aligned Drift
        </label>
    </PanelBase>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { SHIP_TYPES } from '../../bodies/ships/ship-registry';
import {
    requestExitFlightMode,
    requestSpawnShip,
    setAutopilotMode,
    setAutopilotOrbitDistanceM,
    setAutopilotOrbitMode,
    setChaseModeEnabled,
    setCoastDriftAlignEnabled,
    setHidePanelManagerInFlight,
    setSelectedShipTypeId,
    setTargetAssistEnabled,
    simStore,
} from '../sim-bridge';
import SvgIcon from '@jamescoyle/vue-icon';
import { mdiLogin, mdiLogout, mdiRocketLaunchOutline } from '@mdi/js';

import PanelBase from './PanelBase.vue';
import {
    AI_AUTOPILOT_ORBIT_DISTANCE_MAX_M as ORBIT_DISTANCE_MAX_M,
    AI_AUTOPILOT_ORBIT_DISTANCE_MIN_M as ORBIT_DISTANCE_MIN_M,
} from '../../utilities/consts';
import { normalizeAutopilotMode, normalizeAutopilotOrbitMode } from '../../settings/settings-store';

const isClassic = computed(() => simStore.autopilotMode === 'classic');

const canReenter = computed(
    () => simStore.hasKnownShip && simStore.knownShipTypeId === simStore.selectedShipTypeId
);

const spawnIcon = computed(() => (canReenter.value ? mdiLogin : mdiRocketLaunchOutline));
const spawnLabel = computed(() => (canReenter.value ? 'ENTER SHIP' : 'SPAWN SPACESHIP'));

function onHidePanelInFlightChange(e: Event): void {
    setHidePanelManagerInFlight((e.target as HTMLInputElement).checked);
}

function onChaseModeChange(e: Event): void {
    setChaseModeEnabled((e.target as HTMLInputElement).checked);
}

function onCoastDriftAlignChange(e: Event): void {
    setCoastDriftAlignEnabled((e.target as HTMLInputElement).checked);
}

function onAutopilotModeChange(e: Event): void {
    setAutopilotMode(normalizeAutopilotMode((e.target as HTMLSelectElement).value));
}

function onAutopilotOrbitModeChange(e: Event): void {
    setAutopilotOrbitMode(normalizeAutopilotOrbitMode((e.target as HTMLSelectElement).value));
}

function onAutopilotOrbitDistanceChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    setAutopilotOrbitDistanceM(Number(input.value));
    // Show the clamped value back, even when it didn't change the store (e.g. typed 5 twice).
    input.value = String(simStore.autopilotOrbitDistanceM);
}

function onTargetAssistChange(e: Event): void {
    setTargetAssistEnabled((e.target as HTMLInputElement).checked);
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
