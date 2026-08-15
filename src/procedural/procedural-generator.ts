import * as THREE from 'three';
import { SolarSystemGenerator } from './solar-system-generator';
import { SeededRandom } from '../utilities/prng';
import { generateSystemBodyInventory } from './system-body-inventory-generator';
import type { Body } from '../bodies/body';
import type { CelestialBody } from '../bodies/celestial-body';
import type { ISolarSystem, IStateDependencies } from '../interfaces';

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

import { generateSeedString, pickRandomSpaceTexture } from './seed-utils';
import { generateProceduralStars } from './star-generator';
import { createStarBodyFromProceduralCreation } from './star-factory';

// Import the background texture upgrader
import { upgradeProceduralTexture } from './texture-upgrader';

export class ProceduralGenerator extends SolarSystemGenerator {
    private prng: SeededRandom;
    private masterSeed: string;

    private dependencies: IStateDependencies;
    private scene: THREE.Scene;

    constructor(dependencies: IStateDependencies, scene: THREE.Scene, seed: string | undefined) {
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

        // Generate star descriptors (params + placements + names) via the dedicated generator.
        const starCreations = generateProceduralStars({
            dependencies: this.dependencies,
            masterSeed: this.masterSeed,
            starCount,
        });

        // Downstream generators need raw StarParams and placement arrays.
        const starParams = starCreations.map((c) => c.starParams);
        const placements = starCreations.map((c) => ({ pos: c.pos, vel: c.vel }));

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
        for (let i = 0; i < starCreations.length; i++) {
            const creation = starCreations[i]!;
            bodies.push(
                createStarBodyFromProceduralCreation(this.dependencies, this.scene, creation)
            );

            completed++;
            report({ phase: 'stars', label: `Stars: ${completed}/${totalBodies}` });
            await this.yieldToEventLoop();
        }

        // Planets (instant — JPG textures)
        const planetBodies: Body[] = [];
        for (let i = 0; i < planetCreations.length; i++) {
            const creation = planetCreations[i]!;

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
            await this.yieldToEventLoop();
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

            await this.yieldToEventLoop();
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

            await this.yieldToEventLoop();
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

            await this.yieldToEventLoop();
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
