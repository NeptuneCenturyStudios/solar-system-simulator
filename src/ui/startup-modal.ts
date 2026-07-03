import { Panel } from './panel';
import type { ProceduralGeneratorModal } from './procedural-generator-modal';

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

    private _proceduralModal: ProceduralGeneratorModal | null = null;

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

    setProceduralModal(modal: ProceduralGeneratorModal) {
        this._proceduralModal = modal;
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

        if (this.launchDefaultBtn) this.launchDefaultBtn.onclick = () => {
            this._proceduralModal?.show();
            this._proceduralModal?.setTitle('Generate Solar System');

            this.emit('launchDefault');
        };
        if (this.launchEmptyBtn) this.launchEmptyBtn.onclick = () => this.emit('launchEmpty');

        if (this.launchBlackHoleBtn) {
            this.launchBlackHoleBtn.onclick = async () => {
                if (!this._proceduralModal) return;
                this.hide();
                if (this.element) this.element.style.pointerEvents = 'none';
                const result = await this._proceduralModal.prompt({
                    title: 'Generate Black Hole System',
                });
                if (result === null) {
                    this.open({ allowCancel: this._allowCancel });
                } else {
                    this.emit('generateBlackHole', result);
                }
            };
        }

        if (this.launchGenerateBtn) {
            this.launchGenerateBtn.onclick = async () => {
                if (!this._proceduralModal) return;
                this.hide();
                if (this.element) this.element.style.pointerEvents = 'none';
                const result = await this._proceduralModal.prompt();
                if (result === null) {
                    this.open({ allowCancel: this._allowCancel });
                } else {
                    this.emit('generateProcedural', result);
                }
            };
        }

        if (this.cancelBtn) {
            this.cancelBtn.onclick = () => this.emit('cancel');
        }
    }

    open({ allowCancel = false }: { allowCancel?: boolean } = {}) {
        this._allowCancel = !!allowCancel;
        if (this.cancelBtn) {
            this.cancelBtn.style.display = this._allowCancel ? '' : 'none';
        }
        if (this.element) this.element.style.pointerEvents = '';
        this.show();
    }

    isVisible(): boolean {
        return !!this.element && this.element.classList.contains('visible');
    }
}
