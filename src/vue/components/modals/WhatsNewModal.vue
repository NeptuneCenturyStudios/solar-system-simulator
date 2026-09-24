<template>
    <ModalBase
        :visible="modal.isVisible.value"
        title="What's New"
        :allow-close="true"
        @cancel="onClose"
    >
        <div class="modal-body whats-new-body">
            <p class="whats-new-intro">Here's what's new in this update:</p>

            <!-- Only displaying content from within the app, not user content -->
            <!-- eslint-disable vue/no-v-html -->
            <div v-html="relaseNotesHtml"></div>
        </div>

        <template #actions>
            <button class="old-ui btn-with-icon" type="button" @click="onClose">
                <span class="material-symbols-outlined">check</span>
                GOT IT
            </button>
        </template>
    </ModalBase>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { useAsyncModal } from '../../composables/useAsyncModal';
import {
    registerWhatsNewModalController,
    type WhatsNewModalController,
} from '../../whats-new-modal-service';
import ModalBase from './ModalBase.vue';
import { marked } from 'marked';

const modal = useAsyncModal<void>();

const releaseNotes = `
### Version 1.3.0 - Major Update

**Introducing: Probes**

Send probes to celestial objects to unlock hidden attributes.

**Other new features**

-   Added new atmospheric drag. Small objects are now subjected to reduced speed while within the atmosphere of a body.
-   Added satellite station-keeping to counter drag, especially for low orbital vehicles like the ISS.
-   Added several new asteroid variants
-   Added shields to ships.
-   Added weapons testing for the Ship AI test scenario.
-   Added new Extinction Event scenario to give the Osirus Mothership a use
-   Added new target mode and chase mode to ships. Lock onto a threat target to be able to chase it.
-   Added new keyboard shortcuts for increasing and decreasing time scale (+/-) keys.
-   Added new option for smooth camera zoom

**Bug fixes and improvements**

-   Improved ship weapon balancing.
-   Adjusted ship handling for Zenith and Osiris.
-   Fixed issue where entering flight mode no longer closed the system explorer
-   Neptune's orbit is now more accurately represented.
-   Minor UI adjustments.
`;

const relaseNotesHtml = ref(marked.parse(releaseNotes, {}));

function onClose(): void {
    modal.close(undefined);
}

const controller: WhatsNewModalController = {
    show(): Promise<void | null> {
        return modal.show();
    },
    hide(): void {
        modal.close(undefined);
    },
    isVisible(): boolean {
        return modal.isVisible.value;
    },
};

onMounted(() => {
    registerWhatsNewModalController(controller);
});
</script>

<style scoped>
.whats-new-intro {
    margin: 0 0 0;
}

.whats-new-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.whats-new-list > li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
}

.whats-new-icon {
    flex-shrink: 0;
    margin-top: 2px;
}

.whats-new-list strong {
    display: block;
    margin-bottom: 2px;
}
</style>
