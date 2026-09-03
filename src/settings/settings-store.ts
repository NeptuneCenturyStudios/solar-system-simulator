// settingsStore.ts
const STORAGE_KEY = 'spaceSimSettings';

export const enum SettingKey {
    ParticleEffectsEnabled = 'particleEffectsEnabled',
    Substeps = 'substeps',
    SfxVolume = 'sfxVolume',
    MusicVolume = 'musicVolume',
    LensflareEnabled = 'lensflareEnabled',
    FrameRateLimit = 'frameRateLimit',
    ShowAiDebug = 'showAiDebug',
}

export interface SpaceSimSettings {
    particleEffectsEnabled: boolean;
    substeps: number;
    sfxVolume: number;
    musicVolume: number;
    lensflareEnabled: boolean;
    /** Maximum frames per second (0 = unlimited). */
    frameRateLimit: number;
    /** Draw the ship-AI obstacle avoidance overlay (lookahead corridor, hazard sphere, heading). */
    showAiDebug: boolean;
}

const defaultSettings: SpaceSimSettings = {
    particleEffectsEnabled: true,
    substeps: 64,
    sfxVolume: 1.0,
    musicVolume: 0.5,
    lensflareEnabled: true,
    frameRateLimit: 0,
    showAiDebug: false,
};

class SettingsStore {
    private data: SpaceSimSettings;

    constructor() {
        const raw = localStorage.getItem(STORAGE_KEY);
        this.data = raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
    }

    get settings(): SpaceSimSettings {
        return this.data;
    }

    update<K extends keyof SpaceSimSettings>(key: K, value: SpaceSimSettings[K]) {
        this.data[key] = value;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    }
}

export const settingsStore = new SettingsStore();
