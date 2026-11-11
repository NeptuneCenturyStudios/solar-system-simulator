<template>
    <CollapsibleSection
        v-model:open="open"
        :title="view.showOrbitFields ? 'Orbital Elements' : 'Orientation'"
        :subtitle="view.showOrbitFields ? (view.orbitParentName ?? 'None') : null"
    >
        <template v-if="view.showOrbitFields">
            <div class="control-group">
                <label for="bodyEditorOrbitParent">Orbit Parent</label>
                <select
                    v-if="!view.isEdit"
                    id="bodyEditorOrbitParent"
                    :value="view.orbitParentId ?? ''"
                    :disabled="view.usesSystemBarycenter"
                    @change="onParentChange"
                >
                    <option v-if="!view.orbitParentId" value="">&lt; Select &gt;</option>
                    <option v-for="b in view.orbitParentOptions" :key="b.id" :value="b.id">
                        {{ b.name }} ({{ b.typeLabel }})
                    </option>
                </select>
                <select v-else id="bodyEditorOrbitParent" disabled>
                    <option>{{ view.orbitParentName ?? 'None' }}</option>
                </select>
            </div>

            <label v-if="view.barycenterAvailable" class="checkbox-row">
                <input v-model="form.orbitSystemBarycenter" type="checkbox" />
                Orbit system barycenter
            </label>

            <div v-if="!view.isEdit" class="radio-group">
                <label>Orbit Type</label>
                <div class="radio-options vertical">
                    <div class="radio-option">
                        <input
                            id="bodyEditorOrbitCircular"
                            v-model="form.orbitType"
                            type="radio"
                            value="circular"
                        />
                        <label for="bodyEditorOrbitCircular">Circular</label>
                    </div>
                    <div class="radio-option">
                        <input
                            id="bodyEditorOrbitElliptical"
                            v-model="form.orbitType"
                            type="radio"
                            value="elliptical"
                        />
                        <label for="bodyEditorOrbitElliptical">Elliptical</label>
                    </div>
                    <div v-if="view.binaryAvailable" class="radio-option">
                        <input
                            id="bodyEditorOrbitBinary"
                            v-model="form.orbitType"
                            type="radio"
                            value="binary"
                        />
                        <label for="bodyEditorOrbitBinary">Binary (shared barycenter)</label>
                    </div>
                </div>
            </div>

            <template v-else>
                <NumberField
                    v-model="form.velocity"
                    label="Velocity"
                    min="0"
                    :format="(v: number) => v.toFixed(1)"
                />
                <RangeField
                    v-model="form.orbitalAngle"
                    label="Orbital Angle"
                    min="0"
                    max="360"
                    step="1"
                    unit="°"
                />
            </template>

            <RangeField
                v-model="form.inclination"
                label="Inclination"
                min="0"
                max="90"
                step="1"
                unit="°"
            />
        </template>

        <template v-if="view.showTilt">
            <RangeField
                v-model="form.tilt"
                label="Axial Tilt"
                min="-180"
                max="180"
                step="1"
                unit="°"
            />
            <RangeField
                v-model="form.azimuth"
                label="Tilt Azimuth"
                min="-180"
                max="180"
                step="1"
                unit="°"
            />
        </template>
    </CollapsibleSection>
</template>

<script setup lang="ts">
import { useBodyEditorContext } from '../../composables/useBodyEditorForm';
import CollapsibleSection from './CollapsibleSection.vue';
import NumberField from './NumberField.vue';
import RangeField from './RangeField.vue';

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ parentChanged: [] }>();
const { form, view } = useBodyEditorContext();

function onParentChange(e: Event): void {
    form.orbitParentId = (e.target as HTMLSelectElement).value;
    emit('parentChanged');
}
</script>
