<template>
    <div class="vue-ui-panel-manager vue-ui-card expanded">
        <div class="vue-ui-panel-manager-toolbar">
            <div class="toolbar-group">
                <button
                    class="btn toolbar-btn"
                    :class="{ active: activePanel === ActivePanel.Help }"
                    title="Help - keyboard and mouse controls"
                    aria-label="Help - keyboard and mouse controls"
                    @click="setActivePanel(ActivePanel.Help)"
                >
                    <svg-icon type="mdi" :path="mdiHelpCircleOutline"></svg-icon>
                </button>

                <button
                    class="btn toolbar-btn"
                    title="About this simulator"
                    aria-label="About this simulator"
                    @click="openAbout"
                >
                    <svg-icon type="mdi" :path="mdiInformationOutline"></svg-icon>
                </button>

                <button
                    class="btn toolbar-btn btn-care"
                    title="Support Neptune Century on Ko-fi"
                    @click="openDonateWindow"
                >
                    <svg-icon type="mdi" :path="mdiHeartOutline"></svg-icon>
                </button>

                <button
                    class="btn toolbar-btn"
                    :class="{ active: activePanel === ActivePanel.Playlist }"
                    title="Music Playlist"
                    @click="setActivePanel(ActivePanel.Playlist)"
                >
                    <svg-icon type="mdi" :path="mdiMusic"></svg-icon>
                </button>

                <button
                    class="btn toolbar-btn"
                    :class="{ active: activePanel === ActivePanel.Options }"
                    title="Options"
                    @click="setActivePanel(ActivePanel.Options)"
                >
                    <svg-icon type="mdi" :path="mdiCog"></svg-icon>
                </button>

                <button
                    class="btn toolbar-btn"
                    :class="{ active: activePanel === ActivePanel.SolarManagement }"
                    title="Edit Solar System"
                    @click="setActivePanel(ActivePanel.SolarManagement)"
                >
                    <svg-icon type="mdi" :path="mdiTune"></svg-icon>
                </button>

                <button
                    class="btn toolbar-btn"
                    :class="{ active: activePanel === ActivePanel.FlightControls }"
                    title="Flight Controls"
                    @click="setActivePanel(ActivePanel.FlightControls)"
                >
                    <svg-icon type="mdi" :path="mdiRocketLaunchOutline"></svg-icon>
                </button>

                <button
                    style="display: none"
                    class="btn toolbar-btn"
                    :class="{ active: activePanel === ActivePanel.TextureGenerator }"
                    title="Texture Generator"
                    @click="setActivePanel(ActivePanel.TextureGenerator)"
                >
                    <svg-icon type="mdi" :path="mdiPlus"></svg-icon>
                </button>

                <button
                    class="btn toolbar-btn"
                    type="button"
                    title="Add New Object"
                    :disabled="addLocked"
                    @click="openBodyEditor('add', null)"
                >
                    <svg-icon type="mdi" :path="mdiPlus"></svg-icon>
                </button>

                <button
                    class="btn toolbar-btn btn-warning"
                    title="Re-launch System"
                    @click="requestRelaunch()"
                >
                    <svg-icon type="mdi" :path="mdiRefresh"></svg-icon>
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
            <TextureGeneratorPanel v-if="activePanel === ActivePanel.TextureGenerator" />
            <HelpPanel v-if="activePanel === ActivePanel.Help" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ActivePanel, setActivePanel, vueUiState, openBodyEditor } from '../ui-store';
import { isActionLocked, requestRelaunch } from '../sim-bridge';
import { ScenarioLock } from '../../interfaces';
import { showAboutModal } from '../about-modal-service';
import SystemExplorer from '../components/SystemExplorer.vue';
import FlightControls from '../components/FlightControls.vue';
import AddEditBodyPanel from '../components/AddEditBodyPanel.vue';
import SolarSystemManagement from '../components/SolarSystemManagement.vue';
import OptionsPanel from '../components/OptionsPanel.vue';
import PlaylistPanel from '../components/PlaylistPanel.vue';
import TextureGeneratorPanel from '../components/TextureGeneratorPanel.vue';
import HelpPanel from '../components/HelpPanel.vue';

import {
    mdiRefresh,
    mdiPlus,
    mdiRocketLaunchOutline,
    mdiTune,
    mdiCog,
    mdiMusic,
    mdiHeartOutline,
    mdiInformationOutline,
    mdiHelpCircleOutline,
} from '@mdi/js';

import SvgIcon from '@jamescoyle/vue-icon';

const activePanel = computed(() => vueUiState.activePanel);
const addLocked = computed(() => isActionLocked(ScenarioLock.AddBody));

function openAbout(): void {
    showAboutModal();
}

function openDonateWindow(): void {
    window.open('https://ko-fi.com/neptunecentury', '_blank', 'noopener,noreferrer');
}
</script>
