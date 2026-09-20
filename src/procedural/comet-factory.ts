import * as THREE from 'three';
import type { IStateDependencies } from '../interfaces';
import type { CometBase } from '../bodies/comet-base';
import { createCometBodyForVariant } from '../bodies/comet-variants';
import type { IPlanetaryAttributes } from '../bodies/body-attributes';

export type ProceduralCometCreation = {
    id: string;
    name: string;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    radius: number;
    mass: number;
    rotationSpeed: number;
    rotationTilt: number;
    rotationAzimuth: number;
    tailColor: number;

    /**
     * Registry id of the comet variant to instantiate (see comet-variants.ts).
     * Chosen procedurally by the generator so the same seed always yields the same mix.
     */
    variantId: string;

    /** Index into the system's star array this comet orbits, or -1 for a P-type orbit. */
    hostStarIndex: number;

    /** Hidden/discoverable science data. */
    attributes: IPlanetaryAttributes;
};

/**
 * Instantiates a scene-attached comet variant from a procedural creation descriptor.
 *
 * The descriptor names its variant, so the procedural pipeline controls the mix of nucleus
 * models through the same registry the manual Add Comet flow uses for its default.
 */
export function createCometBodyFromProceduralCreation(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    creation: ProceduralCometCreation
): CometBase {
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
        tailColor,
        variantId,
        attributes,
    } = creation;

    return createCometBodyForVariant(
        dependencies,
        scene,
        {
            id,
            name,
            pos,
            vel,
            radius,
            mass,
            rotation: { tilt: rotationTilt, speed: rotationSpeed, azimuth: rotationAzimuth },
            tailColor,
            attributes,
        },
        variantId
    );
}
