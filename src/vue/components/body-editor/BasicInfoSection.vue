<template>
    <CollapsibleSection v-model:open="open" title="Basic Info">
        <div class="control-group">
            <label for="bodyEditorName">Name</label>
            <input
                id="bodyEditorName"
                v-model="form.name"
                type="text"
                class="text-input"
                placeholder="Body name"
            />
        </div>

        <NumberField
            v-if="view.showMass"
            v-model="form.mass"
            label="Mass"
            :min="view.massMin"
            :format="formatNumber"
        />

        <NumberField
            v-model="form.radiusKm"
            label="Size (Radius, km)"
            :min="view.radiusMin"
            :step="view.radiusStep"
            :format="(km: number) => `${formatNumber(km)} km`"
        />

        <template v-if="view.showStarFields">
            <RangeField
                v-model="form.temperature"
                label="Temperature"
                min="2000"
                max="30000"
                step="100"
                :format="(k: number) => `${Math.round(k)}K`"
            />
            <RangeField
                v-model="form.lightIntensity"
                label="Light Intensity"
                :min="BASE_STAR_LIGHT_INTENSITY_MIN"
                :max="BASE_STAR_LIGHT_INTENSITY_MAX"
                step="100"
                :format="formatNumber"
            />
        </template>

        <div v-if="view.showTailColor" class="control-group">
            <label for="bodyEditorTailColor">Tail Color</label>
            <input id="bodyEditorTailColor" v-model="form.tailColor" type="color" />
        </div>

        <label
            v-if="view.showRings"
            class="checkbox-row"
            :class="{ 'is-disabled': !view.ringsEditable }"
            :title="view.ringsEditable ? undefined : 'Rings can only be set when creating a body'"
        >
            <input v-model="form.hasRings" type="checkbox" :disabled="!view.ringsEditable" />
            Has Rings
        </label>
    </CollapsibleSection>
</template>

<script setup lang="ts">
import {
    BASE_STAR_LIGHT_INTENSITY_MAX,
    BASE_STAR_LIGHT_INTENSITY_MIN,
} from '../../../utilities/consts';
import { useBodyEditorContext } from '../../composables/useBodyEditorForm';
import { formatNumber } from '../../sim-bridge';
import CollapsibleSection from './CollapsibleSection.vue';
import NumberField from './NumberField.vue';
import RangeField from './RangeField.vue';

const open = defineModel<boolean>('open', { default: true });
const { form, view } = useBodyEditorContext();
</script>
