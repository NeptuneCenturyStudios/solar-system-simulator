import { loadSrgbTexture } from '../drawing/textures';
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

export function pickRandomSpaceTexture(masterSeed: string){
     const skydomeIndex = rngFor(masterSeed, 'skydome').rangeInt(1, 11);
     const skydomeTexture = loadSrgbTexture(`./assets/textures/skydome/space-${skydomeIndex}.jpg`);
     return skydomeTexture;
}