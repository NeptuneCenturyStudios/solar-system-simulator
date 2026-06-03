import * as THREE from 'three';
import type { StarParams } from '../utilities/body-params';
import { EARTH_DIST } from '../utilities/consts';
import { randomAsteroidParams } from '../utilities/body-params';
import { generateProceduralBodyName } from './body-naming';
import { calculateOrbitalSpeed } from '../physics/physics';
import type { ProceduralAsteroidCreation } from './asteroid-factory';
import type { IStateDependencies } from '../interfaces';
import { BodyTypeEnum } from '../bodies/body-enums';

import { applyInclinationX, applyYawY, buildUnitPositionDirection, safeUnitCross } from './orbital-math';
import { rngFor } from './seed-utils';

export function generateProceduralAsteroids(params: {
    dependencies: IStateDependencies;
    masterSeed: string;
    asteroidCount: number;
    starParams: StarParams[];
    starPlacements: Array<{ pos: THREE.Vector3; vel: THREE.Vector3 }>;
}): ProceduralAsteroidCreation[] {
    const { dependencies, masterSeed, asteroidCount, starParams, starPlacements } = params;

    if (asteroidCount <= 0) return [];

    const starCount = starParams.length;
    if (starCount === 0) return [];

    // Belt zone: roughly 1.5–4 AU relative to the primary star (scaled to world units).
    const minDistAU = 1.5;
    const maxDistAU = 4.0;

    const maxStarRadius = Math.max(...starParams.map((s) => s.radius));
    const minDistWorld = Math.max(EARTH_DIST * minDistAU, maxStarRadius * 12);
    const maxDistWorld = EARTH_DIST * maxDistAU;

    const creations: ProceduralAsteroidCreation[] = [];

    for (let i = 0; i < asteroidCount; i++) {
        const subSeed = `${masterSeed}|asteroid:${i}`;
        const asteroidParams = randomAsteroidParams({ seed: subSeed });

        // Each asteroid orbits a star (round-robin for multi-star systems).
        const starIndex = i % starCount;
        const hostStar = starParams[starIndex]!;
        const hostPlacement = starPlacements[starIndex]!;

        const distanceRng = rngFor(masterSeed, 'asteroidDistance', i);
        // Random orbital distance within the belt zone (log-uniform).
        const logMin = Math.log(Math.max(1e-6, minDistWorld));
        const logMax = Math.log(Math.max(logMin + 1e-6, maxDistWorld));
        const distance = Math.exp(logMin + distanceRng.next() * (logMax - logMin));

        const inclinationRng = rngFor(masterSeed, 'asteroidInclination', i);
        // Asteroids have higher inclinations than planets (up to ~30°).
        const inclinationDeg = Math.pow(inclinationRng.next(), 1.5) * 30;
        const inclinationRad = (inclinationDeg * Math.PI) / 180;

        const yawRng = rngFor(masterSeed, 'asteroidYaw', i);
        const yawRad = yawRng.range(0, Math.PI * 2);

        const phiRng = rngFor(masterSeed, 'asteroidPhi', i);
        const phiRad = phiRng.range(0, Math.PI * 2);

        const u = buildUnitPositionDirection(phiRad, yawRad, inclinationRad);

        const normalBase = new THREE.Vector3(0, 1, 0);
        const nYaw = applyYawY(normalBase, yawRad);
        const normal = applyInclinationX(nYaw, inclinationRad).normalize();

        const tangentialDir = safeUnitCross(normal, u);

        const eccRng = rngFor(masterSeed, 'asteroidEccentricity', i);
        // Asteroids have higher orbital eccentricities (0–0.4).
        const eccentricity = eccRng.range(0, 0.4);
        const speed = calculateOrbitalSpeed(dependencies.getG(), distance, hostStar.mass, eccentricity);

        const pos = hostPlacement.pos.clone().addScaledVector(u, distance);
        const vel = hostPlacement.vel.clone().addScaledVector(tangentialDir, speed);

        const id = `proc_asteroid_${i}_${subSeed}`;
        const name = generateProceduralBodyName(BodyTypeEnum.Asteroid, {
            seed: subSeed,
            sequenceNumber: i + 1,
        });

        creations.push({
            id,
            name,
            pos,
            vel,
            radius: asteroidParams.radius,
            mass: asteroidParams.mass,
        });
    }

    // Defensive finite check.
    for (const c of creations) {
        const ok =
            Number.isFinite(c.pos.x) &&
            Number.isFinite(c.pos.y) &&
            Number.isFinite(c.pos.z) &&
            Number.isFinite(c.vel.x) &&
            Number.isFinite(c.vel.y) &&
            Number.isFinite(c.vel.z) &&
            Number.isFinite(c.radius) &&
            Number.isFinite(c.mass);

        if (!ok) {
            c.pos.set(0, 0, 0);
            c.vel.set(0, 0, 0);
            c.radius = Math.max(0.05, c.radius);
            c.mass = Math.max(1e-6, c.mass);
        }
    }

    return creations;
}
