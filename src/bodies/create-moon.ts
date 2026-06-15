import * as THREE from 'three';
import { Moon } from './moon';
import { calculateTrajectory } from '../physics/physics';
import { SeededRandom } from '../utilities/prng';
import {
    moonTexture,
    fictionalTextures,
    fictionalVolcanicTexture,
    fictionalFrozenTexture,
    fictionalOceanTexture,
    fictionalTemperateTexture,
    getRoughnessForMoonTexture,
    getMetalnessForMoonTexture,
} from '../drawing/textures';
import { getDesertTexture } from '../procedural/desert/desert-texture-generator';

import type { CelestialBody } from './celestial-body';
import { MoonTypeEnum } from './body-enums';
import { IMoonCreationOptions } from '../interfaces';

export function createMoon(parent: CelestialBody, scene: THREE.Scene, config: IMoonCreationOptions): Moon {
    const moonType = config.moonType;

    const seededFromConfig = new SeededRandom(`${config.id}|moonTexture`);
    const pickFictionalDeterministic = (): THREE.Texture => {
        const idx = Math.abs(Math.floor(seededFromConfig.next() * fictionalTextures.length));
        return fictionalTextures[idx % fictionalTextures.length]!;
    };

    const trajectory = calculateTrajectory(parent.dependencies.getG(), config.distance, parent.mass);

    const angle = config.angle !== undefined ? config.angle : 0;

    const posX = parent.mesh.position.x + Math.cos(angle) * config.distance;
    const posY = config.yVariation !== undefined ? (Math.random() - 0.5) * config.yVariation : 0;
    const posZ = parent.mesh.position.z + Math.sin(angle) * config.distance;

    const velX = parent.velocity.x - Math.sin(angle) * trajectory.vel.z;
    const velY = 0;
    const velZ = parent.velocity.z + Math.cos(angle) * trajectory.vel.z;

    const moonName = config.name || 'Moon';
    const moonGeometry = new THREE.SphereGeometry(config.radius, 32, 32);

    const moonMap: THREE.Texture =
        moonType === MoonTypeEnum.Temperate
            ? fictionalTemperateTexture
            : moonType === MoonTypeEnum.Volcanic
              ? fictionalVolcanicTexture
              : moonType === MoonTypeEnum.Ocean
                ? fictionalOceanTexture
                : moonType === MoonTypeEnum.Frozen
                  ? fictionalFrozenTexture
                  : moonType === MoonTypeEnum.Desert
                    ? getDesertTexture(`${config.id}|moonType|desert`)
                    : moonName === 'Moon'
                      ? moonTexture
                      : pickFictionalDeterministic();

    const moonMaterial = new THREE.MeshStandardMaterial({
        map: moonMap,
        color: 0xffffff,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: getRoughnessForMoonTexture(moonType),
        metalness: getMetalnessForMoonTexture(moonType),
    });

    const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);

    const r0 = new THREE.Vector3(posX, posY, posZ).sub(parent.mesh.position);
    const vrel0 = new THREE.Vector3(velX, velY, velZ).sub(parent.velocity);
    const rLenSq = Math.max(1e-12, r0.lengthSq());
    const omega = r0.clone().cross(vrel0).length() / rLenSq;

    const resolvedMoonType: MoonTypeEnum = moonType ?? MoonTypeEnum.Terrestrial;

    return new Moon(parent.dependencies, scene, {
        distance: config.distance,
        angle,
        yVariation: config.yVariation ?? 0,
        tidalLock: {
            target: parent,
            spinAxisWorld: new THREE.Vector3(0, 1, 0),
            faceAxisLocal: new THREE.Vector3(0, 0, 1),
            angularSpeed: omega,
        },
        radius: config.radius,
        pos: new THREE.Vector3(posX, posY, posZ),
        vel: new THREE.Vector3(velX, velY, velZ),
        mass: config.mass,
        id: config.id,
        name: moonName,
        trailColor: config.trailColor || 0xffffff,
        maxTrail: config.maxTrail || 1500,
        rotation: { tilt: 0, speed: 0.15 + Math.random() * 0.35 },
        mesh: moonMesh,
        moonType: resolvedMoonType,
    });
}
