import * as THREE from 'three';
import { buildBodySphereGeometry, createUniqueId } from '../utilities/utilities.js';
import {
    SATURN_DIST,
    SATURN_MASS,
    SUN_MASS,
    SATURN_RADIUS,
    SATURN_AXIS,
    SATURN_AZIMUTH,
    SATURN_MAG_AZIMUTH,
    SATURN_MAG_OFFSET,
    SATURN_MAG_REVERSED,
    SATURN_MAG_STRENGTH,
    SATURN_MAG_TILT,
    SATURN_ORBITAL_PERIOD_REAL,
    SATURN_PERIHELION_DIST,
    SATURN_APHELION_DIST,
    SATURN_INCLINATION,
    SATURN_LONG_ASC_NODE,
    SATURN_ARG_PERIHELION,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { planetOrbitFromElements } from './planet-orbit.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet';
import { PlanetTypeEnum } from './body-enums.js';
import { getBodyTexture } from '../drawing/texture-registry.js';
import { SATURN_RING_SPEC } from '../procedural/ring-presets.js';
import {
    AtmosphericGasEnum,
    CoreTypeEnum,
    LifeformBaseEnum,
    VegetationEnum,
} from './body-attributes.js';

/**
 * Represents the planet Saturn in the simulation, including its texture and orbital properties.
 * Sets up Saturn's trajectory, material, and physical parameters.
 */
export class Saturn extends Planet {
    /**
     * Constructs a new Saturn object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Saturn belongs.
     * @param trueAnomaly Position along the orbit in radians, measured from perihelion
     *                    (0 = perihelion, π = aphelion).
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, trueAnomaly: number = 0) {
        const gEff = dependencies.getG();
        const timeScale =
            SATURN_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(SATURN_DIST, gEff, SUN_MASS);
        // 10.656 h is the Saturnian System III rotation period the fact sheet publishes.
        const rotSpeed = ((2 * Math.PI) / (10.656 * 3600)) * timeScale;

        // Saturn's orbit is the most eccentric of the giants (e ≈ 0.0542) and tilted 2.48° to the
        // ecliptic, the largest orbital inclination of any planet bright enough to see by eye.
        const trajectory = planetOrbitFromElements(
            {
                perihelion: SATURN_PERIHELION_DIST,
                aphelion: SATURN_APHELION_DIST,
                inclinationDeg: SATURN_INCLINATION,
                longitudeAscendingNodeDeg: SATURN_LONG_ASC_NODE,
                argumentOfPeriapsisDeg: SATURN_ARG_PERIHELION,
            },
            trueAnomaly,
            gEff * SUN_MASS
        );
        const texture = getBodyTexture('saturn.jpg');
        const geometry = buildBodySphereGeometry(SATURN_RADIUS);
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
            id: createUniqueId('saturn'),
            name: 'Saturn',
            mass: SATURN_MASS,
            radius: SATURN_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            bodySubtype: PlanetTypeEnum.GasGiant,
            trailColor: 0xffeebb,
            maxTrail: 12000,
            rings: SATURN_RING_SPEC,
            rotation: { tilt: SATURN_AXIS, speed: rotSpeed, azimuth: SATURN_AZIMUTH },
            mesh: mesh,
            atmosphere: {
                radius: SATURN_RADIUS * 1.07,
                tint: 0xffeebb,
                // Surface pressure in bar (cloud tops).
                density: 0.3,
            },
            magneticField: {
                strength: SATURN_MAG_STRENGTH,
                tilt: SATURN_MAG_TILT,
                azimuth: SATURN_MAG_AZIMUTH,
                offset: SATURN_MAG_OFFSET,
                reversed: SATURN_MAG_REVERSED,
            },
            attributes: {
                surfacePressure: { discovered: true },
                coreType: { value: CoreTypeEnum.GasFluid, discovered: true },
                atmosphericComposition: {
                    value:
                        AtmosphericGasEnum.Hydrogen |
                        AtmosphericGasEnum.Helium |
                        AtmosphericGasEnum.Methane |
                        AtmosphericGasEnum.Ammonia,
                    discovered: true,
                },
                averageTemperatureKelvin: { value: 133, discovered: true },
                vegetation: { value: VegetationEnum.None, discovered: true },
                sentientLife: { value: false, discovered: true },
                lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                orbitalPeriod: { discovered: true },
                rotationPeriod: { discovered: true },
            },
        });
    }
}
