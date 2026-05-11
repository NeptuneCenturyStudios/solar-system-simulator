import * as THREE from 'three';

import { IStateDependencies } from "../interfaces";
import { CelestialBody } from './celestial-body';
import { ISatelliteCreationOptions } from './iss';
import { BodyTypeEnum } from '../utilities/utilities';

export class Satellite extends CelestialBody {
    constructor(
            dependencies: IStateDependencies,
            scene: THREE.Scene,
            options: ISatelliteCreationOptions
        ) {
    
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
                BodyTypeEnum.Satellite,
                options.trailColor,
                options.maxTrail,
                false,
                options.rotation,
                options.mesh,
                options.tidalLock
            );
        }
}