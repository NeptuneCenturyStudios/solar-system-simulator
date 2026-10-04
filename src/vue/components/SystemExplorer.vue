<template>
    <PanelBase title="System Explorer">
        <div class="btn-row" style="grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr">
            <button
                class="old-ui btn-icon-only"
                :class="{ active: simStore.isTargetMode }"
                :title="simStore.isTargetMode ? 'Target (On)' : 'Target (Off)'"
                @click="toggleTargetMode()"
            >
                <svg-icon
                    type="mdi"
                    :path="simStore.isTargetMode ? mdiCrosshairsGps : mdiCrosshairs"
                ></svg-icon>
            </button>
            <button
                class="old-ui btn-icon-only"
                :class="{ active: simStore.isLookAtMode }"
                :title="simStore.isLookAtMode ? 'Look At (On)' : 'Look At (Off)'"
                @click="toggleLookAtMode()"
            >
                <svg-icon
                    type="mdi"
                    :path="simStore.isLookAtMode ? mdiEyeOutline : mdiEyeOffOutline"
                ></svg-icon>
            </button>
            <button
                class="old-ui btn-icon-only"
                :class="{ active: simStore.isFreeCameraMode }"
                :title="simStore.isFreeCameraMode ? 'Free Camera (On)' : 'Free Camera (Off)'"
                @click="toggleFreeCameraMode()"
            >
                <svg-icon
                    type="mdi"
                    :path="simStore.isFreeCameraMode ? mdiFullscreenExit : mdiGamepadVariantOutline"
                ></svg-icon>
            </button>
            <button
                class="old-ui btn-icon-only"
                :class="{ active: simStore.surfaceActive }"
                :title="simStore.surfaceActive ? 'Surface (On)' : 'Surface (Off)'"
                :disabled="!simStore.surfaceEnabled"
                @click="toggleSurfaceCamera()"
            >
                <svg-icon
                    type="mdi"
                    :path="simStore.surfaceActive ? mdiWalk : mdiHiking"
                ></svg-icon>
            </button>
            <button class="old-ui btn-icon-only" title="Zoom In" @click="zoomCameraIn()">
                <svg-icon type="mdi" :path="mdiMagnifyPlusOutline"></svg-icon>
            </button>
            <button class="old-ui btn-icon-only" title="Zoom Out" @click="zoomCameraOut()">
                <svg-icon type="mdi" :path="mdiMagnifyMinusOutline"></svg-icon>
            </button>
        </div>

        <label class="checkbox-row">
            <input
                type="checkbox"
                :checked="simStore.lockToSun"
                @change="setLockToSun(($event.target as HTMLInputElement).checked)"
            />
            Lock Camera to Sun
        </label>

        <input
            v-model="searchQuery"
            type="search"
            class="vue-ui-input"
            placeholder="Search objects…"
            aria-label="Search objects"
        />

        <hr class="vue-ui-hr" />

        <div class="vue-ui-body-list" role="listbox" aria-label="Celestial objects">
            <p v-if="filteredBodies.length === 0" class="vue-ui-empty">
                No objects - add a new object or launch a system.
            </p>
            <div
                v-for="body in filteredBodies"
                :key="body.id"
                class="vue-ui-body-row"
                :class="{ 'vue-ui-body-row-selected': body.id === simStore.selectedId }"
                role="option"
                tabindex="0"
                :aria-selected="body.id === simStore.selectedId"
                @click="onSelect(body)"
                @keydown.enter="onSelect(body)"
            >
                <div class="d-flex w-100 vue-ui-body-name-row">
                    <span class="vue-ui-body-name" :title="body.name">{{ body.name }}</span>
                    <!-- Object-data (info) button — shown for every scannable body, which is
                         exactly the probe-mission target set: ships, satellites, and probes
                         cannot be scanned and get no button. -->
                    <button
                        v-if="body.isProbeTarget"
                        class="icon-button vue-ui-body-info"
                        type="button"
                        title="Object data"
                        aria-label="Show object data"
                        @click.stop="openBodyAttributes(body.id)"
                    >
                        <svg-icon type="mdi" :path="mdiInformationOutline" :size="16"></svg-icon>
                    </button>
                    <span class="vue-ui-body-type">{{ body.typeLabel }}</span>
                </div>

                <div class="vue-ui-body-bottom-row w-100">
                    <span class="vue-ui-body-stats">
                        <span>M {{ formatMass(body.mass) }}</span>
                        <span>R {{ formatRadius(body.radius) }}</span>
                        <span>v {{ formatSpeed(body.speed) }}</span>
                    </span>
                    <span class="ml-auto">
                        <button
                            class="icon-button"
                            title="Edit"
                            :disabled="editLocked"
                            @click.stop="openBodyEditor('edit', body.id)"
                        >
                            <svg-icon type="mdi" :path="mdiPencilOutline" :size="16"></svg-icon>
                        </button>
                        <button
                            v-if="body.isShip"
                            class="icon-button"
                            title="Enter ship"
                            @click.stop="enterShipById(body.id)"
                        >
                            <svg-icon type="mdi" :path="mdiLogin" :size="16"></svg-icon>
                        </button>
                        <button
                            v-else-if="hasShip"
                            class="icon-button"
                            :class="{ active: body.id === simStore.autopilotTargetId }"
                            :title="
                                body.id === simStore.autopilotTargetId
                                    ? 'Cancel autopilot'
                                    : 'Fly to this body'
                            "
                            @click.stop="flyToBody(body.id)"
                        >
                            <svg-icon
                                type="mdi"
                                :path="
                                    body.id === simStore.autopilotTargetId ? mdiClose : mdiAirplane
                                "
                                :size="16"
                            ></svg-icon>
                        </button>
                    </span>
                </div>

                <!-- Probe scan status — for probes only; null for every other body type.
                     Mirrors the HUD name panel's scan line (see probe-scan-status.ts). -->
                <p v-if="body.scanStatusLabel" class="vue-ui-body-scan">
                    {{ body.scanStatusLabel }}
                </p>
            </div>
        </div>

        <div>
            <div class="btn-row" style="grid-template-columns: 1fr 1fr">
                <button
                    class="old-ui btn-with-icon mb-3"
                    type="button"
                    :disabled="addLocked"
                    @click="openBodyEditor('add', null)"
                >
                    <svg-icon type="mdi" :path="mdiPlus"></svg-icon>
                    ADD NEW OBJECT
                </button>

                <button class="old-ui btn-with-icon mb-3" type="button" @click="onLaunchProbe">
                    <svg-icon type="mdi" :path="mdiSatelliteVariant"></svg-icon>
                    LAUNCH PROBE
                </button>
            </div>

            <label class="checkbox-row">
                <input
                    type="checkbox"
                    :checked="simStore.showTrails"
                    @change="setShowTrails(($event.target as HTMLInputElement).checked)"
                />
                Show Orbit Trails
            </label>
            <label class="checkbox-row">
                <input
                    type="checkbox"
                    :checked="simStore.showOrbitPrediction"
                    @change="setShowOrbitPrediction(($event.target as HTMLInputElement).checked)"
                />
                Show Orbit Prediction
            </label>
            <label class="checkbox-row">
                <input
                    type="checkbox"
                    :checked="simStore.showNames"
                    @change="setShowNames(($event.target as HTMLInputElement).checked)"
                />
                Show Planet Names
                <span style="margin-left: 8px; color: #aaa" aria-hidden="true">(N)</span>
            </label>
        </div>
    </PanelBase>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { formatMass, formatRadius, formatSpeed } from '../../utilities/display-format';
import {
    enterShipById,
    flyToBody,
    isActionLocked,
    launchProbeMission,
    openBodyAttributes,
    selectBodyById,
    setLockToSun,
    setShowNames,
    setShowOrbitPrediction,
    setShowTrails,
    simStore,
    toggleFreeCameraMode,
    toggleLookAtMode,
    toggleSurfaceCamera,
    toggleTargetMode,
    zoomCameraIn,
    zoomCameraOut,
} from '../sim-bridge';
import type { BodySnapshot } from '../sim-bridge';
import { ScenarioLock } from '../../interfaces';
import { openBodyEditor } from '../ui-store';
import { showProbeMissionModal } from '../probe-mission-modal-service';
import SvgIcon from '@jamescoyle/vue-icon';
import {
    mdiAirplane,
    mdiClose,
    mdiCrosshairs,
    mdiCrosshairsGps,
    mdiEyeOffOutline,
    mdiEyeOutline,
    mdiFullscreenExit,
    mdiGamepadVariantOutline,
    mdiHiking,
    mdiInformationOutline,
    mdiLogin,
    mdiMagnifyMinusOutline,
    mdiMagnifyPlusOutline,
    mdiPencilOutline,
    mdiPlus,
    mdiSatelliteVariant,
    mdiWalk,
} from '@mdi/js';
import PanelBase from './PanelBase.vue';

const searchQuery = ref('');

const filteredBodies = computed<BodySnapshot[]>(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return simStore.bodies;
    return simStore.bodies.filter(
        (b) => b.name.toLowerCase().includes(q) || b.typeLabel.toLowerCase().includes(q)
    );
});

const hasShip = computed(() => simStore.bodies.some((b) => b.isShip));

const addLocked = computed(() => isActionLocked(ScenarioLock.AddBody));
const editLocked = computed(() => isActionLocked(ScenarioLock.EditBody));

async function onLaunchProbe(): Promise<void> {
    const result = await showProbeMissionModal();
    if (!result) return;
    launchProbeMission(result.targetId, result.altitudeKm);
}

function onSelect(body: BodySnapshot): void {
    selectBodyById(body.id);
}
</script>

<style scoped>
.vue-ui-explorer {
    flex: 1;
    min-height: 0;
}

.vue-ui-body-count {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.7rem;
}

.vue-ui-body-action {
    width: auto;
    height: auto;
    padding: 2px 6px;
    font-size: 0.8em;
    align-self: center;
}

/* Object-data icon sits immediately after the body name; the type label keeps its
   own margin-left:auto so it stays flush right. */
.vue-ui-body-name-row {
    align-items: center;
}

.vue-ui-body-info {
    flex: 0 0 auto;
    margin-left: 6px;
    padding: 0;
    line-height: 1;
}
</style>
