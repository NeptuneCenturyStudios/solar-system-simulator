import * as THREE from 'three';

import { CelestialBody } from './celestial-body.js';
import { calculateTrajectory } from '../physics/physics.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import { PLUTO_DIST, PLUTO_MASS, SUN_MASS, PLUTO_RADIUS } from '../utilities/consts.js';
import { IStateDependencies } from '../interfaces.js';

export class Pluto extends CelestialBody {
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, plutoTexture: THREE.Texture) {
        const trajectory = calculateTrajectory(PLUTO_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: plutoTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.95,
        });

        super(
            dependencies,
            scene,
            PLUTO_RADIUS,
            0xffffff,
            trajectory.pos,
            trajectory.vel,
            PLUTO_MASS,
            createUniqueId('pluto'),
            'Pluto',
            BodyTypeEnum.DwarfPlanet,
            0xddbb99,
            20000,
            false,
            { axis: new THREE.Vector3(0, 1, 0), speed: 0.08 },
            undefined,
            material
        );
    }
}
