<template>
    <div class="control-group">
        <label
            >{{ label }} <span class="val-display">{{ display }}</span></label
        >
        <input
            v-model.number="model"
            type="number"
            class="text-input"
            :min="min"
            :step="step ?? 'any'"
            :disabled="disabled"
        />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    label: string;
    min?: number | string;
    step?: number | string;
    /** Appended to the value in the readout (e.g. ' bar'). */
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
