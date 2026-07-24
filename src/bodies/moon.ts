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
            options.tidalLock,
            options.seed
        );

        this.moonType = options.moonType;

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
