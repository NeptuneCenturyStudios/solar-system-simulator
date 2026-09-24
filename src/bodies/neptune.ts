import * as THREE from 'three';
import { buildBodySphereGeometry, createUniqueId } from '../utilities/utilities.js';
import {
    NEPTUNE_DIST,
    NEPTUNE_MASS,
    SUN_MASS,
    NEPTUNE_RADIUS,
    NEPTUNE_AXIS,
    NEPTUNE_AZIMUTH,
    NEPTUNE_MAG_AZIMUTH,
    NEPTUNE_MAG_OFFSET,
    NEPTUNE_MAG_REVERSED,
    NEPTUNE_MAG_STRENGTH,
    NEPTUNE_MAG_TILT,
    NEPTUNE_ORBITAL_PERIOD_REAL,
    NEPTUNE_PERIHELION_DIST,
    NEPTUNE_APHELION_DIST,
    NEPTUNE_INCLINATION,
    NEPTUNE_LONG_ASC_NODE,
    NEPTUNE_ARG_PERIHELION,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { stateVectorsFromElements } from '../procedural/orbital-math.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet';
import { PlanetTypeEnum } from './body-enums.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import {
    AtmosphericGasEnum,
    CoreTypeEnum,
    LifeformBaseEnum,
    VegetationEnum,
} from './body-attributes.js';

/**
 * Represents the planet Neptune in the simulation, including its texture and orbital properties.
 * Sets up Neptune's trajectory, material, and physical parameters.
 */
export class Neptune extends Planet {
    /**
     * Constructs a new Neptune object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Neptune belongs.
     * @param trueAnomaly Position along the orbit in radians, measured from perihelion
     *                    (0 = perihelion, π = aphelion).
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        trueAnomaly: number = Math.PI
    ) {
        const gEff = dependencies.getG();
        const timeScale =
            NEPTUNE_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(NEPTUNE_DIST, gEff, SUN_MASS);
        const rotSpeed = ((2 * Math.PI) / (16.11 * 3600)) * timeScale;

        // Neptune's real orbit is very nearly circular (e ≈ 0.0087) and only 1.77° out of the
        // ecliptic, but both departures are real, so the orbit is built from its orbital
        // elements rather than the flat circle the inner planets still use.
        const semiMajorAxis = (NEPTUNE_PERIHELION_DIST + NEPTUNE_APHELION_DIST) / 2;
        const ecc =
            (NEPTUNE_APHELION_DIST - NEPTUNE_PERIHELION_DIST) /
            (NEPTUNE_APHELION_DIST + NEPTUNE_PERIHELION_DIST); // ≈ 0.008647
        const trajectory = stateVectorsFromElements({
            semiMajorAxis,
            eccentricity: ecc,
            inclinationRad: THREE.MathUtils.degToRad(NEPTUNE_INCLINATION),
            longitudeAscendingNodeRad: THREE.MathUtils.degToRad(NEPTUNE_LONG_ASC_NODE),
            argumentOfPeriapsisRad: THREE.MathUtils.degToRad(NEPTUNE_ARG_PERIHELION),
            trueAnomalyRad: trueAnomaly,
            mu: gEff * SUN_MASS,
        });

        const texture = loadSrgbTexture('./assets/textures/bodies/2k/neptune.jpg');
        const geometry = buildBodySphereGeometry(NEPTUNE_RADIUS);
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
            id: createUniqueId('neptune'),
            name: 'Neptune',
            mass: NEPTUNE_MASS,
            radius: NEPTUNE_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            bodySubtype: PlanetTypeEnum.IceGiant,
            trailColor: 0x6688ff,
            maxTrail: 18000,
            hasRings: false,
            rotation: { tilt: NEPTUNE_AXIS, speed: rotSpeed, azimuth: NEPTUNE_AZIMUTH },
            mesh: mesh,
            atmosphere: {
                radius: NEPTUNE_RADIUS * 1.07,
                tint: 0x4488ff,
                // Surface pressure in bar (cloud tops).
                density: 0.1,
            },
            magneticField: {
                strength: NEPTUNE_MAG_STRENGTH,
                tilt: NEPTUNE_MAG_TILT,
                azimuth: NEPTUNE_MAG_AZIMUTH,
                offset: NEPTUNE_MAG_OFFSET,
                reversed: NEPTUNE_MAG_REVERSED,
            },
            attributes: {
                surfacePressure: { discovered: true },
                coreType: { value: CoreTypeEnum.GasFluid, discovered: true },
                atmosphericComposition: {
                    value:
                        AtmosphericGasEnum.Hydrogen |
                        AtmosphericGasEnum.Helium |
                        AtmosphericGasEnum.Methane,
                    discovered: true,
                },
                averageTemperatureKelvin: { value: 72, discovered: true },
                vegetation: { value: VegetationEnum.None, discovered: true },
                sentientLife: { value: false, discovered: true },
                lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                orbitalPeriod: { discovered: true },
                rotationPeriod: { discovered: true },
            },
        });
    }
}
