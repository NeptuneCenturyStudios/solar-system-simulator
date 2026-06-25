import * as THREE from 'three';
import type { Body } from '../bodies/body';
import { SolarSystemGenerator } from './solar-system-generator';

import { calculateTrajectory } from '../physics/physics';

import { Halley } from '../bodies/halley';
import { Sun } from '../bodies/sun';
import { Mercury } from '../bodies/mercury';
import { Venus } from '../bodies/venus';
import { Earth } from '../bodies/earth';
import { Mars } from '../bodies/mars';
import { Jupiter } from '../bodies/jupiter';
import { Saturn } from '../bodies/saturn';
import { Uranus } from '../bodies/uranus';
import { Neptune } from '../bodies/neptune';
import { Pluto } from '../bodies/pluto';
import { Ceres } from '../bodies/ceres';
import { Asteroid } from '../bodies/asteroid';

import { createSatellite } from '../utilities/utilities';
import type { ISolarSystem, IStateDependencies } from '../interfaces';
import { createMoon } from '../bodies/create-moon';

import {
    SUN_MASS,
    MOON_MASS,
    MOON_DIST_FROM_EARTH,
    MOON_RADIUS,
    ISS_DIST_FROM_EARTH,
    ISS_MASS,
    ISS_RADIUS,
    ISS_INCLINATION,
    IO_MASS,
    IO_DIST_FROM_JUPITER,
    IO_RADIUS,
    EUROPA_MASS,
    EUROPA_DIST_FROM_JUPITER,
    EUROPA_RADIUS,
    GANYMEDE_MASS,
    GANYMEDE_DIST_FROM_JUPITER,
    GANYMEDE_RADIUS,
    CALLISTO_MASS,
    CALLISTO_DIST_FROM_JUPITER,
    CALLISTO_RADIUS,
    VESTA_MASS,
    VESTA_DISTANCE,
    VESTA_RADIUS,
    PALLAS_MASS,
    PALLAS_DISTANCE,
    PALLAS_RADIUS,
    HYGIEA_MASS,
    HYGIEA_DISTANCE,
    HYGIEA_RADIUS,
} from '../utilities/consts';
import { MoonTypeEnum } from '../bodies/body-enums';
import { callistoTexture, europaTexture, ganymedeTexture, ioTexture, moonTexture, spaceTextures } from '../drawing/textures';

export class NormalSolarSystemGenerator extends SolarSystemGenerator {
    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;

    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        super();

        this.dependencies = dependencies;
        this.scene = scene;
    }

    async generateSolarSystemAsync(): Promise<ISolarSystem> {
        const yieldToEventLoop = async () => new Promise<void>((resolve) => setTimeout(resolve, 0));
   
        const bodies: Body[] = [];

        // Helper to generate a random orbital angle
        const randomAngle = () => Math.random() * Math.PI * 2;

        // Sun (static at origin)
        const sun = new Sun(this.dependencies, this.scene);
        bodies.push(sun);
        await yieldToEventLoop();

        // Mercury
        bodies.push(new Mercury(this.dependencies, this.scene, randomAngle()));
        await yieldToEventLoop();

        // Venus
        bodies.push(new Venus(this.dependencies, this.scene, randomAngle()));
        await yieldToEventLoop();

        // Earth (+ Moon)
        const earthAngle = randomAngle();
        const earth = new Earth(this.dependencies, this.scene, earthAngle);
        bodies.push(earth);
        await yieldToEventLoop();

        // Moon gets its own random angle around Earth
        bodies.push(
            createMoon(earth, this.scene, {
                distance: MOON_DIST_FROM_EARTH,
                radius: MOON_RADIUS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden
                mass: MOON_MASS,
                id: 'moon',
                name: 'Moon',
                trailColor: 0xffffff,
                maxTrail: 1500,
                texture: moonTexture,
                moonType: MoonTypeEnum.Terrestrial,
                angle: randomAngle(),
            })
        );
        await yieldToEventLoop();

        // Satellite (ISS) — random angle around Earth
        bodies.push(
            createSatellite(this.scene, earth, {
                distance: ISS_DIST_FROM_EARTH,
                radius: ISS_RADIUS,
                mass: ISS_MASS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden in createSatellite
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden in createSatellite
                id: 'iss',
                name: 'ISS',
                trailColor: 0xffffff,
                maxTrail: 1500,
                inclinationDeg: ISS_INCLINATION,
                angle: randomAngle(),
            })
        );
        await yieldToEventLoop();

        // Mars
        bodies.push(new Mars(this.dependencies, this.scene, randomAngle()));
        await yieldToEventLoop();
        // Ceres (~2.77 AU)
        const ceresAngle = randomAngle();
        bodies.push(new Ceres(this.dependencies, this.scene, ceresAngle));
        await yieldToEventLoop();

        // Vesta (~2.36 AU) — already had random angle, but now uses the helper for consistency
        const vestaAngle = randomAngle();
        const vestaTrajectory = calculateTrajectory(
            this.dependencies.getG(),
            VESTA_DISTANCE,
            SUN_MASS,
            vestaAngle
        );
        const vesta = new Asteroid(this.dependencies, this.scene, {
            radius: VESTA_RADIUS,
            color: 0xb8a890,
            pos: [vestaTrajectory.pos.x, (Math.random() - 0.5) * 1639, vestaTrajectory.pos.z],
            vel: [vestaTrajectory.vel.x, 0, vestaTrajectory.vel.z],
            mass: VESTA_MASS,
            id: 'vesta',
            name: 'Vesta',
            trailColor: 0xc9b89a,
            maxTrail: 1500,
            roughness: 0.9,
        });
        bodies.push(vesta);
        await yieldToEventLoop();

        // Pallas (~2.77 AU)
        const pallasAngle = randomAngle();
        const pallasTrajectory = calculateTrajectory(
            this.dependencies.getG(),
            PALLAS_DISTANCE,
            SUN_MASS,
            pallasAngle
        );
        const pallas = new Asteroid(this.dependencies, this.scene, {
            radius: PALLAS_RADIUS,
            color: 0x8a8a8a,
            pos: [pallasTrajectory.pos.x, (Math.random() - 0.5) * 2185, pallasTrajectory.pos.z],
            vel: [pallasTrajectory.vel.x, 0, pallasTrajectory.vel.z],
            mass: PALLAS_MASS,
            id: 'pallas',
            name: 'Pallas',
            trailColor: 0x999999,
            maxTrail: 1500,
            roughness: 0.9,
        });
        bodies.push(pallas);
        await yieldToEventLoop();

        // Hygiea (~3.14 AU)
        const hygieaAngle = randomAngle();
        const hygieaTrajectory = calculateTrajectory(
            this.dependencies.getG(),
            HYGIEA_DISTANCE,
            SUN_MASS,
            hygieaAngle
        );
        const hygiea = new Asteroid(this.dependencies, this.scene, {
            radius: HYGIEA_RADIUS,
            color: 0x7a7a7a,
            pos: [hygieaTrajectory.pos.x, (Math.random() - 0.5) * 1093, hygieaTrajectory.pos.z],
            vel: [hygieaTrajectory.vel.x, 0, hygieaTrajectory.vel.z],
            mass: HYGIEA_MASS,
            id: 'hygiea',
            name: 'Hygiea',
            trailColor: 0x888888,
            maxTrail: 1500,
            roughness: 0.9,
        });
        bodies.push(hygiea);
        await yieldToEventLoop();

        // Jupiter (+ 4 Galilean moons)
        const jupiterAngle = randomAngle();
        const jupiter = new Jupiter(this.dependencies, this.scene, jupiterAngle);
        bodies.push(jupiter);
        await yieldToEventLoop();

        // Jovian moons each get their own random angle around Jupiter
        bodies.push(
            createMoon(jupiter, this.scene, {
                angle: randomAngle(),
                distance: IO_DIST_FROM_JUPITER,
                radius: IO_RADIUS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden
                mass: IO_MASS,
                id: 'camIo',
                name: 'Io',
                trailColor: 0xffdd77,
                maxTrail: 800,
                yVariation: 109,
                moonType: MoonTypeEnum.Terrestrial,
                texture: ioTexture,
            })
        );
        await yieldToEventLoop();

        bodies.push(
            createMoon(jupiter, this.scene, {
                angle: randomAngle(),
                distance: EUROPA_DIST_FROM_JUPITER,
                radius: EUROPA_RADIUS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                mass: EUROPA_MASS,
                id: 'camEuropa',
                name: 'Europa',
                trailColor: 0xccddee,
                maxTrail: 1000,
                yVariation: 164,
                moonType: MoonTypeEnum.Terrestrial,
                texture: europaTexture,
            })
        );
        await yieldToEventLoop();

        bodies.push(
            createMoon(jupiter, this.scene, {
                angle: randomAngle(),
                distance: GANYMEDE_DIST_FROM_JUPITER,
                radius: GANYMEDE_RADIUS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                mass: GANYMEDE_MASS,
                id: 'camGanymede',
                name: 'Ganymede',
                trailColor: 0xcccccc,
                maxTrail: 1200,
                yVariation: 219,
                moonType: MoonTypeEnum.Terrestrial,
                texture: ganymedeTexture,
            })
        );
        await yieldToEventLoop();

        bodies.push(
            createMoon(jupiter, this.scene, {
                angle: randomAngle(),
                distance: CALLISTO_DIST_FROM_JUPITER,
                radius: CALLISTO_RADIUS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                mass: CALLISTO_MASS,
                id: 'camCallisto',
                name: 'Callisto',
                trailColor: 0xaa9988,
                maxTrail: 1500,
                yVariation: 273,
                moonType: MoonTypeEnum.Terrestrial,
                texture: callistoTexture,
            })
        );
        await yieldToEventLoop();

        // Saturn
        bodies.push(new Saturn(this.dependencies, this.scene, randomAngle()));
        await yieldToEventLoop();

        // Uranus
        bodies.push(new Uranus(this.dependencies, this.scene, randomAngle()));
        await yieldToEventLoop();

        // Neptune
        bodies.push(new Neptune(this.dependencies, this.scene, randomAngle()));
        await yieldToEventLoop();

        // Pluto
        bodies.push(new Pluto(this.dependencies, this.scene, randomAngle()));
        await yieldToEventLoop();

        // Comet (Halley) — random orbital angle preserves elliptical orbit shape
        bodies.push(new Halley(this.dependencies, this.scene, randomAngle()));
        await yieldToEventLoop();

        // Use default space texture
        const spaceTexture = spaceTextures[0];

        return {
            bodies,
            spaceTexture: spaceTexture,
        };
    }
}
