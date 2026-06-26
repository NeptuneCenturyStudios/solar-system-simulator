import * as THREE from 'three';
import { IStateDependencies } from '../interfaces';
import { createUniqueId } from '../utilities/utilities';
import { STAR_LIGHT_DISTANCE, SUN_AXIS, SUN_AZIMUTH, SUN_LIGHT_INTENSITY, SUN_MASS, SUN_RADIUS } from '../utilities/consts';
import { MainSequenceStar } from './main-sequence-star';

export class Sun extends MainSequenceStar {
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        const rotSpeed = (2 * Math.PI) / (25.38 * 3600); // sidereal rotation, no orbital scaling
        super(dependencies, scene, {
            radius: SUN_RADIUS,
            pos: new THREE.Vector3(0, 0, 0),
            vel: new THREE.Vector3(0, 0, 0),
            mass: SUN_MASS,
            id: createUniqueId('sun'),
            name: 'Sun',
            temperature: 5778,
            lightIntensity: SUN_LIGHT_INTENSITY,
            lightDistance: STAR_LIGHT_DISTANCE,
            rotation: { tilt: SUN_AXIS, speed: rotSpeed, azimuth: SUN_AZIMUTH },
            mesh: undefined, // Todo, implment star material/mesh in MainSequenceStar and use here
        });
    }
}
