import { Panel } from './panel';
import { performanceSettings } from '../utilities/consts';

/**
 * Panel for managing performance-related settings.
 */
export class OptionsPanel extends Panel {
    enableShadowsCheckbox: HTMLInputElement | null;
    enableParticleEffectsCheckbox: HTMLInputElement | null;
    substepsSlider: HTMLInputElement | null = null;
    substepsDisplay: HTMLElement | null = null;
    substepsResetBtn: HTMLButtonElement | null = null;
    btnClose: HTMLButtonElement | null;

    // Volume sliders
    sfxVolumeSlider: HTMLInputElement | null = null;
    sfxVolumeDisplay: HTMLElement | null = null;
    sfxVolumeResetBtn: HTMLButtonElement | null = null;
    musicVolumeSlider: HTMLInputElement | null = null;
    musicVolumeDisplay: HTMLElement | null = null;
    musicVolumeResetBtn: HTMLButtonElement | null = null;

    constructor(elementId: string) {
        super(elementId);
        this.enableShadowsCheckbox = null;
        this.enableParticleEffectsCheckbox = null;
        this.btnClose = null;
    }

    initialize() {
        this.btnClose = document.getElementById(
            'btn-close-options-panel'
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

        // ── Sound Effects Volume ──────────────────────────────────────────────
        this.sfxVolumeSlider = document.getElementById(
            'sfxVolumeSlider'
        ) as HTMLInputElement | null;
        this.sfxVolumeDisplay = document.getElementById('sfx-volume-val');
        this.sfxVolumeResetBtn = document.getElementById(
            'sfxVolumeResetBtn'
        ) as HTMLButtonElement | null;

        if (this.sfxVolumeSlider) {
            // Sync global state from initial slider value
            performanceSettings.sfxVolume = parseInt(this.sfxVolumeSlider.value, 10) / 100;

            this.sfxVolumeSlider.oninput = () => {
                const value = parseInt(this.sfxVolumeSlider!.value, 10);
                performanceSettings.sfxVolume = value / 100;
                if (this.sfxVolumeDisplay) this.sfxVolumeDisplay.textContent = `${value}%`;
                this.emit('sfxVolumeChange', { value: value / 100 });
            };
        }

        if (this.sfxVolumeResetBtn) {
            this.sfxVolumeResetBtn.onclick = () => {
                if (this.sfxVolumeSlider) this.sfxVolumeSlider.value = '100';
                performanceSettings.sfxVolume = 1.0;
                if (this.sfxVolumeDisplay) this.sfxVolumeDisplay.textContent = '100%';
                this.emit('sfxVolumeChange', { value: 1.0 });
            };
        }

        // ── Background Music Volume ───────────────────────────────────────────
        this.musicVolumeSlider = document.getElementById(
            'musicVolumeSlider'
        ) as HTMLInputElement | null;
        this.musicVolumeDisplay = document.getElementById('music-volume-val');
        this.musicVolumeResetBtn = document.getElementById(
            'musicVolumeResetBtn'
        ) as HTMLButtonElement | null;

        if (this.musicVolumeSlider) {
            // Sync global state from initial slider value
            performanceSettings.musicVolume = parseInt(this.musicVolumeSlider.value, 10) / 100;

            this.musicVolumeSlider.oninput = () => {
                const value = parseInt(this.musicVolumeSlider!.value, 10);
                performanceSettings.musicVolume = value / 100;
                if (this.musicVolumeDisplay) this.musicVolumeDisplay.textContent = `${value}%`;
                this.emit('musicVolumeChange', { value: value / 100 });
            };
        }

        if (this.musicVolumeResetBtn) {
            this.musicVolumeResetBtn.onclick = () => {
                if (this.musicVolumeSlider) this.musicVolumeSlider.value = '100';
                performanceSettings.musicVolume = 1.0;
                if (this.musicVolumeDisplay) this.musicVolumeDisplay.textContent = '100%';
                this.emit('musicVolumeChange', { value: 1.0 });
            };
        }
    }
}
