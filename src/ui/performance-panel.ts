import { Panel } from './panel';
import { performanceSettings } from '../utilities/consts';

/**
 * Panel for managing performance-related settings.
 */
export class PerformancePanel extends Panel {
    enableShadowsCheckbox: HTMLInputElement | null;
    enableParticleEffectsCheckbox: HTMLInputElement | null;
    substepsSlider: HTMLInputElement | null = null;
    substepsDisplay: HTMLElement | null = null;
    substepsResetBtn: HTMLButtonElement | null = null;
    btnClose: HTMLButtonElement | null;

    constructor(elementId: string) {
        super(elementId);
        this.enableShadowsCheckbox = null;
        this.enableParticleEffectsCheckbox = null;
        this.btnClose = null;
    }

    initialize() {
        this.btnClose = document.getElementById(
            'btn-close-performance-panel'
        ) as HTMLButtonElement | null;

        if (this.btnClose) {
            this.btnClose.onclick = () => {
                this.toggle();
                this.emit('closed');
            };
        }

        this.enableShadowsCheckbox = document.getElementById(
            'enableShadows'
        ) as HTMLInputElement | null;

        if (this.enableShadowsCheckbox) {
            this.enableShadowsCheckbox.onchange = () => {
                this.emit('shadowsChange', { checked: this.enableShadowsCheckbox!.checked });
            };
        }

        this.enableParticleEffectsCheckbox = document.getElementById(
            'enableParticleEffects'
        ) as HTMLInputElement | null;

        if (this.enableParticleEffectsCheckbox) {
            // Sync global state to checkbox initial value
            performanceSettings.particleEffectsEnabled = this.enableParticleEffectsCheckbox.checked;

            this.enableParticleEffectsCheckbox.onchange = () => {
                performanceSettings.particleEffectsEnabled =
                    this.enableParticleEffectsCheckbox!.checked;
            };
        }

        this.substepsSlider = document.getElementById('substepsSlider') as HTMLInputElement | null;
        this.substepsDisplay = document.getElementById('substeps-val');
        if (this.substepsSlider) {
            this.substepsSlider.oninput = () => {
                const value = parseInt(this.substepsSlider!.value, 10);
                if (this.substepsDisplay) this.substepsDisplay.textContent = `${value}`;
                this.emit('substepsChange', { value });
            };
        }

        this.substepsResetBtn = document.getElementById(
            'substepsResetBtn'
        ) as HTMLButtonElement | null;
        if (this.substepsResetBtn) {
            this.substepsResetBtn.onclick = () => {
                if (this.substepsSlider) this.substepsSlider.value = '64';
                if (this.substepsDisplay) this.substepsDisplay.textContent = '64';
                this.emit('substepsChange', { value: 64 });
            };
        }
    }
}
