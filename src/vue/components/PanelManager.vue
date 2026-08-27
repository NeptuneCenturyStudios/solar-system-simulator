<template>
    <div class="vue-ui-panel-manager vue-ui-card expanded">
        <div class="vue-ui-panel-manager-toolbar">
            <div class="toolbar-group">
                <button
                    class="btn toolbar-btn"
                    title="About this simulator"
                    aria-label="About this simulator"
                    @click="openAbout"
                >
                    <span class="material-symbols-outlined">info</span>
                </button>

                <button
                    class="btn toolbar-btn btn-care"
                    title="Support Neptune Century on Ko-fi"
                    @click="openDonateWindow"
                >
                    <span class="material-symbols-outlined">favorite</span>
                </button>

                <button
                    class="btn toolbar-btn"
                    :class="{ active: activePanel === ActivePanel.Playlist }"
                    title="Music Playlist"
                    @click="setActivePanel(ActivePanel.Playlist)"
                >
                    <span class="material-symbols-outlined">music_note</span>
                </button>

                <button
                    class="btn toolbar-btn"
                    :class="{ active: activePanel === ActivePanel.Options }"
                    title="Options"
                    @click="setActivePanel(ActivePanel.Options)"
                >
                    <span class="material-symbols-outlined">settings</span>
                </button>

                <button
                    class="btn toolbar-btn"
                    :class="{ active: activePanel === ActivePanel.SolarManagement }"
                    title="Edit Solar System"
                    @click="setActivePanel(ActivePanel.SolarManagement)"
                >
                    <span class="material-symbols-outlined">edit</span>
                </button>

                <button
                    class="btn toolbar-btn"
                    :class="{ active: activePanel === ActivePanel.FlightControls }"
                    title="Flight Controls"
                    @click="setActivePanel(ActivePanel.FlightControls)"
                >
                    <span class="material-symbols-outlined">rocket</span>
                </button>

                <!-- <button
                        
                        class="btn toolbar-btn"
                        title="Texture Generator"
                    >
                        <span class="material-symbols-outlined">texture</span>
                    </button> -->

                <button
                    class="btn toolbar-btn"
                    type="button"
                    title="Add New Object"
                    @click="openBodyEditor('add', null)"
                >
                    <span class="material-symbols-outlined">add</span>
                </button>

                <button
                    class="btn toolbar-btn btn-warning"
                    title="Re-launch System"
                    @click="requestRelaunch()"
                >
                    <span class="material-symbols-outlined">refresh</span>
                </button>
            </div>
        </div>

        <div class="vue-ui-panel-manager-panels">
            <SystemExplorer v-if="activePanel === ActivePanel.SystemExplorer" />
            <FlightControls v-if="activePanel === ActivePanel.FlightControls" />
            <AddEditBodyPanel v-if="activePanel === ActivePanel.BodyEditor" />
            <SolarSystemManagement v-if="activePanel === ActivePanel.SolarManagement" />
            <OptionsPanel v-if="activePanel === ActivePanel.Options" />
            <PlaylistPanel v-if="activePanel === ActivePanel.Playlist" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ActivePanel, setActivePanel, vueUiState, openBodyEditor } from '../ui-store';
import { requestRelaunch } from '../sim-bridge';
import { showAboutModal } from '../about-modal-service';
import SystemExplorer from '../components/SystemExplorer.vue';
import FlightControls from '../components/FlightControls.vue';
import AddEditBodyPanel from '../components/AddEditBodyPanel.vue';
import SolarSystemManagement from '../components/SolarSystemManagement.vue';
import OptionsPanel from '../components/OptionsPanel.vue';
import PlaylistPanel from '../components/PlaylistPanel.vue';

const activePanel = computed(() => vueUiState.activePanel);

function openAbout(): void {
    showAboutModal();
}

function openDonateWindow(): void {
    window.open('https://ko-fi.com/neptunecentury', '_blank', 'noopener,noreferrer');
}
</script>
