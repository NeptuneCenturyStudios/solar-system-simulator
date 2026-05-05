import { Panel } from './panel';
import { performanceSettings } from '../utilities/consts';

/**
 * Panel for managing performance-related settings.
 */
export class PerformancePanel extends Panel {
    enableShadowsCheckbox: HTMLInputElement | null;
    enableParticleEffectsCheckbox: HTMLInputElement | null;

    constructor(elementId: string) {
        super(elementId);
        this.enableShadowsCheckbox = null;
        this.enableParticleEffectsCheckbox = null;
    }

    initialize() {
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
