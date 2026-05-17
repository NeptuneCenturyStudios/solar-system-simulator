import { Panel } from './panel';
import { performanceSettings } from '../utilities/consts';

/**
 * Panel for managing performance-related settings.
 */
export class PerformancePanel extends Panel {
    enableShadowsCheckbox: HTMLInputElement | null;
    enableParticleEffectsCheckbox: HTMLInputElement | null;
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
    }
}
