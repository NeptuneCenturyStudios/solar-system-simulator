import * as THREE from 'three';

import { AsteroidBase, type IAsteroidModelConfig } from './asteroid-base';
import { ICelestialBodyCreationOptions, IStateDependencies } from '../interfaces.js';
import { loadAsteroidMineralModelTemplate } from './asteroid-model-cache';

/** Dusty grey - muted so a dense belt reads as rock rather than as a light show. */
const ASTEROID_TRAIL_COLOR = 0xa89a88;

/** Everything variant-specific about the standard grey asteroid: its model and its trail. */
const ASTEROID_MODEL_CONFIG: IAsteroidModelConfig = {
    loadTemplate: loadAsteroidMineralModelTemplate,
    trailColor: ASTEROID_TRAIL_COLOR,
};

/**
 * The standard grey asteroid: the LPP rock model, cloned from the cached template.
 * All behaviour lives in {@link AsteroidBase}.
 */
export class AsteroidMineral extends AsteroidBase {
    constructor(
        deps: IStateDependencies,
        scene: THREE.Scene,
        options: ICelestialBodyCreationOptions
    ) {
        super(deps, scene, options, ASTEROID_MODEL_CONFIG);
    }
}
