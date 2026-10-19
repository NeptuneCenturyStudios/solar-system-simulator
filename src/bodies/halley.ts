import * as THREE from 'three';

import {
    SUN_MASS,
    COMET_PERIHELION_DIST,
    COMET_APHELION_DIST,
    COMET_INCLINATION,
    COMET_LONG_ASC_NODE,
    COMET_ARG_PERIHELION,
    COMET_RADIUS,
    COMET_MASS,
} from '../utilities/consts.js';
import { planetOrbitFromElements } from './planet-orbit.js';
import { orbitElementsFromApsides } from './orbital-elements.js';

import { CometBase, type ICometModelConfig } from './comet-base';
import { IStateDependencies } from '../interfaces.js';
import { loadCometVariant2ModelTemplate } from './comet-model-cache';
import {
    AtmosphericGasEnum,
    CoreTypeEnum,
    LifeformBaseEnum,
    LiquidCompositionEnum,
    SoilCompositionEnum,
    VegetationEnum,
} from './body-attributes.js';

/** Neutral grey motion trail. */
const HALLEY_TRAIL_COLOR = 0xaaaaaa;

/**
 * Halley's nucleus model. Pinned to the shared comet-1 asset: Halley is a specific real
 * object, so unlike a procedural comet it should not reroll its nucleus once more models
 * exist.
 */
const HALLEY_MODEL_CONFIG: ICometModelConfig = {
    loadTemplate: loadCometVariant2ModelTemplate,
    trailColor: HALLEY_TRAIL_COLOR,
};

/**
 * Represents Halley's Comet in the simulation, with a realistic elliptical orbit and physical properties.
 * Extends CometBase, which owns the nucleus model, its loading and its disposal.
 */
export class Halley extends CometBase {
    /**
     * Constructs a new Halley object with its unique elliptical orbit and properties.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Halley belongs.
     * @param trueAnomaly Position along the orbit in radians, measured from perihelion
     *                    (0 = perihelion, π = aphelion).
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        trueAnomaly: number = Math.PI
    ) {
        // Halley's real J2000 orbit: e ≈ 0.968, retrograde (i ≈ 162°).
        const orbitElements = orbitElementsFromApsides(
            COMET_PERIHELION_DIST,
            COMET_APHELION_DIST,
            COMET_INCLINATION,
            COMET_LONG_ASC_NODE,
            COMET_ARG_PERIHELION
        );
        const trajectory = planetOrbitFromElements(
            orbitElements,
            trueAnomaly,
            dependencies.getG() * SUN_MASS
        );

        super(
            dependencies,
            scene,
            {
                pos: trajectory.pos,
                vel: trajectory.vel,
                referenceOrbitElements: orbitElements,
                mass: COMET_MASS,
                id: 'halley',
                name: 'Halley',
                radius: COMET_RADIUS,
                rotation: { tilt: 0, speed: 0.05 },
                maxTrail: 2000,
                attributes: {
                    coreType: { value: CoreTypeEnum.Icy, discovered: true },
                    atmosphericComposition: {
                        value:
                            AtmosphericGasEnum.WaterVapor |
                            AtmosphericGasEnum.CarbonDioxide |
                            AtmosphericGasEnum.CarbonMonoxide,
                        discovered: true,
                    },
                    soilComposition: {
                        value:
                            SoilCompositionEnum.WaterIce |
                            SoilCompositionEnum.Carbon |
                            SoilCompositionEnum.Silicates,
                        discovered: true,
                    },
                    liquidComposition: { value: LiquidCompositionEnum.None, discovered: true },
                    averageTemperatureKelvin: { value: 200, discovered: true },
                    vegetation: { value: VegetationEnum.None, discovered: true },
                    sentientLife: { value: false, discovered: true },
                    lifeformBase: { value: LifeformBaseEnum.None, discovered: true },
                    orbitalPeriod: { discovered: true },
                    rotationPeriod: { discovered: true },
                },
            },
            HALLEY_MODEL_CONFIG
        );
    }
}
