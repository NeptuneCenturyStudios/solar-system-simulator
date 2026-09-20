import { computed, onMounted, onUnmounted, reactive, ref, toValue } from 'vue';
import type { ComponentPublicInstance, ComputedRef, MaybeRefOrGetter, Ref } from 'vue';

export interface UseVirtualListOptions<T> {
    /** Ref bound to the scrollable container element (`ref="containerRef"` in the template). */
    containerRef: Ref<HTMLElement | null>;
    /** The full (unwindowed) list to virtualize. */
    items: MaybeRefOrGetter<T[]>;
    /** Stable identity for an item, used to cache its measured row height across re-renders. */
    getKey: (item: T) => string | number;
    /** Estimated row height (px) used for rows that haven't been measured yet. */
    estimatedItemHeight: number;
    /** Extra rows rendered above/below the visible viewport, for smooth scrolling. */
    overscan?: number;
    /** Px gap between rows, matching the scroll container's CSS `gap`. */
    gap?: number;
}

export interface VirtualListEntry<T> {
    item: T;
    /** Index into the source `items` array. */
    index: number;
    /** Top offset (px) within the phantom-height container. */
    top: number;
}

export interface UseVirtualListResult<T> {
    /** The current window of rows to actually render. */
    visibleItems: ComputedRef<VirtualListEntry<T>[]>;
    /** Height (px) of the phantom container standing in for the full (unwindowed) list. */
    totalHeight: ComputedRef<number>;
    /** Bind as a template ref on every rendered row, to measure and cache its real height. */
    setRowRef: (key: string | number, el: Element | ComponentPublicInstance | null) => void;
    /** Scrolls the container just enough to bring `index` into view, if it isn't already. */
    scrollToIndex: (index: number) => void;
    /** Resets scroll to the top — call when the underlying list is reshuffled/filtered. */
    resetScroll: () => void;
}

/**
 * Variable-height windowing for long lists: only the rows within the scrollable viewport (plus a
 * small overscan buffer) are ever rendered, keeping DOM/patch cost constant regardless of list
 * size. Unlike fixed-height virtualizers, each row's *real* rendered height is measured once (by
 * key) and cached, and cumulative offsets are derived from those real measurements — so rows
 * that legitimately differ in height (e.g. a conditional extra line of text, or a stats line that
 * wraps depending on content length) don't throw off the container's total scroll height. Rows
 * not yet rendered use `estimatedItemHeight` until they're first measured, which can cause a
 * small one-time offset shift the first time previously-unseen rows scroll into view — the
 * standard, accepted behavior of variable-height virtualizers.
 */
export function useVirtualList<T>(options: UseVirtualListOptions<T>): UseVirtualListResult<T> {
    const { containerRef, getKey } = options;
    const overscan = options.overscan ?? 8;
    const gap = options.gap ?? 0;

    const scrollTop = ref(0);
    const viewportHeight = ref(0);
    const heightCache = reactive(new Map<string | number, number>());

    const items = computed(() => toValue(options.items));

    // offsets[i] = top position of item i; offsets[N] = total content height plus one trailing
    // gap (subtracted out by totalHeight below, since CSS `gap` never applies after the last
    // child).
    const offsets = computed(() => {
        const arr: number[] = [0];
        let acc = 0;
        for (const item of items.value) {
            const h = heightCache.get(getKey(item)) ?? options.estimatedItemHeight;
            acc += h + gap;
            arr.push(acc);
        }
        return arr;
    });

    const totalHeight = computed(() => {
        const o = offsets.value;
        return o.length > 1 ? o[o.length - 1] - gap : 0;
    });

    /** Index of the item whose row spans `target` (px from the top of the phantom container). */
    function findIndex(target: number): number {
        const o = offsets.value;
        const lastIndex = o.length - 2; // offsets has N+1 entries for N items
        if (lastIndex < 0) return 0;

        let lo = 0;
        let hi = lastIndex;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (o[mid + 1] <= target) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    // Reuses the previous {start, end} object when the window hasn't actually moved, so Vue's
    // computed dependency tracking (which compares the returned reference) doesn't propagate a
    // "changed" signal to visibleItems on every fractional scroll tick — only when the rendered
    // row window truly shifts.
    let lastRange = { start: 0, end: -1 };
    const range = computed(() => {
        const n = items.value.length;
        let start: number;
        let end: number;
        if (n === 0) {
            start = 0;
            end = -1;
        } else {
            start = Math.max(0, findIndex(scrollTop.value) - overscan);
            end = Math.min(n - 1, findIndex(scrollTop.value + viewportHeight.value) + overscan);
        }

        if (start === lastRange.start && end === lastRange.end) return lastRange;
        lastRange = { start, end };
        return lastRange;
    });

    const visibleItems = computed<VirtualListEntry<T>[]>(() => {
        const { start, end } = range.value;
        if (end < start) return [];
        const o = offsets.value;
        return items.value
            .slice(start, end + 1)
            .map((item, i) => ({ item, index: start + i, top: o[start + i] }));
    });

    function setRowRef(key: string | number, el: Element | ComponentPublicInstance | null): void {
        if (!el) return;
        const height = (el as HTMLElement).offsetHeight;
        if (height > 0 && heightCache.get(key) !== height) heightCache.set(key, height);
    }

    function scrollToIndex(index: number): void {
        const container = containerRef.value;
        if (!container) return;

        const o = offsets.value;
        if (index < 0 || index >= o.length - 1) return;

        const targetTop = o[index];
        const targetBottom = o[index + 1] - gap;

        if (targetTop < container.scrollTop) {
            container.scrollTop = targetTop;
        } else if (targetBottom > container.scrollTop + container.clientHeight) {
            container.scrollTop = targetBottom - container.clientHeight;
        }
    }

    function resetScroll(): void {
        if (containerRef.value) containerRef.value.scrollTop = 0;
        scrollTop.value = 0;
    }

    // Raw `scroll` events can fire far more often than the browser paints (per-pixel on
    // trackpads/high-poll-rate mice). Coalescing to one commit per animation frame keeps DOM
    // writes in step with paint instead of thrashing the scroll container's children.
    let scrollRafId: number | null = null;

    function onScroll(): void {
        if (scrollRafId !== null) return;
        scrollRafId = requestAnimationFrame(() => {
            scrollRafId = null;
            if (containerRef.value) scrollTop.value = containerRef.value.scrollTop;
        });
    }

    let resizeObserver: ResizeObserver | null = null;

    onMounted(() => {
        const container = containerRef.value;
        if (!container) return;

        viewportHeight.value = container.clientHeight;
        container.addEventListener('scroll', onScroll, { passive: true });

        resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) viewportHeight.value = entry.contentRect.height;
        });
        resizeObserver.observe(container);
    });

    onUnmounted(() => {
        containerRef.value?.removeEventListener('scroll', onScroll);
        resizeObserver?.disconnect();
        if (scrollRafId !== null) cancelAnimationFrame(scrollRafId);
    });

    return {
        visibleItems,
        totalHeight,
        setRowRef,
        scrollToIndex,
        resetScroll,
    };
}
