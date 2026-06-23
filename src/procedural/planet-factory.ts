import * as THREE from 'three';
import { IStateDependencies } from '../interfaces';
import { Planet } from '../bodies/planet';
import { DwarfPlanet } from '../bodies/dwarf-planet';
import { SeededRandom } from '../utilities/prng';
import {
    fictionalTerrestrialTextures,
    fictionalVolcanicTexture,
    fictionalFrozenTexture,
    fictionalOceanTexture,
    fictionalDesertTexture,
    fictionalTemperateTexture,
    fictionalGasTextures,
    fictionalIceTextures,
    getMetalnessForPlanetTexture,
    getRoughnessForPlanetTexture,
} from '../drawing/textures';

import { BodyTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';

export type ProceduralPlanetSubtype =
    | 'solid'
    | 'gas_giant'
    | 'ice_giant'
    | 'volcanic'
    | 'ocean'
    | 'frozen'
    | 'desert'
    | 'temperate';

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
    rotationTilt: number;
    rotationAzimuth: number;

    /**
     * Optional override for whether this planet should have rings.
     * UI-only feature: only applies to planets (not dwarf planets).
     */
    hasRings?: boolean;

    /**
     * For texture pools with multiple options:
     * - 'solid' uses fictionalTextures
     * - 'gas_giant' uses fictionalGasTextures
     * - 'ice_giant' uses fictionalIceTextures
     */
    textureIndex?: number;

    /**
     * Seed used for deterministic textures (currently: desert/ocean/frozen).
     * Generated in planet-generator.ts and kept stable across runs.
     */
    textureSeed?: string;
};

function computeRingPresence(creation: ProceduralPlanetCreation): { hasRings: boolean } {
    const { id, bodySubtype, hasRings, bodyType } = creation;

    const GAS_GIANT_RINGS_PROB = 0.85;
    const ICE_GIANT_RINGS_PROB = 0.7;
    const SOLID_RINGS_PROB = 0.08;

    const ringRng = new SeededRandom(`${id}|rings-enabled`);
    const hasRingsProbabilistic =
        bodySubtype === PlanetTypeEnum.GasGiant
            ? ringRng.chance(GAS_GIANT_RINGS_PROB)
            : bodySubtype === PlanetTypeEnum.IceGiant
              ? ringRng.chance(ICE_GIANT_RINGS_PROB)
              : ringRng.chance(SOLID_RINGS_PROB);

    const resolved =
        typeof hasRings === 'boolean' && bodyType === BodyTypeEnum.Planet
            ? hasRings
            : hasRingsProbabilistic;

    return { hasRings: resolved };
}

function pickTextureForSolidSubtype(
    subtype: PlanetTypeEnum,
    textureIndex: number | undefined
): THREE.Texture {
    // Always use static JPG textures — procedural upgrades happen asynchronously.
    if (subtype === PlanetTypeEnum.Volcanic) return fictionalVolcanicTexture;
    if (subtype === PlanetTypeEnum.Frozen) return fictionalFrozenTexture;
    if (subtype === PlanetTypeEnum.Desert) return fictionalDesertTexture;
    if (subtype === PlanetTypeEnum.Ocean) return fictionalOceanTexture;
    if (subtype === PlanetTypeEnum.Temperate) return fictionalTemperateTexture;

    const idx = Math.max(0, textureIndex ?? 0);
    return fictionalTerrestrialTextures[idx % fictionalTerrestrialTextures.length]!;
}

function pickTextureForGasIceSubtype(
    subtype: PlanetTypeEnum,
    textureIndex: number | undefined
): THREE.Texture {
    const idx = Math.max(0, textureIndex ?? 0);
    if (subtype === PlanetTypeEnum.GasGiant)
        return fictionalGasTextures[idx % fictionalGasTextures.length]!;
    return fictionalIceTextures[idx % fictionalIceTextures.length]!;
}

function buildMeshMaterial(creation: ProceduralPlanetCreation): THREE.MeshStandardMaterial {
    const { bodySubtype, textureIndex } = creation;

    const texture =
        bodySubtype === PlanetTypeEnum.GasGiant || bodySubtype === PlanetTypeEnum.IceGiant
            ? pickTextureForGasIceSubtype(bodySubtype, textureIndex)
            : pickTextureForSolidSubtype(bodySubtype, textureIndex);

    return new THREE.MeshStandardMaterial({
        map: texture,
        color: 0xffffff,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: getRoughnessForPlanetTexture(bodySubtype),
        metalness: getMetalnessForPlanetTexture(bodySubtype),
        transparent: false,
        depthTest: true,
        depthWrite: true,
    });
}

function createCommonPlanetOptions(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    creation: ProceduralPlanetCreation,
    mesh: THREE.Mesh,
    hasRings: boolean
): Planet | DwarfPlanet {
    const {
        radius,
        pos,
        vel,
        mass,
        id,
        name,
        bodySubtype,
        rotationSpeed,
        rotationTilt,
        rotationAzimuth,
        bodyType,
        textureSeed,
    } = creation;

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
        hasRings,
        rotation: { tilt: rotationTilt, speed: rotationSpeed, azimuth: rotationAzimuth },
        mesh,
        seed: textureSeed,
    };

    if (bodyType === BodyTypeEnum.DwarfPlanet) {
        return new DwarfPlanet(dependencies, scene, commonOptions);
    }

    return new Planet(dependencies, scene, commonOptions);
}

export function createPlanetBodyFromProceduralCreation(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    creation: ProceduralPlanetCreation
): Planet | DwarfPlanet {
    const geometry = new THREE.SphereGeometry(creation.radius, 64, 64);
    const material = buildMeshMaterial(creation);
    const mesh = new THREE.Mesh(geometry, material);

    const { hasRings } = computeRingPresence(creation);
    return createCommonPlanetOptions(dependencies, scene, creation, mesh, hasRings);
}
