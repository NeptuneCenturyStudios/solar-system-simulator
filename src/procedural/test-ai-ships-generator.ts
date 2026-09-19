import * as THREE from 'three';
import { SolarSystemGenerator } from './solar-system-generator';
import { Sun } from '../bodies/sun';
import { calculateOrbitalSpeed } from '../physics/physics';
import { createNpcShip } from '../simulation/ai/npc-manager';
import { CombatShipAI } from '../simulation/ai/combat-ship-ai';
import { getShipTypeById } from '../bodies/ships/ship-registry';
import { TestAiShipsScenario } from '../scenarios/test-ai-ships-scenario';
import {
    NPC_SPAWN_FALLBACK_DISTANCE,
    NPC_SPAWN_STAR_RADII,
    TEST_AI_SHIPS_SPAWN_DISTANCE,
    TEST_AI_SHIPS_TIME_SCALE,
} from '../utilities/consts';
import { createUniqueId } from '../utilities/utilities';
import { pickRandomSpaceTexture, generateSeedString } from './seed-utils';
import type { Body } from '../bodies/body';
import type { Spaceship } from '../bodies/ships/spaceship';
import type { ISolarSystemGenerationResult, IStateDependencies } from '../interfaces';
import { ProceduralGenerationReporter } from './procedural-generation-progress';

/**
 * Test bed for the ship AI: one star, the player's ship, and one AI-piloted ship hunting it.
 *
 * Deliberately uses the real {@link Sun} rather than a procedural star, so every launch of this
 * scenario has identical mass, radius and gravity. AI behaviour is only meaningful to compare
 * between runs if the conditions are fixed, and a randomised star would change the orbit, the
 * spawn offset and the gravity the ships are fighting all at once.
 *
 * The empty sky is the point too — with no planets to collide with or be distracted by, whatever
 * the ships do is the controllers' doing. Both are parked far enough out that the star is
 * irrelevant to the engagement: solar gravity there is some two hundred times weaker than a
 * ship's own thrust, and the star sits well outside the AI's obstacle-avoidance lookahead.
 *
 * Both ships start on the same circular orbit with the same heading, with the NPC offset
 * radially outward. That places it abeam of the player rather than pointed at them, so it has to
 * genuinely acquire and turn onto its target — the behaviour worth watching — instead of
 * beginning the run already lined up.
 */
export class TestAiShipsGenerator extends SolarSystemGenerator {
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
        console.info('[test-ai-ships] using master seed:', this.masterSeed);
    }

    /**
     * Point a ship along `heading`.
     *
     * Ships are +Z forward while Matrix4.lookAt aims -Z at its target, so the eye is placed one
     * unit along the heading and aimed back at the ship to invert that.
     */
    private orientAlong(ship: Spaceship, heading: THREE.Vector3): void {
        if (heading.lengthSq() < 1e-12) return;
        const dir = heading.clone().normalize();
        const eye = ship.mesh.position.clone().add(dir);
        const m = new THREE.Matrix4().lookAt(eye, ship.mesh.position, new THREE.Vector3(0, 1, 0));
        ship.mesh.quaternion.setFromRotationMatrix(m);
        ship.controlFrameQuat.copy(ship.mesh.quaternion);
    }

    async generateSolarSystemAsync(
        reporter?: ProceduralGenerationReporter
    ): Promise<ISolarSystemGenerationResult> {
        const bodies: Body[] = [];

        const totalBodies = 3; // one star + the player's ship + one AI ship
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

        // ── Shared orbit ─────────────────────────────────────────────────────
        // Offset scales off the star's radius so the ships start comfortably outside the corona,
        // and both are given the same circular orbital velocity so they hold position (and hold
        // station on each other) instead of falling in while the AI is idle.
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
        const playerShip = getShipTypeById('zenith').create(
            this.dependencies,
            this.scene,
            playerPosition,
            velocity.clone(),
            createUniqueId('spaceship')
        );
        this.orientAlong(playerShip, velocity);
        bodies.push(playerShip);
        reporter?.report({
            completed: 2,
            total: totalBodies,
            workUnit: { phase: 'finalizing', label: 'Preparing your ship' },
        });

        await this.yieldToEventLoop();

        // ── AI-piloted ship ──────────────────────────────────────────────────
        // Offset radially outward from the player and given the player's velocity outright: at
        // this separation the difference in true orbital speed is a fraction of a metre per
        // second, so matching velocities starts the pair at rest relative to each other and
        // leaves the entire closing phase to the AI's own approach controller.
        const npcPosition = playerPosition
            .clone()
            .addScaledVector(radial.clone().normalize(), TEST_AI_SHIPS_SPAWN_DISTANCE);

        const npcShip = createNpcShip({
            dependencies: this.dependencies,
            scene: this.scene,
            position: npcPosition,
            velocity: velocity.clone(),
            name: 'NPC Zenith',
            ai: (ship) => new CombatShipAI(ship),
        });
        // Same heading as the player, i.e. abeam of them rather than nose-on.
        this.orientAlong(npcShip, velocity);
        npcShip.isThreat = true;

        bodies.push(npcShip);
        reporter?.report({
            completed: 3,
            total: totalBodies,
            workUnit: { phase: 'finalizing', label: 'Creating AI ship' },
        });

        await this.yieldToEventLoop();

        return {
            system: {
                bodies,
                spaceTexture: pickRandomSpaceTexture(this.masterSeed),
            },
            options: {
                timeScale: TEST_AI_SHIPS_TIME_SCALE,
                playerShip,
            },
            scenario: new TestAiShipsScenario(this.dependencies, this.scene, playerShip, npcShip),
        };
    }
}
