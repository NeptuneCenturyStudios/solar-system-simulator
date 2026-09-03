<template>
    <!-- No fade transition: the overlay must disappear instantly when hidden
         so the legacy procedural progress overlay (z-index lower than this
         one) is never covered during a launch handoff. -->
    <Teleport to="body">
        <div
            v-if="visible"
            class="vue-modal-overlay"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
            @mousedown.self="onBackdropDown"
        >
            <div ref="cardEl" class="vue-modal-card" tabindex="-1">
                <header class="vue-modal-header">
                    <span>{{ title }}</span>
                    <button
                        v-if="allowClose"
                        class="vue-modal-close"
                        type="button"
                        title="Close"
                        aria-label="Close"
                        @click="emitCancel"
                    >
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </header>

                <div class="vue-modal-body">
                    <slot />
                </div>

                <footer v-if="$slots.actions" class="vue-modal-actions">
                    <slot name="actions" />
                </footer>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
    defineProps<{
        visible: boolean;
        title: string;
        /** When true, shows the close (X) button and allows Escape to cancel. */
        allowClose?: boolean;
    }>(),
    {
        allowClose: true,
    }
);

const emit = defineEmits<{
    cancel: [];
}>();

const cardEl = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

// Blocks wheel events from reaching the sim's zoom handler while the modal is
// open (matches the old startup overlay, which stopped wheel propagation).
// Wheel events over the modal card itself are left alone (aside from being
// kept from bubbling to the sim) so native scrolling still works on any
// scrollable content inside it, e.g. .vue-modal-body's max-height + overflow.
function onGlobalWheel(e: WheelEvent): void {
    if (!props.visible) return;
    if (cardEl.value && e.target instanceof Node && cardEl.value.contains(e.target)) {
        e.stopPropagation();
        return;
    }
    e.preventDefault();
    e.stopPropagation();
}

// While a modal is visible, form controls keep native interaction but their key
// events still don't reach the simulation (matches the old startup modal's
// overlay blocking). All other key events are fully blocked so WASD/P/etc.
// never trigger scene actions while a modal is open. Escape cancels the modal
// when `allowClose` is true.
function onGlobalKeyDown(e: KeyboardEvent): void {
    if (!props.visible) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA' ||
        tag === 'BUTTON' ||
        tag === 'A'
    ) {
        if (e.key === 'Escape' && props.allowClose) {
            e.preventDefault();
            e.stopPropagation();
            emitCancel();
        } else {
            e.stopPropagation();
        }
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && props.allowClose) {
        emitCancel();
    }
}

// Clicking the dark backdrop acts like Cancel (only when dismissible).
function onBackdropDown(e: MouseEvent): void {
    if (!props.allowClose) return;
    e.preventDefault();
    e.stopPropagation();
    emitCancel();
}

function emitCancel(): void {
    emit('cancel');
}

watch(
    () => props.visible,
    async (isVisible) => {
        if (isVisible) {
            previouslyFocused = document.activeElement as HTMLElement | null;
            await nextTick();
            cardEl.value?.focus();
            document.addEventListener('keydown', onGlobalKeyDown, true);
            document.addEventListener('wheel', onGlobalWheel, { capture: true, passive: false });
        } else {
            document.removeEventListener('keydown', onGlobalKeyDown, true);
            document.removeEventListener('wheel', onGlobalWheel, { capture: true });
            previouslyFocused?.focus?.();
            previouslyFocused = null;
        }
    }
);

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onGlobalKeyDown, true);
    document.removeEventListener('wheel', onGlobalWheel, { capture: true });
});
</script>
