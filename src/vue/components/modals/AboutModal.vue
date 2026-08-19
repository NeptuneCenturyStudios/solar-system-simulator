<template>
    <ModalBase
        :visible="visible"
        title="About"
        :allow-close="true"
        @cancel="hide"
    >
        <div class="modal-body">
            <p>
                Solar System Simulator is a browser-based space simulation focused on
                physics, exploration, and interactive body management.
            </p>
            <div>
                Spaceship by Liz Reddington
                <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank"
                    >CC-BY</a
                >
                via Poly Pizza
                <a href="https://poly.pizza/m/5nWeu4IQXVX" target="_blank"
                    >https://poly.pizza/m/5nWeu4IQXVX</a
                >
            </div>

            <div>
                Osiris Mothership
                <a href="https://skfb.ly/6RFKS" target="_blank">https://skfb.ly/6RFKS</a> by
                alx_flameniro is licensed under Creative Commons Attribution
                <a href="http://creativecommons.org/licenses/by/4.0/" target="_blank"
                    >CC-BY</a
                >.
            </div>
            <div>
                International Space Station by Poly by Google
                <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank"
                    >CC-BY</a
                >
                via Poly Pizza
                <a href="https://poly.pizza/m/d3Fq5H6ne8E" target="_blank"
                    >https://poly.pizza/m/d3Fq5H6ne8E</a
                >
            </div>

            <div>
                Asteroid by J-Toastie
                <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank"
                    >CC-BY</a
                >
                via Poly Pizza
                <a href="https://poly.pizza/m/YS1jpm3mNr" target="_blank"
                    >https://poly.pizza/m/YS1jpm3mNr</a
                >
            </div>

            <div>
                Asteroid 2 by J-Toastie
                <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank"
                    >CC-BY</a
                >
                via Poly Pizza
                <a href="https://poly.pizza/m/yuCzypJ0w4" target="_blank"
                    >https://poly.pizza/m/yuCzypJ0w4</a
                >
            </div>

            <div>
                Star Map by NASA's Scientific Visualization Studio
                <a href="https://svs.gsfc.nasa.gov/4856/" target="_blank"
                    >https://svs.gsfc.nasa.gov/4856/</a
                >
            </div>
        </div>

        <template #actions>
            <button
                class="old-ui btn-with-icon"
                type="button"
                @click="reportIssues"
            >
                <span class="material-symbols-outlined">bug_report</span>
                REPORT ISSUES
            </button>
            <button
                class="old-ui btn-with-icon"
                type="button"
                @click="hide"
            >
                <span class="material-symbols-outlined">close</span>
                CLOSE
            </button>
        </template>
    </ModalBase>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
    registerAboutModalController,
    type AboutModalController,
} from '../../about-modal-service';
import ModalBase from './ModalBase.vue';

const visible = ref(false);

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
