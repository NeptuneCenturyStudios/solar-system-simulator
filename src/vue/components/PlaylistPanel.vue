<template>
    <PanelBase title="Music Playlist">

        <div ref="trackListEl" class="playlist-track-list">
            <div
                v-for="(entry, i) in playlistStore.entries"
                :key="i"
                class="playlist-item"
                :class="{ 'playlist-item--active': i === playlistStore.currentIndex }"
                :data-index="i"
                :title="entry.title"
                @click="onTrackClick(i)"
            >
                <span class="playlist-item__num">{{ i + 1 }}</span>
                <span class="playlist-item__title">{{ entry.title }}</span>
            </div>
        </div>

        <div class="playlist-controls mt-auto">
            <button class="old-ui btn-icon-only" title="Previous" @click="playlistPrev()">
                <span class="material-symbols-outlined">skip_previous</span>
            </button>
            <button
                class="old-ui btn-icon-only"
                :title="playlistStore.isPlaying ? 'Pause' : 'Play'"
                @click="playlistTogglePlayPause()"
            >
                <span class="material-symbols-outlined">{{
                    playlistStore.isPlaying ? 'pause' : 'play_arrow'
                }}</span>
            </button>
            <button class="old-ui btn-icon-only" title="Next" @click="playlistNext()">
                <span class="material-symbols-outlined">skip_next</span>
            </button>
        </div>
    </PanelBase>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import {
    playlistNext,
    playlistPrev,
    playlistSelectTrack,
    playlistTogglePlayPause,
    playlistStore,
} from '../sim-bridge';
import PanelBase from './PanelBase.vue';

const trackListEl = ref<HTMLElement | null>(null);

function onTrackClick(index: number): void {
    playlistSelectTrack(index);
}

/**
 * Scroll the active track into view within the track list only.
 *
 * Deliberately avoids `Element.scrollIntoView()`: it also scrolls every
 * scrollable ancestor, including the overflow-hidden PanelManager card,
 * which visually shifts the card and hides the left toolbar when the
 * panel opens. Replicates `block: 'nearest'` semantics by adjusting the
 * list's own scrollTop instead.
 */
function scrollActiveIntoView(): void {
    const index = playlistStore.currentIndex;
    const container = trackListEl.value;
    if (index < 0 || !container) return;
    // Wait for the DOM to reflect the new active row before scrolling.
    void nextTick(() => {
        const el = container.querySelector(`[data-index="${index}"]`) as HTMLElement | null;
        if (!el) return;

        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const top = elRect.top - containerRect.top + container.scrollTop;
        const bottom = top + el.offsetHeight;

        if (top < container.scrollTop) {
            container.scrollTo({ top, behavior: 'smooth' });
        } else if (bottom > container.scrollTop + container.clientHeight) {
            container.scrollTo({
                top: bottom - container.clientHeight,
                behavior: 'smooth',
            });
        }
    });
}

onMounted(scrollActiveIntoView);
watch(
    () => playlistStore.currentIndex,
    () => scrollActiveIntoView()
);
</script>

<style scoped>
.vue-ui-playlist {
    flex: 1;
    min-height: 0;
}


</style>
