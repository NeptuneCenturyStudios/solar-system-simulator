import * as THREE from 'three';

import {
    SUN_MASS,
    COMET_PERIHELION_DIST,
    COMET_APHELION_DIST,
    COMET_RADIUS,
    COMET_MASS,
} from '../utilities/consts.js';

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
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        trueAnomaly: number = Math.PI
    ) {
        // Halley-like elliptical orbit
        const perihelion = COMET_PERIHELION_DIST; // Just outside Mars (scaled)
        const aphelion = COMET_APHELION_DIST; // Scaled
        const semiMajorAxis = (perihelion + aphelion) / 2;
        const ecc = (aphelion - perihelion) / (aphelion + perihelion);
        const semiLatusRectum = semiMajorAxis * (1 - ecc * ecc);
        const inclination = Math.PI / 6; // 30 degrees inclination

        // --- Fixed orbital plane basis vectors ---
        // ê_r: unit vector from sun toward periapsis (opposite of the original aphelion direction)
        const er = new THREE.Vector3(
            -Math.cos(Math.PI / 4),
            -Math.sin(inclination) * 0.5,
            -Math.sin(Math.PI / 4)
        ).normalize();

        // ê_t: in-plane tangential direction 90° ahead of periapsis (direction of motion at periapsis).
        // Derived from the original velocity direction at aphelion, then Gram-Schmidt
        // orthogonalized against ê_r so both vectors span the fixed orbital plane.
        const etRaw = new THREE.Vector3(
            Math.sin(Math.PI / 4) * Math.cos(inclination),
            -Math.sin(inclination) * 0.3,
            -Math.cos(Math.PI / 4) * Math.cos(inclination)
        );
        etRaw.addScaledVector(er, -etRaw.dot(er));
        const et = etRaw.normalize();

        // --- Kepler position and velocity at the given true anomaly ---
        const gEff = dependencies.getG();
        const nu = trueAnomaly;
        const r = semiLatusRectum / (1 + ecc * Math.cos(nu));

        const pos = new THREE.Vector3()
            .addScaledVector(er, r * Math.cos(nu))
            .addScaledVector(et, r * Math.sin(nu));

        // vis-viva perifocal formula: v = sqrt(GM/p) * [-sin(ν) ê_r + (e+cos(ν)) ê_t]
        const velScale = Math.sqrt((gEff * SUN_MASS) / semiLatusRectum);
        const vel = new THREE.Vector3()
            .addScaledVector(er, -velScale * Math.sin(nu))
            .addScaledVector(et, velScale * (ecc + Math.cos(nu)));

        super(
            dependencies,
            scene,
            {
                pos,
                vel,
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
