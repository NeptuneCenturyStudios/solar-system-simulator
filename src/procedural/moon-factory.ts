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
} from '../drawing/textures';
import type { ProceduralMoonCreation } from './moon-generator';
import { MoonTypeEnum } from '../bodies/body-enums';

function pickMoonTextureForMoonType(
    moonType: MoonTypeEnum,
    moonTextureIndex: number | undefined
): THREE.Texture {
    if (moonType === MoonTypeEnum.Volcanic) return fictionalVolcanicTexture;
    if (moonType === MoonTypeEnum.Ocean) return fictionalOceanTexture;
    if (moonType === MoonTypeEnum.Frozen) return fictionalFrozenTexture;
    if (moonType === MoonTypeEnum.Desert) return fictionalDesertTexture;

    // Terrestrial uses pooled random textures deterministically.
    const idx = Math.max(0, moonTextureIndex ?? 0);
    return fictionalTextures[idx % fictionalTextures.length]!;
}

function createMoonMesh(radius: number, texture: THREE.Texture): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(radius, 32, 32);

    return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
            map: texture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
            transparent: false,
            depthTest: true,
            depthWrite: true,
        })
    );
}

export function createMoonBodyFromProceduralCreation(params: {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    creation: ProceduralMoonCreation;
    parent: CelestialBody;
}): CelestialBody {
    const { dependencies, scene, creation, parent } = params;
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
        moonTextureIndex,
    } = creation;

    const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
    const safeMass = Number.isFinite(mass) && mass > 0 ? mass : 0.5;
    const safeRotationSpeed = Number.isFinite(rotationSpeed) && rotationSpeed > 0 ? rotationSpeed : 0.1;

    const safeDistance = Number.isFinite(distance) && distance > 0 ? distance : 1;
    const safeAngle = Number.isFinite(angle) ? angle : 0;
    const safeYVariation = Number.isFinite(yVariation) ? yVariation : 0;

    const safePos = pos.clone();
    const safeVel = vel.clone();

    // Guard against NaNs creeping into THREE geometry / bounding spheres.
    const fixVector = (v: THREE.Vector3) => {
        if (!Number.isFinite(v.x)) v.x = 0;
        if (!Number.isFinite(v.y)) v.y = 0;
        if (!Number.isFinite(v.z)) v.z = 0;
    };

    fixVector(safePos);
    fixVector(safeVel);

    const texture = pickMoonTextureForMoonType(moonType, moonTextureIndex);
    const mesh = createMoonMesh(safeRadius, texture);

    // angularSpeed=0 => CelestialBody will compute instantaneous omega at first update
    // based on relative state (pos/vel) it sees at runtime.
    const tidalLock: ITidalLockOptions = {
        target: parent,
        spinAxisWorld: new THREE.Vector3(0, 1, 0),
        faceAxisLocal: new THREE.Vector3(0, 0, 1),
        angularSpeed: 0,
    };

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
    });
}
