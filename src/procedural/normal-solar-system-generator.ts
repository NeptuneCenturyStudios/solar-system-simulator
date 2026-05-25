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
import type { IStateDependencies } from '../interfaces';

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

type Textures = {
    jupiterTexture: THREE.Texture;
    saturnTexture: THREE.Texture;
    uranusTexture: THREE.Texture;
    neptuneTexture: THREE.Texture;
    plutoTexture: THREE.Texture;
    ceresTexture: THREE.Texture;
};

export class NormalSolarSystemGenerator extends SolarSystemGenerator {
    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    private readonly textures: Textures;

    constructor(dependencies: IStateDependencies, scene: THREE.Scene, textures: Textures) {
        super();

        this.dependencies = dependencies;
        this.scene = scene;
        this.textures = textures;
    }

    generateSolarSystem(): Body[] {
        const {
            jupiterTexture,
            saturnTexture,
            uranusTexture,
            neptuneTexture,
            plutoTexture,
            ceresTexture,
        } = this.textures;

        const bodies: Body[] = [];

        // Sun
        const sun = new Sun(this.dependencies, this.scene);
        bodies.push(sun);

        // Mercury
        bodies.push(new Mercury(this.dependencies, this.scene));

        // Venus
        bodies.push(new Venus(this.dependencies, this.scene));

        // Earth (+ Moon)
        const earth = new Earth(this.dependencies, this.scene);
        bodies.push(earth);

        bodies.push(
            earth.createMoon(this.scene, {
                distance: MOON_DIST_FROM_EARTH,
                radius: MOON_RADIUS,
                mass: MOON_MASS,
                id: 'moon',
                name: 'Moon',
                trailColor: 0xffffff,
                maxTrail: 1500,
            })
        );

        // Satellite (ISS)
        bodies.push(
            createSatellite(this.scene, earth, {
                distance: ISS_DIST_FROM_EARTH,
                radius: ISS_RADIUS,
                mass: ISS_MASS,
                id: 'iss',
                name: 'ISS',
                trailColor: 0xffffff,
                maxTrail: 1500,
                inclinationDeg: ISS_INCLINATION,
            })
        );

        // Mars
        bodies.push(new Mars(this.dependencies, this.scene));

        // Ceres (~2.77 AU)
        bodies.push(new Ceres(this.dependencies, this.scene, ceresTexture));

        // Vesta (~2.36 AU)
        const vestaAngle = Math.random() * Math.PI * 2;
        const vestaTrajectory = calculateTrajectory(this.dependencies.getG(), VESTA_DISTANCE, SUN_MASS);
        const vesta = new Asteroid(this.dependencies, this.scene, {
            radius: VESTA_RADIUS,
            color: 0xb8a890,
            pos: [
                Math.cos(vestaAngle) * VESTA_DISTANCE,
                (Math.random() - 0.5) * 1639,
                Math.sin(vestaAngle) * VESTA_DISTANCE,
            ],
            vel: [
                -Math.sin(vestaAngle) * vestaTrajectory.vel.length(),
                0,
                Math.cos(vestaAngle) * vestaTrajectory.vel.length(),
            ],
            mass: VESTA_MASS,
            id: 'vesta',
            name: 'Vesta',
            trailColor: 0xc9b89a,
            maxTrail: 1500,
            roughness: 0.9,
        });
        bodies.push(vesta);

        // Pallas (~2.77 AU)
        const pallasAngle = Math.random() * Math.PI * 2;
        const pallasTrajectory = calculateTrajectory(this.dependencies.getG(), PALLAS_DISTANCE, SUN_MASS);
        const pallas = new Asteroid(this.dependencies, this.scene, {
            radius: PALLAS_RADIUS,
            color: 0x8a8a8a,
            pos: [
                Math.cos(pallasAngle) * PALLAS_DISTANCE,
                (Math.random() - 0.5) * 2185,
                Math.sin(pallasAngle) * PALLAS_DISTANCE,
            ],
            vel: [
                -Math.sin(pallasAngle) * pallasTrajectory.vel.length(),
                0,
                Math.cos(pallasAngle) * pallasTrajectory.vel.length(),
            ],
            mass: PALLAS_MASS,
            id: 'pallas',
            name: 'Pallas',
            trailColor: 0x999999,
            maxTrail: 1500,
            roughness: 0.9,
        });
        bodies.push(pallas);

        // Hygiea (~3.14 AU)
        const hygieaAngle = Math.random() * Math.PI * 2;
        const hygieaTrajectory = calculateTrajectory(this.dependencies.getG(), HYGIEA_DISTANCE, SUN_MASS);
        const hygiea = new Asteroid(this.dependencies, this.scene, {
            radius: HYGIEA_RADIUS,
            color: 0x7a7a7a,
            pos: [
                Math.cos(hygieaAngle) * HYGIEA_DISTANCE,
                (Math.random() - 0.5) * 1093,
                Math.sin(hygieaAngle) * HYGIEA_DISTANCE,
            ],
            vel: [
                -Math.sin(hygieaAngle) * hygieaTrajectory.vel.length(),
                0,
                Math.cos(hygieaAngle) * hygieaTrajectory.vel.length(),
            ],
            mass: HYGIEA_MASS,
            id: 'hygiea',
            name: 'Hygiea',
            trailColor: 0x888888,
            maxTrail: 1500,
            roughness: 0.9,
        });
        bodies.push(hygiea);

        // Jupiter (+ 4 Galilean moons)
        const jupiter = new Jupiter(this.dependencies, this.scene, jupiterTexture);
        bodies.push(jupiter);

        // Io (0 degrees)
        bodies.push(
            jupiter.createMoon(this.scene, {
                angle: 0,
                distance: IO_DIST_FROM_JUPITER,
                radius: IO_RADIUS,
                mass: IO_MASS,
                id: 'camIo',
                name: 'Io',
                trailColor: 0xffdd77,
                maxTrail: 800,
                yVariation: 109,
            })
        );

        // Europa (90 degrees)
        bodies.push(
            jupiter.createMoon(this.scene, {
                angle: Math.PI / 2,
                distance: EUROPA_DIST_FROM_JUPITER,
                radius: EUROPA_RADIUS,
                mass: EUROPA_MASS,
                id: 'camEuropa',
                name: 'Europa',
                trailColor: 0xccddee,
                maxTrail: 1000,
                yVariation: 164,
            })
        );

        // Ganymede (180 degrees)
        bodies.push(
            jupiter.createMoon(this.scene, {
                angle: Math.PI,
                distance: GANYMEDE_DIST_FROM_JUPITER,
                radius: GANYMEDE_RADIUS,
                mass: GANYMEDE_MASS,
                id: 'camGanymede',
                name: 'Ganymede',
                trailColor: 0xcccccc,
                maxTrail: 1200,
                yVariation: 219,
            })
        );

        // Callisto (270 degrees)
        bodies.push(
            jupiter.createMoon(this.scene, {
                angle: (Math.PI * 3) / 2,
                distance: CALLISTO_DIST_FROM_JUPITER,
                radius: CALLISTO_RADIUS,
                mass: CALLISTO_MASS,
                id: 'camCallisto',
                name: 'Callisto',
                trailColor: 0xaa9988,
                maxTrail: 1500,
                yVariation: 273,
            })
        );

        // Saturn
        bodies.push(new Saturn(this.dependencies, this.scene, saturnTexture));

        // Uranus
        bodies.push(new Uranus(this.dependencies, this.scene, uranusTexture));

        // Neptune
        bodies.push(new Neptune(this.dependencies, this.scene, neptuneTexture));

        // Pluto
        bodies.push(new Pluto(this.dependencies, this.scene, plutoTexture));

        // Comet (Halley)
        bodies.push(new Halley(this.dependencies, this.scene));

        return bodies;
    }
}
