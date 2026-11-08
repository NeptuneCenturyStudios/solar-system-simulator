import * as THREE from 'three';

import { SolarSystemGenerator } from './solar-system-generator';
import { Sun } from '../bodies/sun';
import { Earth } from '../bodies/earth';
import { Wormhole } from '../bodies/wormhole';
import { createMoon, earthMoonOrbitElements } from '../bodies/create-moon';
import { getShipTypeById } from '../bodies/ships/ship-registry';
import { TEAM_EARTH } from '../bodies/ships/ship-team';
import { AlienInvasionScenario } from '../scenarios/alien-invasion-scenario';
import { enlistShip, orientShipAlong, spawnFleetShip } from '../scenarios/fleet-spawn';
import { pickRandomSpaceTexture, generateSeedString } from './seed-utils';
import { createUniqueId } from '../utilities/utilities';
import { moonTexture } from '../drawing/textures';
import {
    ALIEN_INVASION_CAPITAL_OFFSET,
    ALIEN_INVASION_CAPITAL_SPACING,
    ALIEN_INVASION_EARTH_HP,
    ALIEN_INVASION_FIGHTER_SPACING,
    ALIEN_INVASION_FLEET_STANDOFF,
    ALIEN_INVASION_PLAYER_FLEET_DISTANCE,
    ALIEN_INVASION_TIME_SCALE,
    ALIEN_INVASION_WORMHOLE_EARTH_DISTANCE,
    ALIEN_INVASION_WORMHOLE_RADIUS,
    MOON_DIST_FROM_EARTH,
    MOON_MASS,
    MOON_RADIUS,
} from '../utilities/consts';
import { MoonTypeEnum } from '../bodies/body-enums';
import type { Body } from '../bodies/body';
import type { Spaceship } from '../bodies/ships/spaceship';
import type { ISolarSystemGenerationResult, IStateDependencies } from '../interfaces';
import { ProceduralGenerationReporter } from './procedural-generation-progress';

/** Team Earth capital ships, lined up side by side behind the fighters. */
const EARTH_CAPITALS = [
    'osiris_mothership',
    'paladin_battleship',
    'paladin_battleship',
    'osiris_mothership',
];
/** Team Earth AI fighters: ten Darts and nine Zeniths (the player flies the tenth Zenith). */
const EARTH_FIGHTERS = [
    ...Array.from({ length: 10 }, () => 'dart'),
    ...Array.from({ length: 9 }, () => 'zenith'),
];
/** Team Alien: two Harbingers, then ten Wraiths and ten Stingers (interleaved). */
const ALIEN_CAPITALS = ['harbinger_mothership', 'harbinger_mothership'];
const ALIEN_FIGHTERS = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 'wraith' : 'stinger'));

/** Fighter formation columns (the rest go into rows). */
const FORMATION_COLUMNS = 5;

/**
 * Alien Invasion: the Sun, Earth (with its Moon), an unlinked (red) wormhole a few Earth radii
 * out on Earth's sunward side, the Team Earth fleet parked facing it, and the player in a Zenith
 * behind the fleet. The alien fleet is not built here — it comes through the wormhole once the
 * scenario is running (see AlienInvasionScenario).
 */
export class AlienInvasionGenerator extends SolarSystemGenerator {
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
    }

    /**
     * Team Earth: capitals side by side in a row, fighters in a grid in front of them, all
     * facing `heading` (toward the wormhole) at `velocity`.
     */
    private buildEarthFleet(
        fighterCentre: THREE.Vector3,
        heading: THREE.Vector3,
        velocity: THREE.Vector3
    ): Spaceship[] {
        const ships: Spaceship[] = [];
        const counts = new Map<string, number>();
        const spawn = (typeId: string, position: THREE.Vector3): Spaceship => {
            const n = (counts.get(typeId) ?? 0) + 1;
            counts.set(typeId, n);
            return spawnFleetShip({
                dependencies: this.dependencies,
                scene: this.scene,
                shipTypeId: typeId,
                position,
                velocity,
                heading,
                team: TEAM_EARTH,
                name: `${getShipTypeById(typeId).label} ${n}`,
            });
        };

        const up = new THREE.Vector3(0, 1, 0);
        const across = new THREE.Vector3().crossVectors(heading, up).normalize();

        const capitalRow = fighterCentre
            .clone()
            .addScaledVector(heading, -ALIEN_INVASION_CAPITAL_OFFSET);
        EARTH_CAPITALS.forEach((typeId, i) => {
            const offset = (i - (EARTH_CAPITALS.length - 1) / 2) * ALIEN_INVASION_CAPITAL_SPACING;
            ships.push(spawn(typeId, capitalRow.clone().addScaledVector(across, offset)));
        });

        const rows = Math.ceil(EARTH_FIGHTERS.length / FORMATION_COLUMNS);
        EARTH_FIGHTERS.forEach((typeId, i) => {
            const col = i % FORMATION_COLUMNS;
            const row = Math.floor(i / FORMATION_COLUMNS);
            const position = fighterCentre
                .clone()
                .addScaledVector(
                    across,
                    (col - (FORMATION_COLUMNS - 1) / 2) * ALIEN_INVASION_FIGHTER_SPACING
                )
                .addScaledVector(up, (row - (rows - 1) / 2) * ALIEN_INVASION_FIGHTER_SPACING);
            ships.push(spawn(typeId, position));
        });
        return ships;
    }

    async generateSolarSystemAsync(
        reporter?: ProceduralGenerationReporter
    ): Promise<ISolarSystemGenerationResult> {
        const bodies: Body[] = [];
        // Sun, Earth, Moon, wormhole, player, Team Earth
        const totalBodies = 5 + EARTH_CAPITALS.length + EARTH_FIGHTERS.length;
        reporter?.setTotal(totalBodies);

        const sun = new Sun(this.dependencies, this.scene);
        bodies.push(sun);
        const earth = new Earth(this.dependencies, this.scene);
        earth.orbitParent = sun;
        earth.resetHealthPoints(ALIEN_INVASION_EARTH_HP);
        bodies.push(earth);
        const moon = createMoon(earth, this.scene, {
            distance: MOON_DIST_FROM_EARTH,
            radius: MOON_RADIUS,
            mass: MOON_MASS,
            pos: new THREE.Vector3(),
            vel: new THREE.Vector3(),
            id: createUniqueId('moon'),
            name: 'Moon',
            moonType: MoonTypeEnum.Terrestrial,
            texture: moonTexture,
            trailColor: 0xffffff,
            maxTrail: 1500,
            angle: 0,
            orbitElements: earthMoonOrbitElements(),
        });
        moon.orbitParent = earth;
        bodies.push(moon);

        reporter?.report({
            completed: 3,
            total: totalBodies,
            workUnit: { phase: 'planets', label: 'Creating Earth and the Moon' },
        });
        await this.yieldToEventLoop();

        // The wormhole sits on Earth's sunward side (so the fight is lit), its mouth facing
        // along Earth's direction of travel, where the Team Earth fleet waits.
        const sunward = new THREE.Vector3()
            .subVectors(sun.mesh.position, earth.mesh.position)
            .normalize();
        const wormholePos = earth.mesh.position
            .clone()
            .addScaledVector(sunward, ALIEN_INVASION_WORMHOLE_EARTH_DISTANCE);
        const exitNormal = new THREE.Vector3()
            .crossVectors(new THREE.Vector3(0, 1, 0), sunward)
            .normalize();
        const wormhole = new Wormhole(
            this.dependencies,
            this.scene,
            wormholePos,
            ALIEN_INVASION_WORMHOLE_RADIUS,
            createUniqueId('wormhole'),
            'Unknown Anomaly'
        );
        wormhole.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), exitNormal);
        // Static bodies drift at whatever velocity they're given: keep pace with Earth.
        wormhole.velocity.copy(earth.velocity);
        bodies.push(wormhole);

        // Team Earth, facing the wormhole's mouth.
        const fleetCentre = wormholePos
            .clone()
            .addScaledVector(exitNormal, ALIEN_INVASION_FLEET_STANDOFF);
        const towardWormhole = exitNormal.clone().negate();
        const earthFleet = this.buildEarthFleet(fleetCentre, towardWormhole, earth.velocity);

        // The player: a Zenith behind the fleet's capital row, facing the wormhole.
        const playerShip = getShipTypeById('zenith').create(
            this.dependencies,
            this.scene,
            fleetCentre
                .clone()
                .addScaledVector(
                    exitNormal,
                    ALIEN_INVASION_CAPITAL_OFFSET + ALIEN_INVASION_PLAYER_FLEET_DISTANCE
                ),
            earth.velocity.clone(),
            createUniqueId('spaceship')
        );
        enlistShip(playerShip, TEAM_EARTH);
        orientShipAlong(playerShip, towardWormhole);

        bodies.push(playerShip, ...earthFleet);
        reporter?.report({
            completed: totalBodies,
            total: totalBodies,
            workUnit: { phase: 'finalizing', label: 'Assembling the fleet' },
        });
        await this.yieldToEventLoop();

        return {
            system: {
                bodies,
                features: [],
                spaceTexture: pickRandomSpaceTexture(this.masterSeed),
            },
            options: {
                timeScale: ALIEN_INVASION_TIME_SCALE,
                playerShip,
            },
            scenario: new AlienInvasionScenario(this.dependencies, this.scene, {
                playerShip,
                earthFleet,
                alienCapitals: ALIEN_CAPITALS,
                alienFighters: ALIEN_FIGHTERS,
                wormhole,
                earth,
            }),
        };
    }
}
