import * as THREE from 'three';
import { IStateDependencies } from '../interfaces';
import { Planet } from '../bodies/planet';
import { DwarfPlanet } from '../bodies/dwarf-planet';
import { SeededRandom } from '../utilities/prng';
import {
    gasGiantTextures,
    iceGiantTextures,
    getMetalnessForPlanetTexture,
    getRoughnessForPlanetTexture,
    getVolcanicEmissiveMap,
    terrestrialTextures,
    volcanicTextures,
    oceanTextures,
    frozenTextures,
    desertTextures,
    temperateTextures,
    cloudTextures,
} from '../drawing/textures';

import { BodyTypeEnum, MoonTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';
import type { CelestialBody } from '../bodies/celestial-body';

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

/**
 * Given a planet type and a seeded random number generator, this function selects an appropriate texture for the planet.
 * @param planetType The type of the planet for which to pick a texture.
 * @param rng A seeded random number generator to ensure reproducible results.
 * @returns A texture suitable for the given planet type, or null if no texture is available.
 */
export function pickTextureForPlanetType(
    planetType: PlanetTypeEnum,
    rng: SeededRandom
): THREE.Texture | null {
    let texturePack: THREE.Texture[] = [];

    if (planetType === PlanetTypeEnum.Terrestrial) {
        texturePack = terrestrialTextures;
    }
    if (planetType === PlanetTypeEnum.Volcanic) {
        texturePack = volcanicTextures;
    }
    if (planetType === PlanetTypeEnum.Ocean) {
        texturePack = oceanTextures;
    }
    if (planetType === PlanetTypeEnum.Frozen) {
        texturePack = frozenTextures;
    }
    if (planetType === PlanetTypeEnum.Desert) {
        texturePack = desertTextures;
    }
    if (planetType === PlanetTypeEnum.Temperate) {
        texturePack = temperateTextures;
    }
    if (planetType === PlanetTypeEnum.GasGiant) {
        texturePack = gasGiantTextures;
    }
    if (planetType === PlanetTypeEnum.IceGiant) {
        texturePack = iceGiantTextures;
    }

    // Pick random texture from the selected pack using the seeded RNG
    const texture = rng.pick(texturePack);
    return texture;
}

function buildMeshMaterial(creation: ProceduralPlanetCreation): THREE.MeshStandardMaterial {
    const { bodySubtype, textureSeed } = creation;

    if (!textureSeed) {
        throw new Error('Texture seed is required for deterministic planet texture selection.');
    }

    const rng = new SeededRandom(textureSeed);

    const texture = pickTextureForPlanetType(bodySubtype, rng);

    const material = new THREE.MeshStandardMaterial({
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

    // Volcanic planets get a derived emissive map so lava areas actually glow
    if (bodySubtype === PlanetTypeEnum.Volcanic && texture) {
        const texIdx = volcanicTextures.indexOf(texture);
        const emissiveUrl = texIdx !== -1
            ? `./assets/textures/bodies/2k/procedural/volcanic-${texIdx + 1}.jpg`
            : null;
        if (emissiveUrl) {
            material.emissiveMap = getVolcanicEmissiveMap(emissiveUrl);
            material.emissive = new THREE.Color(0xff3300);
            material.emissiveIntensity = 0.6;
        }
    }

    return material;
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

/** Probability (0–1) that a given planet/moon subtype has a cloud layer. */
const CLOUD_CHANCE: Record<string, number> = {
    [PlanetTypeEnum.Temperate]: 1.0,
    [PlanetTypeEnum.Ocean]: 0.75,
    [PlanetTypeEnum.Terrestrial]: 0.4,
    [PlanetTypeEnum.Desert]: 0.2,
    [PlanetTypeEnum.Frozen]: 0.2,
    [PlanetTypeEnum.Volcanic]: 0.15,
};

/**
 * Attaches a procedural cloud layer to the given body if the type and seeded RNG
 * determine that it should have one. Gas giants and ice giants are always skipped.
 *
 * @param body          The CelestialBody to attach clouds to.
 * @param subtype       The planet or moon subtype enum value.
 * @param seed          Deterministic seed string for this body.
 * @param rotationSpeed The body's base rotation speed (clouds rotate at 1.3×).
 */
export function addCloudLayer(
    body: CelestialBody,
    subtype: PlanetTypeEnum | MoonTypeEnum,
    seed: string,
    rotationSpeed: number
): void {
    // Gas/ice giants never get a cloud layer via this path.
    if (subtype === PlanetTypeEnum.GasGiant || subtype === PlanetTypeEnum.IceGiant) return;

    const chance = CLOUD_CHANCE[subtype] ?? 0;
    if (chance <= 0) return;

    const enableRng = new SeededRandom(`${seed}|clouds-enabled`);
    if (chance < 1.0 && !enableRng.chance(chance)) return;

    if (cloudTextures.length === 0) return;

    const textureRng = new SeededRandom(`${seed}|clouds-texture`);
    const cloudTexture = textureRng.pick(cloudTextures);
    if (!cloudTexture) return;

    const cloudsMat = new THREE.MeshStandardMaterial({
        map: cloudTexture,
        alphaMap: cloudTexture,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        depthTest: true,
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.0,
    });

    const cloudsGeo = new THREE.SphereGeometry(body.radius * 1.03, 64, 64);
    body.clouds = new THREE.Mesh(cloudsGeo, cloudsMat);
    body.clouds.renderOrder = 2;
    body.clouds.receiveShadow = true;
    body.clouds.userData = { parentBody: body };
    body.mesh.add(body.clouds);

    body.cloudRotationSpeed = rotationSpeed * 1.3;
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
    const body = createCommonPlanetOptions(dependencies, scene, creation, mesh, hasRings);

    addCloudLayer(body, creation.bodySubtype, creation.textureSeed!, creation.rotationSpeed);

    return body;
}
