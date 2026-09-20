import * as THREE from 'three';

import { AsteroidBase, type IAsteroidModelConfig } from './asteroid-base';
import { ICelestialBodyCreationOptions, IStateDependencies } from '../interfaces.js';
import { loadAsteroidVariant2ModelTemplate, } from './asteroid-model-cache';

/** Warm rust-orange so the red variant reads distinctly against the grey rocks. */
const ASTEROID_2_TRAIL_COLOR = 0xff7a4d;

/** Everything variant-specific about the red asteroid: its model and its trail. */
const ASTEROID_2_MODEL_CONFIG: IAsteroidModelConfig = {
    loadTemplate: loadAsteroidVariant2ModelTemplate,
    trailColor: ASTEROID_2_TRAIL_COLOR,
};

/**
 * The red asteroid variant: a different rock model, cloned from its own cached template.
 * All behaviour lives in {@link AsteroidBase}.
 */
export class AsteroidMolten extends AsteroidBase {
    constructor(
        deps: IStateDependencies,
        scene: THREE.Scene,
        options: ICelestialBodyCreationOptions
    ) {
        super(deps, scene, options, ASTEROID_2_MODEL_CONFIG);
    }
}
