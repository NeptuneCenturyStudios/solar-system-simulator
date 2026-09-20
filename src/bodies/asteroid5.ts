import * as THREE from 'three';

import { AsteroidBase, type IAsteroidModelConfig } from './asteroid-base';
import { ICelestialBodyCreationOptions, IStateDependencies } from '../interfaces.js';
import { loadAsteroidVariant5ModelTemplate } from './asteroid-model-cache';

/** Warm rust-orange so the red variant reads distinctly against the grey rocks. */
const ASTEROID_RED_TRAIL_COLOR = 0xff7a4d;

/** Everything variant-specific about the red asteroid: its model and its trail. */
const ASTEROID_RED_MODEL_CONFIG: IAsteroidModelConfig = {
    loadTemplate: loadAsteroidVariant5ModelTemplate,
    trailColor: ASTEROID_RED_TRAIL_COLOR,
};

/**
 * The red asteroid variant: a different rock model, cloned from its own cached template.
 * All behaviour lives in {@link AsteroidBase}.
 */
export class Asteroid5 extends AsteroidBase {
    constructor(
        deps: IStateDependencies,
        scene: THREE.Scene,
        options: ICelestialBodyCreationOptions
    ) {
        super(deps, scene, options, ASTEROID_RED_MODEL_CONFIG);
    }
}
