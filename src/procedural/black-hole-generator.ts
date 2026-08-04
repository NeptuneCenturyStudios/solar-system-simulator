import * as THREE from 'three';
import type { StarParams } from '../utilities/body-params';
import { EARTH_DIST, SUN_MASS } from '../utilities/consts';
import { calculateTrajectory, blackHoleMassToEventHorizonRadius } from '../physics/physics';
import { generateProceduralBodyName } from './body-naming';
import type { ProceduralBlackHoleCreation } from './black-hole-factory';
import type { IStateDependencies } from '../interfaces';
import { BodyTypeEnum } from '../bodies/body-enums';
import { rngFor } from './seed-utils';

export function generateProceduralBlackHoles(params: {
    dependencies: IStateDependencies;
    masterSeed: string;
    blackHoleCount: number;
    starParams: StarParams[];
    starPlacements: Array<{ pos: THREE.Vector3; vel: THREE.Vector3 }>;
}): ProceduralBlackHoleCreation[] {
    const { dependencies, masterSeed, blackHoleCount, starParams, starPlacements } = params;

    if (blackHoleCount <= 0) return [];

    const starCount = starParams.length;
    if (starCount === 0) return [];

    const creations: ProceduralBlackHoleCreation[] = [];

    for (let i = 0; i < blackHoleCount; i++) {
        const subSeed = `${masterSeed}|blackhole:${i}`;

        // Black hole orbits the primary star (star index 0).
        const hostStar = starParams[0]!;
        const hostPlacement = starPlacements[0]!;

        // Seeded mass log-uniform in [3–50 M☉].
        const BH_MIN_MASS = 3 * SUN_MASS;
        const BH_MAX_MASS = 50 * SUN_MASS;
        const massRng = rngFor(masterSeed, 'bhMass', i);
        const mass = BH_MIN_MASS * Math.pow(BH_MAX_MASS / BH_MIN_MASS, massRng.next());
        const radius = blackHoleMassToEventHorizonRadius(mass);

        // Orbit the primary star at 0.08–0.9 AU separation.
        const minSep = Math.max((hostStar.radius + radius) * 5, EARTH_DIST * 0.08);
        const maxSep = EARTH_DIST * 0.9;
        const separation = minSep + rngFor(masterSeed, 'bhOrbitDist', i).next() * (maxSep - minSep);

        const orbitAngle = rngFor(masterSeed, 'bhAngle', i).range(0, Math.PI * 2);
        const inclinationDeg = rngFor(masterSeed, 'bhInclination', i).range(5, 45);
        const inclinationRad = (inclinationDeg * Math.PI) / 180;

        // calculateTrajectory returns a circular orbit at `separation` around the host.
        const { pos, vel } = calculateTrajectory(
            dependencies.getG(),
            separation,
            hostStar.mass,
            orbitAngle
        );

        // Tilt the orbital plane.
        pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);
        vel.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);

        // Offset from the host star's position/velocity.
        pos.add(hostPlacement.pos);
        vel.add(hostPlacement.vel);

        const id = `proc_bh_${i}_${subSeed}`;
        const name = generateProceduralBodyName(BodyTypeEnum.BlackHole, {
            seed: subSeed,
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
            Number.isFinite(c.mass) &&
            Number.isFinite(c.radius);

        if (!ok) {
            c.pos.set(0, 0, 0);
            c.vel.set(0, 0, 0);
        }
    }

    return creations;
}
