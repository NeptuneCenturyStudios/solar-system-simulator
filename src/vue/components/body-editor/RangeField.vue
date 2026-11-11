<template>
    <div class="control-group">
        <label
            >{{ label }} <span class="val-display">{{ display }}</span></label
        >
        <input
            v-model.number="model"
            type="range"
            :min="min"
            :max="max"
            :step="step"
            :disabled="disabled"
        />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    label: string;
    min: number | string;
    max: number | string;
    step: number | string;
    /** Appended to the value in the readout (e.g. '°', ' R'). */
    unit?: string;
    /** Custom readout; overrides `unit`. */
    format?: (value: number) => string;
    disabled?: boolean;
}>();

const model = defineModel<number>({ required: true });

const display = computed(() =>
    props.format ? props.format(model.value) : `${model.value}${props.unit ?? ''}`
);
</script>
