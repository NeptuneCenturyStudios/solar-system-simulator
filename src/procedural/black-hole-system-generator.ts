import * as THREE from 'three';
import { SolarSystemGenerator } from './solar-system-generator';
import { BlackHole } from '../bodies/black-hole';
import { randomBlackHoleParams, randomStarParams } from '../utilities/body-params';
import { generateProceduralBodyName } from './body-naming';
import { BodyTypeEnum } from '../bodies/body-enums';
import { calculateTrajectory } from '../physics/physics';
import { EARTH_DIST } from '../utilities/consts';
import { createMainSequenceStarFromParams } from './star-factory';
import { generateBinaryPlacements } from './orbital-math';
import type { Body } from '../bodies/body';
import type { ISolarSystem, IStateDependencies } from '../interfaces';
import { generateSeedString, pickRandomSpaceTexture, rngFor } from './seed-utils';
import { ProceduralGenerationReporter } from './procedural-generation-progress';

/**
 * Generates a black hole system: one procedurally-named black hole + 1–3 procedurally-named stars.
 * The black hole and first star share a true binary (centre-of-mass) orbit.
 * Any additional stars orbit the barycentre on simple circular paths within the siphon range (≤ 1 AU).
 */
export class BlackHoleSystemGenerator extends SolarSystemGenerator {
    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    private readonly masterSeed: string;

    constructor(dependencies: IStateDependencies, scene: THREE.Scene, seed?: string) {
        super();
        this.dependencies = dependencies;
        this.scene = scene;
        const inputSeed = (seed ?? '').trim();
        this.masterSeed = inputSeed.length > 0 ? inputSeed : generateSeedString();
        this.seed = this.masterSeed;
        console.info('[black-hole-system] using master seed:', this.masterSeed);
    }

    async generateSolarSystemAsync(reporter?: ProceduralGenerationReporter): Promise<ISolarSystem> {

        const bodies: Body[] = [];

        const bhParams = randomBlackHoleParams();
        const bhName = generateProceduralBodyName(BodyTypeEnum.BlackHole, {
            seed: `${this.masterSeed}|bh-name`,
        });
        const bhId = `proc_bh_${this.masterSeed}`;

        const starCount = rngFor(this.masterSeed, 'starCount').rangeInt(1, 3);
        const sharedStarNameSeed = `${this.masterSeed}|star-name-base`;
        const gForce = this.dependencies.getG();

        const totalBodies = 1 + starCount; // 1 black hole + number of stars
        reporter?.setTotal(totalBodies);

        // --- Binary orbit: black hole + first star around shared barycentre ---
        const primaryStarParams = randomStarParams({ seed: `${this.masterSeed}|star:0` });

        const binMinSep = Math.max(
            primaryStarParams.radius * 5 + bhParams.radius,
            EARTH_DIST * 0.08
        );
        const binMaxSep = EARTH_DIST * 0.9;
        const binarySep =
            binMinSep + rngFor(this.masterSeed, 'binarySep').next() * (binMaxSep - binMinSep);

        const binaryYaw = rngFor(this.masterSeed, 'binaryYaw').range(0, Math.PI * 2);
        const binaryIncDeg = rngFor(this.masterSeed, 'binaryInc').range(5, 45);
        const binaryIncRad = (binaryIncDeg * Math.PI) / 180;

        const [bhPlacement, star0Placement] = generateBinaryPlacements(
            [bhParams.mass, primaryStarParams.mass],
            binarySep,
            binaryYaw,
            binaryIncRad,
            gForce
        );

        const blackHole = new BlackHole(
            this.dependencies,
            this.scene,
            bhPlacement.pos,
            bhParams.mass,
            bhId,
            bhName,
            { tilt: 0, speed: 0 }
        );

        // Apply the binary orbit velocity to the black hole
        blackHole.velocity.copy(bhPlacement.vel);
        bodies.push(blackHole);

        // Report completion of black hole creation
        let completed = 0;
        completed++;
        reporter?.report({
            completed: completed,
            total: totalBodies,
            workUnit: { phase: 'black-holes', label: 'Creating black hole' },
        });

        await this.yieldToEventLoop();

        const primaryStarNameOptions =
            starCount > 1
                ? {
                      seed: sharedStarNameSeed,
                      starTemperatureK: primaryStarParams.temperature,
                      starSystemMemberIndex: 0,
                      starSystemMemberCount: starCount,
                      starSystemSuffixStyle: 'auto' as const,
                  }
                : {
                      seed: primaryStarParams.seed,
                      sequenceNumber: 1,
                      starTemperatureK: primaryStarParams.temperature,
                  };

        const primaryStar = createMainSequenceStarFromParams(
            this.dependencies,
            this.scene,
            primaryStarParams,
            {
                id: `proc_star_0_${this.masterSeed}`,
                name: generateProceduralBodyName(BodyTypeEnum.Star, primaryStarNameOptions),
                pos: star0Placement.pos,
                vel: star0Placement.vel,
                rotation: {
                    tilt: primaryStarParams.rotationTilt,
                    speed: primaryStarParams.rotationSpeed,
                    azimuth: primaryStarParams.rotationAzimuth,
                },
            }
        );
        bodies.push(primaryStar);

        // Report completion of black hole creation
        completed++;
        reporter?.report({
            completed: completed,
            total: totalBodies,
            workUnit: { phase: 'stars', label: 'Star 1 created' },
        });

        await this.yieldToEventLoop();

        // --- Additional stars (i ≥ 1): simple circular orbits around the barycentre (origin) ---
        for (let i = 1; i < starCount; i++) {
            const params = randomStarParams({ seed: `${this.masterSeed}|star:${i}` });

            const minOrbit = Math.max(params.radius * 5 + bhParams.radius, EARTH_DIST * 0.08);
            const maxOrbit = EARTH_DIST * 0.9;
            const orbitDist =
                minOrbit + rngFor(this.masterSeed, 'starDist', i).next() * (maxOrbit - minOrbit);
            const orbitAngle = rngFor(this.masterSeed, 'starAngle', i).next() * Math.PI * 2;

            const inclinationDeg = rngFor(this.masterSeed, 'starInclination', i).range(-25, 25);
            const inclinationRad = (inclinationDeg * Math.PI) / 180;

            // Orbit around the system barycentre using combined mass for correct orbital speed.
            const totalMass = bhParams.mass + primaryStarParams.mass;
            const { pos, vel } = calculateTrajectory(gForce, orbitDist, totalMass, orbitAngle);

            pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);
            vel.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);

            const nameOptions = {
                seed: sharedStarNameSeed,
                starTemperatureK: params.temperature,
                starSystemMemberIndex: i,
                starSystemMemberCount: starCount,
                starSystemSuffixStyle: 'auto' as const,
            };

            const star = createMainSequenceStarFromParams(this.dependencies, this.scene, params, {
                id: `proc_star_${i}_${this.masterSeed}`,
                name: generateProceduralBodyName(BodyTypeEnum.Star, nameOptions),
                pos,
                vel,
                rotation: {
                    tilt: params.rotationTilt,
                    speed: params.rotationSpeed,
                    azimuth: params.rotationAzimuth,
                },
            });

            bodies.push(star);

            // Report completion of this star's creation
            completed++;
            reporter?.report({
                completed: completed,
                total: totalBodies,
                workUnit: { phase: 'stars', label: `Star ${i + 1} created` },
            });

            await this.yieldToEventLoop();
        }

        // Pick a PRNG skydome texture based on the master seed
        const skydomeTexture = pickRandomSpaceTexture(this.masterSeed);

        return {
            bodies,
            spaceTexture: skydomeTexture,
        };
    }
}
