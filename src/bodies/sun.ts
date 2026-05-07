import * as THREE from 'three';
import { IStateDependencies } from '../interfaces';
import { createUniqueId } from '../utilities/utilities';
import { SUN_AXIS, SUN_MASS, SUN_RADIUS, SUN_ROT_SPEED } from '../utilities/consts';
import { MainSequenceStar } from './main-sequence-star';
import { calculateRotation } from '../physics/physics';

export class Sun extends MainSequenceStar {
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        // Calculate the Sun's rotation based on its axial tilt and rotation speed.
        const rotation = calculateRotation(SUN_AXIS, SUN_ROT_SPEED);

        super(dependencies, scene, {
            radius: SUN_RADIUS,
            pos: new THREE.Vector3(0, 0, 0),
            vel: new THREE.Vector3(0, 0, 0),
            mass: SUN_MASS,
            id: createUniqueId('sun'),
            name: 'Sun',
            temperature: 5778,
            lightIntensity: 500000000,
            lightDistance: 524400,
            rotation: rotation,
        });
    }
}
