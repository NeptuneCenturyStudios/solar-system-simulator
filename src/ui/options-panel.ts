import { Panel } from './panel';
import { SettingKey, settingsStore } from '../settings/settings-store';

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
                this.applyEnableShadows();
            };
        }

        this.enableParticleEffectsCheckbox = document.getElementById(
            'enableParticleEffects'
        ) as HTMLInputElement | null;

        if (this.enableParticleEffectsCheckbox) {
            this.enableParticleEffectsCheckbox.onchange = () => {
                this.applyEnableParticleEffects();
            };
        }

        this.substepsSlider = document.getElementById('substepsSlider') as HTMLInputElement | null;
        this.substepsDisplay = document.getElementById('substeps-val');
        if (this.substepsSlider) {
            this.substepsSlider.oninput = () => {
                this.applySubsteps();
            };
        }

        this.substepsResetBtn = document.getElementById(
            'substepsResetBtn'
        ) as HTMLButtonElement | null;
        if (this.substepsResetBtn) {
            this.substepsResetBtn.onclick = () => {
                if (this.substepsSlider) this.substepsSlider.value = '64';
                if (this.substepsDisplay) this.substepsDisplay.textContent = '64';
                this.applySubsteps();
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
            this.sfxVolumeSlider.oninput = () => {
                this.applySfxVolume();
            };
        }

        if (this.sfxVolumeResetBtn) {
            this.sfxVolumeResetBtn.onclick = () => {
                if (this.sfxVolumeSlider) this.sfxVolumeSlider.value = '100';
                this.applySfxVolume();
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
            this.musicVolumeSlider.oninput = () => {
                this.applyMusicVolume();
            };
        }

        if (this.musicVolumeResetBtn) {
            this.musicVolumeResetBtn.onclick = () => {
                if (this.musicVolumeSlider) this.musicVolumeSlider.value = '100';
                this.applyMusicVolume();
            };
        }

        // Load from settings store
        const s = settingsStore.settings;

        if (this.enableShadowsCheckbox) {
            this.enableShadowsCheckbox.checked = s.enableShadows;
            this.applyEnableShadows();
        }

        if (this.enableParticleEffectsCheckbox) {
            this.enableParticleEffectsCheckbox.checked = s.particleEffectsEnabled;
            this.applyEnableParticleEffects();
        }

        if (this.substepsSlider) {
            this.substepsSlider.value = s.substeps.toString();
            this.applySubsteps();
        }

        if (this.sfxVolumeSlider) {
            const v = Math.round(s.sfxVolume * 100);
            this.sfxVolumeSlider.value = v.toString();
            this.applySfxVolume();
        }

        if (this.musicVolumeSlider) {
            const v = Math.round(s.musicVolume * 100);
            this.musicVolumeSlider.value = v.toString();
            this.applyMusicVolume();
        }
    }

    /**
     * Apply the current state of the "Enable Shadows" checkbox to the settings store and emit an event.
     */
    private applyEnableShadows(): void {
        const checked = this.enableShadowsCheckbox!.checked;
        settingsStore.update(SettingKey.EnableShadows, checked);
        this.emit('shadowsChange', { checked });
    }

    /**
     * Apply the current state of the "Enable Particle Effects" checkbox to the settings store and emit an event.
     */
    private applyEnableParticleEffects(): void {
        const checked = this.enableParticleEffectsCheckbox!.checked;
        settingsStore.update(SettingKey.ParticleEffectsEnabled, checked);
        this.emit('particleEffectsChange', { value: checked });
    }

    /**
     * Apply the current substeps value from the slider to the settings store and emit an event.
     */
    private applySubsteps(): void {
        const value = parseInt(this.substepsSlider!.value, 10);
        settingsStore.update(SettingKey.Substeps, value);
        if (this.substepsDisplay) this.substepsDisplay.textContent = `${value}`;
        this.emit('substepsChange', { value });
    }

    /**
     * Apply the current SFX volume from the slider to the settings store and emit an event.
     */
    private applySfxVolume(): void {
        const value = parseInt(this.sfxVolumeSlider!.value, 10);
        const normalized = value / 100;
        settingsStore.update(SettingKey.SfxVolume, normalized);
        if (this.sfxVolumeDisplay) this.sfxVolumeDisplay.textContent = `${value}%`;
        this.emit('sfxVolumeChange', { value: normalized });
    }

    /**
     * Apply the current music volume from the slider to the settings store and emit an event.
     */
    private applyMusicVolume(): void {
        const value = parseInt(this.musicVolumeSlider!.value, 10);
        const normalized = value / 100;
        settingsStore.update(SettingKey.MusicVolume, normalized);
        if (this.musicVolumeDisplay) this.musicVolumeDisplay.textContent = `${value}%`;
        this.emit('musicVolumeChange', { value: normalized });
    }
}
