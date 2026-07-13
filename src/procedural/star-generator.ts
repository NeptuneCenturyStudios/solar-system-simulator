import * as THREE from 'three';
import { randomStarParams } from '../utilities/body-params';
import { BodyTypeEnum } from '../bodies/body-enums';
import type { IStateDependencies } from '../interfaces';

import { generateProceduralBodyName } from './body-naming';
import {
    applyInclinationX,
    applyYawY,
    buildUnitPositionDirection,
    generateBinaryPlacements,
    safeUnitCross,
} from './orbital-math';
import { rngFor } from './seed-utils';
import type { ProceduralStarCreation } from './star-factory';

type StarPlacement = {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
};

/**
 * Computes positions and velocities for three stars orbiting their shared
 * barycentre (approximate — treats each star as if orbiting the full system mass).
 */
function generateTriplePlacements(
    masses: [number, number, number],
    radii: [number, number, number],
    yawRad: number,
    inclinationRad: number,
    masterSeed: string,
    gForce: number
): [StarPlacement, StarPlacement, StarPlacement] {
    const [m1, m2, m3] = masses;
    const mSum = m1 + m2 + m3;

    const maxRadius = Math.max(radii[0], radii[1], radii[2]);
    const minRi = maxRadius * 3;
    const maxRi = maxRadius * 40;

    const normalBaseVec = new THREE.Vector3(0, 1, 0);
    const normalYaw = applyYawY(normalBaseVec, yawRad);
    const normal = applyInclinationX(normalYaw, inclinationRad).normalize();

    const placements: StarPlacement[] = [];

    for (let i = 0; i < 3; i++) {
        const phiRad = rngFor(masterSeed, 'triplePhi', i).range(0, Math.PI * 2);
        const base = minRi + (maxRi - minRi) * rngFor(masterSeed, 'tripleRi', i).next();
        const ri = Math.max(base, radii[i] * 6);

        const u = buildUnitPositionDirection(phiRad, yawRad, inclinationRad);
        const speed = Math.sqrt((gForce * mSum) / Math.max(ri, 1e-9));
        const velDir = safeUnitCross(normal, u);

        const pos = u.clone().multiplyScalar(ri);
        const vel = velDir.clone().multiplyScalar(speed);

        placements.push({ pos, vel });
    }

    return [placements[0]!, placements[1]!, placements[2]!];
}

/**
 * Generates all star creation descriptors and their orbital placements for a
 * procedural system.  Returns both so downstream generators (planets,
 * asteroids, comets…) can use the raw placements without re-deriving them.
 */
export function generateProceduralStars(params: {
    dependencies: IStateDependencies;
    masterSeed: string;
    starCount: number;
}): ProceduralStarCreation[] {
    const { dependencies, masterSeed, starCount } = params;

    const starParamsList = Array.from({ length: starCount }, (_, i) =>
        randomStarParams({ seed: `${masterSeed}|star:${i}` })
    );

    const masses = starParamsList.map((p) => p.mass);

    let placements: StarPlacement[];

    if (starCount === 1) {
        placements = [{ pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(0, 0, 0) }];
    } else if (starCount === 2) {
        const rMax = Math.max(starParamsList[0]!.radius, starParamsList[1]!.radius);
        const sepMin = Math.max(
            (starParamsList[0]!.radius + starParamsList[1]!.radius) * 2,
            rMax * 10
        );
        const sepMax = sepMin * 50;

        const separationDistance = rngFor(masterSeed, 'binarySeparation', 0).range(sepMin, sepMax);
        const yawRad = rngFor(masterSeed, 'binaryYaw', 0).range(0, Math.PI * 2);
        const inclinationDeg = rngFor(masterSeed, 'binaryInclination', 0).range(5, 85);
        const inclinationRad = (inclinationDeg * Math.PI) / 180;

        placements = generateBinaryPlacements(
            masses as [number, number],
            separationDistance,
            yawRad,
            inclinationRad,
            dependencies.getG()
        );
    } else {
        const radii = starParamsList.map((p) => p.radius) as [number, number, number];

        const yawRad = rngFor(masterSeed, 'tripleYaw', 0).range(0, Math.PI * 2);
        const inclinationDeg = rngFor(masterSeed, 'tripleInclination', 0).range(5, 85);
        const inclinationRad = (inclinationDeg * Math.PI) / 180;

        placements = generateTriplePlacements(
            masses as [number, number, number],
            radii,
            yawRad,
            inclinationRad,
            masterSeed,
            dependencies.getG()
        );
    }

    const sharedStarNameSeed =
        starCount > 1
            ? `${masterSeed}|star-name-base`
            : `${masterSeed}|star-name-base|single`;

    return starParamsList.map((starParams, i) => {
        const placement = placements[i]!;
        const id = `proc_star_${i}_${starParams.seed}`;

        const nameOptions =
            starCount > 1
                ? {
                      seed: sharedStarNameSeed,
                      sequenceNumber: i + 1,
                      starTemperatureK: starParams.temperature,
                      starSystemMemberIndex: i,
                      starSystemMemberCount: starCount,
                      starSystemSuffixStyle: 'auto' as const,
                  }
                : {
                      seed: starParams.seed,
                      sequenceNumber: i + 1,
                      starTemperatureK: starParams.temperature,
                  };

        const name = generateProceduralBodyName(BodyTypeEnum.Star, nameOptions);

        const rotation = {
            tilt: Number.isFinite(starParams.rotationTilt) ? starParams.rotationTilt : 0,
            speed:
                Number.isFinite(starParams.rotationSpeed) && starParams.rotationSpeed > 0
                    ? starParams.rotationSpeed
                    : 0.00008,
            azimuth: Number.isFinite(starParams.rotationAzimuth) ? starParams.rotationAzimuth : 0,
        };

        return {
            id,
            name,
            pos: placement.pos,
            vel: placement.vel,
            starParams,
            rotation,
        };
    });
}
