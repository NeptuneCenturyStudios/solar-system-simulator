import * as THREE from 'three';
import {
    SUN_MASS,
    MARS_MASS,
    MARS_DIST,
    MARS_RADIUS,
    MARS_AXIS,
    MARS_AZIMUTH,
    MARS_ORBITAL_PERIOD_REAL,
    MARS_PERIHELION_DIST,
    MARS_APHELION_DIST,
    MARS_INCLINATION,
    MARS_LONG_ASC_NODE,
    MARS_ARG_PERIHELION,
    calcSimOrbitalPeriod,
} from '../utilities/consts.js';
import { buildBodySphereGeometry, createUniqueId } from '../utilities/utilities.js';
import { getBodyTexture } from '../drawing/texture-registry.js';
import { planetOrbitFromElements } from './planet-orbit.js';
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
 * Represents the planet Mars in the simulation, including its texture and orbital properties.
 * Sets up Mars's trajectory, material, and physical parameters.
 */
export class Mars extends Planet {
    /**
     * Constructs a new Mars object with its unique properties and orbit.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Mars belongs.
     * @param trueAnomaly Position along the orbit in radians, measured from perihelion
     *                    (0 = perihelion, π = aphelion).
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, trueAnomaly: number = 0) {
        const gEff = dependencies.getG();
        const timeScale =
            MARS_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(MARS_DIST, gEff, SUN_MASS);
        const rotSpeed = ((2 * Math.PI) / (24.6229 * 3600)) * timeScale;

        // Mars's orbit is noticeably oval (e ≈ 0.0935) and tilted 1.85° to the ecliptic. The Sun
        // distance swings from 206.7 to 249.3 million km over the 687-day year, and that variation
        // is what drives the planet's seasons.
        const trajectory = planetOrbitFromElements(
            {
                perihelion: MARS_PERIHELION_DIST,
                aphelion: MARS_APHELION_DIST,
                inclinationDeg: MARS_INCLINATION,
                longitudeAscendingNodeDeg: MARS_LONG_ASC_NODE,
                argumentOfPeriapsisDeg: MARS_ARG_PERIHELION,
            },
            trueAnomaly,
            gEff * SUN_MASS
        );
        const texture = getBodyTexture('mars.jpg');
        const geometry = buildBodySphereGeometry(MARS_RADIUS);
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
            id: createUniqueId('mars'),
            name: 'Mars',
            mass: MARS_MASS,
            radius: MARS_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            bodySubtype: PlanetTypeEnum.Terrestrial,
            trailColor: 0xff8888,
            maxTrail: 3000,
            rotation: { tilt: MARS_AXIS, speed: rotSpeed, azimuth: MARS_AZIMUTH },
            mesh: mesh,
            atmosphere: {
                radius: MARS_RADIUS * 1.05,
                tint: 0xff8866,
                // Surface pressure in bar.
                density: 0.006,
            },
            attributes: {
                surfacePressure: { discovered: true },
                coreType: { value: CoreTypeEnum.Solid, discovered: true },
                atmosphericComposition: {
                    value:
                        AtmosphericGasEnum.CarbonDioxide |
                        AtmosphericGasEnum.Nitrogen |
                        AtmosphericGasEnum.Argon,
                    discovered: true,
                },
                soilComposition: {
                    value: SoilCompositionEnum.IronOxide | SoilCompositionEnum.Silicates,
                    discovered: true,
                },
                liquidComposition: { value: LiquidCompositionEnum.None, discovered: true },
                averageTemperatureKelvin: { value: 208, discovered: true },
                vegetation: { value: VegetationEnum.None, discovered: true },
                sentientLife: { value: false, discovered: true },
                lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                orbitalPeriod: { discovered: true },
                rotationPeriod: { discovered: true },
            },
        });
    }
}
