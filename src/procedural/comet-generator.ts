import * as THREE from 'three';
import type { StarParams } from '../utilities/body-params';
import { EARTH_DIST } from '../utilities/consts';
import { calculateOrbitalSpeed } from '../physics/physics';
import { generateProceduralBodyName } from './body-naming';
import type { ProceduralCometCreation } from './comet-factory';
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

export function generateProceduralComets(params: {
    dependencies: IStateDependencies;
    masterSeed: string;
    cometCount: number;
    starParams: StarParams[];
    starPlacements: Array<{ pos: THREE.Vector3; vel: THREE.Vector3 }>;
}): ProceduralCometCreation[] {
    const { dependencies, masterSeed, cometCount, starParams, starPlacements } = params;

    if (cometCount <= 0) return [];

    const starCount = starParams.length;
    if (starCount === 0) return [];

    // Comets occupy the outer solar system zone (5–50 AU).
    const minDistAU = 5.0;
    const maxDistAU = 50.0;

    const maxStarRadius = Math.max(...starParams.map((s) => s.radius));
    const totalStarMass = starParams.reduce((sum, s) => sum + s.mass, 0);

    const binarySeparation =
        starCount > 1 ? starPlacements[0]!.pos.distanceTo(starPlacements[1]!.pos) : 0;

    const S_STABLE_FRACTION = 0.3;
    const P_STABLE_MULTIPLE = 2.0;

    const sMinDist = Math.max(EARTH_DIST * minDistAU, maxStarRadius * 20);
    const sMaxDist = starCount > 1 ? binarySeparation * S_STABLE_FRACTION : 0;
    const sZoneValid = starCount > 1 && sMaxDist > sMinDist;

    const pMinDist = Math.max(
        EARTH_DIST * minDistAU,
        maxStarRadius * 20,
        binarySeparation * P_STABLE_MULTIPLE
    );
    const pMaxDist = Math.max(EARTH_DIST * maxDistAU, binarySeparation * 20.0);
    const pZoneValid = pMinDist < pMaxDist;

    const creations: ProceduralCometCreation[] = [];

    for (let i = 0; i < cometCount; i++) {
        const subSeed = `${masterSeed}|comet:${i}`;

        const orbitTypeRng = rngFor(masterSeed, 'cometOrbitType', i);
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

        const distanceRng = rngFor(masterSeed, 'cometDistance', i);
        const logMin = Math.log(Math.max(1e-6, zoneMin));
        const logMax = Math.log(Math.max(logMin + 1e-6, zoneMax));
        const distance = Math.exp(logMin + distanceRng.next() * (logMax - logMin));

        // Comets have high inclinations (0–60°).
        const inclinationRng = rngFor(masterSeed, 'cometInclination', i);
        const inclinationDeg = inclinationRng.range(0, 60);
        const inclinationRad = (inclinationDeg * Math.PI) / 180;

        const yawRng = rngFor(masterSeed, 'cometYaw', i);
        const yawRad = yawRng.range(0, Math.PI * 2);

        const phiRng = rngFor(masterSeed, 'cometPhi', i);
        const phiRad = phiRng.range(0, Math.PI * 2);

        const u = buildUnitPositionDirection(phiRad, yawRad, inclinationRad);

        const normalBase = new THREE.Vector3(0, 1, 0);
        const nYaw = applyYawY(normalBase, yawRad);
        const normal = applyInclinationX(nYaw, inclinationRad).normalize();
        const tangentialDir = safeUnitCross(normal, u);

        // Comets have high eccentricities (0.6–0.97), but periapsis must clear all stars
        // AND stay far enough from the host that periapsis velocity remains integrable.
        // r_peri = distance × (1−e)/(1+e); minPeriapsis ≥ distance×0.15 caps e ≈ 0.74 max.
        const minPeriapsis = computeMinPeriapsis({
            isSType,
            hostStarIndex,
            distance,
            distanceFraction: 0.15,
            starParams,
            starPlacements,
            maxStarRadius,
            binarySeparation,
            P_STABLE_MULTIPLE,
        });
        const eMax = computeMaxEccentricity(distance, minPeriapsis);

        const eccRng = rngFor(masterSeed, 'cometEccentricity', i);
        const eccentricity = Math.min(eccRng.range(0.6, 0.97), eMax);
        const speed = calculateOrbitalSpeed(dependencies.getG(), distance, hostMass, eccentricity);

        const pos = hostPos.clone().addScaledVector(u, distance);
        const vel = hostVel.clone().addScaledVector(tangentialDir, speed);

        // Seeded mass and radius (avoids the unseeded Math.random() inside randomCometParams).
        const massRng = rngFor(masterSeed, 'cometMass', i);
        const mass = 0.5 + massRng.next() * 3.5;

        const radiusRng = rngFor(masterSeed, 'cometRadius', i);
        const radius = 1 + radiusRng.next() * 2;

        // Comets tumble chaotically: random tilt (0–180° for full 3D tumbling), azimuth
        // (0–360°), and a spin speed that increases as mass decreases (smaller bodies
        // spin faster, like real asteroids/comets).
        const tiltRng = rngFor(masterSeed, 'cometRotationTilt', i);
        const rotationTilt = tiltRng.range(0, 180);

        const azimuthRng = rngFor(masterSeed, 'cometRotationAzimuth', i);
        const rotationAzimuth = azimuthRng.range(0, 360);

        // Spin speed: base of 0.3–1.0 rad/s, multiplied by inverse-mass factor so smaller
        // comets spin faster. Clamped to sensible visual range [0.2, 4.0].
        const speedRng = rngFor(masterSeed, 'cometRotationSpeed', i);
        const massFactor = Math.max(0.5, 2.0 / Math.max(0.1, mass));
        const rotationSpeed = Math.min(4.0, Math.max(0.2, speedRng.range(0.3, 1.0) * massFactor));

        const id = `proc_comet_${i}_${subSeed}`;
        const name = generateProceduralBodyName(BodyTypeEnum.Comet, {
            seed: subSeed,
            sequenceNumber: i + 1,
        });

        creations.push({
            id,
            name,
            pos,
            vel,
            mass,
            radius,
            rotationSpeed,
            rotationTilt,
            rotationAzimuth,
        });
    }

    sanitizeOrbitCreations(creations, { minRadius: 1, minMass: 0.5 });

    return creations;
}
