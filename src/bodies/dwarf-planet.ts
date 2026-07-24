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
                options.mesh,
                undefined,
                options.seed
            );

            this.planetType = options.bodySubtype;

            // Auto-register texture path from mesh material's map
            if (options.mesh) {
                const mat = options.mesh.material as THREE.MeshStandardMaterial | undefined;
                if (mat?.map) {
                    const url = (mat.map as THREE.Texture).userData.sourceUrl as string | undefined;
                    if (url) {
                        this.setTexturePath('map', url);
                    }
                }
            }
        }
    }
}
