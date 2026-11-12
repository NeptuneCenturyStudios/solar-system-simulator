/**
 * custom-body-naming.ts
 *
 * Naming helpers for bodies created interactively through the Add/Edit Body panel.
 *
 * Interactive creation used to fall back to the legacy IAU catalogue-style names
 * (`generateIAUName`), even though those bodies are otherwise randomized by the same
 * procedural parameter roll as generated systems. These helpers route that flow through
 * `generateProceduralBodyName` instead, so custom bodies share the generated systems'
 * naming language.
 *
 * Two entry points, one for each side of the boundary:
 * - `generateCustomBodyName` is the sim-side fallback: deterministic from the body id, used
 *   when the panel supplied no name of its own.
 * - `generateRandomCustomBodyName` is the UI-side preview: unseeded, so the RANDOMIZE
 *   button (and every body-type/planet-type/moon-type change) produces a fresh name.
 */
import { BodyTypeEnum, BodyTypeKeyEnum } from '../bodies/body-enums';
import { generateProceduralBodyName } from './body-naming';
import { generateSeedString } from './seed-utils';

export interface CustomBodyNameOptions {
    /**
     * For moons: the parent body's resolved name, so the generated name can read
     * `<parent> <Roman numeral>` like procedurally generated moons do.
     */
    parentName?: string;
    /** Stable ordering number when available (e.g. the wormhole gate index + 1). */
    sequenceNumber?: number;
}

/**
 * Maps a panel body-type key to its `BodyTypeEnum` flag.
 * Returns null for keys the add form cannot create so callers can fall back to a plain name.
 */
export function customBodyTypeKeyToEnum(bodyType: BodyTypeKeyEnum): BodyTypeEnum | null {
    switch (bodyType) {
        case BodyTypeKeyEnum.Star:
            return BodyTypeEnum.Star;
        case BodyTypeKeyEnum.Planet:
            return BodyTypeEnum.Planet;
        case BodyTypeKeyEnum.Moon:
            return BodyTypeEnum.Moon;
        case BodyTypeKeyEnum.Asteroid:
            return BodyTypeEnum.Asteroid;
        case BodyTypeKeyEnum.Comet:
            return BodyTypeEnum.Comet;
        case BodyTypeKeyEnum.BlackHole:
            return BodyTypeEnum.BlackHole;
        case BodyTypeKeyEnum.Wormhole:
            return BodyTypeEnum.Wormhole;
        default:
            return null;
    }
}

/**
 * Deterministic procedural name for a custom body, seeded by its id so the same body
 * always resolves to the same name.
 */
export function generateCustomBodyName(
    bodyType: BodyTypeKeyEnum,
    bodyId: string,
    options: CustomBodyNameOptions = {}
): string {
    const type = customBodyTypeKeyToEnum(bodyType);
    if (type === null) return 'Unnamed';

    return generateProceduralBodyName(type, {
        seed: `${bodyId}|name`,
        parentName: options.parentName,
        sequenceNumber: options.sequenceNumber,
    });
}

/**
 * Fresh procedural name for the add-form preview. Unseeded by design: each call re-rolls,
 * so the RANDOMIZE button and body-type changes give the user a new name to accept or edit.
 */
export function generateRandomCustomBodyName(
    bodyType: BodyTypeKeyEnum,
    options: CustomBodyNameOptions = {}
): string {
    const type = customBodyTypeKeyToEnum(bodyType);
    if (type === null) return 'Unnamed';

    return generateProceduralBodyName(type, {
        seed: generateSeedString(),
        parentName: options.parentName,
        sequenceNumber: options.sequenceNumber,
    });
}
