import * as THREE from 'three';

import { SolarSystemGenerator } from './solar-system-generator';
import { Sun } from '../bodies/sun';
import { Earth } from '../bodies/earth';
import { createMoon } from '../bodies/create-moon';
import { getShipTypeById } from '../bodies/ships/ship-registry';
import { calculateOrbitalSpeed } from '../physics/physics';
import { AsteroidDefenseScenario } from '../scenarios/asteroid-defense-scenario';
import { pickRandomSpaceTexture, generateSeedString } from './seed-utils';
import { createUniqueId } from '../utilities/utilities';
import { moonTexture } from '../drawing/textures';
import {
    ASTEROID_DEFENSE_SHIP_ALTITUDE,
    ASTEROID_DEFENSE_TIME_SCALE,
    EARTH_MASS,
    MOON_DIST_FROM_EARTH,
    MOON_MASS,
    MOON_RADIUS,
} from '../utilities/consts';
import { MoonTypeEnum } from '../bodies/body-enums';
import type { Body } from '../bodies/body';
import type { Spaceship } from '../bodies/ships/spaceship';
import type { ISolarSystemGenerationResult, IStateDependencies } from '../interfaces';
import { ProceduralGenerationReporter } from './procedural-generation-progress';

/**
 * Scenario: the Sun, Earth on its real orbit, and the Moon — plus the player's ship parked
 * just off Earth's day side. The generator hands that ship back as a launch option so the
 * player starts in flight mode, and returns an {@link AsteroidDefenseScenario} that the
 * scenario manager runs to throw waves of asteroids at Earth.
 */
export class AsteroidDefenseGenerator extends SolarSystemGenerator {
    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    private readonly shipTypeId: string;
    private readonly masterSeed: string;

    /**
     * @param shipTypeId Ship type (from ship-registry.ts) to give the player — index.ts passes
     *   the Flight Controls dropdown selection. Unknown ids fall back to the first type.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        shipTypeId: string,
        seed?: string
    ) {
        super();
        this.dependencies = dependencies;
        this.scene = scene;
        this.shipTypeId = shipTypeId;
        const inputSeed = (seed ?? '').trim();
        // Seeds the skydome and the asteroid waves; the body layout itself is fixed.
        this.masterSeed = inputSeed.length > 0 ? inputSeed : generateSeedString();
        this.seed = this.masterSeed;
        console.info('[asteroid-defense] using master seed:', this.masterSeed);
    }

    /**
     * Build the player's ship on the sunward side of Earth, so Earth is lit when the player
     * looks back at it, holding a circular orbit around Earth so it doesn't fall while the
     * player gets oriented.
     */
    private createPlayerShip(sun: Sun, earth: Earth): Spaceship {
        const sunward = new THREE.Vector3()
            .subVectors(sun.mesh.position, earth.mesh.position)
            .normalize();
        const position = earth.mesh.position
            .clone()
            .addScaledVector(sunward, ASTEROID_DEFENSE_SHIP_ALTITUDE);

        // Tangent in the ecliptic, pointing along Earth's prograde direction of travel.
        const tangent = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunward);
        tangent.normalize();
        const orbitSpeed = calculateOrbitalSpeed(
            this.dependencies.getG(),
            ASTEROID_DEFENSE_SHIP_ALTITUDE,
            EARTH_MASS,
            0
        );
        const velocity = earth.velocity.clone().addScaledVector(tangent, orbitSpeed);

        const ship = getShipTypeById(this.shipTypeId).create(
            this.dependencies,
            this.scene,
            position,
            velocity,
            createUniqueId('spaceship')
        );

        // Point the ship along its orbit so it doesn't start flying backwards.
        const eye = ship.mesh.position.clone().add(tangent);
        const m = new THREE.Matrix4().lookAt(eye, ship.mesh.position, new THREE.Vector3(0, 1, 0));
        ship.mesh.quaternion.setFromRotationMatrix(m);
        ship.controlFrameQuat.copy(ship.mesh.quaternion);

        return ship;
    }

    async generateSolarSystemAsync(
        reporter?: ProceduralGenerationReporter
    ): Promise<ISolarSystemGenerationResult> {
        const bodies: Body[] = [];

        const totalBodies = 4; // Sun + Earth + Moon + player ship
        reporter?.setTotal(totalBodies);

        // ── Sun (static at the origin) ───────────────────────────────────────
        const sun = new Sun(this.dependencies, this.scene);
        bodies.push(sun);
        reporter?.report({
            completed: 1,
            total: totalBodies,
            workUnit: { phase: 'stars', label: 'Creating Sun' },
        });
        await this.yieldToEventLoop();

        // ── Earth (real orbit) ───────────────────────────────────────────────
        const earth = new Earth(this.dependencies, this.scene);
        bodies.push(earth);
        reporter?.report({
            completed: 2,
            total: totalBodies,
            workUnit: { phase: 'planets', label: 'Creating Earth' },
        });
        await this.yieldToEventLoop();

        // ── Moon ─────────────────────────────────────────────────────────────
        const moon = createMoon(earth, this.scene, {
            distance: MOON_DIST_FROM_EARTH,
            radius: MOON_RADIUS,
            mass: MOON_MASS,
            pos: new THREE.Vector3(), // overridden by createMoon
            vel: new THREE.Vector3(), // overridden by createMoon
            id: createUniqueId('moon'),
            name: 'Moon',
            moonType: MoonTypeEnum.Terrestrial,
            texture: moonTexture,
            trailColor: 0xffffff,
            maxTrail: 1500,
            angle: 0,
        });
        bodies.push(moon);
        reporter?.report({
            completed: 3,
            total: totalBodies,
            workUnit: { phase: 'moons', label: 'Creating Moon' },
        });
        await this.yieldToEventLoop();

        // ── Player ship ──────────────────────────────────────────────────────
        const ship = this.createPlayerShip(sun, earth);
        bodies.push(ship);
        reporter?.report({
            completed: 4,
            total: totalBodies,
            workUnit: { phase: 'finalizing', label: 'Preparing your ship' },
        });
        await this.yieldToEventLoop();

        return {
            system: {
                bodies,
                spaceTexture: pickRandomSpaceTexture(this.masterSeed),
            },
            options: {
                timeScale: ASTEROID_DEFENSE_TIME_SCALE,
                playerShip: ship,
            },
            scenario: new AsteroidDefenseScenario(
                this.dependencies,
                this.scene,
                earth,
                ship,
                this.masterSeed
            ),
        };
    }
}
