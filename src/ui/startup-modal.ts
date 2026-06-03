import { Panel } from './panel';

/**
 * Startup modal shown before first launch and on reset.
 * Handles launch options and modal overlay logic.
 */
export class StartupModal extends Panel {
    modalEl: HTMLElement | null;
    launchDefaultBtn: HTMLButtonElement | null;
    launchEmptyBtn: HTMLButtonElement | null;
    launchGenerateBtn: HTMLButtonElement | null;
    launchBlackHoleBtn: HTMLButtonElement | null;
    cancelBtn: HTMLButtonElement | null;
    _allowCancel: boolean;

    // G multiplier slider
    gMultiplierSlider: HTMLInputElement | null;
    gMultiplierDisplay: HTMLElement | null;

    // Procedural generate modal DOM
    proceduralOverlayEl: HTMLElement | null;
    proceduralSeedInput: HTMLInputElement | null;
    proceduralCancelBtn: HTMLButtonElement | null;
    proceduralCreateBtn: HTMLButtonElement | null;

    // Procedural progress DOM
    private proceduralProgressSectionEl: HTMLElement | null;
    private proceduralProgressStatusEl: HTMLElement | null;
    private proceduralProgressTextEl: HTMLElement | null;
    private proceduralProgressBarFillEl: HTMLElement | null;
    private proceduralProgressErrorEl: HTMLElement | null;
    private proceduralSeedSectionEl: HTMLElement | null;

    private proceduralCancelRequested: boolean;

    constructor(elementId: string) {
        super(elementId);
        this.modalEl = document.getElementById('startup-modal');
        this.launchDefaultBtn = null;
        this.launchEmptyBtn = null;
        this.launchGenerateBtn = null;
        this.launchBlackHoleBtn = null;
        this.cancelBtn = null;
        this._allowCancel = false;

        this.gMultiplierSlider = null;
        this.gMultiplierDisplay = null;

        this.proceduralOverlayEl = document.getElementById('procedural-overlay');
        this.proceduralSeedInput = null;
        this.proceduralCancelBtn = null;
        this.proceduralCreateBtn = null;

        this.proceduralProgressSectionEl = null;
        this.proceduralProgressStatusEl = null;
        this.proceduralProgressTextEl = null;
        this.proceduralProgressBarFillEl = null;
        this.proceduralProgressErrorEl = null;
        this.proceduralSeedSectionEl = null;

        this.proceduralCancelRequested = false;
    }

    private static readonly G_MULTIPLIER_STEPS = [1, 2500000, 5000000, 7500000, 10000000];

    private formatGDisplay(index: number): string {
        const value = StartupModal.G_MULTIPLIER_STEPS[index];
        if (value === 1) return 'Normal (1×)';
        return `${value.toLocaleString()}×`;
    }

    getGMultiplier(): number {
        if (!this.gMultiplierSlider) return 1;
        const index = parseInt(this.gMultiplierSlider.value, 10);
        return StartupModal.G_MULTIPLIER_STEPS[index] ?? 1;
    }

    initialize() {
        this.launchDefaultBtn = document.getElementById(
            'startupLaunchDefaultBtn'
        ) as HTMLButtonElement | null;
        this.launchEmptyBtn = document.getElementById(
            'startupLaunchEmptyBtn'
        ) as HTMLButtonElement | null;
        this.launchGenerateBtn = document.getElementById(
            'startupLaunchGenerateBtn'
        ) as HTMLButtonElement | null;
        this.launchBlackHoleBtn = document.getElementById(
            'startupLaunchBlackHoleBtn'
        ) as HTMLButtonElement | null;
        this.cancelBtn = document.getElementById('startupCancelBtn') as HTMLButtonElement | null;

        this.gMultiplierSlider = document.getElementById(
            'startupGMultiplierSlider'
        ) as HTMLInputElement | null;
        this.gMultiplierDisplay = document.getElementById('startupGMultiplierVal');

        if (this.gMultiplierSlider && this.gMultiplierDisplay) {
            const slider = this.gMultiplierSlider;
            const display = this.gMultiplierDisplay;
            slider.oninput = () => {
                display.textContent = this.formatGDisplay(parseInt(slider.value, 10));
            };
        }

        // Procedural modal elements (ids defined in index.html)
        this.proceduralSeedInput = document.getElementById(
            'proceduralSeedInput'
        ) as HTMLInputElement | null;
        this.proceduralCancelBtn = document.getElementById(
            'proceduralCancelBtn'
        ) as HTMLButtonElement | null;
        this.proceduralCreateBtn = document.getElementById('proceduralCreateBtn') as HTMLButtonElement | null;

        this.proceduralSeedSectionEl = document.getElementById('procedural-seed-section') as HTMLElement | null;
        this.proceduralProgressSectionEl = document.getElementById('procedural-progress-section') as HTMLElement | null;
        this.proceduralProgressStatusEl = document.getElementById('procedural-progress-status') as HTMLElement | null;
        this.proceduralProgressTextEl = document.getElementById('procedural-progress-text') as HTMLElement | null;
        this.proceduralProgressBarFillEl = document.getElementById('procedural-progress-bar-fill') as HTMLElement | null;
        this.proceduralProgressErrorEl = document.getElementById('procedural-progress-error') as HTMLElement | null;

        if (this.element) {
            const stop = (e: Event) => {
                // Allow native interaction on form controls so range sliders, inputs, etc. work.
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
                    e.stopPropagation();
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
            };
            ['mousedown', 'mouseup', 'mousemove', 'click', 'wheel', 'keydown', 'keyup'].forEach((evt) =>
                this.element!.addEventListener(evt, stop, { passive: false })
            );
        }

        // Note: we intentionally do not block pointer/keyboard events on the procedural overlay.
        // Blocking mouse events can prevent button clicks from reaching their handlers.

        if (this.launchDefaultBtn) this.launchDefaultBtn.onclick = () => this.emit('launchDefault');
        if (this.launchEmptyBtn) this.launchEmptyBtn.onclick = () => this.emit('launchEmpty');
        if (this.launchBlackHoleBtn) this.launchBlackHoleBtn.onclick = () => this.emit('launchBlackHole');

        if (this.launchGenerateBtn) {
            this.launchGenerateBtn.onclick = () => {
                this.openProceduralModal();
            };
        }

        if (this.cancelBtn) {
            this.cancelBtn.onclick = () => this.emit('cancel');
        }

        if (this.proceduralCancelBtn) {
            this.proceduralCancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // UI responsibility: lock progress status as "Canceling" immediately.
                this.proceduralCancelRequested = true;
                this.setProceduralProgressStatus('Canceling');
                this.hideProceduralProgressError();

                this.emit('proceduralCancel');
            });
        }

        if (this.proceduralCreateBtn) {
            this.proceduralCreateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const seed = this.proceduralSeedInput?.value?.trim() ?? '';
                this.emit('generateProcedural', { seed });
            });
        }
    }

    open({ allowCancel = false }: { allowCancel?: boolean } = {}) {
        this._allowCancel = !!allowCancel;
        if (this.cancelBtn) {
            this.cancelBtn.style.display = this._allowCancel ? '' : 'none';
        }
        this.show();
    }

    isVisible(): boolean {
        return !!this.element && this.element.classList.contains('visible');
    }

    isProceduralVisible(): boolean {
        return !!this.proceduralOverlayEl && this.proceduralOverlayEl.classList.contains('visible');
    }

    // ===== Procedural UI API (used by src/index.ts) =====

    /**
     * Called when generation starts: shows progress section and hides seed section.
     * Index.ts should call this when it is about to begin generation.
     */
    showProceduralProgressUI() {
        // Ensure the overlay is hit-testable (clickable) during generation.
        if (this.proceduralOverlayEl) {
            this.proceduralOverlayEl.style.pointerEvents = 'auto';
        }

        if (this.proceduralSeedSectionEl) this.proceduralSeedSectionEl.style.display = 'none';
        if (this.proceduralProgressSectionEl) this.proceduralProgressSectionEl.style.display = 'block';
        this.hideProceduralProgressError();
        // Ensure deterministic starting text.
        this.setProceduralProgressStatus('Generating...');

        // CANCEL must remain clickable.
        if (this.proceduralCancelBtn) {
            this.proceduralCancelBtn.disabled = false;
            this.proceduralCancelBtn.style.pointerEvents = 'auto';
        }
    }

    /**
     * Called when generation finishes (success path): hide procedural overlay entirely.
     */
    hideProceduralOverlay() {
        if (this.proceduralOverlayEl) this.proceduralOverlayEl.classList.remove('visible');
        if (this.element) this.element.style.pointerEvents = '';
    }

    /**
     * Called when generation is canceled/aborted and we should return to Launch Control.
     */
    closeProceduralModalToStartup() {
        if (this.proceduralOverlayEl) this.proceduralOverlayEl.classList.remove('visible');
        if (this.element) this.element.style.pointerEvents = '';
        this.open({ allowCancel: this._allowCancel });
    }

    /**
     * Locks/unlocks procedural form inputs while generation is running.
     * Index.ts should call this right before/after starting the async generation.
     */
    setProceduralInputsLocked(locked: boolean) {
        if (this.proceduralCreateBtn) this.proceduralCreateBtn.disabled = locked;
        if (this.proceduralSeedInput) this.proceduralSeedInput.disabled = locked;

        // CANCEL must remain clickable during generation (user needs to abort).
        if (this.proceduralCancelBtn) this.proceduralCancelBtn.disabled = false;
    }

    /**
     * Sets the "cancel requested" flag so progress reporter can't overwrite "Canceling".
     * This is triggered immediately in the cancel click handler as well, but index.ts can
     * also call it for safety if needed.
     */
    markProceduralCancelRequested() {
        this.proceduralCancelRequested = true;
        this.setProceduralProgressStatus('Canceling');
    }

    setProceduralProgressTotal(total: number) {
        if (this.proceduralProgressStatusEl) {
            // If cancel isn't requested, we can update status. If cancel is requested,
            // reporter updates must not override "Canceling".
            if (!this.proceduralCancelRequested) this.setProceduralProgressStatus('Generating...');
        }
        if (this.proceduralProgressTextEl) {
            this.proceduralProgressTextEl.textContent = `0 / ${total}`;
        }
        if (this.proceduralProgressBarFillEl) {
            this.proceduralProgressBarFillEl.style.width = '0%';
        }
    }

    reportProceduralProgress(completed: number, total: number, workUnitLabel?: string) {
        if (this.proceduralProgressBarFillEl) {
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            this.proceduralProgressBarFillEl.style.width = `${pct}%`;
        }
        if (this.proceduralProgressTextEl) {
            this.proceduralProgressTextEl.textContent = `${completed} / ${total}`;
        }

        if (this.proceduralCancelRequested) {
            this.setProceduralProgressStatus('Canceling');
            return;
        }

        const label = workUnitLabel ?? '';
        this.setProceduralProgressStatus(label ? label : 'Generating...');
    }

    /**
     * Shows/hides error UI (suppressed for cancellation path by index.ts).
     */
    setProceduralProgressErrorVisible(visible: boolean) {
        if (!this.proceduralProgressErrorEl) return;
        this.proceduralProgressErrorEl.style.display = visible ? '' : 'none';
    }

    // ===== Procedural modal open/reset =====

    /**
     * Opens the procedural overlay and resets UI state (progress hidden, seed shown).
     * Used when index.ts starts procedural generation mode.
     */
    openProceduralOverlayForGeneration() {
        this.openProceduralModal();
    }

    /**
     * Shows the seed section for retry and keeps the overlay visible.
     * Used for non-cancellation failures.
     */
    showProceduralSeedSectionForRetry() {
        if (this.proceduralProgressSectionEl) this.proceduralProgressSectionEl.style.display = 'none';
        if (this.proceduralSeedSectionEl) this.proceduralSeedSectionEl.style.display = 'block';
    }

    /**
     * Public wrapper to set status text (e.g. "Done.", "Generation failed.", etc.)
     */
    setProceduralProgressStatusText(text: string) {
        this.setProceduralProgressStatus(text);
    }

    private openProceduralModal() {
        // Hide startup modal but keep its internal state (allowCancel).
        this.hide();

        // IMPORTANT: ensure the hidden startup overlay can't intercept pointer events
        // while the procedural overlay is open (both are fixed-position overlays).
        if (this.element) {
            this.element.style.pointerEvents = 'none';
        }

        this.resetProceduralProgressUI();

        // Restore form interactivity (index.ts will re-lock if generation starts).
        if (this.proceduralCreateBtn) this.proceduralCreateBtn.disabled = false;
        if (this.proceduralSeedInput) this.proceduralSeedInput.disabled = false;
        if (this.proceduralCancelBtn) this.proceduralCancelBtn.disabled = false;

        if (this.proceduralOverlayEl) this.proceduralOverlayEl.classList.add('visible');
        if (this.proceduralOverlayEl) this.proceduralOverlayEl.style.pointerEvents = 'auto';

        if (this.proceduralSeedInput) {
            // Focus after paint so it works reliably.
            setTimeout(() => this.proceduralSeedInput?.focus?.(), 0);
        }
    }

    private resetProceduralProgressUI() {
        this.proceduralCancelRequested = false;

        if (this.proceduralProgressSectionEl) this.proceduralProgressSectionEl.style.display = 'none';
        if (this.proceduralSeedSectionEl) this.proceduralSeedSectionEl.style.display = 'block';

        if (this.proceduralProgressErrorEl) this.proceduralProgressErrorEl.style.display = 'none';
        if (this.proceduralProgressStatusEl) this.proceduralProgressStatusEl.textContent = '';
        if (this.proceduralProgressTextEl) this.proceduralProgressTextEl.textContent = '';
        if (this.proceduralProgressBarFillEl) this.proceduralProgressBarFillEl.style.width = '0%';
    }

    private setProceduralProgressStatus(text: string) {
        if (this.proceduralProgressStatusEl) this.proceduralProgressStatusEl.textContent = text;
    }

    private hideProceduralProgressError() {
        if (this.proceduralProgressErrorEl) this.proceduralProgressErrorEl.style.display = 'none';
    }
}
