import * as THREE from 'three';

import { ISatelliteCreationOptions, IStateDependencies } from '../interfaces';
import { CelestialBody } from './celestial-body';
import { BodyTypeEnum } from './body-enums';

export class Satellite extends CelestialBody {
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: ISatelliteCreationOptions
    ) {
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
                trailColor: options.trailColor,
                maxTrail: options.maxTrail,
                hasRings: false,
                rotation: options.rotation,
                mesh: options.mesh,
                tidalLock: options.tidalLock,
            },
            BodyTypeEnum.Satellite
        );
    }
}
