// settingsStore.ts
const STORAGE_KEY = 'spaceSimSettings';

export const enum SettingKey {
    ParticleEffectsEnabled = 'particleEffectsEnabled',
    Substeps = 'substeps',
    SfxVolume = 'sfxVolume',
    MusicVolume = 'musicVolume',
    LensflareEnabled = 'lensflareEnabled',
    AuroraEnabled = 'auroraEnabled',
    FrameRateLimit = 'frameRateLimit',
    ShowAiDebug = 'showAiDebug',
    PhysicsSolver = 'physicsSolver',
    BarnesHutTheta = 'barnesHutTheta',
}

/**
 * Which gravity solver the n-body engine uses.
 *
 * - `direct`     — exact all-pairs O(N²). No interaction dropped, no approximation.
 * - `cutoff`     — exact between significant masses, skips dust-on-dust pairs. O(M² + M·T).
 * - `barnes-hut` — octree multipole approximation. O(N log N) at any mass distribution.
 *
 * Declared here rather than in the physics layer so the settings store stays dependency-free.
 */
export type PhysicsSolverMode = 'direct' | 'cutoff' | 'barnes-hut';

export interface SpaceSimSettings {
    particleEffectsEnabled: boolean;
    substeps: number;
    sfxVolume: number;
    musicVolume: number;
    lensflareEnabled: boolean;
    /** Draw aurora curtains around the magnetic poles of bodies that have a field and an atmosphere. */
    auroraEnabled: boolean;
    /** Maximum frames per second (0 = unlimited). */
    frameRateLimit: number;
    /** Draw the ship-AI obstacle avoidance overlay (lookahead corridor, hazard sphere, heading). */
    showAiDebug: boolean;
    /** Gravity solver used by the n-body engine. */
    physicsSolver: PhysicsSolverMode;
    /** Barnes-Hut opening angle. Lower is more accurate and slower. Ignored by other solvers. */
    barnesHutTheta: number;
}

const defaultSettings: SpaceSimSettings = {
    particleEffectsEnabled: true,
    substeps: 64,
    sfxVolume: 1.0,
    musicVolume: 0.5,
    lensflareEnabled: true,
    auroraEnabled: true,
    frameRateLimit: 0,
    showAiDebug: false,
    // Exact for everything that measurably matters, and degrades to all-pairs on its own
    // when every body has comparable mass — so it is safe as the default in any scenario.
    physicsSolver: 'cutoff',
    barnesHutTheta: 0.5,
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
