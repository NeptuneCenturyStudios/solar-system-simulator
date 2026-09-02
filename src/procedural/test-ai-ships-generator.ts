import * as THREE from 'three';
import { SolarSystemGenerator } from './solar-system-generator';
import { Sun } from '../bodies/sun';
import { calculateOrbitalSpeed } from '../physics/physics';
import { createNpcShip } from '../simulation/ai/npc-manager';
import { NPC_SPAWN_FALLBACK_DISTANCE, NPC_SPAWN_STAR_RADII } from '../utilities/consts';
import { pickRandomSpaceTexture, generateSeedString } from './seed-utils';
import type { Body } from '../bodies/body';
import type { ISolarSystem, IStateDependencies } from '../interfaces';
import { ProceduralGenerationReporter } from './procedural-generation-progress';

/**
 * Test bed for the ship AI: one star and one AI-piloted ship, and nothing else.
 *
 * Deliberately uses the real {@link Sun} rather than a procedural star, so every
 * launch of this scenario has identical mass, radius and gravity. AI behaviour is
 * only meaningful to compare between runs if the conditions are fixed, and a
 * randomised star would change the orbit, the spawn offset and the gravity the
 * ship is fighting all at once.
 *
 * The empty sky is the point too — with no planets to collide with or be
 * distracted by, whatever the ship does is the controller's doing.
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

    async generateSolarSystemAsync(reporter?: ProceduralGenerationReporter): Promise<ISolarSystem> {
        const bodies: Body[] = [];

        const totalBodies = 2; // one star + one AI ship
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

        // ── AI-piloted ship ──────────────────────────────────────────────────
        // Offset scales off the star's radius so the ship starts comfortably
        // outside the corona, and is given a circular orbital velocity so it
        // holds position instead of falling in while the AI is idle.
        const offset = Math.max(sun.radius * NPC_SPAWN_STAR_RADII, NPC_SPAWN_FALLBACK_DISTANCE);
        const position = sun.mesh.position.clone().add(new THREE.Vector3(offset, 0, 0));

        const orbitSpeed = calculateOrbitalSpeed(this.dependencies.getG(), offset, sun.mass, 0);
        // Circular orbit in the XZ plane: velocity is perpendicular to the radius.
        const radial = new THREE.Vector3().subVectors(position, sun.mesh.position);
        const velocity = new THREE.Vector3(-radial.z, 0, radial.x)
            .normalize()
            .multiplyScalar(orbitSpeed)
            .add(sun.velocity);

        const ship = createNpcShip({
            dependencies: this.dependencies,
            scene: this.scene,
            position,
            velocity,
            name: 'NPC Zenith',
        });

        // Point the ship along its orbit so it doesn't start flying backwards.
        if (velocity.lengthSq() > 1e-12) {
            const heading = velocity.clone().normalize();
            const eye = ship.mesh.position.clone().add(heading);
            const m = new THREE.Matrix4().lookAt(
                eye,
                ship.mesh.position,
                new THREE.Vector3(0, 1, 0)
            );
            ship.mesh.quaternion.setFromRotationMatrix(m);
        }
        ship.controlFrameQuat.copy(ship.mesh.quaternion);

        bodies.push(ship);
        reporter?.report({
            completed: 2,
            total: totalBodies,
            workUnit: { phase: 'finalizing', label: 'Creating AI ship' },
        });

        await this.yieldToEventLoop();

        return {
            bodies,
            spaceTexture: pickRandomSpaceTexture(this.masterSeed),
        };
    }
}
