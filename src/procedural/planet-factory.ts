import * as THREE from 'three';
import { IStateDependencies } from '../interfaces';
import { Planet } from '../bodies/planet';
import { DwarfPlanet } from '../bodies/dwarf-planet';
import { BodyTypeEnum } from '../utilities/utilities';
// still uses the existing deterministic fictional JPGs for volcanic/ocean/frozen
import { PlanetTypeEnum } from '../utilities/body-params';
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
import { getDesertNormalTexture, getDesertTexture } from './desert/desert-texture-generator';

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

// `textureSeed` is optional so existing creation paths still work;
// for desert we prefer it, but fall back to the existing fictional desert JPG.
function pickTextureForSolidSubtype(
    subtype: PlanetTypeEnum,
    textureIndex: number | undefined,
    textureSeed: string | undefined
): THREE.Texture {
    // Deterministic custom textures first (match custom creation in index.ts)
    if (subtype === PlanetTypeEnum.Volcanic) return fictionalVolcanicTexture;
    if (subtype === PlanetTypeEnum.Ocean) return fictionalOceanTexture;
    if (subtype === PlanetTypeEnum.Frozen) return fictionalFrozenTexture;

    if (subtype === PlanetTypeEnum.Desert) {
        if (!textureSeed) return fictionalDesertTexture;
        return getDesertTexture(textureSeed);
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

export function createPlanetBodyFromProceduralCreation(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    creation: ProceduralPlanetCreation
): Planet | DwarfPlanet {
    const { bodyType, bodySubtype, radius, mass, pos, vel, id, name, rotationSpeed } = creation;

    // Higher segment count helps texture detail read sharper on the sphere.
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    const texture =
        bodySubtype === PlanetTypeEnum.GasGiant || bodySubtype === PlanetTypeEnum.IceGiant
            ? pickTextureForGasIceSubtype(bodySubtype, creation.textureIndex)
            : pickTextureForSolidSubtype(bodySubtype, creation.textureIndex, creation.textureSeed);

    const isDesert = bodySubtype === PlanetTypeEnum.Desert;

    // Add a deterministic normal map for deserts to make lighting read sharper.
    // (Works even when the base color texture is minified.)
    const desertNormalMap =
        isDesert && creation.textureSeed ? getDesertNormalTexture(creation.textureSeed) : null;

    // Procedural bodies may be far away, but we still need correct depth so planets
    // occlude each other properly (otherwise they look "glowy" / see-through).
    const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
            map: texture,
            normalMap: desertNormalMap ?? undefined,
            // Lower normal strength for deserts so it doesn't look like foil.
            normalScale: desertNormalMap ? new THREE.Vector2(0.7, 0.7) : undefined,
            color: 0xffffff, // keep texture untinted
            emissive: 0x000000,
            emissiveIntensity: 0,
            // Deserts should be very non-metallic, very rough.
            roughness: isDesert ? 0.95 : 0.7,
            metalness: isDesert ? 0.02 : 0.85,
            transparent: false,
            depthTest: true,
            depthWrite: true,
        })
    );

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
