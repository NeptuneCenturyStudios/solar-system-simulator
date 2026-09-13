<template>
    <ModalBase
        :visible="modal.isVisible.value"
        title="What's New"
        :allow-close="true"
        @cancel="onClose"
    >
        <div class="modal-body whats-new-body">
            <p class="whats-new-intro">Here's what's new in this update:</p>

            <h3>Version 1.2.0 - Major Update</h3>
            <ul class="whats-new-list">
                <li>
                    <span class="material-symbols-outlined whats-new-icon">interests</span>
                    <div>
                        <strong>Introducing: Scenarios</strong>
                        <p>
                            Explore and play through different scenarios from wormhole shortcuts to
                            saving the earth from asteroids. More scenarios coming soon!
                        </p>

                        <p>
                            <strong>Other new features:</strong>
                        </p>
                        <ul>
                            <li>
                                Added new atmospheric entry effects (asteroids, comets, ships,
                                satellites).
                            </li>
                            <li>Added magnetic field planetary attributes and aurora effects.</li>

                            <li>
                                Added new gravity solvers to choose from to optimize performance for
                                larger simulations.
                            </li>
                            <li>Added a scenario to test the ship AI work-in-progress.</li>
                        </ul>
                    </div>
                </li>
                <li>
                    <span class="material-symbols-outlined whats-new-icon">bug_report</span>
                    <div>
                        <strong>Bug fixes and improvements:</strong>
                        <ul>
                            <li>Improved the particle explosion effect more.</li>
                            <li>Adjusted ship handling for Zenith and Osiris.</li>
                            <li>
                                Collisions no longer result in instant destruction, but cause damage
                                depending on impact velocity.
                            </li>
                            <li>Comets now get procedurally random tail colors.</li>

                            <li>
                                Removed old naming conventions for custom created objects. They now
                                use procedurally generated names.
                            </li>
                            <li>Object names are now editable before creating the object.</li>
                            <li>Removed an unused color picker from edit mode.</li>
                            <li>Fixed an issue that caused right clicking to exit flight mode.</li>
                            <li>UI HUD overhaul for better performance.</li>
                            <li>
                                Fixed certain effects updating per substep instead of frame,
                                improving performance.
                            </li>
                            <li>Pluto's orbit is now more accurately represented.</li>
                            <li>Minor UI adjustments.</li>
                        </ul>
                    </div>
                </li>
            </ul>

            <h3>Version 1.1.2 - Maintenance Update</h3>
            <ul class="whats-new-list">
                <li>
                    <span class="material-symbols-outlined whats-new-icon">bug_report</span>
                    <div>
                        <strong>Bug fixes and improvements</strong>
                        <ul>
                            <li>
                                Fixed an issue that caused the camera to focus on scene center and
                                disabled Look At when an object was destroyed.
                            </li>
                            <li>
                                Fixed an issue where the ship flame would get stuck in scene when
                                ship was destroyed.
                            </li>
                            <li>
                                Fixed issue where main UI was visible even before the system was
                                fully loaded.
                            </li>
                            <li>Improved the particle explosion effect.</li>
                        </ul>
                    </div>
                </li>
            </ul>

            <h3>Version 1.1.1 - Major Update</h3>
            <ul class="whats-new-list">
                <li>
                    <span class="material-symbols-outlined whats-new-icon">cyclone</span>
                    <div>
                        <strong>Introducing: Wormholes!</strong>
                        <span
                            >Link wormholes together to send planets across the system instantly.
                            Experiment with different sizes. Can you transport a whole star?</span
                        >
                    </div>
                </li>
                <li>
                    <span class="material-symbols-outlined whats-new-icon">palette</span>
                    <div>
                        <strong>Revamped UI</strong>
                        <span>Major updates to the UI.</span>
                    </div>
                </li>
                <li>
                    <span class="material-symbols-outlined whats-new-icon">music_note</span>
                    <div>
                        <strong>New Music Tracks</strong>
                        <span
                            >Added nine new audio tracks to enjoy while exploring the cosmos.</span
                        >
                    </div>
                </li>
                <li>
                    <span class="material-symbols-outlined whats-new-icon">bug_report</span>
                    <div>
                        <strong>Bug fixes and improvements</strong>
                    </div>
                </li>
            </ul>
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
import { onMounted } from 'vue';

import { useAsyncModal } from '../../composables/useAsyncModal';
import {
    registerWhatsNewModalController,
    type WhatsNewModalController,
} from '../../whats-new-modal-service';
import ModalBase from './ModalBase.vue';

const modal = useAsyncModal<void>();

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
