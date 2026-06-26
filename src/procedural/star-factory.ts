import * as THREE from 'three';
import { MainSequenceStar } from '../bodies/main-sequence-star';
import type { StarParams } from '../utilities/body-params';
import type { IStateDependencies } from '../interfaces';
import { STAR_LIGHT_DISTANCE } from '../utilities/consts';

/**
 * Scene-dependent body factory for a "main sequence star" using the shared, pure
 * parameter generator (`randomStarParams` / `StarParams`).
 *
 * This is intentionally small so both procedural generation and custom star
 * creation paths can share the exact same instantiation logic.
 */
export function createMainSequenceStarFromParams(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    params: StarParams,
    {
        id,
        name,
        pos,
        vel,
        rotation,
    }: {
        id: string;
        name: string;
        pos: THREE.Vector3;
        vel: THREE.Vector3;
        rotation?: { tilt: number; speed: number; azimuth?: number };
    }
): MainSequenceStar {
    return new MainSequenceStar(dependencies, scene, {
        radius: params.radius,
        pos,
        vel,
        mass: params.mass,
        id,
        name,
        temperature: params.temperature,
        lightIntensity: params.lightIntensity,
        lightDistance: STAR_LIGHT_DISTANCE,
        rotation: rotation ?? {
            tilt: params.rotationTilt,
            speed: params.rotationSpeed,
            azimuth: params.rotationAzimuth,
        },
        mesh: undefined, // use default star material/mesh
    });
}
