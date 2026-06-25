// settingsStore.ts
const STORAGE_KEY = 'spaceSimSettings';

export const enum SettingKey {
    EnableShadows = 'enableShadows',
    ParticleEffectsEnabled = 'particleEffectsEnabled',
    Substeps = 'substeps',
    SfxVolume = 'sfxVolume',
    MusicVolume = 'musicVolume'
}

export interface SpaceSimSettings {
    enableShadows: boolean;
    particleEffectsEnabled: boolean;
    substeps: number;
    sfxVolume: number;
    musicVolume: number;
}

const defaultSettings: SpaceSimSettings = {
    enableShadows: false,
    particleEffectsEnabled: true,
    substeps: 64,
    sfxVolume: 1.0,
    musicVolume: 1.0
};

class SettingsStore {
    private data: SpaceSimSettings;

    constructor() {
        const raw = localStorage.getItem(STORAGE_KEY);
        this.data = raw
            ? { ...defaultSettings, ...JSON.parse(raw) }
            : { ...defaultSettings };
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
