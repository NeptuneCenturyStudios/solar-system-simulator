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
        this.proceduralCreateBtn = document.getElementById(
            'proceduralCreateBtn'
        ) as HTMLButtonElement | null;

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
            ['mousedown', 'mouseup', 'mousemove', 'click', 'wheel', 'keydown', 'keyup'].forEach(
                (evt) => this.element!.addEventListener(evt, stop, { passive: false })
            );
        }

        // Note: we intentionally do not block pointer/keyboard events on the procedural overlay.
        // Blocking mouse events can prevent button clicks from reaching their handlers.

        if (this.launchDefaultBtn) this.launchDefaultBtn.onclick = () => this.emit('launchDefault');
        if (this.launchEmptyBtn) this.launchEmptyBtn.onclick = () => this.emit('launchEmpty');
        if (this.launchBlackHoleBtn)
            this.launchBlackHoleBtn.onclick = () => this.emit('launchBlackHole');

        if (this.launchGenerateBtn) {
            this.launchGenerateBtn.onclick = () => {
                this.openProceduralModal();
            };
        }

        if (this.cancelBtn) {
            this.cancelBtn.onclick = () => this.emit('cancel');
        }

        if (this.proceduralCancelBtn) {
            console.log('[procedural] wiring cancel handler');
            this.proceduralCancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[procedural] cancel clicked');
                this.closeProceduralModalToStartup();
            });
        }

        if (this.proceduralCreateBtn) {
            console.log('[procedural] wiring create handler');
            this.proceduralCreateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const seed = this.proceduralSeedInput?.value?.trim() ?? '';
                console.log('[procedural] create clicked seed:', seed);
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

    private openProceduralModal() {
        // Hide startup modal but keep its internal state (allowCancel).
        this.hide();

        // IMPORTANT: ensure the hidden startup overlay can't intercept pointer events
        // while the procedural overlay is open (both are fixed-position overlays).
        if (this.element) {
            this.element.style.pointerEvents = 'none';
        }

        if (this.proceduralOverlayEl) this.proceduralOverlayEl.classList.add('visible');
        if (this.proceduralOverlayEl) this.proceduralOverlayEl.style.pointerEvents = 'auto';

        if (this.proceduralSeedInput) {
            // Focus after paint so it works reliably.
            setTimeout(() => this.proceduralSeedInput?.focus?.(), 0);
        }
    }

    private closeProceduralModalToStartup() {
        if (this.proceduralOverlayEl) this.proceduralOverlayEl.classList.remove('visible');

        // Restore pointer events so the startup overlay behaves normally again.
        if (this.element) {
            this.element.style.pointerEvents = '';
        }

        this.open({ allowCancel: this._allowCancel });
    }
}
