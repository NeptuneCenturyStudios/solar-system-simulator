import * as THREE from 'three';

import { CometBase, type ICometModelConfig } from './comet-base';
import { ICometCreationOptions, IStateDependencies } from '../interfaces.js';

/**
 * Represents a generic comet in the simulation, with a realistic elliptical orbit and
 * physical properties.
 *
 * The nucleus model is not baked in here: the caller passes the model configuration it wants,
 * which is what lets the variant registry in comet-variants.ts spawn a mix of nuclei from a
 * single class. The tail, the model loading and the shared-resource-safe disposal all live in
 * {@link CometBase}.
 */
export class GenericComet extends CometBase {
    /**
     * Constructs a new GenericComet object with its unique elliptical orbit and properties.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which the comet belongs.
     * @param options Creation options for the comet.
     * @param config Nucleus model and default trail tint this comet renders with.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: ICometCreationOptions,
        config: ICometModelConfig
    ) {
        super(dependencies, scene, options, config);
    }
}
