import * as THREE from 'three';
import type { IStateDependencies } from '../interfaces';
import type { AsteroidBase } from '../bodies/asteroid-base';
import { getAsteroidVariantById } from '../bodies/asteroid-variants';
import type { IPlanetaryAttributes } from '../bodies/body-attributes';

export type ProceduralAsteroidCreation = {
    id: string;
    name: string;
    pos: THREE.Vector3;
    vel: THREE.Vector3;

    radius: number;
    mass: number;
    rotationSpeed: number;
    rotationTilt: number;
    rotationAzimuth: number;

    /**
     * Registry id of the asteroid variant to instantiate (see asteroid-variants.ts).
     * Chosen procedurally by the generator so the same seed always yields the same mix.
     */
    variantId: string;

    /** Index into the system's star array this asteroid orbits, or -1 for a P-type orbit. */
    hostStarIndex: number;

    /** Hidden/discoverable science data. */
    attributes: IPlanetaryAttributes;
};

/**
 * Instantiates a scene-attached asteroid variant from a procedural creation descriptor.
 *
 * The descriptor names its variant, so the procedural generation pipeline controls the mix
 * of rock models through the same registry the scenarios use.
 */
export function createAsteroidBodyFromProceduralCreation(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    creation: ProceduralAsteroidCreation
): AsteroidBase {
    const {
        id,
        name,
        pos,
        vel,
        radius,
        mass,
        rotationSpeed,
        rotationTilt,
        rotationAzimuth,
        variantId,
        attributes,
    } = creation;

    return getAsteroidVariantById(variantId).create(dependencies, scene, {
        id,
        name,
        pos,
        vel,
        radius,
        mass,
        rotation: { tilt: rotationTilt, speed: rotationSpeed, azimuth: rotationAzimuth },
        attributes,
    });
}
