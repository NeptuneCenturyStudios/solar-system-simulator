import * as THREE from 'three';

export interface IShipEffect {
    init(): void;
    update(
        nozzle: THREE.Vector3,
        speed: number,
        maxSpeed: number,
        thrusting: boolean,
        shipVelocity: THREE.Vector3,
        exhaustDir: THREE.Vector3,
        dt: number
    ): void;
    hide(): void;
    dispose(): void;
}
