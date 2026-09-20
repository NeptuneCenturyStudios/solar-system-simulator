import * as THREE from 'three';

import { GenericComet } from './generic-comet';
import type { CometBase, ICometModelConfig } from './comet-base';
import {
    loadCometVariant1ModelTemplate,
    loadCometVariant2ModelTemplate,
} from './comet-model-cache';
import { pickWeighted } from '../procedural/seed-utils';
import type { ICometCreationOptions, IStateDependencies } from '../interfaces';
import type { SeededRandom } from '../utilities/prng';

/**
 * Describes one selectable comet variant.
 *
 * Unlike asteroids — where each variant is its own class because behaviour can differ — every
 * comet behaves identically and only its nucleus model changes. So a variant is a model
 * configuration rather than a class: adding a comet model means a loader in
 * comet-model-cache.ts plus one entry here, with no new class to write.
 */
export interface ICometVariant {
    /** Stable identifier, used by procedural creation descriptors to pin a variant. */
    id: string;
    /** Human-readable name, for logs and debug output. */
    label: string;
    /** Relative selection weight. 0 removes the variant from random selection. */
    weight: number;
    /** Nucleus model and motion-trail tint this variant spawns with. */
    config: ICometModelConfig;
}

/** Variant used whenever a caller asks for one that does not exist, or wants no reroll. */
export const DEFAULT_COMET_VARIANT_ID = 'rock';

/**
 * Registry of every comet variant in the game.
 *
 * The procedural pipeline picks from this list per comet, so its `weight` controls how often
 * each nucleus appears without touching any caller.
 */
export const COMET_VARIANTS: ICometVariant[] = [
    {
        id: DEFAULT_COMET_VARIANT_ID,
        label: 'Rocky Comet',
        // Equal odds with the icy variant until someone wants a different mix.
        weight: 1,
        config: {
            loadTemplate: loadCometVariant1ModelTemplate,
            // Neutral grey motion trail.
            trailColor: 0xaaaaaa,
        },
    },
    {
        id: 'ice',
        label: 'Icy Comet',
        weight: 1,
        config: {
            loadTemplate: loadCometVariant2ModelTemplate,
            // Pale blue so an icy nucleus reads distinctly from a rocky one.
            trailColor: 0x9fd8ff,
        },
    },
];

/** Resolved once so a comet field does not rebuild the choice list per comet. */
const VARIANT_CHOICES = COMET_VARIANTS.map((variant) => ({
    value: variant,
    weight: variant.weight,
}));

/** Resolve a variant id to its registry entry, falling back to the default variant. */
export function getCometVariantById(id: string | null | undefined): ICometVariant {
    const match = COMET_VARIANTS.find((variant) => variant.id === id);
    return match ?? COMET_VARIANTS[0];
}

/** Draw a variant using the supplied seeded RNG, honouring each variant's weight. */
export function pickCometVariant(rng: SeededRandom): ICometVariant {
    return pickWeighted(rng, VARIANT_CHOICES);
}

/**
 * Instantiate the comet variant with the given registry id, falling back to the default when
 * the id is unknown. This is the single construction point for comets, so every caller agrees
 * on how a variant's configuration is applied.
 */
export function createCometBodyForVariant(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    options: ICometCreationOptions,
    variantId: string | null | undefined
): CometBase {
    return new GenericComet(dependencies, scene, options, getCometVariantById(variantId).config);
}

/**
 * Instantiate a comet using the default variant.
 *
 * Used where a comet must not reroll its nucleus — the manual Add Comet flow, and any other
 * caller that wants one predictable model.
 */
export function createCometBody(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    options: ICometCreationOptions
): CometBase {
    return createCometBodyForVariant(dependencies, scene, options, DEFAULT_COMET_VARIANT_ID);
}

/**
 * Instantiate a randomly chosen comet variant.
 *
 * Callers pass their own seeded RNG so the choice is deterministic per spawn — the same seed
 * always yields the same mix of nuclei.
 */
export function createRandomCometBody(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    options: ICometCreationOptions,
    rng: SeededRandom
): CometBase {
    return createCometBodyForVariant(dependencies, scene, options, pickCometVariant(rng).id);
}
