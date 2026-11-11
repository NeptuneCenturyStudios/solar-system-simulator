<template>
    <CollapsibleSection
        v-model:open="open"
        title="Atmosphere"
        :subtitle="view.atmosphereActive ? null : 'None'"
    >
        <label
            class="checkbox-row"
            :class="{ 'is-disabled': !view.atmosphereToggleEnabled }"
            :title="toggleTitle"
        >
            <input
                type="checkbox"
                :checked="view.atmosphereActive"
                :disabled="!view.atmosphereToggleEnabled"
                @change="form.hasAtmosphere = ($event.target as HTMLInputElement).checked"
            />
            Has Atmosphere
        </label>

        <template v-if="view.atmosphereActive">
            <RangeField
                v-model="form.atmRadiusFactor"
                label="Atmosphere Radius"
                :min="ATM_RADIUS_FACTOR_MIN"
                :max="ATM_RADIUS_FACTOR_MAX"
                step="0.01"
                unit=" R"
            />
            <NumberField
                v-model="form.atmPressure"
                :label="view.atmosphereIsCloudTop ? 'Cloud-top Pressure' : 'Surface Pressure'"
                :min="ATM_PRESSURE_MIN"
                unit=" bar"
            />
        </template>
    </CollapsibleSection>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
    ATM_PRESSURE_MIN,
    ATM_RADIUS_FACTOR_MAX,
    ATM_RADIUS_FACTOR_MIN,
    useBodyEditorContext,
} from '../../composables/useBodyEditorForm';
import CollapsibleSection from './CollapsibleSection.vue';
import NumberField from './NumberField.vue';
import RangeField from './RangeField.vue';

const open = defineModel<boolean>('open', { default: false });
const { form, view } = useBodyEditorContext();

const toggleTitle = computed(() => {
    if (view.value.atmosphereToggleEnabled) return undefined;
    return view.value.isEdit
        ? 'An atmosphere can only be added or removed when creating a body'
        : 'This type always has an atmosphere';
});
</script>
