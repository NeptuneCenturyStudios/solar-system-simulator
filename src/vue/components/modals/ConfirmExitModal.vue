<template>
    <ModalBase
        :visible="modal.isVisible.value"
        title="Leave This System?"
        :allow-close="true"
        @cancel="choose(ExitPromptChoice.Stay)"
    >
        <div class="d-flex flex-column gap-3">
            <div>{{ message }}</div>
            <label class="checkbox-row">
                <input v-model="alwaysClose" type="checkbox" />
                Always close without asking
            </label>
        </div>

        <template #actions>
            <button
                class="old-ui btn-with-icon"
                type="button"
                @click="choose(ExitPromptChoice.Exit)"
            >
                <svg-icon type="mdi" :path="mdiCheck"></svg-icon>
                YES
            </button>
            <button
                class="old-ui btn-with-icon"
                type="button"
                @click="choose(ExitPromptChoice.SaveAndExit)"
            >
                <svg-icon type="mdi" :path="mdiContentSave"></svg-icon>
                SAVE &amp; EXIT
            </button>
            <button
                class="old-ui btn-with-icon"
                type="button"
                @click="choose(ExitPromptChoice.Stay)"
            >
                <svg-icon type="mdi" :path="mdiClose"></svg-icon>
                NO
            </button>
        </template>
    </ModalBase>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import SvgIcon from '@jamescoyle/vue-icon';
import { mdiCheck, mdiClose, mdiContentSave } from '@mdi/js';

import { useAsyncModal } from '../../composables/useAsyncModal';
import {
    ExitPromptChoice,
    registerConfirmExitModalController,
    type ConfirmExitModalController,
    type ConfirmExitRequest,
    type ConfirmExitResult,
} from '../../confirm-exit-modal-service';
import ModalBase from './ModalBase.vue';

const modal = useAsyncModal<ConfirmExitResult>();
const message = ref('');
const alwaysClose = ref(false);

function choose(choice: ExitPromptChoice): void {
    modal.close({ choice, alwaysCloseWithoutAsking: alwaysClose.value });
}

const controller: ConfirmExitModalController = {
    show(request: ConfirmExitRequest): Promise<ConfirmExitResult | null> {
        message.value = request.message;
        alwaysClose.value = false;
        return modal.show();
    },
    hide(): void {
        modal.close(null);
    },
    isVisible(): boolean {
        return modal.isVisible.value;
    },
};

onMounted(() => {
    registerConfirmExitModalController(controller);
});
</script>
