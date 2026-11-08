import * as THREE from 'three';

import { SolarSystemGenerator } from './solar-system-generator';
import { Sun } from '../bodies/sun';
import { Earth } from '../bodies/earth';
import { createMoon, earthMoonOrbitElements } from '../bodies/create-moon';
import { getShipTypeById } from '../bodies/ships/ship-registry';
import { TEAM_ALIEN, TEAM_EARTH, type ShipTeam } from '../bodies/ships/ship-team';
import { createNpcShip } from '../simulation/ai/npc-manager';
import { CombatShipAI } from '../simulation/ai/combat-ship-ai';
import { TeamSkirmishScenario } from '../scenarios/team-skirmish-scenario';
import { pickRandomSpaceTexture, generateSeedString } from './seed-utils';
import { createUniqueId } from '../utilities/utilities';
import { moonTexture } from '../drawing/textures';
import {
    MOON_DIST_FROM_EARTH,
    MOON_MASS,
    MOON_RADIUS,
    TEAM_SKIRMISH_CAPITAL_OFFSET,
    TEAM_SKIRMISH_CAPITAL_SPACING,
    TEAM_SKIRMISH_EARTH_DISTANCE,
    TEAM_SKIRMISH_FIGHTER_SPACING,
    TEAM_SKIRMISH_FIGHTERS_PER_TEAM,
    TEAM_SKIRMISH_FLEET_SEPARATION,
    TEAM_SKIRMISH_TIME_SCALE,
} from '../utilities/consts';
import { MoonTypeEnum } from '../bodies/body-enums';
import type { Body } from '../bodies/body';
import type { Spaceship } from '../bodies/ships/spaceship';
import type { ISolarSystemGenerationResult, IStateDependencies } from '../interfaces';
import { ProceduralGenerationReporter } from './procedural-generation-progress';

/** Fighter classes cycled through for each team's AI fighters. */
const EARTH_FIGHTERS = ['dart', 'zenith'];
const ALIEN_FIGHTERS = ['wraith', 'stinger'];

/** Capital ships for each team, lined up side by side behind the fighters. */
const EARTH_CAPITALS = ['osiris_mothership', 'paladin_battleship'];
const ALIEN_CAPITALS = ['harbinger_mothership'];

/**
 * Test bed for team battles: the Sun, Earth (with its Moon) and two small fleets facing each
 * other a few Earth radii out on Earth's sunward side, all at rest relative to Earth.
 *
 *  - Team Earth: the Osiris Mothership, the Paladin Battleship, TEAM_SKIRMISH_FIGHTERS_PER_TEAM Darts/Zeniths and the
 *    player's Zenith.
 *  - Team Alien: the Harbinger Mothership and TEAM_SKIRMISH_FIGHTERS_PER_TEAM Wraiths/Stingers.
 *
 * Every ship has guidance enabled and locked, so the whole fight is flown relative to Earth.
 */
export class TeamSkirmishGenerator extends SolarSystemGenerator {
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

    /** Point a ship along `heading` (ships are +Z forward; lookAt aims -Z, hence the inversion). */
    private orientAlong(ship: Spaceship, heading: THREE.Vector3): void {
        const eye = ship.mesh.position.clone().add(heading);
        const m = new THREE.Matrix4().lookAt(eye, ship.mesh.position, new THREE.Vector3(0, 1, 0));
        ship.mesh.quaternion.setFromRotationMatrix(m);
        ship.controlFrameQuat.copy(ship.mesh.quaternion);
    }

    /** Put a ship on a team, with guidance forced on. */
    private enlist(ship: Spaceship, team: ShipTeam): void {
        ship.team = team;
        ship.guidanceEnabled = true;
        ship.guidanceLocked = true;
    }

    /**
     * Build one fleet: a line of fighters across `side` at `centre`, facing `heading`, plus the
     * capital ships side by side behind them. Returns the AI ships (the player is added by the
     * caller).
     */
    private buildFleet(
        team: ShipTeam,
        capitalTypeIds: string[],
        fighterTypes: string[],
        centre: THREE.Vector3,
        heading: THREE.Vector3,
        side: THREE.Vector3,
        velocity: THREE.Vector3,
        fighterSlots: number[]
    ): Spaceship[] {
        const ships: Spaceship[] = [];
        const counts = new Map<string, number>();
        const spawn = (typeId: string, position: THREE.Vector3): Spaceship => {
            const n = (counts.get(typeId) ?? 0) + 1;
            counts.set(typeId, n);
            const label = getShipTypeById(typeId).label;
            const ship = createNpcShip({
                dependencies: this.dependencies,
                scene: this.scene,
                position,
                velocity: velocity.clone(),
                shipTypeId: typeId,
                name: `${label} ${n}`,
                team,
                ai: (s) => new CombatShipAI(s),
            });
            this.enlist(ship, team);
            this.orientAlong(ship, heading);
            return ship;
        };

        // Capitals sit behind the fighter line, spread horizontally (fighters spread along
        // `side`), centred on the fleet's axis.
        const capitalRow = centre.clone().addScaledVector(heading, -TEAM_SKIRMISH_CAPITAL_OFFSET);
        const across = new THREE.Vector3().crossVectors(heading, side).normalize();
        capitalTypeIds.forEach((typeId, i) => {
            const offset = (i - (capitalTypeIds.length - 1) / 2) * TEAM_SKIRMISH_CAPITAL_SPACING;
            ships.push(spawn(typeId, capitalRow.clone().addScaledVector(across, offset)));
        });
        fighterSlots.forEach((slot, i) => {
            const position = centre
                .clone()
                .addScaledVector(side, slot * TEAM_SKIRMISH_FIGHTER_SPACING);
            ships.push(spawn(fighterTypes[i % fighterTypes.length], position));
        });
        return ships;
    }

    async generateSolarSystemAsync(
        reporter?: ProceduralGenerationReporter
    ): Promise<ISolarSystemGenerationResult> {
        const bodies: Body[] = [];
        const fighters = TEAM_SKIRMISH_FIGHTERS_PER_TEAM;
        // Sun, Earth, Moon, player, two fleets
        const totalBodies = 3 + 1 + 2 * fighters + EARTH_CAPITALS.length + ALIEN_CAPITALS.length;
        reporter?.setTotal(totalBodies);

        const sun = new Sun(this.dependencies, this.scene);
        bodies.push(sun);
        const earth = new Earth(this.dependencies, this.scene);
        earth.orbitParent = sun;
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
            workUnit: { phase: 'planets', label: 'Creating Earth' },
        });
        await this.yieldToEventLoop();

        // Battle centre on Earth's sunward side (so the fight is lit); fleets face each other
        // along Earth's direction of travel, fighters spread vertically.
        const sunward = new THREE.Vector3()
            .subVectors(sun.mesh.position, earth.mesh.position)
            .normalize();
        const centre = earth.mesh.position
            .clone()
            .addScaledVector(sunward, TEAM_SKIRMISH_EARTH_DISTANCE);
        const axis = new THREE.Vector3()
            .crossVectors(new THREE.Vector3(0, 1, 0), sunward)
            .normalize();
        const side = new THREE.Vector3(0, 1, 0);
        const velocity = earth.velocity.clone(); // at rest relative to Earth

        const earthCentre = centre
            .clone()
            .addScaledVector(axis, -TEAM_SKIRMISH_FLEET_SEPARATION / 2);
        const alienCentre = centre
            .clone()
            .addScaledVector(axis, TEAM_SKIRMISH_FLEET_SEPARATION / 2);
        const towardAliens = axis.clone();
        const towardEarth = axis.clone().negate();

        // Symmetric slots: …, -2, -1, 1, 2, … — slot 0 (the middle) is the player's on Team Earth.
        const slots = Array.from({ length: fighters }, (_, i) => {
            const k = Math.floor(i / 2) + 1;
            return i % 2 === 0 ? k : -k;
        });

        const earthFleet = this.buildFleet(
            TEAM_EARTH,
            EARTH_CAPITALS,
            EARTH_FIGHTERS,
            earthCentre,
            towardAliens,
            side,
            velocity,
            slots
        );
        const alienFleet = this.buildFleet(
            TEAM_ALIEN,
            ALIEN_CAPITALS,
            ALIEN_FIGHTERS,
            alienCentre,
            towardEarth,
            side,
            velocity,
            [0, ...slots].slice(0, fighters)
        );

        const playerShip = getShipTypeById('zenith').create(
            this.dependencies,
            this.scene,
            earthCentre.clone(),
            velocity.clone(),
            createUniqueId('spaceship')
        );
        this.enlist(playerShip, TEAM_EARTH);
        this.orientAlong(playerShip, towardAliens);

        bodies.push(playerShip, ...earthFleet, ...alienFleet);
        reporter?.report({
            completed: totalBodies,
            total: totalBodies,
            workUnit: { phase: 'finalizing', label: 'Assembling the fleets' },
        });
        await this.yieldToEventLoop();

        return {
            system: {
                bodies,
                features: [],
                spaceTexture: pickRandomSpaceTexture(this.masterSeed),
            },
            options: {
                timeScale: TEAM_SKIRMISH_TIME_SCALE,
                playerShip,
            },
            scenario: new TeamSkirmishScenario(this.dependencies, playerShip, [
                playerShip,
                ...earthFleet,
                ...alienFleet,
            ]),
        };
    }
}
