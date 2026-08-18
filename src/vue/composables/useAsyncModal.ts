import { ref } from 'vue';
import type { Ref } from 'vue';

export interface AsyncModalController<TResult> {
    /** Reactive visibility flag — binds to the modal's `visible` prop. */
    isVisible: Ref<boolean>;
    /**
     * Shows the modal and returns a promise that resolves with the user's
     * result, or `null` when the modal was cancelled. Same async contract as
     * the old ProceduralGeneratorModal.prompt().
     */
    show(): Promise<TResult | null>;
    /** Resolves the pending `show()` promise with `result` (null = cancelled). */
    close(result: TResult | null): void;
    /** Cancels the modal (resolves `show()` with null). */
    hide(): void;
}

/**
 * Shared async-show behaviour for all Vue modals. Modal components compose this
 * composable and call `close(result)` from their action buttons; the caller
 * awaits the `show()` promise.
 */
export function useAsyncModal<TResult>(): AsyncModalController<TResult> {
    const isVisible = ref(false);
    let resolveFn: ((value: TResult | null) => void) | null = null;

    function show(): Promise<TResult | null> {
        isVisible.value = true;
        return new Promise<TResult | null>((resolve) => {
            resolveFn = resolve;
        });
    }

    function close(result: TResult | null): void {
        if (resolveFn) {
            const resolve = resolveFn;
            resolveFn = null;
            resolve(result);
        }
        isVisible.value = false;
    }

    return { isVisible, show, close, hide: () => close(null) };
}
