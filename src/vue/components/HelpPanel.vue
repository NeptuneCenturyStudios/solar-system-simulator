<template>
    <PanelBase title="Help">
        <div class="attribute-body help-body">
            <p class="help-intro">Keyboard and mouse controls.</p>

            <section
                v-for="section in HELP_SECTIONS"
                :key="section.title"
                class="attribute-section"
            >
                <h3 class="attribute-section-title">{{ section.title }}</h3>
                <p v-if="section.note" class="attribute-note">{{ section.note }}</p>
                <dl class="attribute-list">
                    <div v-for="row in section.rows" :key="row.action" class="attribute-row">
                        <dt class="attribute-label">{{ row.action }}</dt>
                        <dd class="attribute-value help-keys">
                            <kbd v-for="key in row.keys" :key="key" class="help-key">{{ key }}</kbd>
                        </dd>
                    </div>
                </dl>
            </section>
        </div>
    </PanelBase>
</template>

<script setup lang="ts">
import { HELP_SECTIONS } from '../help-content';
import PanelBase from './PanelBase.vue';
</script>
