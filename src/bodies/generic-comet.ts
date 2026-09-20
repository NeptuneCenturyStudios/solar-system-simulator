import * as THREE from 'three';

import { CometBase, type ICometModelConfig } from './comet-base';
import { ICometCreationOptions, IStateDependencies } from '../interfaces.js';
import { loadCometNucleusModelTemplate } from './comet-model-cache';

/** Neutral grey motion trail. */
const GENERIC_COMET_TRAIL_COLOR = 0xaaaaaa;

/**
 * The procedural comet's nucleus. Currently the shared comet-1 model — when a second comet
 * model lands, only this constant changes (or, if models should vary per spawn, this is
 * where a registry lookup would go).
 */
const GENERIC_COMET_MODEL_CONFIG: ICometModelConfig = {
    loadTemplate: loadCometNucleusModelTemplate,
    trailColor: GENERIC_COMET_TRAIL_COLOR,
};

/**
 * Represents a generic comet in the simulation, with a realistic elliptical orbit and
 * physical properties. Its nucleus model, loading and disposal all live in
 * {@link CometBase}; this class only supplies the model it uses.
 */
export class GenericComet extends CometBase {
    /**
     * Constructs a new GenericComet object with its unique elliptical orbit and properties.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which the comet belongs.
     * @param options Creation options for the comet.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: ICometCreationOptions
    ) {
        super(dependencies, scene, options, GENERIC_COMET_MODEL_CONFIG);
    }
}
