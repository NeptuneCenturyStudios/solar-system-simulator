import * as THREE from 'three';
import { IStateDependencies, type IMagneticFieldOptions } from '../interfaces';
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
} from '../drawing/textures';

import { BodyTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';
import { rollMagneticField, type MagneticFieldKind } from './magnetic-field';
import { buildBodySphereGeometry } from '../utilities/utilities';
import type { IPlanetaryAttributes } from '../bodies/body-attributes';
import { computePlanetaryAttributes } from './planet-attributes';
import {
    type AtmosphereBodyKind,
    type IAtmosphereProfile,
    resolveAtmosphereProfile,
} from './atmosphere-profile';
import { applyAtmosphereToBody } from './atmosphere-factory';

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
     * Optional override for this planet's magnetic field, set by the Add/Edit panel.
     * Undefined means "roll for one"; an explicit null means "no field".
     */
    magneticField?: IMagneticFieldOptions | null;

    /**
     * Seed used for deterministic textures (currently: desert/ocean/frozen).
     * Generated in planet-generator.ts and kept stable across runs.
     */
    textureSeed?: string;

    /**
     * Normalized 0..1 position within the system's planet distance ordering (0=near star).
     * Omitted by the custom Add/Edit panel creation path — defaults to mid-range (0.5).
     */
    distanceT01?: number;

    /**
     * Index into the system's star array this planet orbits, or -1 for a P-type
     * (circumbinary/barycentric) orbit with no single host star. Omitted by the custom
     * Add/Edit panel creation path, which doesn't track a host star index.
     */
    hostStarIndex?: number;

    /**
     * Hidden/discoverable science data. Undefined means "roll for one" (rolled here from
     * bodySubtype/distanceT01, mirroring how computeMagneticField resolves an absent field);
     * generated explicitly in planet-generator.ts for the main procedural pipeline.
     */
    attributes?: IPlanetaryAttributes;

    /**
     * Atmosphere, or null when airless. Undefined means "roll for one" (seeded by id); the
     * Add/Edit panel sends an explicit profile or null. Temperate and gas/ice giants always get
     * one. Must agree with `attributes` when both are given — see atmosphere-profile.ts.
     */
    atmosphere?: IAtmosphereProfile | null;
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
 * Resolves a planet's magnetic field: an explicit override from the UI wins, otherwise
 * a seeded roll keyed to the body id (mirroring how `computeRingPresence` resolves rings).
 */
function computeMagneticField(creation: ProceduralPlanetCreation): IMagneticFieldOptions | null {
    const { id, bodySubtype, bodyType, magneticField } = creation;

    // The panel sends null to mean "explicitly no field", so only an absent key rolls.
    if (magneticField !== undefined) return magneticField;

    const kind: MagneticFieldKind =
        bodyType === BodyTypeEnum.DwarfPlanet
            ? 'dwarf'
            : bodySubtype === PlanetTypeEnum.GasGiant
              ? 'gasGiant'
              : bodySubtype === PlanetTypeEnum.IceGiant
                ? 'iceGiant'
                : 'solid';

    return rollMagneticField(new SeededRandom(`${id}|magnetic-field`), kind);
}

/**
 * Resolves a planet's hidden attributes: an explicit value from the generator wins,
 * otherwise they're rolled here (mirroring how computeMagneticField resolves an absent
 * field) — covers the custom Add/Edit panel creation path, which doesn't pre-compute one.
 */
function computeAttributes(
    creation: ProceduralPlanetCreation,
    hasAtmosphere: boolean
): IPlanetaryAttributes {
    if (creation.attributes) return creation.attributes;

    return computePlanetaryAttributes({
        id: creation.id,
        subtype: creation.bodySubtype,
        isDwarf: creation.bodyType === BodyTypeEnum.DwarfPlanet,
        distanceT01: creation.distanceT01 ?? 0.5,
        hasAtmosphere,
    });
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
        const emissiveUrl =
            texIdx !== -1
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
    hasRings: boolean,
    magneticField: IMagneticFieldOptions | null,
    hasAtmosphere: boolean
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

    const attributes = computeAttributes(creation, hasAtmosphere);

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
        magneticField,
        attributes,
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
    const geometry = buildBodySphereGeometry(creation.radius);
    const material = buildMeshMaterial(creation);
    const mesh = new THREE.Mesh(geometry, material);

    const { hasRings } = computeRingPresence(creation);
    const magneticField = computeMagneticField(creation);
    const kind: AtmosphereBodyKind =
        creation.bodyType === BodyTypeEnum.DwarfPlanet ? 'dwarf' : 'planet';
    const atmosphere = resolveAtmosphereProfile(
        creation.atmosphere,
        creation.id,
        creation.bodySubtype,
        kind
    );
    const body = createCommonPlanetOptions(
        dependencies,
        scene,
        creation,
        mesh,
        hasRings,
        magneticField,
        atmosphere !== null
    );

    applyAtmosphereToBody(
        body,
        atmosphere,
        creation.bodySubtype,
        creation.textureSeed!,
        creation.rotationSpeed
    );

    return body;
}
