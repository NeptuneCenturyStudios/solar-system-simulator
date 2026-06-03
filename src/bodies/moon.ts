import * as THREE from 'three';
import type { ICelestialBodyCreationOptions, IStateDependencies } from '../interfaces';
import type { ITidalLockOptions } from './celestial-body';
import { CelestialBody } from './celestial-body';
import { BodyTypeEnum, MoonTypeEnum } from './body-enums';

export interface IMoonCreationOptions extends ICelestialBodyCreationOptions {
    distance: number;
    angle: number;
    yVariation: number;
    tidalLock: ITidalLockOptions;

    /** Solid-like moon texture classification (excludes gas/ice categories). */
    moonType: MoonTypeEnum;
}

/**
 * Procedural/custom "Moon" body.
 * This mirrors the old Satellite constructor behavior, but uses BodyTypeEnum.Moon
 * so we can reserve `Satellite` for orbital vehicles (ISS, etc).
 */
export class Moon extends CelestialBody {
    moonType: MoonTypeEnum;

    constructor(dependencies: IStateDependencies, scene: THREE.Scene, options: IMoonCreationOptions) {
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
            BodyTypeEnum.Moon,
            options.trailColor,
            options.maxTrail,
            false,
            options.rotation,
            options.mesh,
            options.tidalLock
        );

        this.moonType = options.moonType;
    }
}
