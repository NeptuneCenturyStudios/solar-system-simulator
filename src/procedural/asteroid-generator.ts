import * as THREE from 'three';
import type { StarParams } from '../utilities/body-params';
import { EARTH_DIST } from '../utilities/consts';
import { randomAsteroidParams } from '../utilities/body-params';
import { generateProceduralBodyName } from './body-naming';
import { calculateOrbitalSpeed } from '../physics/physics';
import type { ProceduralAsteroidCreation } from './asteroid-factory';
import type { IStateDependencies } from '../interfaces';
import { BodyTypeEnum } from '../bodies/body-enums';

import {
    applyInclinationX,
    applyYawY,
    buildUnitPositionDirection,
    computeMaxEccentricity,
    computeMinPeriapsis,
    pickOrbitType,
    sanitizeOrbitCreations,
    safeUnitCross,
} from './orbital-math';
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

    // Belt zone: roughly 1.5–4 AU (scaled to world units).
    const minDistAU = 1.5;
    const maxDistAU = 4.0;

    const maxStarRadius = Math.max(...starParams.map((s) => s.radius));
    const totalStarMass = starParams.reduce((sum, s) => sum + s.mass, 0);

    const binarySeparation =
        starCount > 1 ? starPlacements[0]!.pos.distanceTo(starPlacements[1]!.pos) : 0;

    const S_STABLE_FRACTION = 0.3;
    const P_STABLE_MULTIPLE = 2.0;

    const sMinDist = Math.max(EARTH_DIST * minDistAU, maxStarRadius * 12);
    const sMaxDist = starCount > 1 ? binarySeparation * S_STABLE_FRACTION : 0;
    const sZoneValid = starCount > 1 && sMaxDist > sMinDist;

    const pMinDist = Math.max(
        EARTH_DIST * minDistAU,
        maxStarRadius * 12,
        binarySeparation * P_STABLE_MULTIPLE
    );
    const pMaxDist = Math.max(EARTH_DIST * maxDistAU, binarySeparation * 5.0);
    const pZoneValid = pMinDist < pMaxDist;

    const creations: ProceduralAsteroidCreation[] = [];

    for (let i = 0; i < asteroidCount; i++) {
        const subSeed = `${masterSeed}|asteroid:${i}`;
        const asteroidParams = randomAsteroidParams({ seed: subSeed });

        const orbitTypeRng = rngFor(masterSeed, 'asteroidOrbitType', i);
        const { isSType, hostStarIndex } = pickOrbitType({
            rng: orbitTypeRng,
            starCount,
            sZoneValid,
            pZoneValid,
        });

        const hostMass = isSType ? starParams[hostStarIndex]!.mass : totalStarMass;
        const hostPos = isSType ? starPlacements[hostStarIndex]!.pos : new THREE.Vector3(0, 0, 0);
        const hostVel = isSType ? starPlacements[hostStarIndex]!.vel : new THREE.Vector3(0, 0, 0);

        const zoneMin = isSType ? sMinDist : pMinDist;
        const zoneMax = isSType ? sMaxDist : pMaxDist;

        const distanceRng = rngFor(masterSeed, 'asteroidDistance', i);
        const logMin = Math.log(Math.max(1e-6, zoneMin));
        const logMax = Math.log(Math.max(logMin + 1e-6, zoneMax));
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

        // r_peri = distance × (1−e)/(1+e); clamp so periapsis clears all stars
        // and stays integrable (distance×0.3 floor caps e ≈ 0.54 max).
        const minPeriapsis = computeMinPeriapsis({
            isSType,
            hostStarIndex,
            distance,
            distanceFraction: 0.3,
            starParams,
            starPlacements,
            maxStarRadius,
            binarySeparation,
            P_STABLE_MULTIPLE,
        });
        const eMax = computeMaxEccentricity(distance, minPeriapsis);

        const eccRng = rngFor(masterSeed, 'asteroidEccentricity', i);
        // Asteroids have higher orbital eccentricities (0–0.4).
        const eccentricity = Math.min(eccRng.range(0, 0.4), eMax);
        const speed = calculateOrbitalSpeed(dependencies.getG(), distance, hostMass, eccentricity);

        const pos = hostPos.clone().addScaledVector(u, distance);
        const vel = hostVel.clone().addScaledVector(tangentialDir, speed);

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

    sanitizeOrbitCreations(creations, { minRadius: 0.05, minMass: 1e-6 });

    return creations;
}
