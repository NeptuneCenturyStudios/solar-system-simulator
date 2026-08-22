/**
 * Shared environment/solar-system settings that both the sim code and the UI
 * layers (legacy DOM panel + Vue overlay) read from.
 *
 * Kept dependency-free on purpose: it is imported by body classes
 * (main-sequence-star) and drawing helpers (text-rendering), so pulling in
 * Three.js or Vue here would create import cycles.
 */
export interface EnvironmentState {
    /** Natural star death (fuel burn → red giant → supernova/white dwarf/black hole). */
    starDeathEnabled: boolean;
    /** Kuiper belt point-cloud visibility. */
    kuiperBeltVisible: boolean;
    /** Skydome / space background texture visibility. */
    spaceBackgroundVisible: boolean;
    /** Filename of the currently selected space background texture (null until a system loads one). */
    spaceTextureFilename: string | null;
}

export const environmentState: EnvironmentState = {
    // Matches the legacy checkbox default (unchecked).
    starDeathEnabled: false,
    // Pre-launch default in index.ts hides the kuiper belt until a system launches.
    kuiperBeltVisible: false,
    // Matches the legacy "Enable Background Texture" checkbox default (checked).
    spaceBackgroundVisible: true,
    spaceTextureFilename: null,
};
