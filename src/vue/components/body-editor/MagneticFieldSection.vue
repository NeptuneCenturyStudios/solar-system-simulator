<template>
    <CollapsibleSection
        v-model:open="open"
        title="Magnetic Field"
        :subtitle="form.hasMagneticField ? null : 'None'"
    >
        <label class="checkbox-row">
            <input v-model="form.hasMagneticField" type="checkbox" /> Has Magnetic Field
        </label>

        <template v-if="form.hasMagneticField">
            <NumberField v-model="form.magStrength" label="Field Strength" min="0.0001" unit=" G" />
            <RangeField
                v-model="form.magTilt"
                label="Dipole Tilt"
                min="0"
                max="90"
                step="1"
                unit="°"
            />
            <RangeField
                v-model="form.magAzimuth"
                label="Dipole Azimuth"
                min="-180"
                max="180"
                step="1"
                unit="°"
            />
            <RangeField
                v-model="form.magOffset"
                label="Dipole Offset"
                min="0"
                max="1"
                step="0.01"
                unit=" R"
            />
            <label class="checkbox-row">
                <input v-model="form.magReversed" type="checkbox" /> Reversed Polarity
            </label>
        </template>
    </CollapsibleSection>
</template>

<script setup lang="ts">
import { useBodyEditorContext } from '../../composables/useBodyEditorForm';
import CollapsibleSection from './CollapsibleSection.vue';
import NumberField from './NumberField.vue';
import RangeField from './RangeField.vue';

const open = defineModel<boolean>('open', { default: false });
const { form } = useBodyEditorContext();
</script>
