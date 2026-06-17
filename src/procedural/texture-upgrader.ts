import { CelestialBody } from '../bodies/celestial-body';

/**
 * Disabled: procedural texture generation is no longer active.
 * Bodies use their static JPG textures instead.
 *
 * To re-enable, remove this file's no-op and restore the original
 * implementation from git history.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function upgradeProceduralTexture(body: CelestialBody): void {
    // Procedural texture generation is disabled.
    // Bodies display using their static JPG texture files.
}
