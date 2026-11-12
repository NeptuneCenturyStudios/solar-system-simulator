import * as THREE from 'three';

import type { CelestialBody } from '../bodies/celestial-body';
import type { Moon } from '../bodies/moon';
import { Asteroid } from '../bodies/asteroid';
import { AsteroidPocked } from '../bodies/asteroid-pocked';
import { Vesta } from '../bodies/vesta';
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
    callistoOrbitElements,
    charonOrbitElements,
    createMoon,
    earthMoonOrbitElements,
    europaOrbitElements,
    ganymedeOrbitElements,
    ioOrbitElements,
    titanOrbitElements,
} from '../bodies/create-moon';
import { planetOrbitFromElements, trueAnomalyFromApsides } from '../bodies/planet-orbit';
import { orbitElementsFromApsides } from '../bodies/orbital-elements';
import {
    callistoTexture,
    charonTexture,
    europaTexture,
    ganymedeTexture,
    ioTexture,
    moonTexture,
    titanTexture,
} from '../drawing/textures';
import { createSatellite } from '../utilities/utilities';
import type { IStateDependencies } from '../interfaces';
import {
    SUN_MASS,
    MOON_MASS,
    MOON_DIST_FROM_EARTH,
    MOON_RADIUS,
    MOON_PERIGEE_DIST,
    MOON_APOGEE_DIST,
    MOON_MEAN_ANOMALY_J2000,
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
    VESTA_DISTANCE,
    VESTA_AXIS,
    VESTA_AZIMUTH,
    VESTA_ORBITAL_PERIOD_REAL,
    VESTA_PERIHELION_DIST,
    VESTA_APHELION_DIST,
    VESTA_INCLINATION,
    VESTA_LONG_ASC_NODE,
    VESTA_ARG_PERIHELION,
    VESTA_MEAN_ANOMALY_J2000,
    PALLAS_MASS,
    PALLAS_RADIUS,
    PALLAS_DISTANCE,
    PALLAS_AXIS,
    PALLAS_AZIMUTH,
    PALLAS_ORBITAL_PERIOD_REAL,
    PALLAS_PERIHELION_DIST,
    PALLAS_APHELION_DIST,
    PALLAS_INCLINATION,
    PALLAS_LONG_ASC_NODE,
    PALLAS_ARG_PERIHELION,
    PALLAS_MEAN_ANOMALY_J2000,
    HYGIEA_MASS,
    HYGIEA_RADIUS,
    HYGIEA_DISTANCE,
    HYGIEA_AXIS,
    HYGIEA_AZIMUTH,
    HYGIEA_ORBITAL_PERIOD_REAL,
    HYGIEA_PERIHELION_DIST,
    HYGIEA_APHELION_DIST,
    HYGIEA_INCLINATION,
    HYGIEA_LONG_ASC_NODE,
    HYGIEA_ARG_PERIHELION,
    HYGIEA_MEAN_ANOMALY_J2000,
} from '../utilities/consts';
import { scaledSpinSpeed } from './orbital-math';

/**
 * Builders for the real solar-system bodies that have no class of their own (the minor
 * asteroids, the named moons, and the ISS). Shared by the default solar-system generator and
 * the Add Object panel's presets, so a preset is exactly the body the default system creates.
 *
 * Each builder takes the body `id` so the generator can keep its fixed ids while presets pass a
 * unique one (a preset can be added while the original still exists).
 */

/**
 * State vectors and reference elements for a small body on its real heliocentric orbit, placed
 * at the true anomaly that its J2000 mean anomaly corresponds to.
 */
function j2000HeliocentricOrbit(
    dependencies: IStateDependencies,
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
        dependencies.getG() * SUN_MASS
    );
    return { elements, pos, vel };
}



/** Vesta (~2.36 AU) on its real J2000 orbit. */
export function createVestaBody(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    sun: CelestialBody | null,
    id = 'vesta'
): Vesta {
    const orbit = j2000HeliocentricOrbit(
        dependencies,
        VESTA_PERIHELION_DIST,
        VESTA_APHELION_DIST,
        VESTA_INCLINATION,
        VESTA_LONG_ASC_NODE,
        VESTA_ARG_PERIHELION,
        VESTA_MEAN_ANOMALY_J2000
    );
    // Vesta spins in 5.3421276322 h about its IAU/Dawn pole (ecliptic longitude 330.8 deg,
    // latitude 57.7 deg), an obliquity of 27.5 deg.
    const rotSpeed = scaledSpinSpeed(
        dependencies,
        5.3421276322,
        VESTA_ORBITAL_PERIOD_REAL,
        VESTA_DISTANCE
    );

    return new Vesta(dependencies, scene, {
        radius: VESTA_RADIUS,
        pos: orbit.pos,
        vel: orbit.vel,
        referenceOrbitElements: orbit.elements,
        mass: VESTA_MASS,
        id,
        name: 'Vesta',
        trailColor: 0xc9b89a,
        maxTrail: 1500,
        orbitParent: sun,
        rotation: { tilt: VESTA_AXIS, speed: rotSpeed, azimuth: VESTA_AZIMUTH },
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
}

/** Pallas (~2.77 AU) on its real J2000 orbit. */
export function createPallasBody(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    sun: CelestialBody | null,
    id = 'pallas'
): Asteroid {
    const orbit = j2000HeliocentricOrbit(
        dependencies,
        PALLAS_PERIHELION_DIST,
        PALLAS_APHELION_DIST,
        PALLAS_INCLINATION,
        PALLAS_LONG_ASC_NODE,
        PALLAS_ARG_PERIHELION,
        PALLAS_MEAN_ANOMALY_J2000
    );
    // Pallas spins in 7.8132214 h about its published pole (ecliptic longitude 30 deg,
    // latitude -16 deg).
    const rotSpeed = scaledSpinSpeed(
        dependencies,
        7.8132214,
        PALLAS_ORBITAL_PERIOD_REAL,
        PALLAS_DISTANCE
    );

    return new Asteroid(dependencies, scene, {
        radius: PALLAS_RADIUS,
        pos: orbit.pos,
        vel: orbit.vel,
        referenceOrbitElements: orbit.elements,
        mass: PALLAS_MASS,
        id,
        name: 'Pallas',
        trailColor: 0x999999,
        maxTrail: 1500,
        orbitParent: sun,
        rotation: { tilt: PALLAS_AXIS, speed: rotSpeed, azimuth: PALLAS_AZIMUTH },
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
}

/** Hygiea (~3.14 AU) on its real J2000 orbit. */
export function createHygieaBody(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    sun: CelestialBody | null,
    id = 'hygiea'
): AsteroidPocked {
    const orbit = j2000HeliocentricOrbit(
        dependencies,
        HYGIEA_PERIHELION_DIST,
        HYGIEA_APHELION_DIST,
        HYGIEA_INCLINATION,
        HYGIEA_LONG_ASC_NODE,
        HYGIEA_ARG_PERIHELION,
        HYGIEA_MEAN_ANOMALY_J2000
    );
    // Hygiea spins in 13.828 h (Vernazza et al. 2019 measure 13.82559 h) about a pole 29 deg
    // south of the ecliptic, so its spin is retrograde with respect to its orbit - published
    // as an obliquity of ~120 deg. The rate stays positive: the body spins right-handed about
    // the pole given, and that pole merely points below the ecliptic plane.
    const rotSpeed = scaledSpinSpeed(
        dependencies,
        13.828,
        HYGIEA_ORBITAL_PERIOD_REAL,
        HYGIEA_DISTANCE
    );

    return new AsteroidPocked(dependencies, scene, {
        radius: HYGIEA_RADIUS,
        pos: orbit.pos,
        vel: orbit.vel,
        referenceOrbitElements: orbit.elements,
        mass: HYGIEA_MASS,
        id,
        name: 'Hygiea',
        trailColor: 0x888888,
        maxTrail: 1500,
        orbitParent: sun,
        rotation: { tilt: HYGIEA_AXIS, speed: rotSpeed, azimuth: HYGIEA_AZIMUTH },
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
}

/** Earth's Moon on its real J2000 orbit (eccentric, inclined 5.145° to the ecliptic). */
export function createEarthMoonBody(earth: CelestialBody, scene: THREE.Scene, id = 'moon'): Moon {
    return createMoon(earth, scene, {
        distance: MOON_DIST_FROM_EARTH,
        radius: MOON_RADIUS,
        pos: new THREE.Vector3(0, 0, 0), // Will be overridden
        vel: new THREE.Vector3(0, 0, 0), // Will be overridden
        mass: MOON_MASS,
        id,
        name: 'Moon',
        trailColor: 0xffffff,
        maxTrail: 1500,
        texture: moonTexture,
        moonType: MoonTypeEnum.Terrestrial,
        angle: trueAnomalyFromApsides(MOON_MEAN_ANOMALY_J2000, MOON_PERIGEE_DIST, MOON_APOGEE_DIST),
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
    });
}

/** The ISS in a circular orbit in Earth's equatorial frame, at a random phase. */
export function createIssBody(earth: CelestialBody, scene: THREE.Scene, id = 'iss') {
    return createSatellite(scene, earth, {
        distance: ISS_DIST_FROM_EARTH,
        radius: ISS_RADIUS,
        mass: ISS_MASS,
        pos: new THREE.Vector3(0, 0, 0), // Will be overridden in createSatellite
        vel: new THREE.Vector3(0, 0, 0), // Will be overridden in createSatellite
        id,
        name: 'ISS',
        trailColor: 0xffffff,
        maxTrail: 1500,
        inclinationDeg: ISS_INCLINATION,
        angle: Math.random() * Math.PI * 2,
    });
}

/** Io on its real J2000 orbit around Jupiter. */
export function createIoBody(jupiter: CelestialBody, scene: THREE.Scene, id = 'camIo'): Moon {
    return createMoon(jupiter, scene, {
        angle: trueAnomalyFromApsides(IO_MEAN_ANOMALY_J2000, IO_PERIAPSIS_DIST, IO_APOAPSIS_DIST),
        orbitElements: ioOrbitElements(),
        distance: IO_DIST_FROM_JUPITER,
        radius: IO_RADIUS,
        pos: new THREE.Vector3(0, 0, 0), // Will be overridden
        vel: new THREE.Vector3(0, 0, 0), // Will be overridden
        mass: IO_MASS,
        id,
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
    });
}

/** Europa on its real J2000 orbit around Jupiter. */
export function createEuropaBody(
    jupiter: CelestialBody,
    scene: THREE.Scene,
    id = 'camEuropa'
): Moon {
    return createMoon(jupiter, scene, {
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
        id,
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
    });
}

/** Ganymede on its real J2000 orbit around Jupiter. */
export function createGanymedeBody(
    jupiter: CelestialBody,
    scene: THREE.Scene,
    id = 'camGanymede'
): Moon {
    return createMoon(jupiter, scene, {
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
        id,
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
    });
}

/** Callisto on its real J2000 orbit around Jupiter. */
export function createCallistoBody(
    jupiter: CelestialBody,
    scene: THREE.Scene,
    id = 'camCallisto'
): Moon {
    return createMoon(jupiter, scene, {
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
        id,
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
    });
}

/** Titan on its real J2000 orbit around Saturn, with its thick nitrogen/methane haze. */
export function createTitanBody(saturn: CelestialBody, scene: THREE.Scene, id = 'camTitan'): Moon {
    return createMoon(saturn, scene, {
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
        id,
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
                value: LiquidCompositionEnum.LiquidMethane | LiquidCompositionEnum.LiquidEthane,
                discovered: true,
            },
            averageTemperatureKelvin: { value: 94, discovered: true },
            vegetation: { value: VegetationEnum.None, discovered: true },
            sentientLife: { value: false, discovered: true },
            lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
            orbitalPeriod: { discovered: true },
            rotationPeriod: { discovered: true },
        },
    });
}

/** Charon on its real J2000 orbit around Pluto. */
export function createCharonBody(pluto: CelestialBody, scene: THREE.Scene, id = 'camCharon'): Moon {
    return createMoon(pluto, scene, {
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
        id,
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
    });
}
