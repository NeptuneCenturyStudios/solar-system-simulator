import * as THREE from 'three';
import { IPlanetCreationOptions, IStateDependencies } from '../interfaces';
import { CelestialBody } from './celestial-body';
import { BodyTypeEnum, PlanetTypeEnum } from './body-enums';

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
                {
                    radius: options.radius,
                    pos: options.pos,
                    vel: options.vel,
                    mass: options.mass,
                    id: options.id,
                    name: options.name,
                    trailColor: options.trailColor ?? 0xffffff,
                    maxTrail: options.maxTrail ?? 500,
                    hasRings: options.hasRings ?? false,
                    rotation: options.rotation,
                    mesh: options.mesh,
                    seed: options.seed,
                    magneticField: options.magneticField,
                },
                BodyTypeEnum.DwarfPlanet
            );

            this.planetType = options.bodySubtype;
        }
    }
}
