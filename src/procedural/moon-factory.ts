import * as THREE from 'three';
import type { IStateDependencies } from '../interfaces';
import { CelestialBody, type ITidalLockOptions } from '../bodies/celestial-body';
import { Moon } from '../bodies/moon';
import {
    fictionalTextures,
    fictionalVolcanicTexture,
    fictionalFrozenTexture,
    fictionalOceanTexture,
    fictionalDesertTexture,
    fictionalTemperateTexture,
    getRoughnessForMoonTexture,
    getMetalnessForMoonTexture,
} from '../drawing/textures';
import type { ProceduralMoonCreation } from './moon-generator';
import { MoonTypeEnum } from '../bodies/body-enums';

function pickMoonTextureForMoonType(
    moonType: MoonTypeEnum,
    moonTextureIndex: number | undefined
): THREE.Texture {
    // Always use static JPG textures — procedural upgrades happen asynchronously.
    if (moonType === MoonTypeEnum.Volcanic) return fictionalVolcanicTexture;
    if (moonType === MoonTypeEnum.Ocean) return fictionalOceanTexture;
    if (moonType === MoonTypeEnum.Frozen) return fictionalFrozenTexture;
    if (moonType === MoonTypeEnum.Desert) return fictionalDesertTexture;
    if (moonType === MoonTypeEnum.Temperate) return fictionalTemperateTexture;

    // Terrestrial falls through to the random pool.
    const idx = Math.max(0, moonTextureIndex ?? 0);
    return fictionalTextures[idx % fictionalTextures.length]!;
}

function createMoonMesh(radius: number, texture: THREE.Texture, moonType: MoonTypeEnum): THREE.Mesh {
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

function buildMoon(
    params: {
        dependencies: IStateDependencies;
        scene: THREE.Scene;
        creation: ProceduralMoonCreation;
        parent: CelestialBody;
        mesh: THREE.Mesh;
    }
): CelestialBody {
    const { dependencies, scene, creation, parent, mesh } = params;

    const {
        id,
        name,
        pos,
        vel,
        radius,
        mass,
        rotationSpeed,
        distance,
        angle,
        yVariation,
        moonType,
        textureSeed,
    } = creation;

    const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
    const safeMass = Number.isFinite(mass) && mass > 0 ? mass : 0.5;
    const safeRotationSpeed = Number.isFinite(rotationSpeed) && rotationSpeed > 0 ? rotationSpeed : 0.1;

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
        rotation: { tilt: 0, speed: safeRotationSpeed },
        trailColor: 0xffffff,
        maxTrail: 1500,
        mesh,
        tidalLock,
        seed: textureSeed,
    });
}

export function createMoonBodyFromProceduralCreation(params: {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    creation: ProceduralMoonCreation;
    parent: CelestialBody;
}): CelestialBody {
    const { creation } = params;

    const {
        radius,
        moonType,
        moonTextureIndex,
    } = creation;

    const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;

    const texture = pickMoonTextureForMoonType(moonType, moonTextureIndex);
    const mesh = createMoonMesh(safeRadius, texture, moonType);

    return buildMoon({
        dependencies: params.dependencies,
        scene: params.scene,
        creation,
        parent: params.parent,
        mesh,
    });
}
