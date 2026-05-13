import * as THREE from 'three';
import { IStateDependencies } from '../interfaces';
import { createUniqueId } from '../utilities/utilities';
import { DIST_SCALE, SUN_AXIS, SUN_MASS, SUN_RADIUS, SUN_ROT_SPEED } from '../utilities/consts';
import { MainSequenceStar } from './main-sequence-star';

export class Sun extends MainSequenceStar {
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        super(dependencies, scene, {
            radius: SUN_RADIUS,
            pos: new THREE.Vector3(0, 0, 0),
            vel: new THREE.Vector3(0, 0, 0),
            mass: SUN_MASS,
            id: createUniqueId('sun'),
            name: 'Sun',
            temperature: 5778,
            lightIntensity: 2_000_000_000,
            lightDistance: 1_500_000_000 / DIST_SCALE,
            rotation: { tilt: SUN_AXIS, speed: SUN_ROT_SPEED },
            mesh: undefined, // Todo, implment star material/mesh in MainSequenceStar and use here
        });
    }
}
