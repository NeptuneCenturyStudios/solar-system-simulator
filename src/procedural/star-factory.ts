import * as THREE from 'three';
import { MainSequenceStar } from '../bodies/main-sequence-star';
import type { StarParams } from '../utilities/body-params';
import type { IMagneticFieldOptions, IStateDependencies } from '../interfaces';
import { STAR_LIGHT_DISTANCE } from '../utilities/consts';
import { SeededRandom } from '../utilities/prng';
import { rollMagneticField } from './magnetic-field';
import { computeStellarAttributes } from './star-attributes';

export type ProceduralStarCreation = {
    id: string;
    name: string;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    starParams: StarParams;
    rotation?: { tilt: number; speed: number; azimuth?: number };
    /**
     * Optional override for this star's magnetic field, set by the Add/Edit panel.
     * Undefined means "roll for one"; an explicit null means "no field".
     */
    magneticField?: IMagneticFieldOptions | null;
    /** True when this star actually orbits something (a companion star or a black hole),
     *  making its orbital period a meaningful discoverable attribute. Defaults to false — a
     *  lone star has no orbit. */
    hasOrbitalPeriod?: boolean;
};

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
        magneticField,
        hasOrbitalPeriod,
    }: {
        id: string;
        name: string;
        pos: THREE.Vector3;
        vel: THREE.Vector3;
        rotation?: { tilt: number; speed: number; azimuth?: number };
        magneticField?: IMagneticFieldOptions | null;
        hasOrbitalPeriod?: boolean;
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
        // Every star has a field, so an absent override always rolls one. Keyed to the
        // star's own params seed so the same seed reproduces the same field.
        magneticField:
            magneticField !== undefined
                ? magneticField
                : rollMagneticField(new SeededRandom(`${params.seed}|magnetic-field`), 'star'),
        attributes: computeStellarAttributes({
            id,
            mass: params.mass,
            hasOrbitalPeriod: hasOrbitalPeriod ?? false,
        }),
    });
}

/**
 * Instantiates a scene-attached {@link MainSequenceStar} from a procedural
 * creation descriptor, matching the generator-factory pattern used by all
 * other body types.
 */
export function createStarBodyFromProceduralCreation(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    creation: ProceduralStarCreation
): MainSequenceStar {
    return createMainSequenceStarFromParams(dependencies, scene, creation.starParams, {
        id: creation.id,
        name: creation.name,
        pos: creation.pos,
        vel: creation.vel,
        rotation: creation.rotation,
        magneticField: creation.magneticField,
        hasOrbitalPeriod: creation.hasOrbitalPeriod,
    });
}
