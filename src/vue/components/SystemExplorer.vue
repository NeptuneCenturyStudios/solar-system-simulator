<template>
    <section class="vue-ui-panel vue-ui-explorer">
        <header class="vue-ui-card-header">
            <span>System Explorer</span>
        </header>

        <div class="btn-row" style="grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr">
            <button
                class="old-ui btn-icon-only"
                :class="{ active: simStore.isTargetMode }"
                :title="simStore.isTargetMode ? 'Target (On)' : 'Target (Off)'"
                @click="toggleTargetMode()"
            >
                <span class="material-symbols-outlined">{{
                    simStore.isTargetMode ? 'my_location' : 'location_searching'
                }}</span>
            </button>
            <button
                class="old-ui btn-icon-only"
                :class="{ active: simStore.isLookAtMode }"
                :title="simStore.isLookAtMode ? 'Look At (On)' : 'Look At (Off)'"
                @click="toggleLookAtMode()"
            >
                <span class="material-symbols-outlined">{{
                    simStore.isLookAtMode ? 'visibility' : 'visibility_off'
                }}</span>
            </button>
            <button
                class="old-ui btn-icon-only"
                :class="{ active: simStore.isFreeCameraMode }"
                :title="simStore.isFreeCameraMode ? 'Free Camera (On)' : 'Free Camera (Off)'"
                @click="toggleFreeCameraMode()"
            >
                <span class="material-symbols-outlined">{{
                    simStore.isFreeCameraMode ? 'close_fullscreen' : 'videogame_asset'
                }}</span>
            </button>
            <button
                class="old-ui btn-icon-only"
                :class="{ active: simStore.surfaceActive }"
                :title="simStore.surfaceActive ? 'Surface (On)' : 'Surface (Off)'"
                :disabled="!simStore.surfaceEnabled"
                @click="toggleSurfaceCamera()"
            >
                <span class="material-symbols-outlined">{{
                    simStore.surfaceActive ? 'directions_walk' : 'hiking'
                }}</span>
            </button>
            <button class="old-ui btn-icon-only" title="Zoom In" @click="zoomCameraIn()">
                <span class="material-symbols-outlined">zoom_in</span>
            </button>
            <button class="old-ui btn-icon-only" title="Zoom Out" @click="zoomCameraOut()">
                <span class="material-symbols-outlined">zoom_out</span>
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
            placeholder="Search bodies…"
            aria-label="Search bodies"
        />

        <hr class="vue-ui-hr" />

        <div class="vue-ui-body-list" role="listbox" aria-label="Celestial bodies">
            <p v-if="filteredBodies.length === 0" class="vue-ui-empty">
                No bodies yet — launch a system first.
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
                <div class="d-flex w-100">
                    <span class="vue-ui-body-name" :title="body.name">{{ body.name }}</span>
                    <span class="vue-ui-body-type">{{ body.typeLabel }}</span>
                </div>

                <div class="vue-ui-body-bottom-row w-100">
                    <span class="vue-ui-body-stats">
                        <span>M {{ formatNumber(body.mass) }}</span>
                        <span>R {{ formatNumber(body.radius) }}</span>
                        <span>v {{ formatNumber(body.speed) }}</span>
                    </span>
                    <span class="ml-auto">
                        <button
                            class="icon-button"
                            title="Edit"
                            @click.stop="openBodyEditor('edit', body.id)"
                        >
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <button
                            v-if="body.isShip"
                            class="icon-button"
                            title="Enter ship"
                            @click.stop="enterShipById(body.id)"
                        >
                            <span class="material-symbols-outlined">login</span>
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
                            <span class="material-symbols-outlined">{{
                                body.id === simStore.autopilotTargetId ? 'close' : 'flight'
                            }}</span>
                        </button>
                    </span>
                </div>
            </div>
        </div>

        <div>
            <button
                class="old-ui btn-with-icon mb-3"
                type="button"
                @click="openBodyEditor('add', null)"
            >
                <span class="material-symbols-outlined">add</span>
                ADD BODY
            </button>

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

            <div class="footer-note">© {{ new Date().getFullYear() }} Neptune Century</div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import {
    enterShipById,
    flyToBody,
    formatNumber,
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
import { openBodyEditor } from '../ui-store';

const searchQuery = ref('');

const filteredBodies = computed<BodySnapshot[]>(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return simStore.bodies;
    return simStore.bodies.filter(
        (b) => b.name.toLowerCase().includes(q) || b.typeLabel.toLowerCase().includes(q)
    );
});

const hasShip = computed(() => simStore.bodies.some((b) => b.isShip));

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
</style>
