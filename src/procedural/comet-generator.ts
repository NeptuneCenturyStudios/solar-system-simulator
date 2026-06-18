import * as THREE from 'three';
import type { StarParams } from '../utilities/body-params';
import { EARTH_DIST } from '../utilities/consts';
import { calculateOrbitalSpeed } from '../physics/physics';
import { generateProceduralBodyName } from './body-naming';
import type { ProceduralCometCreation } from './comet-factory';
import type { IStateDependencies } from '../interfaces';
import { BodyTypeEnum } from '../bodies/body-enums';

import { applyInclinationX, applyYawY, buildUnitPositionDirection, safeUnitCross } from './orbital-math';
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
    const minDistWorld = Math.max(EARTH_DIST * minDistAU, maxStarRadius * 20);
    const maxDistWorld = EARTH_DIST * maxDistAU;

    const creations: ProceduralCometCreation[] = [];

    for (let i = 0; i < cometCount; i++) {
        const subSeed = `${masterSeed}|comet:${i}`;

        // Round-robin across stars for multi-star systems.
        const starIndex = i % starCount;
        const hostStar = starParams[starIndex]!;
        const hostPlacement = starPlacements[starIndex]!;

        const distanceRng = rngFor(masterSeed, 'cometDistance', i);
        // Log-uniform distance within the outer zone.
        const logMin = Math.log(Math.max(1e-6, minDistWorld));
        const logMax = Math.log(Math.max(logMin + 1e-6, maxDistWorld));
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

        // Comets have high eccentricities (0.6–0.97).
        const eccRng = rngFor(masterSeed, 'cometEccentricity', i);
        const eccentricity = eccRng.range(0.6, 0.97);
        const speed = calculateOrbitalSpeed(dependencies.getG(), distance, hostStar.mass, eccentricity);

        const pos = hostPlacement.pos.clone().addScaledVector(u, distance);
        const vel = hostPlacement.vel.clone().addScaledVector(tangentialDir, speed);

        // Seeded mass and radius (avoids the unseeded Math.random() inside randomCometParams).
        const massRng = rngFor(masterSeed, 'cometMass', i);
        const mass = 0.5 + massRng.next() * 3.5;

        const radiusRng = rngFor(masterSeed, 'cometRadius', i);
        const radius = 1 + radiusRng.next() * 2;

        const id = `proc_comet_${i}_${subSeed}`;
        const name = generateProceduralBodyName(BodyTypeEnum.Comet, {
            seed: subSeed,
            sequenceNumber: i + 1,
        });

        creations.push({ id, name, pos, vel, mass, radius });
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
            c.radius = Math.max(1, c.radius);
            c.mass = Math.max(0.5, c.mass);
        }
    }

    return creations;
}
