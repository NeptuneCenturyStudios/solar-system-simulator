import * as THREE from 'three';
import { Spaceship } from './spaceship';
import { ISpaceshipHandling } from '../../interfaces';
import type { WeaponConstructor } from '../../ship-effects/weapons/weapon';

/**
 * Fighter class extends Spaceship with handling characteristics specific to
 * a nimble starfighter.
 */
export abstract class Fighter extends Spaceship {
    constructor(
        dependencies: object,
        scene: THREE.Scene,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        id: string,
        flightHandling: ISpaceshipHandling,
        weaponLoadout: WeaponConstructor[],
        modelName: string = 'Lo_poly_Spaceship_01_by_Liz_Reddington'
    ) {
        

        super(
            dependencies,
            scene,
            position,
            velocity,
            id,
            modelName,
            flightHandling,
            weaponLoadout
        );
    }
}
