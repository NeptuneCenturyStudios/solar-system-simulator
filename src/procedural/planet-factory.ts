import * as THREE from 'three';
import { IStateDependencies } from '../interfaces';
import { Planet } from '../bodies/planet';
import { DwarfPlanet } from '../bodies/dwarf-planet';
import { BodyTypeEnum } from '../utilities/utilities';
import { PlanetTypeEnum } from '../utilities/body-params';
import {
    fictionalTextures,
    fictionalVolcanicTexture,
    fictionalFrozenTexture,
    fictionalOceanTexture,
    fictionalDesertTexture,
    fictionalGasTextures,
    fictionalIceTextures,
} from '../drawing/textures';

export type ProceduralPlanetSubtype =
    | 'solid'
    | 'gas_giant'
    | 'ice_giant'
    | 'volcanic'
    | 'ocean'
    | 'frozen'
    | 'desert';

export type PlanetBodyType = BodyTypeEnum.Planet | BodyTypeEnum.DwarfPlanet;

export type ProceduralPlanetCreation = {
    id: string;
    name: string;
    pos: THREE.Vector3;
    vel: THREE.Vector3;

    bodyType: PlanetBodyType;
    bodySubtype: PlanetTypeEnum;

    radius: number;
    mass: number;
    rotationSpeed: number;

    /**
     * For texture pools with multiple options:
     * - 'solid' uses fictionalTextures
     * - 'gas_giant' uses fictionalGasTextures
     * - 'ice_giant' uses fictionalIceTextures
     * For deterministic textures (volcanic/ocean/frozen/desert), this can be omitted.
     */
    textureIndex?: number;
};

function pickTextureForSolidSubtype(
    subtype: PlanetTypeEnum,
    textureIndex: number | undefined
): THREE.Texture {
    // Deterministic custom textures first (match custom creation in index.ts)
    if (subtype === PlanetTypeEnum.Volcanic) return fictionalVolcanicTexture;
    if (subtype === PlanetTypeEnum.Ocean) return fictionalOceanTexture;
    if (subtype === PlanetTypeEnum.Frozen) return fictionalFrozenTexture;
    if (subtype === PlanetTypeEnum.Desert) return fictionalDesertTexture;

    // Remaining solid-like uses the pooled random textures (deterministic via textureIndex)
    const idx = Math.max(0, textureIndex ?? 0);
    return fictionalTextures[idx % fictionalTextures.length]!;
}

function pickTextureForGasIceSubtype(
    subtype: PlanetTypeEnum,
    textureIndex: number | undefined
): THREE.Texture {
    const idx = Math.max(0, textureIndex ?? 0);
    if (subtype === PlanetTypeEnum.GasGiant) return fictionalGasTextures[idx % fictionalGasTextures.length]!;
    return fictionalIceTextures[idx % fictionalIceTextures.length]!;
}

export function createPlanetBodyFromProceduralCreation(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    creation: ProceduralPlanetCreation
): Planet | DwarfPlanet {
    const { bodyType, bodySubtype, radius, mass, pos, vel, id, name, rotationSpeed } = creation;

    const geometry = new THREE.SphereGeometry(radius, 32, 32);

    const texture =
        bodySubtype === PlanetTypeEnum.GasGiant || bodySubtype === PlanetTypeEnum.IceGiant
            ? pickTextureForGasIceSubtype(bodySubtype, creation.textureIndex)
            : pickTextureForSolidSubtype(bodySubtype, creation.textureIndex);

    // TEMP DEBUG: Procedural bodies can be extremely far from the origin.
    // Use an unlit material + disable depthTest/write so we can verify the mesh is actually being drawn.
    const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
            map: texture,
            color: 0xffffff, // keep texture untinted
            transparent: false,
            depthTest: false,
            depthWrite: false,
        })
    );

    // Procedural systems are spawned at extremely large world coordinates.
    // With log-depth + huge transforms, Mesh frustum culling can occasionally misclassify them.
    // Disable culling for procedural planets to ensure visibility.
    mesh.frustumCulled = false;

    const commonOptions = {
        radius,
        pos,
        vel,
        mass,
        id,
        name,
        bodySubtype,
        trailColor: 0x888888,
        maxTrail: 3000,
        hasRings: false,
        rotation: { tilt: 0, speed: rotationSpeed },
        mesh,
    };

    if (bodyType === BodyTypeEnum.DwarfPlanet) {
        return new DwarfPlanet(dependencies, scene, commonOptions);
    }

    return new Planet(dependencies, scene, commonOptions);
}
