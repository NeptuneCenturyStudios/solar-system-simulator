import * as THREE from 'three';
import type { Body } from '../bodies/body';
import { SolarSystemGenerator } from './solar-system-generator';

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

import type { ISolarSystemGenerationResult, IStateDependencies } from '../interfaces';
import { KuiperBelt } from '../features/kuiper-belt';
import {
    createCallistoBody,
    createCharonBody,
    createEarthMoonBody,
    createEuropaBody,
    createGanymedeBody,
    createHygieaBody,
    createIoBody,
    createIssBody,
    createPallasBody,
    createTitanBody,
    createVestaBody,
} from './real-solar-system-bodies';

import {
    MERCURY_PERIHELION_DIST,
    MERCURY_APHELION_DIST,
    MERCURY_MEAN_ANOMALY_J2000,
    VENUS_PERIHELION_DIST,
    VENUS_APHELION_DIST,
    VENUS_MEAN_ANOMALY_J2000,
    EARTH_PERIHELION_DIST,
    EARTH_APHELION_DIST,
    EARTH_MEAN_ANOMALY_J2000,
    MARS_PERIHELION_DIST,
    MARS_APHELION_DIST,
    MARS_MEAN_ANOMALY_J2000,
    JUPITER_PERIHELION_DIST,
    JUPITER_APHELION_DIST,
    JUPITER_MEAN_ANOMALY_J2000,
    SATURN_PERIHELION_DIST,
    SATURN_APHELION_DIST,
    SATURN_MEAN_ANOMALY_J2000,
    URANUS_PERIHELION_DIST,
    URANUS_APHELION_DIST,
    URANUS_MEAN_ANOMALY_J2000,
    NEPTUNE_PERIHELION_DIST,
    NEPTUNE_APHELION_DIST,
    NEPTUNE_MEAN_ANOMALY_J2000,
    PLUTO_PERIHELION_DIST,
    PLUTO_APHELION_DIST,
    PLUTO_MEAN_ANOMALY_J2000,
    CERES_PERIHELION_DIST,
    CERES_APHELION_DIST,
    CERES_MEAN_ANOMALY_J2000,
    COMET_PERIHELION_DIST,
    COMET_APHELION_DIST,
    COMET_MEAN_ANOMALY_J2000,
} from '../utilities/consts';
import { trueAnomalyFromApsides } from '../bodies/planet-orbit';
import { spaceTextures } from '../drawing/textures';
import type {
    ProceduralGenerationReporter,
    ProceduralGenerationWorkUnit,
} from './procedural-generation-progress';

export class NormalSolarSystemGenerator extends SolarSystemGenerator {
    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;

    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        super();

        this.dependencies = dependencies;
        this.scene = scene;
    }

    async generateSolarSystemAsync(
        progressReporter?: ProceduralGenerationReporter
    ): Promise<ISolarSystemGenerationResult> {
        const bodies: Body[] = [];

        // Total bodies: Sun + 9 planets + Ceres + 3 asteroids + 7 moons + ISS + Halley = 23
        const totalBodies = 23;
        let completed = 0;

        const report = (workUnit?: ProceduralGenerationWorkUnit) => {
            progressReporter?.report({
                completed,
                total: totalBodies,
                workUnit,
            });
        };

        // Set total upfront
        progressReporter?.setTotal(totalBodies);

        // Sun (static at origin)
        const sun = new Sun(this.dependencies, this.scene);
        bodies.push(sun);
        completed++;
        report({ phase: 'stars', label: `Sun` });
        await this.yieldToEventLoop();

        // Mercury
        const mercury = new Mercury(
            this.dependencies,
            this.scene,
            trueAnomalyFromApsides(
                MERCURY_MEAN_ANOMALY_J2000,
                MERCURY_PERIHELION_DIST,
                MERCURY_APHELION_DIST
            )
        );
        mercury.orbitParent = sun;
        bodies.push(mercury);
        completed++;
        report({ phase: 'planets', label: `Mercury ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Venus
        const venus = new Venus(
            this.dependencies,
            this.scene,
            trueAnomalyFromApsides(
                VENUS_MEAN_ANOMALY_J2000,
                VENUS_PERIHELION_DIST,
                VENUS_APHELION_DIST
            )
        );
        venus.orbitParent = sun;
        bodies.push(venus);
        completed++;
        report({ phase: 'planets', label: `Venus ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Earth (+ Moon) — placed at its J2000 position
        const earthTrueAnomaly = trueAnomalyFromApsides(
            EARTH_MEAN_ANOMALY_J2000,
            EARTH_PERIHELION_DIST,
            EARTH_APHELION_DIST
        );
        const earth = new Earth(this.dependencies, this.scene, earthTrueAnomaly);
        earth.orbitParent = sun;
        bodies.push(earth);
        completed++;
        report({ phase: 'planets', label: `Earth ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Moon — real J2000 orbital elements (eccentric, inclined 5.145° to the ecliptic), placed
        // at its J2000 position in the ellipse.
        bodies.push(createEarthMoonBody(earth, this.scene));
        completed++;
        report({ phase: 'moons', label: `Moon ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Satellite (ISS) — random angle around Earth
        bodies.push(createIssBody(earth, this.scene));
        completed++;
        report({ phase: 'finalizing', label: `ISS ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Mars
        const mars = new Mars(
            this.dependencies,
            this.scene,
            trueAnomalyFromApsides(
                MARS_MEAN_ANOMALY_J2000,
                MARS_PERIHELION_DIST,
                MARS_APHELION_DIST
            )
        );
        mars.orbitParent = sun;
        bodies.push(mars);
        completed++;
        report({ phase: 'planets', label: `Mars ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Ceres (~2.77 AU) — placed at its J2000 position
        const ceres = new Ceres(
            this.dependencies,
            this.scene,
            trueAnomalyFromApsides(
                CERES_MEAN_ANOMALY_J2000,
                CERES_PERIHELION_DIST,
                CERES_APHELION_DIST
            )
        );
        ceres.orbitParent = sun;
        bodies.push(ceres);
        completed++;
        report({ phase: 'planets', label: `Ceres ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // The three largest main-belt asteroids after Ceres, on their real J2000 orbits
        const asteroids: [string, Body][] = [
            ['Vesta', createVestaBody(this.dependencies, this.scene, sun)],
            ['Pallas', createPallasBody(this.dependencies, this.scene, sun)],
            ['Hygiea', createHygieaBody(this.dependencies, this.scene, sun)],
        ];
        for (const [label, asteroid] of asteroids) {
            bodies.push(asteroid);
            completed++;
            report({ phase: 'asteroids', label: `${label} ${completed}/${totalBodies}` });
            await this.yieldToEventLoop();
        }

        // Jupiter (+ 4 Galilean moons)
        const jupiterAngle = trueAnomalyFromApsides(
            JUPITER_MEAN_ANOMALY_J2000,
            JUPITER_PERIHELION_DIST,
            JUPITER_APHELION_DIST
        );
        const jupiter = new Jupiter(this.dependencies, this.scene, jupiterAngle);
        jupiter.orbitParent = sun;
        bodies.push(jupiter);
        completed++;
        report({ phase: 'planets', label: `Jupiter ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // The four Galilean moons sit on their real J2000 orbits around Jupiter
        const galileans: [string, (j: typeof jupiter, s: THREE.Scene) => Body][] = [
            ['Io', createIoBody],
            ['Europa', createEuropaBody],
            ['Ganymede', createGanymedeBody],
            ['Callisto', createCallistoBody],
        ];
        for (const [label, build] of galileans) {
            bodies.push(build(jupiter, this.scene));
            completed++;
            report({ phase: 'moons', label: `${label} ${completed}/${totalBodies}` });
            await this.yieldToEventLoop();
        }

        // Saturn
        const saturn = new Saturn(
            this.dependencies,
            this.scene,
            trueAnomalyFromApsides(
                SATURN_MEAN_ANOMALY_J2000,
                SATURN_PERIHELION_DIST,
                SATURN_APHELION_DIST
            )
        );
        saturn.orbitParent = sun;
        bodies.push(saturn);
        completed++;
        report({ phase: 'planets', label: `Saturn ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        bodies.push(createTitanBody(saturn, this.scene));
        completed++;
        report({ phase: 'moons', label: `Titan ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Uranus
        const uranus = new Uranus(
            this.dependencies,
            this.scene,
            trueAnomalyFromApsides(
                URANUS_MEAN_ANOMALY_J2000,
                URANUS_PERIHELION_DIST,
                URANUS_APHELION_DIST
            )
        );
        uranus.orbitParent = sun;
        bodies.push(uranus);
        completed++;
        report({ phase: 'planets', label: `Uranus ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Neptune
        const neptune = new Neptune(
            this.dependencies,
            this.scene,
            trueAnomalyFromApsides(
                NEPTUNE_MEAN_ANOMALY_J2000,
                NEPTUNE_PERIHELION_DIST,
                NEPTUNE_APHELION_DIST
            )
        );
        neptune.orbitParent = sun;
        bodies.push(neptune);
        completed++;
        report({ phase: 'planets', label: `Neptune ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Pluto
        const pluto = new Pluto(
            this.dependencies,
            this.scene,
            trueAnomalyFromApsides(
                PLUTO_MEAN_ANOMALY_J2000,
                PLUTO_PERIHELION_DIST,
                PLUTO_APHELION_DIST
            )
        );
        pluto.orbitParent = sun;
        bodies.push(pluto);
        completed++;
        report({ phase: 'planets', label: `Pluto ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        bodies.push(createCharonBody(pluto, this.scene));
        completed++;
        report({ phase: 'moons', label: `Charon ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Comet (Halley) — real orbit, placed at its J2000 position
        const halley = new Halley(
            this.dependencies,
            this.scene,
            trueAnomalyFromApsides(
                COMET_MEAN_ANOMALY_J2000,
                COMET_PERIHELION_DIST,
                COMET_APHELION_DIST
            )
        );
        halley.orbitParent = sun;
        bodies.push(halley);
        completed++;
        report({ phase: 'comets', label: `Halley's Comet ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Kuiper belt beyond Neptune
        const kuiperBelt = new KuiperBelt(this.scene);

        // Use default space texture
        const spaceTexture = spaceTextures[0];

        return {
            system: {
                bodies,
                features: [kuiperBelt],
                spaceTexture: spaceTexture,
            },
            options: {},
            scenario: null,
        };
    }
}
