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
                <svg-icon type="mdi" :path="mdiCheck"></svg-icon>
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
import SvgIcon from '@jamescoyle/vue-icon';
import { mdiCheck } from '@mdi/js';
import ModalBase from './ModalBase.vue';
import { marked } from 'marked';

const modal = useAsyncModal<void>();

const releaseNotes = `
### Version 1.4.0 - Major Update

**New features**

-   Added a desktop app for Windows, macOS and Linux.
-   Added a texture quality option (desktop app only). High resolution textures, including new 8k textures, also increase the detail of planet and moon meshes.
-   Added procedurally generated ring systems for planets.
-   The Kuiper belt is now a feature of the solar system rather than part of every system, and you can zoom out far enough to see all of it.
-   Added a render distance option in Graphics settings to help with performance.
-   Added a cockpit view with a new cockpit model, glass and a working dashboard.
-   Added a health bar to flight mode.
-   Added missiles, with a launch sound and a tracking icon.
-   Added aim assist, a lead aim indicator and auto target. You can also cycle through your weapons.
-   Added a Ship AI autopilot. Select it in Flight Controls to have your ship fly to a target and then hold a natural or powered orbit around it.
-   Added atmospheric capture for small objects.
-   Added new ship types and models.
-   Added the moons Titan (Saturn) and Charon (Pluto).
-   Added a new Osiris Ambush scenario.
-   Added a "Steering Follows Time Scale" option to Flight Controls so ship turning keeps up with the time scale.
-   Increased the maximum time warp.
-   Updated warp streak visuals and the wormhole shortcut.

**Bug fixes and improvements**

-   Every major planet now follows its real orbit, with accurate perihelion, aphelion, inclination and orientation based on the J2000 epoch from JPL Horizons.
-   Improved orbit prediction.
-   Improved the gizmo so it scales better with body size and is easier to use.
-   Fixed body names drifting away from their bodies at high speeds.
-   Fixed the camera position being restored when your ship is destroyed.
-   Your selected ship is now remembered between sessions.
-   Ship flames now only show while thrust or boost is active.
-   Improved ship handling, autopilot speeds, weapon balancing and aiming accuracy.
-   Improved the Ship AI's dog fighting.
-   Improved speed formatting.
-   Replaced icons and made minor UI adjustments.
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
