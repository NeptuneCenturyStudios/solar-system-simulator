import * as THREE from 'three';
import { IStateDependencies } from '../interfaces';
import { Planet } from '../bodies/planet';
import { DwarfPlanet } from '../bodies/dwarf-planet';
import { SeededRandom } from '../utilities/prng';
import {
    fictionalTextures,
    fictionalVolcanicTexture,
    fictionalFrozenTexture,
    fictionalOceanTexture,
    fictionalDesertTexture,
    fictionalTemperateTexture,
    fictionalGasTextures,
    fictionalIceTextures,
} from '../drawing/textures';

// New deterministic, seam-free procedural desert generator.
import {
    getDesertNormalTexture,
    getDesertTexture,
    getDesertNormalTextureAsync,
    getDesertTextureAsync,
    type DesertGenerationProgress,
} from './desert/desert-texture-generator';

// New deterministic, seam-free procedural ocean generator.
import {
    getOceanTexture,
    getOceanNormalTexture,
    getOceanNormalTextureAsync,
    getOceanTextureAsync,
    type OceanGenerationProgress,
} from './ocean/ocean-texture-generator';

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
     * Seed used for deterministic textures (currently: desert).
     * Generated in planet-generator.ts and kept stable across runs.
     */
    textureSeed?: string;
};

function computeRingPresence(
    creation: ProceduralPlanetCreation
): { hasRings: boolean } {
    const { id, bodySubtype, hasRings, bodyType } = creation;

    // Ring presence is probabilistic (deterministic per planet id) so not all gas/ice giants get rings,
    // and regular planets can occasionally have them.
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
        typeof hasRings === 'boolean' && bodyType === BodyTypeEnum.Planet ? hasRings : hasRingsProbabilistic;

    return { hasRings: resolved };
}

// `textureSeed` is optional so existing creation paths still work;
// for desert we prefer it, but fall back to the existing fictional desert JPG.
function pickTextureForSolidSubtype(
    subtype: PlanetTypeEnum,
    textureIndex: number | undefined,
    textureSeed: string | undefined
): THREE.Texture {
    // Deterministic custom textures first (match custom creation in index.ts)
    if (subtype === PlanetTypeEnum.Volcanic) return fictionalVolcanicTexture;
    if (subtype === PlanetTypeEnum.Frozen) return fictionalFrozenTexture;

    if (subtype === PlanetTypeEnum.Desert) {
        if (!textureSeed) return fictionalDesertTexture;
        return getDesertTexture(textureSeed);
    }
    if (subtype === PlanetTypeEnum.Ocean) {
        if (!textureSeed) return fictionalOceanTexture;
        return getOceanTexture(textureSeed);
    }
    if (subtype === PlanetTypeEnum.Temperate) return fictionalTemperateTexture;

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

function buildMeshMaterialSync(
    creation: ProceduralPlanetCreation
): THREE.MeshStandardMaterial {
    const { bodySubtype, textureIndex, textureSeed } = creation;
    const isDesert = bodySubtype === PlanetTypeEnum.Desert;
    const isOcean = bodySubtype === PlanetTypeEnum.Ocean;

    const texture =
        bodySubtype === PlanetTypeEnum.GasGiant || bodySubtype === PlanetTypeEnum.IceGiant
            ? pickTextureForGasIceSubtype(bodySubtype, textureIndex)
            : pickTextureForSolidSubtype(bodySubtype, textureIndex, textureSeed);

    const desertNormalMap = isDesert && textureSeed ? getDesertNormalTexture(textureSeed) : null;
    const oceanNormalMap = isOcean && textureSeed ? getOceanNormalTexture(textureSeed) : null;
    const normalMap = desertNormalMap ?? oceanNormalMap;

    return new THREE.MeshStandardMaterial({
        map: texture,
        normalMap: normalMap ?? undefined,
        // Lower normal strength for deserts so it doesn't look like foil.
        normalScale: normalMap
            ? isDesert
                ? new THREE.Vector2(0.7, 0.7)
                : new THREE.Vector2(0.5, 0.5)
            : undefined,
        color: 0xffffff, // keep texture untinted
        emissive: 0x000000,
        emissiveIntensity: 0,
        // Deserts should be very non-metallic, very rough.
        roughness: isDesert ? 0.95 : isOcean ? 0.8 : 0.7,
        metalness: isDesert ? 0.02 : isOcean ? 0.02 : 0.85,
        transparent: false,
        depthTest: true,
        depthWrite: true,
    });
}

async function buildMeshMaterialDesertAsync(
    creation: ProceduralPlanetCreation,
    onDesertProgress?: (progress: DesertGenerationProgress) => void,
    options?: { signal?: AbortSignal }
): Promise<THREE.MeshStandardMaterial> {
    const { bodySubtype, textureSeed } = creation;
    const isDesert = bodySubtype === PlanetTypeEnum.Desert;
    if (!isDesert) throw new Error('buildMeshMaterialDesertAsync called for non-desert');

    if (!textureSeed) {
        // No seed => fallback to fictional JPG (fast, sync).
        return new THREE.MeshStandardMaterial({
            map: fictionalDesertTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.95,
            metalness: 0.02,
            transparent: false,
            depthTest: true,
            depthWrite: true,
        });
    }

    const [color, normal] = await Promise.all([
        getDesertTextureAsync(textureSeed, onDesertProgress, { signal: options?.signal }),
        getDesertNormalTextureAsync(textureSeed, onDesertProgress, { signal: options?.signal }),
    ]);

    return new THREE.MeshStandardMaterial({
        map: color,
        normalMap: normal,
        normalScale: new THREE.Vector2(0.7, 0.7),
        color: 0xffffff,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.95,
        metalness: 0.02,
        transparent: false,
        depthTest: true,
        depthWrite: true,
    });
}

async function buildMeshMaterialOceanAsync(
    creation: ProceduralPlanetCreation,
    onOceanProgress?: (progress: OceanGenerationProgress) => void,
    options?: { signal?: AbortSignal }
): Promise<THREE.MeshStandardMaterial> {
    const { bodySubtype, textureSeed } = creation;
    const isOcean = bodySubtype === PlanetTypeEnum.Ocean;
    if (!isOcean) throw new Error('buildMeshMaterialOceanAsync called for non-ocean');

    if (!textureSeed) {
        // No seed => fallback to fictional ocean JPG (fast, sync).
        return new THREE.MeshStandardMaterial({
            map: fictionalOceanTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.8,
            metalness: 0.02,
            transparent: false,
            depthTest: true,
            depthWrite: true,
        });
    }

    const [color, normal] = await Promise.all([
        getOceanTextureAsync(textureSeed, onOceanProgress, { signal: options?.signal }),
        getOceanNormalTextureAsync(textureSeed, onOceanProgress, { signal: options?.signal }),
    ]);

    return new THREE.MeshStandardMaterial({
        map: color,
        normalMap: normal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        color: 0xffffff,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.8,
        metalness: 0.02,
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
    const { radius, pos, vel, mass, id, name, bodySubtype, rotationSpeed, bodyType } = creation;

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
        rotation: { tilt: 0, speed: rotationSpeed },
        mesh,
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
    const material = buildMeshMaterialSync(creation);
    const mesh = new THREE.Mesh(geometry, material);

    const { hasRings } = computeRingPresence(creation);
    return createCommonPlanetOptions(dependencies, scene, creation, mesh, hasRings);
}

export async function createPlanetBodyFromProceduralCreationAsync(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    creation: ProceduralPlanetCreation,
    options?: {
        onDesertProgress?: (progress: DesertGenerationProgress) => void;
        onOceanProgress?: (progress: OceanGenerationProgress) => void;
        signal?: AbortSignal;
    }
): Promise<Planet | DwarfPlanet> {
    const geometry = new THREE.SphereGeometry(creation.radius, 64, 64);

    const isDesert = creation.bodySubtype === PlanetTypeEnum.Desert;
    const isOcean = creation.bodySubtype === PlanetTypeEnum.Ocean;

    const onDesertProgress = options?.onDesertProgress;
    const onOceanProgress = options?.onOceanProgress;

    let material: THREE.MeshStandardMaterial;
    if (isDesert) {
        material = await buildMeshMaterialDesertAsync(creation, onDesertProgress, { signal: options?.signal });
    } else if (isOcean) {
        material = await buildMeshMaterialOceanAsync(creation, onOceanProgress, { signal: options?.signal });
    } else {
        material = buildMeshMaterialSync(creation);
    }

    const mesh = new THREE.Mesh(geometry, material);

    const { hasRings } = computeRingPresence(creation);
    return createCommonPlanetOptions(dependencies, scene, creation, mesh, hasRings);
}
