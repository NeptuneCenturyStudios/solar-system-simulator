import * as THREE from 'three';
import { IStateDependencies } from '../interfaces';
import { PlanetTypeEnum } from '../utilities/body-params';
import { CelestialBody } from './celestial-body';
import { BodyTypeEnum } from '../utilities/utilities';
import { IPlanetCreationOptions } from './planet';

/**
 * Planet class representing a planet in the solar system simulator.
 * Inherits from CelestialBody and can be extended with planet-specific properties and methods.
 */
export class DwarfPlanet extends CelestialBody {
    planetType: PlanetTypeEnum;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: IPlanetCreationOptions
    ) {
        {
            super(
                dependencies,
                scene,
                options.radius,
                0xffffff,
                options.pos,
                options.vel,
                options.mass,
                options.id,
                options.name,
                BodyTypeEnum.DwarfPlanet,
                options.trailColor ?? 0xffffff,
                options.maxTrail ?? 500,
                options.hasRings ?? false,
                options.rotation,
                options.mesh
            );

            this.planetType = options.bodySubtype;
        }
    }
}
