<template>
    <PanelBase :title="isEditMode ? 'Edit Object' : 'Add Object'">
        <div class="vue-ui-body-editor-fields">
            <p v-if="isEditMode && !snapshot" class="vue-ui-empty">No body selected.</p>

            <template v-else>
                <!-- ── Preset / custom (add only) ── -->
                <div v-if="!isEditMode" class="control-group">
                    <label for="bodyEditorAddMode">Add Mode</label>
                    <select id="bodyEditorAddMode" v-model="addMode">
                        <option :value="AddBodyModeEnum.Preset">Preset</option>
                        <option :value="AddBodyModeEnum.Custom">Custom</option>
                    </select>
                </div>

                <div v-if="isPresetMode" class="control-group">
                    <label for="bodyEditorPreset">Preset</label>
                    <select id="bodyEditorPreset" v-model="presetKey">
                        <optgroup v-for="g in PRESET_BODY_GROUPS" :key="g.label" :label="g.label">
                            <option v-for="p in g.options" :key="p.value" :value="p.value">
                                {{ p.label }}
                            </option>
                        </optgroup>
                    </select>
                </div>

                <template v-else>
                    <!-- ── Type pickers: drive which fields exist ── -->
                    <div class="control-group">
                        <label for="bodyEditorBodyType">Body Type</label>
                        <select
                            v-if="!isEditMode"
                            id="bodyEditorBodyType"
                            v-model="form.bodyType"
                            @change="onBodyTypeChanged"
                        >
                            <option value="" disabled>&lt; Select &gt;</option>
                            <option v-for="t in BODY_TYPE_OPTIONS" :key="t.value" :value="t.value">
                                {{ t.label }}
                            </option>
                        </select>
                        <select v-else id="bodyEditorBodyType" disabled>
                            <option>{{ snapshot?.typeLabel }}</option>
                        </select>
                    </div>

                    <div v-if="showSubtypePicker" class="control-group">
                        <label for="bodyEditorSubtype">{{ subtypePickerLabel }}</label>
                        <select
                            v-if="!isEditMode"
                            id="bodyEditorSubtype"
                            v-model="form.subtype"
                            @change="onSubtypeChanged"
                        >
                            <option value="" disabled>&lt; Select &gt;</option>
                            <option v-for="t in subtypeOptions" :key="t.value" :value="t.value">
                                {{ t.label }}
                            </option>
                        </select>
                        <select v-else id="bodyEditorSubtype" disabled>
                            <option>{{ subtypeLabel(form.subtype) }}</option>
                        </select>
                    </div>

                    <!-- ── Field groups, once the type is settled ── -->
                    <template v-if="view.fieldsReady">
                        <div v-if="!isEditMode" class="body-editor-randomize">
                            <button class="old-ui btn-with-icon" type="button" @click="randomize">
                                <svg-icon type="mdi" :path="mdiShuffleVariant"></svg-icon>
                                RANDOMIZE
                            </button>
                        </div>

                        <BasicInfoSection v-model:open="sectionOpen.basic" />
                        <OrbitSection
                            v-if="view.showOrbitFields || view.showTilt"
                            v-model:open="sectionOpen.orbit"
                            @parent-changed="onOrbitParentChanged"
                        />
                        <AtmosphereSection
                            v-if="view.showAtmosphereSection"
                            v-model:open="sectionOpen.atmosphere"
                        />
                        <MagneticFieldSection
                            v-if="view.showMagneticSection"
                            v-model:open="sectionOpen.magnetic"
                        />

                        <p v-if="view.validationMessage" class="validation-message visible">
                            {{ view.validationMessage }}
                        </p>
                    </template>
                </template>

                <!-- ── Actions ── -->
                <div v-if="!isEditMode" class="button-group">
                    <button
                        class="old-ui btn-with-icon"
                        type="button"
                        :disabled="!canCreate"
                        @click="onCreate"
                    >
                        <svg-icon type="mdi" :path="mdiCheck"></svg-icon>
                        CREATE
                    </button>
                    <button class="old-ui btn-with-icon btn-danger" type="button" @click="onClose">
                        <svg-icon type="mdi" :path="mdiCloseCircleOutline"></svg-icon>
                        CLOSE
                    </button>
                </div>

                <template v-else>
                    <div class="button-group">
                        <button
                            class="old-ui btn-with-icon"
                            type="button"
                            :disabled="editLocked"
                            @click="onApply"
                        >
                            <svg-icon type="mdi" :path="mdiContentSaveOutline"></svg-icon>
                            APPLY
                        </button>
                        <button
                            class="old-ui btn-with-icon btn-danger"
                            type="button"
                            :disabled="deleteLocked"
                            @click="onDelete"
                        >
                            <svg-icon type="mdi" :path="mdiDeleteOutline"></svg-icon>
                            DELETE
                        </button>
                        <button
                            class="old-ui btn-with-icon btn-danger"
                            type="button"
                            @click="onClose"
                        >
                            <svg-icon type="mdi" :path="mdiCloseCircleOutline"></svg-icon>
                            CLOSE
                        </button>
                    </div>

                    <div class="button-group">
                        <button
                            class="old-ui btn-with-icon mb-3"
                            type="button"
                            :disabled="addLocked"
                            @click="openBodyEditor('add', null)"
                        >
                            <svg-icon type="mdi" :path="mdiPlus"></svg-icon>
                            ADD NEW
                        </button>
                    </div>
                </template>
            </template>
        </div>
    </PanelBase>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import SvgIcon from '@jamescoyle/vue-icon';
import {
    mdiCheck,
    mdiCloseCircleOutline,
    mdiContentSaveOutline,
    mdiDeleteOutline,
    mdiPlus,
    mdiShuffleVariant,
} from '@mdi/js';

import { ScenarioLock } from '../../interfaces';
import { BodyTypeKeyEnum, PresetBodyKeyEnum } from '../../bodies/body-enums';
import { closeBodyEditor, openBodyEditor, vueUiState } from '../ui-store';
import {
    applyBodyEdit,
    bodyEditorStore,
    clearBodyEditSnapshot,
    createCustomBody,
    createPresetBodyByKey,
    deleteBodyById,
    isActionLocked,
    loadBodyEditSnapshot,
    simStore,
} from '../sim-bridge';
import { useBodyEditorForm } from '../composables/useBodyEditorForm';
import PanelBase from './PanelBase.vue';
import AtmosphereSection from './body-editor/AtmosphereSection.vue';
import BasicInfoSection from './body-editor/BasicInfoSection.vue';
import MagneticFieldSection from './body-editor/MagneticFieldSection.vue';
import OrbitSection from './body-editor/OrbitSection.vue';
import {
    AddBodyModeEnum,
    BODY_TYPE_OPTIONS,
    MOON_TYPE_OPTIONS,
    PLANET_TYPE_OPTIONS,
    PRESET_BODY_GROUPS,
    subtypeLabel,
} from './body-editor/body-editor-options';

const isEditMode = computed(() => vueUiState.bodyEditor?.mode === 'edit');
const snapshot = computed(() => bodyEditorStore.snapshot);

const {
    form,
    view,
    resetForAdd,
    randomize,
    onBodyTypeChanged,
    onSubtypeChanged,
    onOrbitParentChanged,
    loadFromSnapshot,
    buildCreatePayload,
    buildApplyPayload,
} = useBodyEditorForm(() => isEditMode.value);

// ── Add-mode choices (kept across opens so repeated custom adds stay in Custom) ──
const addMode = ref<AddBodyModeEnum>(AddBodyModeEnum.Preset);
const presetKey = ref<PresetBodyKeyEnum>(PresetBodyKeyEnum.Sun);
const isPresetMode = computed(() => !isEditMode.value && addMode.value === AddBodyModeEnum.Preset);

/** Basic Info starts expanded, the detail groups collapsed; kept while the panel is open. */
const sectionOpen = reactive({ basic: true, orbit: false, atmosphere: false, magnetic: false });

// ── Type pickers ──────────────────────────────────────────────────────────
const showSubtypePicker = computed(() =>
    isEditMode.value ? !!snapshot.value?.subtypeKey : view.value.needsSubtype
);
const subtypePickerLabel = computed(() =>
    (isEditMode.value ? snapshot.value?.bodyTypeKey : form.bodyType) === BodyTypeKeyEnum.Moon
        ? 'Moon Type'
        : 'Planet Type'
);
const subtypeOptions = computed(() =>
    form.bodyType === BodyTypeKeyEnum.Moon ? MOON_TYPE_OPTIONS : PLANET_TYPE_OPTIONS
);

// ── Locks ─────────────────────────────────────────────────────────────────
const addLocked = computed(() => isActionLocked(ScenarioLock.AddBody));
const editLocked = computed(() => isActionLocked(ScenarioLock.EditBody));
const deleteLocked = computed(() => isActionLocked(ScenarioLock.DeleteBody));
const canCreate = computed(
    () =>
        !addLocked.value &&
        (isPresetMode.value || (view.value.fieldsReady && !view.value.validationMessage))
);

// ── Mode / snapshot sync ──────────────────────────────────────────────────
watch(
    () => bodyEditorStore.snapshot,
    (snap) => {
        if (isEditMode.value) loadFromSnapshot(snap);
    }
);

// Drives mode switches within the same mounted instance (edit -> edit on a new id after
// Create, or a fresh Add open triggered by the System Explorer buttons). Loads the edit form
// synchronously here too — `loadBodyEditSnapshot` mutates `bodyEditorStore.snapshot` inside
// this same immediate callback, and the snapshot watcher above only picks that up next tick.
watch(
    () => vueUiState.bodyEditor,
    (val) => {
        if (!val) return;
        if (val.mode === 'edit' && val.bodyId) {
            loadBodyEditSnapshot(val.bodyId);
            loadFromSnapshot(bodyEditorStore.snapshot);
        } else {
            clearBodyEditSnapshot();
            resetForAdd();
        }
    },
    { immediate: true }
);

// Close the editor when the body being edited is destroyed (collision, absorption, star death,
// a new system replacing this one...). The id must have been seen in the body list first: a
// body created a moment ago only shows up there on the bridge's next refresh.
let editedBodySeen = false;
watch(
    () => vueUiState.bodyEditor?.bodyId,
    () => {
        editedBodySeen = false;
    }
);
watch(
    () => simStore.bodies,
    (bodies) => {
        const bodyId = vueUiState.bodyEditor?.bodyId;
        if (!isEditMode.value || !bodyId) return;
        if (bodies.some((b) => b.id === bodyId)) {
            editedBodySeen = true;
        } else if (editedBodySeen) {
            onClose();
        }
    }
);

// ── Actions ───────────────────────────────────────────────────────────────
function onCreate(): void {
    if (!canCreate.value) return;
    let newId: string | null;
    if (isPresetMode.value) {
        newId = createPresetBodyByKey(presetKey.value);
    } else {
        const payload = buildCreatePayload();
        newId = payload ? createCustomBody(payload) : null;
    }
    if (newId) openBodyEditor('edit', newId);
}

function onApply(): void {
    const bodyId = vueUiState.bodyEditor?.bodyId;
    const snap = bodyEditorStore.snapshot;
    if (!bodyId || !snap) return;
    applyBodyEdit(bodyId, buildApplyPayload(snap));
    loadBodyEditSnapshot(bodyId);
}

function onDelete(): void {
    const bodyId = vueUiState.bodyEditor?.bodyId;
    if (!bodyId) return;
    deleteBodyById(bodyId);
    onClose();
}

function onClose(): void {
    clearBodyEditSnapshot();
    closeBodyEditor();
}
</script>

<style scoped>
.vue-ui-body-editor-fields {
    flex: 1;
    min-height: 0;
    overflow: auto;
    min-width: 0;
}

.body-editor-randomize {
    margin-bottom: var(--new-ui-gap-3);
}

.vue-ui-body-editor-fields :deep(.checkbox-row.is-disabled) {
    cursor: not-allowed;
    opacity: 0.6;
}
</style>
