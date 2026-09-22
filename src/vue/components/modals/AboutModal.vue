<template>
    <ModalBase :visible="visible" title="About" :allow-close="true" @cancel="hide">
        <div class="modal-body">
            <p>
                Solar System Simulator is a browser-based space simulation focused on physics,
                exploration, and interactive body management.
            </p>

            <div class="vue-ui-card-header">Credits</div>
            <!-- Only displaying content from within the app, not user content -->
            <!-- eslint-disable vue/no-v-html -->
            <div v-html="attribution"></div>

        </div>

        <template #actions>
            <button class="old-ui btn-with-icon" type="button" @click="reportIssues">
                <span class="material-symbols-outlined">bug_report</span>
                REPORT ISSUES
            </button>
            <button class="old-ui btn-with-icon" type="button" @click="hide">
                <span class="material-symbols-outlined">close</span>
                CLOSE
            </button>
        </template>
    </ModalBase>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { registerAboutModalController, type AboutModalController } from '../../about-modal-service';
import ModalBase from './ModalBase.vue';
import { marked } from 'marked';

const visible = ref(false);

const credits = `
Spaceship by Liz Reddington [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/5nWeu4IQXVX)

"Osiris Mothership" (https://skfb.ly/6RFKS) by alx_flameniro is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

"Asteroid" (https://skfb.ly/6SzzJ) by kayra23 is licensed under Creative Commons Attribution-ShareAlike (http://creativecommons.org/licenses/by-sa/4.0/).

"Asteroit" (https://skfb.ly/6S8nG) by kayra23 is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

"Meteor" (https://skfb.ly/6Zx8T) by Maxim Mavrichev is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

"Asteroid with minerals" (https://skfb.ly/osIZL) by PeterMikielewicz is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

"MET02 Meteor" (https://skfb.ly/ovyM9) by Hodisfut is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

"Vesta" (https://science.nasa.gov/resource/vesta-3d-model/) by NASA Visualization Technology Applications and Development (VTAD).

International Space Station by Poly by Google [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/d3Fq5H6ne8E)

Space probe by Poly by Google [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/fnFCCFiHbQt)

Star Map by NASA's Scientific Visualization Studio (https://svs.gsfc.nasa.gov/4856/)
                
`;

const attribution = ref(marked.parse(credits));

function show(): void {
    visible.value = true;
}

function hide(): void {
    visible.value = false;
}

function reportIssues(): void {
    window.open(
        'https://github.com/NeptuneCenturyStudios/solar-system-simulator/issues',
        '_blank',
        'noopener,noreferrer'
    );
}

const controller: AboutModalController = {
    show,
    hide,
    isVisible(): boolean {
        return visible.value;
    },
};

onMounted(() => {
    registerAboutModalController(controller);
});
</script>
