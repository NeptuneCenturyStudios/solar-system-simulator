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
### Version 1.5.0 - Major Update

**New features**

-   Added a new Alien Invasion scenario: a massive fleet battle between earth and an alien fleet that arrives through a wormhole.
-   Added new alien ships: the Harbinger mothership, World Destroyer, and the Stinger and Wraith fighters.
-   Added new human ships: the Paladin battleship, plus a new Zenith model.
-   Added a new lightning weapon, and updated the look of beam weapons.
-   Ships now have teams, so AI ships work together and target the other team.
-   Added ship guidance (V): your ship matches the velocity of the nearest planet, moon or asteroid, so dogfights stay manageable at orbital speeds.
-   Ships can now land on planets, moons and asteroids (E), rest on the actual terrain, and launch again (hold W).
-   Added walking on the surface: step out of a landed ship (E), walk with WASD, sprint with Shift, jump with Space (affected by gravity) and toggle a headlamp with T. Press F to board your ship again.
-   Ships that fall onto a surface now bounce, slide and come to rest with surface friction.
-   Save and load solar systems, including edited and procedurally generated ones (Ctrl + S / Ctrl + O). You can also load a saved system from Launch Control.
-   Added binary star orbits, and the option for bodies to orbit the system barycenter between the stars.
-   Press F to spawn or enter your ship.
-   Added Graphics Presets (Low, Medium, High) to quickly tune performance, plus new options for render scale, HDR, tone mapping, exposure, cloud quality, star quality (including a pre-rendered Minimal level for integrated graphics), shadow quality, aurora detail, distant body detail, and name panel updates.
-   Added volumetric clouds, with the flat cloud layer kept as a fallback on lower settings.
-   Added volumetric aurorae on the High aurora detail setting: folded curtains with fine rays, a bright lower edge and realistic altitude colors.
-   Added shadows cast by ships onto the ground, each other and themselves.
-   The desktop app now asks before you exit.

**Bug fixes and improvements**

-   Completely overhauled how stars look, including red giants, lens flares and sun rays.
-   The atmosphere now looks like a real sky when the camera is inside it.
-   Earth's day/night shading now accounts for how bright its star actually is, so faint stars leave the surface in night.
-   Added an HDR rendering pipeline, so bright light rolls off smoothly instead of clipping to white. Day/night terminators and highlights are much softer.
-   The Kuiper belt now fades in as you zoom out instead of always being visible.
-   Reorganized the Add Custom / Add Preset body panel into collapsible sections so it is easier to use.
-   Major performance improvements: distant bodies are drawn with less detail, and the star shader quality now scales with your settings.
-   Many surface camera fixes: it sits on the true surface, and no longer breaks when generating a new system, leaving surface mode or when the body is destroyed.
-   Corrected rotation axes and poles of bodies.
-   Explosions and shockwaves now follow the velocity of the body they hit, and sound now fades with distance.
-   Fixed wormhole particles, ring shadows and asteroid visuals.
-   Improved ship handling, collision detection, weapon balancing and AI behavior, including capital ship standoff distances.
-   WASD no longer moves the camera when in Look At mode.
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
