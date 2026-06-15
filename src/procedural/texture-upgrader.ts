import { CelestialBody } from '../bodies/celestial-body';
import { BodyTypeEnum, PlanetTypeEnum, MoonTypeEnum } from '../bodies/body-enums';
import { getDesertTextureAsync, getDesertNormalTextureAsync } from './desert/desert-texture-generator';
import { getOceanTextureAsync, getOceanNormalTextureAsync } from './ocean/ocean-texture-generator';
import { getFrozenTextureAsync, getFrozenNormalTextureAsync } from './frozen/frozen-texture-generator';
import {
    getVolcanicTextureAsync,
    getVolcanicNormalTextureAsync,
    getVolcanicEmissiveTextureAsync,
} from './volcanic/volcanic-texture-generator';
import {
    getTerrestrialTextureAsync,
    getTerrestrialNormalTextureAsync,
} from './terrestrial/terrestrial-texture-generator';
import {
    getTemperateTextureAsync,
    getTemperateNormalTextureAsync,
} from './temperate/temperate-texture-generator';
import { SeededRandom } from '../utilities/prng';
import * as THREE from 'three';

/**
 * Kicks off async procedural texture generation for a body that has a seed.
 * The body will initially display with its static JPG texture; once the
 * procedural texture finishes generating, it replaces the material in-place.
 *
 * This is fire-and-forget — the returned promise is only for error tracking.
 */
export function upgradeProceduralTexture(body: CelestialBody): void {
    if (!body.seed) {
        console.log(`[texture-upgrader] ${body.id} — no seed, skipping`);
        return;
    }
    if (body._isDisposed) {
        console.log(`[texture-upgrader] ${body.id} — disposed, skipping`);
        return;
    }

    // Derive the texture subseed from the body's stored seed
    const texSeed = `${body.seed}|texture-upgrade`;

    console.log(`[texture-upgrader] Scheduling upgrade for ${body.id} (type=${body.bodyType})`);

    // Determine which procedural generator to use based on body type/subtype
    switch (body.bodyType) {
        case BodyTypeEnum.Planet:
        case BodyTypeEnum.DwarfPlanet: {
            const planet = body as unknown as { planetType: PlanetTypeEnum };
            console.log(`[texture-upgrader]   → planet subtype: ${planet.planetType}`);
            upgradePlanetTexture(planet, texSeed, body);
            return;
        }
        case BodyTypeEnum.Moon: {
            const moon = body as unknown as { moonType: MoonTypeEnum };
            console.log(`[texture-upgrader]   → moon subtype: ${moon.moonType}`);
            upgradeMoonTexture(moon, texSeed, body);
            return;
        }
        default:
            console.log(`[texture-upgrader] ${body.id} — unhandled bodyType ${body.bodyType}, skipping`);
            return;
    }
}

function upgradePlanetTexture(
    planet: { planetType: PlanetTypeEnum },
    texSeed: string,
    body: CelestialBody
): void {
    const subtype = planet.planetType;

    if (subtype === PlanetTypeEnum.Terrestrial) {
        scheduleTextureSwap(body, texSeed, getTerrestrialTextureAsync, getTerrestrialNormalTextureAsync);
    } else if (subtype === PlanetTypeEnum.Desert) {
        scheduleTextureSwap(body, texSeed, getDesertTextureAsync, getDesertNormalTextureAsync);
    } else if (subtype === PlanetTypeEnum.Ocean) {
        scheduleTextureSwap(body, texSeed, getOceanTextureAsync, getOceanNormalTextureAsync);
    } else if (subtype === PlanetTypeEnum.Frozen) {
        scheduleTextureSwap(body, texSeed, getFrozenTextureAsync, getFrozenNormalTextureAsync);
    } else if (subtype === PlanetTypeEnum.Volcanic) {
        const emissiveIntensity = new SeededRandom(`${texSeed}|emissive-intensity`).range(0.35, 0.60);
        scheduleTextureSwapWithEmissive(
            body,
            texSeed,
            getVolcanicTextureAsync,
            getVolcanicNormalTextureAsync,
            getVolcanicEmissiveTextureAsync,
            emissiveIntensity,
        );
    } else if (subtype === PlanetTypeEnum.Temperate) {
        scheduleTextureSwap(body, texSeed, getTemperateTextureAsync, getTemperateNormalTextureAsync);
    }
    // Other planet subtypes (gas/ice giants) keep their JPGs.
}

function upgradeMoonTexture(
    moon: { moonType: MoonTypeEnum },
    texSeed: string,
    body: CelestialBody
): void {
    const subtype = moon.moonType;

    if (subtype === MoonTypeEnum.Terrestrial) {
        scheduleTextureSwap(body, texSeed, getTerrestrialTextureAsync, getTerrestrialNormalTextureAsync);
    } else if (subtype === MoonTypeEnum.Desert) {
        scheduleTextureSwap(body, texSeed, getDesertTextureAsync, getDesertNormalTextureAsync);
    } else if (subtype === MoonTypeEnum.Ocean) {
        scheduleTextureSwap(body, texSeed, getOceanTextureAsync, getOceanNormalTextureAsync);
    } else if (subtype === MoonTypeEnum.Frozen) {
        scheduleTextureSwap(body, texSeed, getFrozenTextureAsync, getFrozenNormalTextureAsync);
    } else if (subtype === MoonTypeEnum.Volcanic) {
        const emissiveIntensity = new SeededRandom(`${texSeed}|emissive-intensity`).range(0.35, 0.60);
        scheduleTextureSwapWithEmissive(
            body,
            texSeed,
            getVolcanicTextureAsync,
            getVolcanicNormalTextureAsync,
            getVolcanicEmissiveTextureAsync,
            emissiveIntensity,
        );
    } else if (subtype === MoonTypeEnum.Temperate) {
        scheduleTextureSwap(body, texSeed, getTemperateTextureAsync, getTemperateNormalTextureAsync);
    }
    // Other moon subtypes keep their JPGs.
}

type TextureAsyncFn = (seed: string) => Promise<THREE.Texture>;

function scheduleTextureSwap(
    body: CelestialBody,
    texSeed: string,
    getColorAsync: TextureAsyncFn,
    getNormalAsync: TextureAsyncFn
): void {
    // Fire and forget — the texture will upgrade the material when ready.
    Promise.all([getColorAsync(texSeed), getNormalAsync(texSeed)])
        .then(([color, normal]) => {
            if (body._isDisposed) return;

            const mat = body.mesh.material as THREE.MeshStandardMaterial | undefined;
            if (!mat) return;

            mat.map = color;
            mat.normalMap = normal;
            mat.needsUpdate = true;
        })
        .catch((err) => {
            // Silently ignore — the body keeps its JPG texture.
            console.warn(`[texture-upgrader] Failed to upgrade texture for ${body.id}:`, err);
        });
}

/**
 * Like scheduleTextureSwap but also sets an emissive map for bodies with
 * self-illuminating features (e.g. volcanic lava rivers/lakes).
 * The emissive map encodes lava color directly, so mat.emissive is set to
 * white (0xffffff) and emissiveIntensity controls overall brightness.
 */
function scheduleTextureSwapWithEmissive(
    body: CelestialBody,
    texSeed: string,
    getColorAsync: TextureAsyncFn,
    getNormalAsync: TextureAsyncFn,
    getEmissiveAsync: TextureAsyncFn,
    emissiveIntensity: number,
): void {
    Promise.all([getColorAsync(texSeed), getNormalAsync(texSeed), getEmissiveAsync(texSeed)])
        .then(([color, normal, emissive]) => {
            if (body._isDisposed) return;

            const mat = body.mesh.material as THREE.MeshStandardMaterial | undefined;
            if (!mat) return;

            mat.map          = color;
            mat.normalMap    = normal;
            mat.emissiveMap  = emissive;
            mat.emissive     = new THREE.Color(0xffffff);
            mat.emissiveIntensity = emissiveIntensity;
            mat.needsUpdate  = true;
        })
        .catch((err) => {
            console.warn(`[texture-upgrader] Failed to upgrade volcanic texture for ${body.id}:`, err);
        });
}
