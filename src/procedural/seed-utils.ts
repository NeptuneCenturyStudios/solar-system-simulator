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
 * Generates a new seed string using either the crypto API or Math.random as a fallback.
 * @returns A string representing a newly generated seed.
 */
export function generateSeedString(): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = new Uint32Array(2);
        crypto.getRandomValues(bytes);
        return `${bytes[0].toString(16)}${bytes[1].toString(16)}`;
    }
    return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
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

/**
 * Picks a value from a weighted list using the provided seeded RNG.
 * Weights are clamped to 0 before normalisation — negative weights count as zero.
 */
export function pickWeighted<T>(
    rng: SeededRandom,
    choices: Array<{ value: T; weight: number }>
): T {
    const totalWeight = choices.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
    if (totalWeight <= 0) return choices[0]!.value;

    const roll = rng.next() * totalWeight;
    let acc = 0;
    for (const c of choices) {
        acc += Math.max(0, c.weight);
        if (roll < acc) return c.value;
    }
    return choices[choices.length - 1]!.value;
}