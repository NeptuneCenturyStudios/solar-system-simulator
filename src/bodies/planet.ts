import * as THREE from 'three';
import { IStateDependencies } from '../interfaces';
import { PlanetTypeEnum } from '../utilities/body-params';
import { CelestialBody, ICelestialBodyCreationOptions } from './celestial-body';
import { BodyTypeEnum } from '../utilities/utilities';

export interface IPlanetCreationOptions extends ICelestialBodyCreationOptions {
    hasRings?: boolean;
    bodySubtype: PlanetTypeEnum;
}

/**
 * Planet class representing a planet in the solar system simulator.
 * Inherits from CelestialBody and can be extended with planet-specific properties and methods.
 */
export class Planet extends CelestialBody {
    planetType: PlanetTypeEnum;

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
                options.radius,
                0xffffff,
                options.pos,
                options.vel,
                options.mass,
                options.id,
                options.name,
                BodyTypeEnum.Planet,
                options.trailColor ?? 0xffffff,
                options.maxTrail ?? 500,
                options.hasRings ?? false,
                options.rotation,
                undefined,
                material
            );

            this.planetType = options.bodySubtype;
        }
    }
}
