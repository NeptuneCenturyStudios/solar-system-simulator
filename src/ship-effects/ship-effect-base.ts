import * as THREE from 'three';

export interface IShipEffect {
    init(): void;
    update(
        nozzle: THREE.Vector3,
        speed: number,
        maxSpeed: number,
        boosting: boolean,
        thrusting: boolean,
        shipVelocity: THREE.Vector3,
        exhaustDir: THREE.Vector3,
        dt: number,
        cameraPos: THREE.Vector3
    ): void;
    hide(): void;
    dispose(): void;
}
