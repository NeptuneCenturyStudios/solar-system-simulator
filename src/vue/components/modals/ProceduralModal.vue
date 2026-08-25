<template>
<ModalBase
    :visible="modal.isVisible.value"
    :title="title"
    :allow-close="false"
    @cancel="onCancel"
>
    <!-- Seed entry section -->
    <div v-if="mode === 'seed-entry'" class="d-flex flex-column gap-3">
        <div class="control-group">
            <label for="vueProceduralSeedInput">Seed (optional)</label>
            <input
                id="vueProceduralSeedInput"
                ref="seedInputRef"
                v-model="seedValue"
                type="text"
                class="text-input"
                placeholder="Leave blank for random seed"
            />
        </div>

        <div class="d-flex gap-3">
            <button
                class="old-ui btn-with-icon"
                type="button"
                :disabled="inputsLocked"
                @click="onCreate"
            >
                <span class="material-symbols-outlined">auto_fix_high</span>
                CREATE
            </button>
            <button
                class="old-ui btn-with-icon btn-danger"
                type="button"
                :disabled="inputsLocked"
                @click="onCancel"
            >
                <span class="material-symbols-outlined">cancel</span>
                CANCEL
            </button>
        </div>
    </div>

    <!-- Progress section -->
    <div v-if="mode === 'progress'" class="d-flex flex-column gap-2">
        <div style="display: flex; align-items: center" class="mb-1">
            <span class="material-symbols-outlined loading-icon mr-1">progress_activity</span>
            <div style="font-weight: bold;">
                {{ progressStatus }}
            </div>
        </div>

        <div class="procedural-progress-bar" aria-hidden="true">
            <div
                class="procedural-progress-bar-fill"
                :style="{ width: progressPercent + '%' }"
            ></div>
        </div>

        <div style="margin-top: 8px">
            {{ progressText }}
        </div>

        <div v-if="progressError" class="procedural-progress-error">
            Generation failed. Check console for details.
        </div>
    </div>
</ModalBase>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';

import { useAsyncModal } from '../../composables/useAsyncModal';
import {
    registerProceduralModalController,
    type ProceduralModalController,
    type ProceduralModalPromptOptions,
    type ProceduralModalProgressOptions,
} from '../../procedural-modal-service';
import type { IProceduralGeneratorPromptResult } from '../../../interfaces';
import type {
    ProceduralGenerationReporter,
    ProceduralGenerationProgress,
} from '../../../procedural/procedural-generation-progress';
import ModalBase from './ModalBase.vue';

type ModalMode = 'seed-entry' | 'progress';

const modal = useAsyncModal<IProceduralGeneratorPromptResult>();
const title = ref('Generate Procedural System');
const mode = ref<ModalMode>('seed-entry');
const seedValue = ref('');
const inputsLocked = ref(false);
const seedInputRef = ref<HTMLInputElement | null>(null);

// Progress state
const progressStatus = ref('Generating...');
const progressText = ref('0 / 0');
const progressPercent = ref(0);
const progressError = ref(false);

function resetProgressUI(): void {
    progressStatus.value = 'Generating...';
    progressText.value = '0 / 0';
    progressPercent.value = 0;
    progressError.value = false;
}

function onCreate(): void {
    const seed = seedValue.value.trim();
    modal.close({ seed });
}

function onCancel(): void {
    modal.close(null);
}

function createProgressReporter(): ProceduralGenerationReporter {
    return {
        setTotal: (total: number) => {
            progressText.value = `0 / ${total}`;
            progressPercent.value = 0;
        },
        report: (progress: ProceduralGenerationProgress) => {
            const { completed, total, workUnit } = progress;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            progressPercent.value = pct;
            progressText.value = `${completed} / ${total}`;
            const label = workUnit?.label ?? '';
            progressStatus.value = label || 'Generating...';
        },
    };
}

// Access the raw isVisible ref for progress mode, which bypasses the promise-based show().
const isVisible = modal.isVisible;

const controller: ProceduralModalController = {
    async showPrompt(
        options: ProceduralModalPromptOptions = {}
    ): Promise<IProceduralGeneratorPromptResult | null> {
        title.value = options.title ?? 'Generate Procedural System';
        mode.value = 'seed-entry';
        seedValue.value = '';
        inputsLocked.value = false;
        resetProgressUI();

        await nextTick();
        seedInputRef.value?.focus();

        return modal.show();
    },

    showProgress(
        options: ProceduralModalProgressOptions = {}
    ): ProceduralGenerationReporter {
        title.value = options.title ?? 'Generate Procedural System';
        mode.value = 'progress';
        inputsLocked.value = true;
        resetProgressUI();
        progressStatus.value = 'Generating...';

        // For progress mode, we set visibility directly (no promise).
        // The caller manages the lifecycle and calls hide() when done.
        isVisible.value = true;

        return createProgressReporter();
    },

    hide(): void {
        // Resolve any pending promise (for prompt mode) or just hide.
        modal.hide();
    },

    isVisible(): boolean {
        return isVisible.value;
    },
};

onMounted(() => {
    registerProceduralModalController(controller);
});
</script>
