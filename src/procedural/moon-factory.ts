import * as THREE from 'three';
import type { IStateDependencies } from '../interfaces';
import { CelestialBody, type ITidalLockOptions } from '../bodies/celestial-body';
import { Moon } from '../bodies/moon';
import {
    getRoughnessForMoonTexture,
    getMetalnessForMoonTexture,
    getVolcanicEmissiveMap,
    volcanicTextures,
    terrestrialTextures,
    oceanTextures,
    frozenTextures,
    desertTextures,
    temperateTextures,
} from '../drawing/textures';
import type { ProceduralMoonCreation } from './moon-generator';
import { MoonTypeEnum } from '../bodies/body-enums';
import { SeededRandom } from '../utilities/prng';
import { addCloudLayer } from './planet-factory';
import { createAtmosphereShell } from '../effects/atmosphere-shell';

/**
 * Given a moon type and a seeded random number generator, this function selects an appropriate texture for the moon.
 * @param moonType The type of the moon for which to pick a texture.
 * @param rng A seeded random number generator to ensure reproducible results.
 * @returns A texture suitable for the given moon type, or null if no texture is available.
 */
export function pickMoonTextureForMoonType(
    moonType: MoonTypeEnum,
    rng: SeededRandom
): THREE.Texture | null {
    let texturePack: THREE.Texture[] = [];

    if (moonType === MoonTypeEnum.Terrestrial) {
        texturePack = terrestrialTextures;
    }
    if (moonType === MoonTypeEnum.Volcanic) {
        texturePack = volcanicTextures;
    }
    if (moonType === MoonTypeEnum.Ocean) {
        texturePack = oceanTextures;
    }
    if (moonType === MoonTypeEnum.Frozen) {
        texturePack = frozenTextures;
    }
    if (moonType === MoonTypeEnum.Desert) {
        texturePack = desertTextures;
    }
    if (moonType === MoonTypeEnum.Temperate) {
        texturePack = temperateTextures;
    }

    // Pick random texture from the selected pack using the seeded RNG
    const texture = rng.pick(texturePack);
    return texture;
}

function createMoonMesh(
    radius: number,
    texture: THREE.Texture,
    moonType: MoonTypeEnum
): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(radius, 32, 32);

    const material = new THREE.MeshStandardMaterial({
        map: texture,
        color: 0xffffff,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: getRoughnessForMoonTexture(moonType),
        metalness: getMetalnessForMoonTexture(moonType),
        transparent: false,
        depthTest: true,
        depthWrite: true,
    });

    // Volcanic moons get a derived emissive map so lava areas actually glow
    if (moonType === MoonTypeEnum.Volcanic && texture) {
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

    return new THREE.Mesh(geometry, material);
}

function createMoonTidalLock(parent: CelestialBody, safeRotationSpeed: number): ITidalLockOptions {
    void safeRotationSpeed;
    return {
        target: parent,
        spinAxisWorld: new THREE.Vector3(0, 1, 0),
        faceAxisLocal: new THREE.Vector3(0, 0, 1),
        angularSpeed: 0,
    };
}

function buildProceduralMoon(params: {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    creation: ProceduralMoonCreation;
    parent: CelestialBody;
    mesh: THREE.Mesh;
}): CelestialBody {
    const { dependencies, scene, creation, parent, mesh } = params;

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
        distance,
        angle,
        yVariation,
        moonType,
        textureSeed,
    } = creation;

    const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
    const safeMass = Number.isFinite(mass) && mass > 0 ? mass : 0.5;
    const safeRotationSpeed =
        Number.isFinite(rotationSpeed) && rotationSpeed > 0 ? rotationSpeed : 0.1;

    const safeDistance = Number.isFinite(distance) && distance > 0 ? distance : 1;
    const safeAngle = Number.isFinite(angle) ? angle : 0;
    const safeYVariation = Number.isFinite(yVariation) ? yVariation : 0;

    const safePos = pos.clone();
    const safeVel = vel.clone();

    const fixVector = (v: THREE.Vector3) => {
        if (!Number.isFinite(v.x)) v.x = 0;
        if (!Number.isFinite(v.y)) v.y = 0;
        if (!Number.isFinite(v.z)) v.z = 0;
    };

    fixVector(safePos);
    fixVector(safeVel);

    const tidalLock: ITidalLockOptions = createMoonTidalLock(parent, safeRotationSpeed);

    return new Moon(dependencies, scene, {
        radius: safeRadius,
        mass: safeMass,
        id,
        name,
        pos: safePos,
        vel: safeVel,
        distance: safeDistance,
        angle: safeAngle,
        yVariation: safeYVariation,
        moonType,
        rotation: { tilt: rotationTilt, speed: safeRotationSpeed, azimuth: rotationAzimuth },
        trailColor: 0xffffff,
        maxTrail: 1500,
        mesh,
        tidalLock,
        seed: textureSeed,
    });
}

/**
 * Creates a moon body in the simulation based on the provided procedural creation parameters.
 * This function ensures that the moon has a valid radius, mass, and texture based on its type.
 * It also sets up the moon's mesh and tidal locking behavior relative to its parent body.
 * @param params Contains the dependencies, scene, procedural creation parameters, and parent body for the moon.
 * @returns A CelestialBody instance representing the newly created moon.
 */
export function createMoonBodyFromProceduralCreation(params: {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    creation: ProceduralMoonCreation;
    parent: CelestialBody;
}): CelestialBody {
    const { creation } = params;

    const { radius, moonType, textureSeed } = creation;

    const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;

    if (!textureSeed) {
        throw new Error('Texture seed is required for deterministic moon texture selection.');
    }

    const rng = new SeededRandom(textureSeed);
    const texture = pickMoonTextureForMoonType(moonType, rng);
    if (!texture) {
        throw new Error(`No texture available for moon type: ${moonType}`);
    }

    const mesh = createMoonMesh(safeRadius, texture, moonType);

    const body = buildProceduralMoon({
        dependencies: params.dependencies,
        scene: params.scene,
        creation,
        parent: params.parent,
        mesh,
    });

    addCloudLayer(body, moonType, textureSeed, creation.rotationSpeed);

    if (body.clouds) {
        const tintRng = new SeededRandom(`${textureSeed}|atmosphere-tint`);
        let tint: number;
        if (moonType === MoonTypeEnum.Temperate) {
            tint = 0x77aaff;
        } else if (moonType === MoonTypeEnum.Ocean) {
            tint = 0x4477cc;
        } else if (moonType === MoonTypeEnum.Desert) {
            tint = 0xffbb66;
        } else if (moonType === MoonTypeEnum.Frozen) {
            tint = 0xaaccee;
        } else if (moonType === MoonTypeEnum.Volcanic) {
            tint = 0xff8844;
        } else {
            tint = 0x88aaff; // Terrestrial or fallback
        }
        const tintColor = new THREE.Color(tint);
        const shift = (tintRng.next() - 0.5) * 0.08;
        tintColor.offsetHSL(shift, 0, 0);
        body.atmosphereShell = createAtmosphereShell(
            params.scene,
            safeRadius * 1.07,
            tintColor,
            body.mesh
        );
    }

    return body;
}
