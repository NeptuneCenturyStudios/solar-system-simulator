import * as THREE from 'three';

import { Asteroid } from './asteroid';
import { AsteroidRed } from './asteroid-red';
import type { AsteroidBase } from './asteroid-base';
import { pickWeighted } from '../procedural/seed-utils';
import type { ICelestialBodyCreationOptions, IStateDependencies } from '../interfaces';
import type { SeededRandom } from '../utilities/prng';
import { AsteroidMolten } from './asteroid-molten';
import { AsteroidMineral } from './asteroid-mineral';
import { Asteroid5 } from './asteroid5';
import { AsteroidPocked } from './asteroid-pocked';

/**
 * Describes one selectable asteroid variant. Every variant shares the same constructor
 * signature (through {@link AsteroidBase}), so anything that spawns asteroids can pick a
 * variant without knowing which concrete class it gets.
 */
export interface IAsteroidVariant {
    /** Stable identifier, used by procedural creation descriptors to pin a variant. */
    id: string;
    /** Human-readable name, for logs and debug output. */
    label: string;
    /** Relative selection weight. 0 removes the variant from random selection. */
    weight: number;
    create(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: ICelestialBodyCreationOptions
    ): AsteroidBase;
}

/**
 * Registry of every asteroid variant in the game.
 *
 * Adding a variant is a loader in asteroid-model-cache.ts, a subclass in its own file, and
 * one entry here — the scenarios, the procedural pipeline and the factory all pick it up
 * automatically, and its `weight` controls how often it appears without touching any caller.
 */
export const ASTEROID_VARIANTS: IAsteroidVariant[] = [
    {
        id: 'asteroid-rock',
        label: 'Asteroid',
        // Equal odds with the red variant until someone wants a different mix.
        weight: 1,
        create: (dependencies, scene, options) => new Asteroid(dependencies, scene, options),
    },
    {
        id: 'red',
        label: 'Red Asteroid',
        weight: 0.5,
        create: (dependencies, scene, options) => new AsteroidRed(dependencies, scene, options),
    },
    {
        id: 'molten',
        label: 'Molten Asteroid',
        weight: 0.25,
        create: (dependencies, scene, options) => new AsteroidMolten(dependencies, scene, options),
    },
    {
        id: 'mineral',
        label: 'Mineral Asteroid',
        weight: 0.1,
        create: (dependencies, scene, options) => new AsteroidMineral(dependencies, scene, options),
    },
    {
        id: 'asteroid-5',
        label: 'Asteroid 5',
        weight: 0.75,
        create: (dependencies, scene, options) => new Asteroid5(dependencies, scene, options),
    },
        {
        id: 'asteroid-6',
        label: 'Asteroid 6',
        weight: 0.5,
        create: (dependencies, scene, options) => new AsteroidPocked(dependencies, scene, options),
    },
];

/** Resolved once so a 300-asteroid belt does not rebuild the choice list per asteroid. */
const VARIANT_CHOICES = ASTEROID_VARIANTS.map((variant) => ({
    value: variant,
    weight: variant.weight,
}));

/** Resolve a variant id to its registry entry, falling back to the default variant. */
export function getAsteroidVariantById(id: string | null | undefined): IAsteroidVariant {
    const match = ASTEROID_VARIANTS.find((variant) => variant.id === id);
    return match ?? ASTEROID_VARIANTS[0];
}

/** Draw a variant using the supplied seeded RNG, honouring each variant's weight. */
export function pickAsteroidVariant(rng: SeededRandom): IAsteroidVariant {
    return pickWeighted(rng, VARIANT_CHOICES);
}

/**
 * Instantiate a randomly chosen asteroid variant.
 *
 * Callers pass their own seeded RNG so the choice is deterministic per spawn — the same
 * seed always yields the same mix of rocks.
 */
export function createRandomAsteroidBody(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    options: ICelestialBodyCreationOptions,
    rng: SeededRandom
): AsteroidBase {
    return pickAsteroidVariant(rng).create(dependencies, scene, options);
}
