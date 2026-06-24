import { spaceTextures } from '../drawing/textures';
import { ISpaceBackground } from '../interfaces';
import { SeededRandom } from '../utilities/prng';

export function deriveSeed(
    masterSeed: string,
    ...parts: Array<string | number | boolean | undefined | null>
): string {
    const cleaned = parts
        .filter((p): p is string | number | boolean => p !== undefined && p !== null)
        .map((p) => String(p));
    return `${masterSeed}|${cleaned.join('|')}`;
}

export function rngFor(
    masterSeed: string,
    ...parts: Array<string | number | boolean | undefined | null>
): SeededRandom {
    return new SeededRandom(deriveSeed(masterSeed, ...parts));
}

/**
 * Get a random space texture based on the provided master seed.
 * @param masterSeed The master seed used to deterministically select a space texture.
 * @returns The selected space texture as an ISpaceBackground object.
 */
export function pickRandomSpaceTexture(masterSeed: string): ISpaceBackground {
     const skydomeIndex = rngFor(masterSeed, 'skydome').rangeInt(1, 11);
     const spaceTexture = spaceTextures[skydomeIndex - 1];
     return spaceTexture;
}