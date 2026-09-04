<template>
    <PanelBase :title="isEditMode ? 'Edit Object' : 'Add Object'">
        <div class="vue-ui-body-editor-fields">
            <!-- ══════════════════════════ ADD MODE ══════════════════════════ -->
            <template v-if="!isEditMode">
                <div class="control-group">
                    <label for="vueAddModeSelect">Add Mode</label>
                    <select id="vueAddModeSelect" v-model="addMode">
                        <option value="preset">Preset</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>

                <div v-if="addMode === 'preset'" class="control-group">
                    <label for="vuePresetBodySelect">Presets</label>
                    <select id="vuePresetBodySelect" v-model="presetKey">
                        <option v-for="p in PRESET_BODIES" :key="p.value" :value="p.value">
                            {{ p.label }}
                        </option>
                    </select>
                </div>

                <template v-else>
                    <div class="control-group">
                        <label for="vueBodyTypeSelect">Body Type</label>
                        <select
                            id="vueBodyTypeSelect"
                            v-model="bodyType"
                            @change="applyRandomDefaults"
                        >
                            <option value="sun">Star</option>
                            <option value="planet">Planet</option>
                            <option value="moon">Moon</option>
                            <option value="asteroid">Asteroid</option>
                            <option value="comet">Comet</option>
                            <option value="black_hole">Black Hole</option>
                            <option value="wormhole">Wormhole</option>
                        </select>
                    </div>

                    <div v-if="showMass" class="control-group">
                        <label
                            >Mass <span class="val-display">{{ formatNumber(mass) }}</span></label
                        >
                        <input
                            v-model.number="mass"
                            type="number"
                            class="text-input"
                            min="0.001"
                            step="any"
                        />
                    </div>

                    <div v-if="bodyType === 'sun'" class="control-group">
                        <label
                            >Temperature
                            <span class="val-display">{{ Math.round(temperature) }}K</span></label
                        >
                        <input
                            v-model.number="temperature"
                            type="range"
                            min="2000"
                            max="30000"
                            step="100"
                        />
                    </div>

                    <div v-if="bodyType === 'sun'" class="control-group">
                        <label
                            >Light Intensity
                            <span class="val-display">{{
                                formatNumber(lightIntensity)
                            }}</span></label
                        >
                        <input
                            v-model.number="lightIntensity"
                            type="range"
                            min="1000"
                            max="15000"
                            step="100"
                        />
                    </div>

                    <div v-if="showRadius" class="control-group">
                        <label
                            >Size (Radius)
                            <span class="val-display">{{ formatNumber(radius) }}</span></label
                        >
                        <input
                            v-model.number="radius"
                            type="number"
                            class="text-input"
                            min="0.01"
                            step="1"
                        />
                    </div>

                    <div v-if="showOrbitControls" class="control-group">
                        <label
                            >Orbit Parent
                            <span class="val-display">{{ orbitParentName }}</span></label
                        >
                    </div>

                    <div v-if="showOrbitControls" class="radio-group">
                        <label>Orbit Type</label>
                        <div class="radio-options">
                            <div class="radio-option">
                                <input
                                    id="vueOrbitCircular"
                                    v-model="orbitType"
                                    type="radio"
                                    value="circular"
                                />
                                <label for="vueOrbitCircular">Circular</label>
                            </div>
                            <div class="radio-option">
                                <input
                                    id="vueOrbitElliptical"
                                    v-model="orbitType"
                                    type="radio"
                                    value="elliptical"
                                />
                                <label for="vueOrbitElliptical">Elliptical</label>
                            </div>
                        </div>
                    </div>

                    <div v-if="showOrbitControls" class="control-group">
                        <label
                            >Inclination <span class="val-display">{{ inclination }}°</span></label
                        >
                        <input
                            v-model.number="inclination"
                            type="range"
                            min="0"
                            max="90"
                            step="1"
                        />
                    </div>

                    <div v-if="showTilt" class="control-group">
                        <label
                            >Axial Tilt <span class="val-display">{{ tilt }}°</span></label
                        >
                        <input v-model.number="tilt" type="range" min="-180" max="180" step="1" />
                    </div>

                    <div v-if="showTilt" class="control-group">
                        <label
                            >Tilt Azimuth <span class="val-display">{{ azimuth }}°</span></label
                        >
                        <input
                            v-model.number="azimuth"
                            type="range"
                            min="-180"
                            max="180"
                            step="1"
                        />
                    </div>

                    <div v-if="bodyType === 'planet'" class="control-group">
                        <label for="vuePlanetTypeSelect">Planet Type</label>
                        <select
                            id="vuePlanetTypeSelect"
                            v-model="planetType"
                            @change="applyRandomDefaults"
                        >
                            <option value="solid">Solid</option>
                            <option value="gas_giant">Gas Giant</option>
                            <option value="ice_giant">Ice Giant</option>
                            <option value="temperate">Temperate</option>
                            <option value="volcanic">Volcanic</option>
                            <option value="frozen">Frozen</option>
                            <option value="ocean">Ocean</option>
                            <option value="desert">Desert</option>
                        </select>
                    </div>

                    <div v-if="bodyType === 'moon'" class="control-group">
                        <label for="vueMoonTypeSelect">Moon Type</label>
                        <select
                            id="vueMoonTypeSelect"
                            v-model="moonType"
                            @change="applyRandomDefaults"
                        >
                            <option value="solid">Solid</option>
                            <option value="temperate">Temperate</option>
                            <option value="volcanic">Volcanic</option>
                            <option value="ocean">Ocean</option>
                            <option value="frozen">Frozen</option>
                            <option value="desert">Desert</option>
                        </select>
                    </div>

                    <label v-if="canHaveAtmosphere" class="checkbox-row">
                        <input v-model="hasAtmosphere" type="checkbox" /> Has Atmosphere
                    </label>

                    <label v-if="bodyType === 'planet'" class="checkbox-row">
                        <input v-model="hasRings" type="checkbox" /> Has Rings
                    </label>

                    <p
                        v-if="bodyType === 'moon' && !canCreateMoon"
                        class="validation-message visible"
                    >
                        Please select a body first to create a moon
                    </p>

                    <div v-if="bodyType === 'comet'" class="control-group">
                        <label for="vueAddTailColor">Tail Color</label>
                        <input id="vueAddTailColor" v-model="addTailColor" type="color" />
                    </div>

                    <div class="d-flex gap-3 mb-3">
                        <button
                            class="old-ui btn-with-icon"
                            type="button"
                            @click="applyRandomDefaults"
                        >
                            <span class="material-symbols-outlined">shuffle</span>
                            RANDOMIZE
                        </button>
                    </div>
                </template>

                <div class="button-group">
                    <button
                        class="old-ui btn-with-icon"
                        type="button"
                        :disabled="!canCreate"
                        @click="onCreate"
                    >
                        <span class="material-symbols-outlined">check</span>
                        CREATE
                    </button>
                    <button class="old-ui btn-with-icon btn-danger" type="button" @click="onClose">
                        <span class="material-symbols-outlined">cancel</span>
                        CLOSE
                    </button>
                </div>
            </template>

            <!-- ══════════════════════════ EDIT MODE ══════════════════════════ -->
            <template v-else>
                <p v-if="!snapshot" class="vue-ui-empty">No body selected.</p>
                <template v-else>
                    <div class="control-group">
                        <label>Name</label>
                        <input
                            v-model="editName"
                            type="text"
                            class="text-input"
                            placeholder="Body name"
                        />
                    </div>

                    <div v-if="snapshot.isAsteroid || snapshot.isComet" class="control-group">
                        <label>Color</label>
                        <input v-model="editColor" type="color" />
                    </div>

                    <div v-if="snapshot.isComet" class="control-group">
                        <label>Tail Color</label>
                        <input v-model="editTailColor" type="color" />
                    </div>

                    <div class="control-group">
                        <label
                            >Mass
                            <span class="val-display">{{ formatNumber(editMass) }}</span></label
                        >
                        <input
                            v-model.number="editMass"
                            type="number"
                            class="text-input"
                            min="0.001"
                            step="any"
                        />
                    </div>

                    <div v-if="snapshot.isStar" class="control-group">
                        <label
                            >Temperature
                            <span class="val-display"
                                >{{ Math.round(editTemperature) }}K</span
                            ></label
                        >
                        <input
                            v-model.number="editTemperature"
                            type="range"
                            min="2000"
                            max="30000"
                            step="100"
                        />
                    </div>

                    <div v-if="snapshot.isStar" class="control-group">
                        <label
                            >Light Intensity
                            <span class="val-display">{{
                                formatNumber(editLightIntensity)
                            }}</span></label
                        >
                        <input
                            v-model.number="editLightIntensity"
                            type="range"
                            min="1000"
                            max="15000"
                            step="100"
                        />
                    </div>

                    <div class="control-group">
                        <label
                            >Size (Radius)
                            <span class="val-display">{{ formatNumber(editRadius) }}</span></label
                        >
                        <input
                            v-model.number="editRadius"
                            type="number"
                            class="text-input"
                            min="0.01"
                            step="1"
                        />
                    </div>

                    <div class="control-group">
                        <label
                            >Velocity
                            <span class="val-display">{{ editVelocity.toFixed(1) }}</span></label
                        >
                        <input
                            v-model.number="editVelocity"
                            class="text-input"
                            type="number"
                            min="0"
                        />
                    </div>

                    <div class="control-group">
                        <label
                            >Orbital Angle
                            <span class="val-display">{{ editOrbitalAngle }}°</span></label
                        >
                        <input
                            v-model.number="editOrbitalAngle"
                            type="range"
                            min="0"
                            max="360"
                            step="1"
                        />
                    </div>

                    <div class="control-group">
                        <label
                            >Inclination
                            <span class="val-display">{{ editInclination }}°</span></label
                        >
                        <input
                            v-model.number="editInclination"
                            type="range"
                            min="0"
                            max="90"
                            step="1"
                        />
                    </div>

                    <div v-if="snapshot.hasTilt" class="control-group">
                        <label
                            >Axial Tilt <span class="val-display">{{ editTilt }}°</span></label
                        >
                        <input
                            v-model.number="editTilt"
                            type="range"
                            min="-180"
                            max="180"
                            step="1"
                        />
                    </div>

                    <div v-if="snapshot.hasTilt" class="control-group">
                        <label
                            >Tilt Azimuth <span class="val-display">{{ editAzimuth }}°</span></label
                        >
                        <input
                            v-model.number="editAzimuth"
                            type="range"
                            min="-180"
                            max="180"
                            step="1"
                        />
                    </div>

                    <div class="button-group">
                        <button class="old-ui btn-with-icon" type="button" @click="onApply">
                            <span class="material-symbols-outlined">save</span>
                            APPLY
                        </button>
                        <button
                            class="old-ui btn-with-icon btn-danger"
                            type="button"
                            @click="onDelete"
                        >
                            <span class="material-symbols-outlined">delete</span>
                            DELETE
                        </button>
                        <button
                            class="old-ui btn-with-icon btn-danger"
                            type="button"
                            @click="onClose"
                        >
                            <span class="material-symbols-outlined">cancel</span>
                            CLOSE
                        </button>
                    </div>

                    <div class="button-group">
                        <button
                            class="old-ui btn-with-icon mb-3"
                            type="button"
                            @click="openBodyEditor('add', null)"
                        >
                            <span class="material-symbols-outlined">add</span>
                            ADD NEW
                        </button>
                    </div>
                </template>
            </template>
        </div>
    </PanelBase>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { COMET_TAIL_COLOR_PALETTE } from '../../utilities/consts';
import { closeBodyEditor, openBodyEditor, vueUiState } from '../ui-store';
import {
    applyBodyEdit,
    bodyEditorStore,
    clearBodyEditSnapshot,
    createCustomBody,
    createPresetBodyByKey,
    deleteBodyById,
    formatNumber,
    getRandomizedCreateDefaults,
    loadBodyEditSnapshot,
    resolveOrbitParentId,
    simStore,
} from '../sim-bridge';
import type { ApplyBodyEditPayload, CreateBodyPayload } from '../sim-bridge';
import PanelBase from './PanelBase.vue';

const PRESET_BODIES = [
    { value: 'sun', label: 'Sun' },
    { value: 'mercury', label: 'Mercury' },
    { value: 'venus', label: 'Venus' },
    { value: 'earth', label: 'Earth' },
    { value: 'earth_moon', label: 'Moon (Earth)' },
    { value: 'mars', label: 'Mars' },
    { value: 'jupiter', label: 'Jupiter' },
    { value: 'saturn', label: 'Saturn' },
    { value: 'uranus', label: 'Uranus' },
    { value: 'neptune', label: 'Neptune' },
    { value: 'pluto', label: 'Pluto' },
];

const isEditMode = computed(() => vueUiState.bodyEditor?.mode === 'edit');
const snapshot = computed(() => bodyEditorStore.snapshot);

// ── Add-mode form state ───────────────────────────────────────────────────
const addMode = ref<'preset' | 'custom'>('preset');
const addTailColor = ref('#7ab8ff');
const presetKey = ref('sun');
const bodyType = ref('sun');
const planetType = ref('solid');
const moonType = ref('solid');
const orbitType = ref<'circular' | 'elliptical'>('circular');
const inclination = ref(0);
const hasAtmosphere = ref(false);
const hasRings = ref(false);
const mass = ref(0);
const radius = ref(0);
const temperature = ref(5778);
const lightIntensity = ref(15000);
const tilt = ref(0);
const azimuth = ref(0);

const showMassRadius = computed(
    () =>
        bodyType.value === 'sun' ||
        bodyType.value === 'planet' ||
        bodyType.value === 'moon' ||
        bodyType.value === 'black_hole'
);
const showMass = computed(() => showMassRadius.value);
const showRadius = computed(() => showMassRadius.value || bodyType.value === 'wormhole');
const showOrbitControls = computed(
    () => bodyType.value !== 'black_hole' && bodyType.value !== 'wormhole'
);
const showTilt = computed(
    () =>
        bodyType.value === 'sun' ||
        bodyType.value === 'planet' ||
        bodyType.value === 'moon' ||
        bodyType.value === 'wormhole'
);
const canHaveAtmosphere = computed(() => {
    if (bodyType.value === 'planet') {
        return ['solid', 'volcanic', 'ocean', 'frozen', 'desert'].includes(planetType.value);
    }
    if (bodyType.value === 'moon') {
        return moonType.value !== 'temperate';
    }
    return false;
});
const orbitParentName = computed(() => {
    const body = simStore.bodies.find((b) => b.id === simStore.selectedId);
    return body ? body.name : 'None';
});
const canCreateMoon = computed(
    () => bodyType.value !== 'moon' || !!resolveOrbitParentId(simStore.selectedId)
);
const canCreate = computed(() => addMode.value === 'preset' || canCreateMoon.value);

// Hidden fields shouldn't silently keep a stale "on" value (mirrors the old panel forcing
// these off when their row is hidden).
watch(canHaveAtmosphere, (val) => {
    if (!val) hasAtmosphere.value = false;
});
watch(
    () => bodyType.value === 'planet',
    (isPlanet) => {
        if (!isPlanet) hasRings.value = false;
    }
);

function resetAddForm(): void {
    addMode.value = 'preset';
    addTailColor.value = '#7ab8ff';
    presetKey.value = 'sun';
    bodyType.value = 'sun';
    planetType.value = 'solid';
    moonType.value = 'solid';
    orbitType.value = 'circular';
    inclination.value = 0;
    hasAtmosphere.value = false;
    hasRings.value = false;
    tilt.value = 0;
    azimuth.value = 0;
}

function applyRandomDefaults(): void {
    const defaults = getRandomizedCreateDefaults(bodyType.value);
    if (!defaults) return;
    if (defaults.mass !== null) mass.value = defaults.mass;
    if (defaults.radius !== null) radius.value = defaults.radius;
    if (defaults.temperature !== null) temperature.value = defaults.temperature;
    if (defaults.lightIntensity !== null) lightIntensity.value = defaults.lightIntensity;
    if (defaults.tilt !== null) tilt.value = defaults.tilt;
    if (defaults.azimuth !== null) azimuth.value = defaults.azimuth;
    if (defaults.inclination !== null) inclination.value = defaults.inclination;
    hasAtmosphere.value = defaults.hasAtmosphere;
    hasRings.value = defaults.hasRings;
    if (defaults.planetType) planetType.value = defaults.planetType;
    if (defaults.moonType) moonType.value = defaults.moonType;

    // Comets get a randomized tail color from the shared procedural palette.
    if (bodyType.value === 'comet') {
        addTailColor.value = randomCometTailColorHex();
    }
}

/** Picks a random comet-tail color from the shared procedural palette, as a hex string. */
function randomCometTailColorHex(): string {
    const color =
        COMET_TAIL_COLOR_PALETTE[Math.floor(Math.random() * COMET_TAIL_COLOR_PALETTE.length)];
    return '#' + color.toString(16).padStart(6, '0');
}

// ── Edit-mode form state ──────────────────────────────────────────────────
const editName = ref('');
const editColor = ref('#ffffff');
const editTailColor = ref('#7ab8ff');
const editMass = ref(0);
const editRadius = ref(0);
const editTemperature = ref(5778);
const editLightIntensity = ref(15000);
const editVelocity = ref(0);
const editOrbitalAngle = ref(0);
const editInclination = ref(0);
const editTilt = ref(0);
const editAzimuth = ref(0);

function syncEditFormFromSnapshot(): void {
    const snap = bodyEditorStore.snapshot;
    if (!snap) return;
    editName.value = snap.name;
    editColor.value = snap.colorHex ?? '#ffffff';
    editTailColor.value = snap.tailColorHex ?? '#7ab8ff';
    editMass.value = snap.mass;
    editRadius.value = snap.radius;
    editTemperature.value = snap.temperature ?? 5778;
    editLightIntensity.value = snap.lightIntensity ?? 15000;
    editVelocity.value = snap.velocity;
    editOrbitalAngle.value = Math.round(snap.orbitalAngle);
    editInclination.value = Math.round(snap.inclination);
    editTilt.value = Math.round(snap.tilt);
    editAzimuth.value = Math.round(snap.azimuth);
}

watch(() => bodyEditorStore.snapshot, syncEditFormFromSnapshot);

// Drives mode switches within the same mounted instance (edit -> edit on a new id after
// Create, or a fresh Add open triggered by the System Explorer buttons). Syncs the edit form
// synchronously here too — `loadBodyEditSnapshot` mutates `bodyEditorStore.snapshot` inside this
// same immediate callback, and the snapshot watcher above only picks that up on the next tick.
watch(
    () => vueUiState.bodyEditor,
    (val) => {
        if (!val) return;
        if (val.mode === 'edit' && val.bodyId) {
            loadBodyEditSnapshot(val.bodyId);
            syncEditFormFromSnapshot();
        } else {
            clearBodyEditSnapshot();
            resetAddForm();
            applyRandomDefaults();
        }
    },
    { immediate: true }
);

function onCreate(): void {
    let newId: string | null;

    if (addMode.value === 'preset') {
        newId = createPresetBodyByKey(presetKey.value);
    } else {
        if (bodyType.value === 'moon' && !canCreateMoon.value) return;
        const hidesMass =
            bodyType.value === 'asteroid' ||
            bodyType.value === 'comet' ||
            bodyType.value === 'wormhole';
        const hidesRadius = bodyType.value === 'asteroid' || bodyType.value === 'comet';
        const payload: CreateBodyPayload = {
            bodyType: bodyType.value,
            planetType: bodyType.value === 'moon' ? moonType.value : planetType.value,
            orbitType: orbitType.value,
            inclination: inclination.value,
            hasAtmosphere: hasAtmosphere.value,
            hasRings: hasRings.value,
            customMass: hidesMass ? null : mass.value,
            customTemperature: bodyType.value === 'sun' ? temperature.value : null,
            customLightIntensity: bodyType.value === 'sun' ? lightIntensity.value : null,
            customRadius: hidesRadius ? null : radius.value,
            orbitParentId: resolveOrbitParentId(simStore.selectedId),
            createTilt: showTilt.value ? tilt.value : null,
            createAzimuth: showTilt.value ? azimuth.value : null,
            tailColor: bodyType.value === 'comet' ? addTailColor.value : null,
        };
        newId = createCustomBody(payload);
    }

    if (newId) {
        openBodyEditor('edit', newId);
    }
}

function onApply(): void {
    const bodyId = vueUiState.bodyEditor?.bodyId;
    const snap = bodyEditorStore.snapshot;
    if (!bodyId || !snap) return;

    const payload: ApplyBodyEditPayload = {
        name: editName.value,
        mass: editMass.value,
        temperature: snap.isStar ? editTemperature.value : null,
        lightIntensity: snap.isStar ? editLightIntensity.value : null,
        radius: editRadius.value,
        velocity: editVelocity.value,
        orbitalAngle: editOrbitalAngle.value,
        inclination: editInclination.value,
        color: snap.isAsteroid || snap.isComet ? editColor.value : null,
        tailColor: snap.isComet ? editTailColor.value : null,
        isStarBody: snap.isStar,
        editTilt: snap.hasTilt ? editTilt.value : null,
        editAzimuth: snap.hasTilt ? editAzimuth.value : null,
    };

    applyBodyEdit(bodyId, payload);
    loadBodyEditSnapshot(bodyId);
}

function onDelete(): void {
    const bodyId = vueUiState.bodyEditor?.bodyId;
    if (!bodyId) return;
    deleteBodyById(bodyId);
    clearBodyEditSnapshot();
    closeBodyEditor();
}

function onClose(): void {
    clearBodyEditSnapshot();
    closeBodyEditor();
}
</script>

<style scoped>
.vue-ui-body-editor {
    flex: 1;
    min-height: 0;
}

.vue-ui-body-editor-fields {
    flex: 1;
    min-height: 0;
    overflow: auto;
    min-width: 0;
}
</style>
