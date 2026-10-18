import * as THREE from 'three';
import { SolarSystemGenerator } from './solar-system-generator';
import { Sun } from '../bodies/sun';
import { calculateOrbitalSpeed } from '../physics/physics';
import { getShipTypeById } from '../bodies/ships/ship-registry';
import { createHostileWave, OsirisAmbushScenario } from '../scenarios/osiris-ambush-scenario';
import {
    NPC_SPAWN_FALLBACK_DISTANCE,
    NPC_SPAWN_STAR_RADII,
    OSIRIS_AMBUSH_NPC_COUNT,
    OSIRIS_AMBUSH_TIME_SCALE,
} from '../utilities/consts';
import { createUniqueId } from '../utilities/utilities';
import { pickRandomSpaceTexture, generateSeedString } from './seed-utils';
import type { Body } from '../bodies/body';
import type { ISolarSystemGenerationResult, IStateDependencies } from '../interfaces';
import { ProceduralGenerationReporter } from './procedural-generation-progress';

/**
 * Scenario: one star, the player's Osiris Mothership, and a wave of AI-piloted ships hunting it.
 *
 * Laid out like {@link TestAiShipsGenerator}: the real {@link Sun} (so every launch has identical
 * gravity), the player on a circular orbit far enough out that the star is irrelevant to the
 * engagement, and an otherwise empty sky. The hostiles are placed around the player by
 * {@link createHostileWave}, which the scenario reuses for every later wave.
 */
export class OsirisAmbushGenerator extends SolarSystemGenerator {
    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    private readonly masterSeed: string;

    constructor(dependencies: IStateDependencies, scene: THREE.Scene, seed?: string) {
        super();
        this.dependencies = dependencies;
        this.scene = scene;
        const inputSeed = (seed ?? '').trim();
        // Only the skydome is seeded; the star and ship placement are fixed.
        this.masterSeed = inputSeed.length > 0 ? inputSeed : generateSeedString();
        this.seed = this.masterSeed;
        console.info('[osiris-ambush] using master seed:', this.masterSeed);
    }

    async generateSolarSystemAsync(
        reporter?: ProceduralGenerationReporter
    ): Promise<ISolarSystemGenerationResult> {
        const bodies: Body[] = [];

        const totalBodies = 2 + OSIRIS_AMBUSH_NPC_COUNT; // star + player's ship + the wave
        reporter?.setTotal(totalBodies);

        // ── Star ─────────────────────────────────────────────────────────────
        const sun = new Sun(this.dependencies, this.scene);
        bodies.push(sun);
        reporter?.report({
            completed: 1,
            total: totalBodies,
            workUnit: { phase: 'stars', label: 'Creating star' },
        });

        await this.yieldToEventLoop();

        // ── Orbit ────────────────────────────────────────────────────────────
        // Offset scales off the star's radius so the player starts comfortably outside the
        // corona, on a circular orbit so the ship holds station instead of falling in.
        const offset = Math.max(sun.radius * NPC_SPAWN_STAR_RADII, NPC_SPAWN_FALLBACK_DISTANCE);
        const playerPosition = sun.mesh.position.clone().add(new THREE.Vector3(offset, 0, 0));

        const orbitSpeed = calculateOrbitalSpeed(this.dependencies.getG(), offset, sun.mass, 0);
        // Circular orbit in the XZ plane: velocity is perpendicular to the radius.
        const radial = new THREE.Vector3().subVectors(playerPosition, sun.mesh.position);
        const velocity = new THREE.Vector3(-radial.z, 0, radial.x)
            .normalize()
            .multiplyScalar(orbitSpeed)
            .add(sun.velocity);

        // ── Player ship ──────────────────────────────────────────────────────
        const playerShip = getShipTypeById('osiris_mothership').create(
            this.dependencies,
            this.scene,
            playerPosition,
            velocity.clone(),
            createUniqueId('spaceship')
        );
        // Point along the direction of travel. Ships are +Z forward while Matrix4.lookAt aims -Z
        // at its target, so the eye is placed one unit along the heading and aimed back.
        const heading = velocity.clone().normalize();
        const eye = playerShip.mesh.position.clone().add(heading);
        const m = new THREE.Matrix4().lookAt(
            eye,
            playerShip.mesh.position,
            new THREE.Vector3(0, 1, 0)
        );
        playerShip.mesh.quaternion.setFromRotationMatrix(m);
        playerShip.controlFrameQuat.copy(playerShip.mesh.quaternion);
        bodies.push(playerShip);
        reporter?.report({
            completed: 2,
            total: totalBodies,
            workUnit: { phase: 'finalizing', label: 'Preparing your ship' },
        });

        await this.yieldToEventLoop();

        // ── Opening wave ─────────────────────────────────────────────────────
        const npcs = createHostileWave(
            this.dependencies,
            this.scene,
            playerPosition,
            velocity,
            OSIRIS_AMBUSH_NPC_COUNT
        );
        bodies.push(...npcs);
        reporter?.report({
            completed: totalBodies,
            total: totalBodies,
            workUnit: { phase: 'finalizing', label: 'Creating AI ships' },
        });

        await this.yieldToEventLoop();

        return {
            system: {
                bodies,
                features: [],
                spaceTexture: pickRandomSpaceTexture(this.masterSeed),
            },
            options: {
                timeScale: OSIRIS_AMBUSH_TIME_SCALE,
                playerShip,
            },
            scenario: new OsirisAmbushScenario(this.dependencies, this.scene, playerShip, npcs),
        };
    }
}
