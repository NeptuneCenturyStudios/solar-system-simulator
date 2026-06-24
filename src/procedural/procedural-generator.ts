import * as THREE from 'three';
import { SolarSystemGenerator } from './solar-system-generator';
import { SeededRandom } from '../utilities/prng';
import { generateSystemBodyInventory } from './system-body-inventory-generator';
import { randomStarParams, type StarParams } from '../utilities/body-params';
import type { Body } from '../bodies/body';
import type { CelestialBody } from '../bodies/celestial-body';
import type { ISolarSystem, IStateDependencies } from '../interfaces';
import { MainSequenceStar } from '../bodies/main-sequence-star';

import { generateProceduralBodyName } from './body-naming';
import { createMainSequenceStarFromParams } from './star-factory';
import { generateProceduralPlanets } from './planet-generator';
import { createPlanetBodyFromProceduralCreation } from './planet-factory';
import { generateProceduralMoons } from './moon-generator';

import type {
    ProceduralGenerationReporter,
    ProceduralGenerationWorkUnit,
} from './procedural-generation-progress';
import { createMoonBodyFromProceduralCreation } from './moon-factory';
import { generateProceduralAsteroids } from './asteroid-generator';
import { createAsteroidBodyFromProceduralCreation } from './asteroid-factory';
import { generateProceduralComets } from './comet-generator';
import { createCometBodyFromProceduralCreation } from './comet-factory';
import { generateProceduralBlackHoles } from './black-hole-generator';
import { createBlackHoleBodyFromProceduralCreation } from './black-hole-factory';
import { BodyTypeEnum } from '../bodies/body-enums';

import {
    applyInclinationX,
    applyYawY,
    buildUnitPositionDirection,
    safeUnitCross,
    generateBinaryPlacements,
} from './orbital-math';
import { rngFor } from './seed-utils';

// Import the background texture upgrader
import { upgradeProceduralTexture } from './texture-upgrader';
import { loadSrgbTexture } from '../drawing/textures';

type StarPlacement = {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
};

function generateSeedString(): string {
    return (() => {
        const randPart =
            typeof crypto !== 'undefined' && crypto.getRandomValues
                ? (() => {
                      const bytes = new Uint32Array(2);
                      crypto.getRandomValues(bytes);
                      return `${bytes[0].toString(16)}${bytes[1].toString(16)}`;
                  })()
                : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        return `${randPart}`;
    })();
}

function deriveSubSeed(masterSeed: string, index: number): string {
    return `${masterSeed}|star:${index}`;
}

function createStarBody(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    params: StarParams,
    index: number,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    rotation: { tilt: number; speed: number } | undefined,
    starCount: number,
    sharedStarNameSeed: string
): MainSequenceStar {
    const id = `proc_star_${index}_${params.seed}`;

    const nameOptions = (() => {
        if (starCount > 1) {
            return {
                seed: sharedStarNameSeed,
                sequenceNumber: index + 1,
                starTemperatureK: params.temperature,
                starSystemMemberIndex: index,
                starSystemMemberCount: starCount,
                starSystemSuffixStyle: 'auto' as const,
            };
        }

        return {
            seed: params.seed,
            sequenceNumber: index + 1,
            starTemperatureK: params.temperature,
        };
    })();

    const name = generateProceduralBodyName(BodyTypeEnum.Star, nameOptions);

    return createMainSequenceStarFromParams(dependencies, scene, params, {
        id,
        name,
        pos,
        vel,
        rotation,
    });
}

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

    return [placements[0], placements[1], placements[2]];
}

export class ProceduralGenerator extends SolarSystemGenerator {
    private prng: SeededRandom;
    private masterSeed: string;

    private dependencies: IStateDependencies;
    private scene: THREE.Scene;

    constructor(seed: string | undefined, dependencies: IStateDependencies, scene: THREE.Scene) {
        super();

        this.dependencies = dependencies;
        this.scene = scene;

        const inputSeed = (seed ?? '').trim();
        this.masterSeed = inputSeed.length > 0 ? inputSeed : generateSeedString();
        this.seed = this.masterSeed;

        console.info('[procedural] using master seed:', this.masterSeed);

        this.prng = new SeededRandom(this.masterSeed);
    }

    async generateSolarSystemAsync(reporter?: ProceduralGenerationReporter): Promise<ISolarSystem> {
        const yieldToEventLoop = async () => new Promise<void>((resolve) => setTimeout(resolve, 0));

        const inventory = generateSystemBodyInventory(this.prng);

        const starEntry = inventory.find((e) => e.bodyType === BodyTypeEnum.Star);
        const starCount = starEntry?.count ?? 1;

        const planetEntry = inventory.find((e) => e.bodyType === BodyTypeEnum.Planet);
        const planetCount = planetEntry?.count ?? 0;

        const asteroidEntry = inventory.find((e) => e.bodyType === BodyTypeEnum.Asteroid);
        const asteroidCount = asteroidEntry?.count ?? 0;

        const blackHoleEntry = inventory.find((e) => e.bodyType === BodyTypeEnum.BlackHole);
        const blackHoleCount = blackHoleEntry?.count ?? 0;

        const cometEntry = inventory.find((e) => e.bodyType === BodyTypeEnum.Comet);
        const cometCount = cometEntry?.count ?? 0;

        const starParams = Array.from({ length: starCount }, (_, i) =>
            randomStarParams({ seed: deriveSubSeed(this.masterSeed, i) })
        );

        const masses = starParams.map((p) => p.mass) as number[];

        let placements!: StarPlacement[];
        if (starCount === 1) {
            placements = [{ pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(0, 0, 0) }];
        } else if (starCount === 2) {
            const rMax = Math.max(starParams[0].radius, starParams[1].radius);
            const sepMin = Math.max((starParams[0].radius + starParams[1].radius) * 2, rMax * 10);
            const sepMax = sepMin * 50;

            const separationDistance = rngFor(this.masterSeed, 'binarySeparation', 0).range(
                sepMin,
                sepMax
            );
            const yawRad = rngFor(this.masterSeed, 'binaryYaw', 0).range(0, Math.PI * 2);
            const inclinationDeg = rngFor(this.masterSeed, 'binaryInclination', 0).range(5, 85);
            const inclinationRad = (inclinationDeg * Math.PI) / 180;

            placements = generateBinaryPlacements(
                masses as [number, number],
                separationDistance,
                yawRad,
                inclinationRad,
                this.dependencies.getG()
            );
        } else {
            const radii = starParams.map((p) => p.radius) as [number, number, number];

            const yawRad = rngFor(this.masterSeed, 'tripleYaw', 0).range(0, Math.PI * 2);
            const inclinationDeg = rngFor(this.masterSeed, 'tripleInclination', 0).range(5, 85);
            const inclinationRad = (inclinationDeg * Math.PI) / 180;

            placements = generateTriplePlacements(
                masses as [number, number, number],
                radii,
                yawRad,
                inclinationRad,
                this.masterSeed,
                this.dependencies.getG()
            );
        }

        // Precompute creation descriptors so total can be set before bodies are instantiated.
        const planetCreations = generateProceduralPlanets({
            dependencies: this.dependencies,
            masterSeed: this.masterSeed,
            planetCount,
            starParams,
            starPlacements: placements,
        });

        const moonCreations = generateProceduralMoons({
            dependencies: this.dependencies,
            masterSeed: this.masterSeed,
            planetCreations,
        });

        const asteroidCreations = generateProceduralAsteroids({
            dependencies: this.dependencies,
            masterSeed: this.masterSeed,
            asteroidCount,
            starParams,
            starPlacements: placements,
        });

        const blackHoleCreations = generateProceduralBlackHoles({
            dependencies: this.dependencies,
            masterSeed: this.masterSeed,
            blackHoleCount,
            starParams,
            starPlacements: placements,
        });

        const cometCreations = generateProceduralComets({
            dependencies: this.dependencies,
            masterSeed: this.masterSeed,
            cometCount,
            starParams,
            starPlacements: placements,
        });

        const totalBodies =
            starCount +
            planetCreations.length +
            moonCreations.length +
            asteroidCreations.length +
            blackHoleCreations.length +
            cometCreations.length;

        reporter?.setTotal(totalBodies);

        const bodies: Body[] = [];
        let completed = 0;

        const report = (workUnit?: ProceduralGenerationWorkUnit) => {
            reporter?.report({
                completed,
                total: totalBodies,
                workUnit,
            });
        };

        // Stars
        const sharedStarNameSeed =
            starCount > 1
                ? `${this.masterSeed}|star-name-base`
                : `${this.masterSeed}|star-name-base|single`;

        for (let i = 0; i < starCount; i++) {
            const params = starParams[i];
            const placement = placements[i];

            const rotation = {
                tilt: Number.isFinite(params.rotationTilt) ? params.rotationTilt : 0,
                speed:
                    Number.isFinite(params.rotationSpeed) && params.rotationSpeed > 0
                        ? params.rotationSpeed
                        : 0.08,
                azimuth: Number.isFinite(params.rotationAzimuth) ? params.rotationAzimuth : 0,
            };

            bodies.push(
                createStarBody(
                    this.dependencies,
                    this.scene,
                    params,
                    i,
                    placement.pos,
                    placement.vel,
                    rotation,
                    starCount,
                    sharedStarNameSeed
                )
            );

            completed++;
            report({ phase: 'stars', label: `Stars: ${completed}/${totalBodies}` });
            await yieldToEventLoop();
        }

        // Planets (instant — JPG textures)
        const planetBodies: Body[] = [];
        for (let i = 0; i < planetCreations.length; i++) {
            const creation = planetCreations[i]!;

            reporter?.report({
                completed,
                total: totalBodies,
                workUnit: {
                    phase: 'planets',
                    label: `Planet ${i + 1}/${planetCreations.length}…`,
                },
            });

            const planetBody = createPlanetBodyFromProceduralCreation(
                this.dependencies,
                this.scene,
                creation
            );

            // Kick off background procedural texture upgrade
            upgradeProceduralTexture(planetBody as unknown as CelestialBody);

            planetBodies.push(planetBody);
            bodies.push(planetBody);

            completed++;
            reporter?.report({
                completed,
                total: totalBodies,
                workUnit: {
                    phase: 'planets',
                    label: `Planet ${i + 1}/${planetCreations.length} ✓`,
                },
            });
            await yieldToEventLoop();
        }

        // Moons
        for (let i = 0; i < moonCreations.length; i++) {
            const creation = moonCreations[i]!;
            const parentBody = planetBodies[creation.parentIndex] as Body | undefined;
            const parentCelestial = parentBody as unknown as CelestialBody;

            if (!parentCelestial || parentCelestial._isDisposed) continue;

            const moonBody = createMoonBodyFromProceduralCreation({
                dependencies: this.dependencies,
                scene: this.scene,
                creation,
                parent: parentCelestial,
            });

            // Kick off background procedural texture upgrade
            upgradeProceduralTexture(moonBody);

            bodies.push(moonBody);

            completed++;
            reporter?.report({
                completed,
                total: totalBodies,
                workUnit: { phase: 'moons', label: `Moon: ${i + 1}/${moonCreations.length} ✓` },
            });

            await yieldToEventLoop();
        }

        // Asteroids
        for (let i = 0; i < asteroidCreations.length; i++) {
            const creation = asteroidCreations[i]!;
            const asteroidBody = createAsteroidBodyFromProceduralCreation(
                this.dependencies,
                this.scene,
                creation
            );
            bodies.push(asteroidBody);

            completed++;
            reporter?.report({
                completed,
                total: totalBodies,
                workUnit: {
                    phase: 'asteroids',
                    label: `Asteroid: ${i + 1}/${asteroidCreations.length} ✓`,
                },
            });

            await yieldToEventLoop();
        }

        // Black Holes
        for (let i = 0; i < blackHoleCreations.length; i++) {
            const creation = blackHoleCreations[i]!;
            const bhBody = createBlackHoleBodyFromProceduralCreation(
                this.dependencies,
                this.scene,
                creation
            );
            bodies.push(bhBody);

            completed++;
            reporter?.report({
                completed,
                total: totalBodies,
                workUnit: {
                    phase: 'black-holes',
                    label: `Black Hole: ${i + 1}/${blackHoleCreations.length} ✓`,
                },
            });

            await yieldToEventLoop();
        }

        // Comets
        for (let i = 0; i < cometCreations.length; i++) {
            const creation = cometCreations[i]!;
            const cometBody = createCometBodyFromProceduralCreation(
                this.dependencies,
                this.scene,
                creation
            );
            bodies.push(cometBody);

            completed++;
            reporter?.report({
                completed,
                total: totalBodies,
                workUnit: { phase: 'comets', label: `Comet: ${i + 1}/${cometCreations.length} ✓` },
            });

            await yieldToEventLoop();
        }

        // Pick a PRNG skydome texture based on the master seed
        const skydomeIndex = rngFor(this.masterSeed, 'skydome').rangeInt(1, 12);
        const skydomeTexture = loadSrgbTexture(`./assets/textures/skydome/space-${skydomeIndex}.jpg`);

        return {
            bodies,
            spaceTexture: skydomeTexture,
        };
    }
}
