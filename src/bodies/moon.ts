import * as THREE from 'three';
import type { IMoonCreationOptions, IStateDependencies } from '../interfaces';
import { CelestialBody } from './celestial-body';
import { BodyTypeEnum, MoonTypeEnum } from './body-enums';

/**
 * Procedural/custom "Moon" body.
 * This mirrors the old Satellite constructor behavior, but uses BodyTypeEnum.Moon
 * so we can reserve `Satellite` for orbital vehicles (ISS, etc).
 */
export class Moon extends CelestialBody {
    moonType: MoonTypeEnum;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: IMoonCreationOptions
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
                trailColor: options.trailColor ?? 0xffffff,
                maxTrail: options.maxTrail ?? 500,
                hasRings: false,
                rotation: options.rotation,
                mesh: options.mesh,
                tidalLock: options.tidalLock,
                seed: options.seed
            },
            BodyTypeEnum.Moon
        );

        this.moonType = options.moonType;
    }
}
