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
import { Asteroid } from '../bodies/asteroid';
import { Vesta } from '../bodies/vesta';
import { AsteroidPocked } from '../bodies/asteroid-pocked';

import { createSatellite } from '../utilities/utilities';
import type { ISolarSystemGenerationResult, IStateDependencies } from '../interfaces';
import {
    callistoOrbitElements,
    charonOrbitElements,
    createMoon,
    earthMoonOrbitElements,
    europaOrbitElements,
    ganymedeOrbitElements,
    ioOrbitElements,
    titanOrbitElements,
} from '../bodies/create-moon';
import { KuiperBelt } from '../features/kuiper-belt';

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
    IO_PERIAPSIS_DIST,
    IO_APOAPSIS_DIST,
    IO_MEAN_ANOMALY_J2000,
    IO_DIST_FROM_JUPITER,
    IO_RADIUS,
    EUROPA_MASS,
    EUROPA_PERIAPSIS_DIST,
    EUROPA_APOAPSIS_DIST,
    EUROPA_MEAN_ANOMALY_J2000,
    EUROPA_DIST_FROM_JUPITER,
    EUROPA_RADIUS,
    GANYMEDE_MASS,
    GANYMEDE_PERIAPSIS_DIST,
    GANYMEDE_APOAPSIS_DIST,
    GANYMEDE_MEAN_ANOMALY_J2000,
    GANYMEDE_DIST_FROM_JUPITER,
    GANYMEDE_RADIUS,
    CALLISTO_MASS,
    CALLISTO_PERIAPSIS_DIST,
    CALLISTO_APOAPSIS_DIST,
    CALLISTO_MEAN_ANOMALY_J2000,
    CALLISTO_DIST_FROM_JUPITER,
    CALLISTO_RADIUS,
    TITAN_MASS,
    TITAN_PERIAPSIS_DIST,
    TITAN_APOAPSIS_DIST,
    TITAN_MEAN_ANOMALY_J2000,
    TITAN_DIST_FROM_SATURN,
    TITAN_RADIUS,
    CHARON_MASS,
    CHARON_PERIAPSIS_DIST,
    CHARON_APOAPSIS_DIST,
    CHARON_MEAN_ANOMALY_J2000,
    CHARON_DIST_FROM_PLUTO,
    CHARON_RADIUS,
    VESTA_MASS,
    VESTA_RADIUS,
    PALLAS_MASS,
    PALLAS_RADIUS,
    HYGIEA_MASS,
    HYGIEA_RADIUS,
    MERCURY_PERIHELION_DIST,
    MERCURY_APHELION_DIST,
    MERCURY_MEAN_ANOMALY_J2000,
    VENUS_PERIHELION_DIST,
    VENUS_APHELION_DIST,
    VENUS_MEAN_ANOMALY_J2000,
    EARTH_PERIHELION_DIST,
    EARTH_APHELION_DIST,
    EARTH_MEAN_ANOMALY_J2000,
    MOON_PERIGEE_DIST,
    MOON_APOGEE_DIST,
    MOON_MEAN_ANOMALY_J2000,
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
    VESTA_PERIHELION_DIST,
    VESTA_APHELION_DIST,
    VESTA_INCLINATION,
    VESTA_LONG_ASC_NODE,
    VESTA_ARG_PERIHELION,
    VESTA_MEAN_ANOMALY_J2000,
    PALLAS_PERIHELION_DIST,
    PALLAS_APHELION_DIST,
    PALLAS_INCLINATION,
    PALLAS_LONG_ASC_NODE,
    PALLAS_ARG_PERIHELION,
    PALLAS_MEAN_ANOMALY_J2000,
    HYGIEA_PERIHELION_DIST,
    HYGIEA_APHELION_DIST,
    HYGIEA_INCLINATION,
    HYGIEA_LONG_ASC_NODE,
    HYGIEA_ARG_PERIHELION,
    HYGIEA_MEAN_ANOMALY_J2000,
    COMET_PERIHELION_DIST,
    COMET_APHELION_DIST,
    COMET_MEAN_ANOMALY_J2000,
} from '../utilities/consts';
import { planetOrbitFromElements, trueAnomalyFromApsides } from '../bodies/planet-orbit';
import { orbitElementsFromApsides } from '../bodies/orbital-elements';
import { MoonTypeEnum } from '../bodies/body-enums';
import {
    AtmosphericGasEnum,
    CoreTypeEnum,
    LifeformBaseEnum,
    LiquidCompositionEnum,
    SoilCompositionEnum,
    VegetationEnum,
} from '../bodies/body-attributes';
import {
    callistoTexture,
    charonTexture,
    europaTexture,
    ganymedeTexture,
    ioTexture,
    moonTexture,
    spaceTextures,
    titanTexture,
} from '../drawing/textures';
import type {
    ProceduralGenerationReporter,
    ProceduralGenerationWorkUnit,
} from './procedural-generation-progress';

export class NormalSolarSystemGenerator extends SolarSystemGenerator {
    /**
     * State vectors and reference elements for a small body on its real orbit, placed at the
     * true anomaly that its J2000 mean anomaly corresponds to.
     */
    private j2000Orbit(
        perihelion: number,
        aphelion: number,
        inclinationDeg: number,
        longitudeAscendingNodeDeg: number,
        argumentOfPeriapsisDeg: number,
        meanAnomalyDeg: number
    ) {
        const elements = orbitElementsFromApsides(
            perihelion,
            aphelion,
            inclinationDeg,
            longitudeAscendingNodeDeg,
            argumentOfPeriapsisDeg
        );
        const trueAnomaly = trueAnomalyFromApsides(meanAnomalyDeg, perihelion, aphelion);
        const { pos, vel } = planetOrbitFromElements(
            elements,
            trueAnomaly,
            this.dependencies.getG() * SUN_MASS
        );
        return { elements, pos, vel };
    }

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

        // Helper to generate a random orbital angle
        const randomAngle = () => Math.random() * Math.PI * 2;

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
                angle: trueAnomalyFromApsides(
                    MOON_MEAN_ANOMALY_J2000,
                    MOON_PERIGEE_DIST,
                    MOON_APOGEE_DIST
                ),
                orbitElements: earthMoonOrbitElements(),
                attributes: {
                    surfacePressure: { discovered: true },
                    coreType: { value: CoreTypeEnum.Solid, discovered: true },
                    atmosphericComposition: { value: AtmosphericGasEnum.None, discovered: true },
                    soilComposition: {
                        value:
                            SoilCompositionEnum.Silicates |
                            SoilCompositionEnum.Iron |
                            SoilCompositionEnum.Regolith,
                        discovered: true,
                    },
                    liquidComposition: { value: LiquidCompositionEnum.None, discovered: true },
                    averageTemperatureKelvin: { value: 220, discovered: true },
                    vegetation: { value: VegetationEnum.None, discovered: true },
                    sentientLife: { value: false, discovered: true },
                    lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                    orbitalPeriod: { discovered: true },
                    rotationPeriod: { discovered: true },
                },
            })
        );
        completed++;
        report({ phase: 'moons', label: `Moon ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

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

        // Vesta (~2.36 AU)
        const vestaOrbit = this.j2000Orbit(
            VESTA_PERIHELION_DIST,
            VESTA_APHELION_DIST,
            VESTA_INCLINATION,
            VESTA_LONG_ASC_NODE,
            VESTA_ARG_PERIHELION,
            VESTA_MEAN_ANOMALY_J2000
        );
        const vesta = new Vesta(this.dependencies, this.scene, {
            radius: VESTA_RADIUS,
            pos: vestaOrbit.pos,
            vel: vestaOrbit.vel,
            referenceOrbitElements: vestaOrbit.elements,
            mass: VESTA_MASS,
            id: 'vesta',
            name: 'Vesta',
            trailColor: 0xc9b89a,
            maxTrail: 1500,
            orbitParent: sun,
            attributes: {
                coreType: { value: CoreTypeEnum.Metallic, discovered: true },
                atmosphericComposition: { value: AtmosphericGasEnum.None, discovered: true },
                soilComposition: {
                    value:
                        SoilCompositionEnum.Basalt |
                        SoilCompositionEnum.Silicates |
                        SoilCompositionEnum.Iron,
                    discovered: true,
                },
                liquidComposition: { value: LiquidCompositionEnum.None, discovered: true },
                averageTemperatureKelvin: { value: 180, discovered: true },
                vegetation: { value: VegetationEnum.None, discovered: true },
                sentientLife: { value: false, discovered: true },
                lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                orbitalPeriod: { discovered: true },
                rotationPeriod: { discovered: true },
            },
        });
        bodies.push(vesta);
        completed++;
        report({ phase: 'asteroids', label: `Vesta ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Pallas (~2.77 AU)
        const pallasOrbit = this.j2000Orbit(
            PALLAS_PERIHELION_DIST,
            PALLAS_APHELION_DIST,
            PALLAS_INCLINATION,
            PALLAS_LONG_ASC_NODE,
            PALLAS_ARG_PERIHELION,
            PALLAS_MEAN_ANOMALY_J2000
        );
        const pallas = new Asteroid(this.dependencies, this.scene, {
            radius: PALLAS_RADIUS,
            pos: pallasOrbit.pos,
            vel: pallasOrbit.vel,
            referenceOrbitElements: pallasOrbit.elements,
            mass: PALLAS_MASS,
            id: 'pallas',
            name: 'Pallas',
            trailColor: 0x999999,
            maxTrail: 1500,
            orbitParent: sun,
            attributes: {
                coreType: { value: CoreTypeEnum.RubblePile, discovered: true },
                atmosphericComposition: { value: AtmosphericGasEnum.None, discovered: true },
                soilComposition: {
                    value:
                        SoilCompositionEnum.Carbon |
                        SoilCompositionEnum.Silicates |
                        SoilCompositionEnum.WaterIce,
                    discovered: true,
                },
                liquidComposition: { value: LiquidCompositionEnum.None, discovered: true },
                averageTemperatureKelvin: { value: 164, discovered: true },
                vegetation: { value: VegetationEnum.None, discovered: true },
                sentientLife: { value: false, discovered: true },
                lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                orbitalPeriod: { discovered: true },
                rotationPeriod: { discovered: true },
            },
        });
        bodies.push(pallas);
        completed++;
        report({ phase: 'asteroids', label: `Pallas ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        // Hygiea (~3.14 AU)
        const hygieaOrbit = this.j2000Orbit(
            HYGIEA_PERIHELION_DIST,
            HYGIEA_APHELION_DIST,
            HYGIEA_INCLINATION,
            HYGIEA_LONG_ASC_NODE,
            HYGIEA_ARG_PERIHELION,
            HYGIEA_MEAN_ANOMALY_J2000
        );
        const hygiea = new AsteroidPocked(this.dependencies, this.scene, {
            radius: HYGIEA_RADIUS,
            pos: hygieaOrbit.pos,
            vel: hygieaOrbit.vel,
            referenceOrbitElements: hygieaOrbit.elements,
            mass: HYGIEA_MASS,
            id: 'hygiea',
            name: 'Hygiea',
            trailColor: 0x888888,
            maxTrail: 1500,
            orbitParent: sun,
            attributes: {
                coreType: { value: CoreTypeEnum.RubblePile, discovered: true },
                atmosphericComposition: { value: AtmosphericGasEnum.None, discovered: true },
                soilComposition: {
                    value:
                        SoilCompositionEnum.Carbon |
                        SoilCompositionEnum.Iron |
                        SoilCompositionEnum.IronOxide |
                        SoilCompositionEnum.WaterIce,
                    discovered: true,
                },
                liquidComposition: { value: LiquidCompositionEnum.None, discovered: true },
                averageTemperatureKelvin: { value: 164, discovered: true },
                vegetation: { value: VegetationEnum.None, discovered: true },
                sentientLife: { value: false, discovered: true },
                lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                orbitalPeriod: { discovered: true },
                rotationPeriod: { discovered: true },
            },
        });
        bodies.push(hygiea);
        completed++;
        report({ phase: 'asteroids', label: `Hygiea ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

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
        bodies.push(
            createMoon(jupiter, this.scene, {
                angle: trueAnomalyFromApsides(
                    IO_MEAN_ANOMALY_J2000,
                    IO_PERIAPSIS_DIST,
                    IO_APOAPSIS_DIST
                ),
                orbitElements: ioOrbitElements(),
                distance: IO_DIST_FROM_JUPITER,
                radius: IO_RADIUS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden
                mass: IO_MASS,
                id: 'camIo',
                name: 'Io',
                trailColor: 0xffdd77,
                maxTrail: 800,
                moonType: MoonTypeEnum.Terrestrial,
                texture: ioTexture,
                attributes: {
                    surfacePressure: { discovered: true },
                    coreType: { value: CoreTypeEnum.Molten, discovered: true },
                    atmosphericComposition: { value: AtmosphericGasEnum.None, discovered: true },
                    soilComposition: {
                        value:
                            SoilCompositionEnum.Sulfur |
                            SoilCompositionEnum.Silicates |
                            SoilCompositionEnum.Basalt,
                        discovered: true,
                    },
                    liquidComposition: {
                        value: LiquidCompositionEnum.LiquidSulfur,
                        discovered: true,
                    },
                    averageTemperatureKelvin: { value: 130, discovered: true },
                    vegetation: { value: VegetationEnum.None, discovered: true },
                    sentientLife: { value: false, discovered: true },
                    lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                    orbitalPeriod: { discovered: true },
                    rotationPeriod: { discovered: true },
                },
            })
        );
        completed++;
        report({ phase: 'moons', label: `Io ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        bodies.push(
            createMoon(jupiter, this.scene, {
                angle: trueAnomalyFromApsides(
                    EUROPA_MEAN_ANOMALY_J2000,
                    EUROPA_PERIAPSIS_DIST,
                    EUROPA_APOAPSIS_DIST
                ),
                orbitElements: europaOrbitElements(),
                distance: EUROPA_DIST_FROM_JUPITER,
                radius: EUROPA_RADIUS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                mass: EUROPA_MASS,
                id: 'camEuropa',
                name: 'Europa',
                trailColor: 0xccddee,
                maxTrail: 1000,
                moonType: MoonTypeEnum.Terrestrial,
                texture: europaTexture,
                attributes: {
                    surfacePressure: { discovered: true },
                    coreType: { value: CoreTypeEnum.Metallic, discovered: true },
                    atmosphericComposition: { value: AtmosphericGasEnum.None, discovered: true },
                    soilComposition: {
                        value: SoilCompositionEnum.WaterIce | SoilCompositionEnum.Silicates,
                        discovered: true,
                    },
                    liquidComposition: { value: LiquidCompositionEnum.Water, discovered: true },
                    averageTemperatureKelvin: { value: 102, discovered: true },
                    vegetation: { value: VegetationEnum.None, discovered: true },
                    sentientLife: { value: false, discovered: true },
                    lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                    orbitalPeriod: { discovered: true },
                    rotationPeriod: { discovered: true },
                },
            })
        );
        completed++;
        report({ phase: 'moons', label: `Europa ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        bodies.push(
            createMoon(jupiter, this.scene, {
                angle: trueAnomalyFromApsides(
                    GANYMEDE_MEAN_ANOMALY_J2000,
                    GANYMEDE_PERIAPSIS_DIST,
                    GANYMEDE_APOAPSIS_DIST
                ),
                orbitElements: ganymedeOrbitElements(),
                distance: GANYMEDE_DIST_FROM_JUPITER,
                radius: GANYMEDE_RADIUS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                mass: GANYMEDE_MASS,
                id: 'camGanymede',
                name: 'Ganymede',
                trailColor: 0xcccccc,
                maxTrail: 1200,
                moonType: MoonTypeEnum.Terrestrial,
                texture: ganymedeTexture,
                attributes: {
                    surfacePressure: { discovered: true },
                    coreType: { value: CoreTypeEnum.Metallic, discovered: true },
                    atmosphericComposition: { value: AtmosphericGasEnum.None, discovered: true },
                    soilComposition: {
                        value: SoilCompositionEnum.WaterIce | SoilCompositionEnum.Silicates,
                        discovered: true,
                    },
                    liquidComposition: {
                        value: LiquidCompositionEnum.Water | LiquidCompositionEnum.Brine,
                        discovered: true,
                    },
                    averageTemperatureKelvin: { value: 110, discovered: true },
                    vegetation: { value: VegetationEnum.None, discovered: true },
                    sentientLife: { value: false, discovered: true },
                    lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                    orbitalPeriod: { discovered: true },
                    rotationPeriod: { discovered: true },
                },
            })
        );
        completed++;
        report({ phase: 'moons', label: `Ganymede ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

        bodies.push(
            createMoon(jupiter, this.scene, {
                angle: trueAnomalyFromApsides(
                    CALLISTO_MEAN_ANOMALY_J2000,
                    CALLISTO_PERIAPSIS_DIST,
                    CALLISTO_APOAPSIS_DIST
                ),
                orbitElements: callistoOrbitElements(),
                distance: CALLISTO_DIST_FROM_JUPITER,
                radius: CALLISTO_RADIUS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                mass: CALLISTO_MASS,
                id: 'camCallisto',
                name: 'Callisto',
                trailColor: 0xaa9988,
                maxTrail: 1500,
                moonType: MoonTypeEnum.Terrestrial,
                texture: callistoTexture,
                attributes: {
                    surfacePressure: { discovered: true },
                    coreType: { value: CoreTypeEnum.Icy, discovered: true },
                    atmosphericComposition: { value: AtmosphericGasEnum.None, discovered: true },
                    soilComposition: {
                        value:
                            SoilCompositionEnum.WaterIce |
                            SoilCompositionEnum.Silicates |
                            SoilCompositionEnum.Carbon,
                        discovered: true,
                    },
                    liquidComposition: { value: LiquidCompositionEnum.Water, discovered: true },
                    averageTemperatureKelvin: { value: 134, discovered: true },
                    vegetation: { value: VegetationEnum.None, discovered: true },
                    sentientLife: { value: false, discovered: true },
                    lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                    orbitalPeriod: { discovered: true },
                    rotationPeriod: { discovered: true },
                },
            })
        );
        completed++;
        report({ phase: 'moons', label: `Callisto ${completed}/${totalBodies}` });
        await this.yieldToEventLoop();

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

        bodies.push(
            createMoon(saturn, this.scene, {
                angle: trueAnomalyFromApsides(
                    TITAN_MEAN_ANOMALY_J2000,
                    TITAN_PERIAPSIS_DIST,
                    TITAN_APOAPSIS_DIST
                ),
                orbitElements: titanOrbitElements(),
                distance: TITAN_DIST_FROM_SATURN,
                radius: TITAN_RADIUS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                mass: TITAN_MASS,
                id: 'camTitan',
                name: 'Titan',
                trailColor: 0xd9902f,
                maxTrail: 1500,
                moonType: MoonTypeEnum.Terrestrial,
                texture: titanTexture,
                // Thick nitrogen/methane haze: ~1.47 bar at the surface, hazy orange layers
                // extending a few hundred km up.
                atmosphere: { radius: TITAN_RADIUS * 1.2, tint: 0xd9902f, density: 1.47 },
                attributes: {
                    surfacePressure: { discovered: true },
                    coreType: { value: CoreTypeEnum.Icy, discovered: true },
                    atmosphericComposition: {
                        value: AtmosphericGasEnum.Nitrogen | AtmosphericGasEnum.Methane,
                        discovered: true,
                    },
                    soilComposition: {
                        value: SoilCompositionEnum.WaterIce | SoilCompositionEnum.Carbon,
                        discovered: true,
                    },
                    liquidComposition: {
                        value:
                            LiquidCompositionEnum.LiquidMethane |
                            LiquidCompositionEnum.LiquidEthane,
                        discovered: true,
                    },
                    averageTemperatureKelvin: { value: 94, discovered: true },
                    vegetation: { value: VegetationEnum.None, discovered: true },
                    sentientLife: { value: false, discovered: true },
                    lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                    orbitalPeriod: { discovered: true },
                    rotationPeriod: { discovered: true },
                },
            })
        );
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

        bodies.push(
            createMoon(pluto, this.scene, {
                angle: trueAnomalyFromApsides(
                    CHARON_MEAN_ANOMALY_J2000,
                    CHARON_PERIAPSIS_DIST,
                    CHARON_APOAPSIS_DIST
                ),
                orbitElements: charonOrbitElements(),
                distance: CHARON_DIST_FROM_PLUTO,
                radius: CHARON_RADIUS,
                pos: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                vel: new THREE.Vector3(0, 0, 0), // Will be overridden in createMoon
                mass: CHARON_MASS,
                id: 'camCharon',
                name: 'Charon',
                trailColor: 0x9a918a,
                maxTrail: 1000,
                moonType: MoonTypeEnum.Terrestrial,
                texture: charonTexture,
                attributes: {
                    surfacePressure: { discovered: true },
                    coreType: { value: CoreTypeEnum.Icy, discovered: true },
                    atmosphericComposition: { value: AtmosphericGasEnum.None, discovered: true },
                    soilComposition: {
                        value: SoilCompositionEnum.WaterIce | SoilCompositionEnum.Carbon,
                        discovered: true,
                    },
                    liquidComposition: { value: LiquidCompositionEnum.None, discovered: true },
                    averageTemperatureKelvin: { value: 53, discovered: true },
                    vegetation: { value: VegetationEnum.None, discovered: true },
                    sentientLife: { value: false, discovered: true },
                    lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                    orbitalPeriod: { discovered: true },
                    rotationPeriod: { discovered: true },
                },
            })
        );
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
