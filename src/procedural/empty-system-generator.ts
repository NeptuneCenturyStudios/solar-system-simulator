import * as THREE from 'three';
import { SolarSystemGenerator } from './solar-system-generator';
import type { Body } from '../bodies/body';
import type { ISolarSystem, IStateDependencies } from '../interfaces';
import { pickRandomSpaceTexture, generateSeedString } from './seed-utils';

/**
 * Generates an empty system with no significant celestial bodies.
 */
export class EmptySystemGenerator extends SolarSystemGenerator {
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
        console.info('[empty-system] using master seed:', this.masterSeed);
    }

    async generateSolarSystemAsync(): Promise<ISolarSystem> {
        const bodies: Body[] = [];

        await this.yieldToEventLoop();

        // Pick a PRNG skydome texture based on the master seed
        const skydomeTexture = pickRandomSpaceTexture(this.masterSeed);

        return {
            bodies,
            spaceTexture: skydomeTexture,
        };
    }
}
