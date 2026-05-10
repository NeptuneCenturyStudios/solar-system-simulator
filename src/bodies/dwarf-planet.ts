import * as THREE from 'three';
import { IStateDependencies } from '../interfaces';
import { IPlanetCreationOptions, Planet } from './planet';

/**
 * Planet class representing a planet in the solar system simulator.
 * Inherits from CelestialBody and can be extended with planet-specific properties and methods.
 */
export class DwarfPlanet extends Planet {
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: IPlanetCreationOptions,
        material: THREE.Material
    ) {
        {
            super(
                dependencies,
                scene,
                options,
                material
            );

        }
    }
}
