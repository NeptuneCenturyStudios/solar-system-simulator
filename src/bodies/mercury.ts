import * as THREE from 'three';
import {
    MERCURY_AXIS,
    MERCURY_AZIMUTH,
    MERCURY_DIST,
    MERCURY_MAG_AZIMUTH,
    MERCURY_MAG_OFFSET,
    MERCURY_MAG_REVERSED,
    MERCURY_MAG_STRENGTH,
    MERCURY_MAG_TILT,
    MERCURY_MASS,
    MERCURY_ORBITAL_PERIOD_REAL,
    MERCURY_RADIUS,
    MERCURY_PERIHELION_DIST,
    MERCURY_APHELION_DIST,
    MERCURY_INCLINATION,
    MERCURY_LONG_ASC_NODE,
    MERCURY_ARG_PERIHELION,
    SUN_MASS,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { buildBodySphereGeometry, createUniqueId } from '../utilities/utilities.js';
import { getBodyTexture } from '../drawing/texture-registry.js';
import { planetOrbitFromElements } from './planet-orbit.js';
import { orbitElementsFromApsides } from './orbital-elements.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet.js';
import { PlanetTypeEnum } from './body-enums.js';
import {
    AtmosphericGasEnum,
    CoreTypeEnum,
    LifeformBaseEnum,
    LiquidCompositionEnum,
    SoilCompositionEnum,
    VegetationEnum,
} from './body-attributes.js';

/**
 * Represents the planet Mercury in the simulation, including its texture and orbital properties.
 * Sets up Mercury's trajectory, material, and physical parameters.
 */
export class Mercury extends Planet {
    /**
     * Constructs a new Mercury object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Mercury belongs.
     * @param trueAnomaly Position along the orbit in radians, measured from perihelion
     *                    (0 = perihelion, π = aphelion).
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, trueAnomaly: number = 0) {
        const gEff = dependencies.getG();
        // Kepler's third law relates the period to the *semi-major axis*, not to the instantaneous
        // distance, so the time scale is keyed to MERCURY_DIST (the semi-major axis) even though
        // the body itself swings between perihelion and aphelion.
        const timeScale =
            MERCURY_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(MERCURY_DIST, gEff, SUN_MASS);
        const rotSpeed = ((2 * Math.PI) / (1407.6 * 3600)) * timeScale;

        // Mercury has the most eccentric orbit of the eight planets (e ≈ 0.206) and rides 7° out of
        // the ecliptic, so both departures from a flat circle are real and worth modelling: the
        // Sun distance swings by 52% over the 88-day year.
        const orbitElements = orbitElementsFromApsides(
            MERCURY_PERIHELION_DIST,
            MERCURY_APHELION_DIST,
            MERCURY_INCLINATION,
            MERCURY_LONG_ASC_NODE,
            MERCURY_ARG_PERIHELION
        );
        const trajectory = planetOrbitFromElements(orbitElements, trueAnomaly, gEff * SUN_MASS);

        const texture = getBodyTexture('mercury.jpg');
        const geometry = buildBodySphereGeometry(MERCURY_RADIUS);
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });
        const mesh = new THREE.Mesh(geometry, material);

        super(dependencies, scene, {
            id: createUniqueId('mercury'),
            name: 'Mercury',
            mass: MERCURY_MASS,
            radius: MERCURY_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            referenceOrbitElements: orbitElements,
            rotation: {
                tilt: MERCURY_AXIS,
                speed: rotSpeed,
                azimuth: MERCURY_AZIMUTH,
            },
            trailColor: 0xaaaaaa,
            maxTrail: 2000,
            bodySubtype: PlanetTypeEnum.Terrestrial,
            mesh: mesh,
            magneticField: {
                strength: MERCURY_MAG_STRENGTH,
                tilt: MERCURY_MAG_TILT,
                azimuth: MERCURY_MAG_AZIMUTH,
                offset: MERCURY_MAG_OFFSET,
                reversed: MERCURY_MAG_REVERSED,
            },
            attributes: {
                surfacePressure: { discovered: true },
                coreType: { value: CoreTypeEnum.Metallic, discovered: true },
                atmosphericComposition: { value: AtmosphericGasEnum.None, discovered: true },
                soilComposition: {
                    value:
                        SoilCompositionEnum.Silicates |
                        SoilCompositionEnum.Iron |
                        SoilCompositionEnum.Regolith,
                    discovered: true,
                },
                liquidComposition: { value: LiquidCompositionEnum.None, discovered: true },
                averageTemperatureKelvin: { value: 440, discovered: true },
                vegetation: { value: VegetationEnum.None, discovered: true },
                sentientLife: { value: false, discovered: true },
                lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                orbitalPeriod: { discovered: true },
                rotationPeriod: { discovered: true },
            },
        });
    }
}
