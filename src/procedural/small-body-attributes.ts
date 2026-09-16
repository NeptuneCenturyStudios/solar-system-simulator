import { SeededRandom } from '../utilities/prng';
import {
    AtmosphericGasEnum,
    CoreTypeEnum,
    type IPlanetaryAttributes,
    LifeformBaseEnum,
    LiquidCompositionEnum,
    SoilCompositionEnum,
    VegetationEnum,
} from '../bodies/body-attributes';
import { pickWeighted } from './seed-utils';

/**
 * Equilibrium blackbody temperature approximation (zero albedo, Earth-normalized):
 * T ≈ 279K / sqrt(distanceAU). Not exact for airless bodies with real albedo, but a
 * reasonable game-appropriate curve that matches real asteroid-belt temperatures
 * (~140–230K across 1.5–4 AU).
 */
function blackbodyTemperatureKelvin(distanceAU: number): number {
    return 279 / Math.sqrt(Math.max(0.1, distanceAU));
}

/**
 * Attribute generation for procedural asteroids — airless rubble/rock bodies with no
 * atmosphere table. Soil composition covers the "metals like iron/gold/platinum" case
 * the milestone calls out for future mining/probe gameplay.
 */
export function computeAsteroidAttributes(params: {
    id: string;
    distanceAU: number;
}): IPlanetaryAttributes {
    const { id, distanceAU } = params;

    const coreRng = new SeededRandom(`${id}|attr-core`);
    const coreType = pickWeighted(coreRng, [
        { value: CoreTypeEnum.RubblePile, weight: 0.45 },
        { value: CoreTypeEnum.Solid, weight: 0.3 },
        { value: CoreTypeEnum.Metallic, weight: 0.25 },
    ]);

    const soilRng = new SeededRandom(`${id}|attr-soil`);
    let soil = SoilCompositionEnum.Silicates;
    if (soilRng.chance(0.4)) soil |= SoilCompositionEnum.Carbon;
    if (soilRng.chance(0.2)) soil |= SoilCompositionEnum.WaterIce;
    if (coreType === CoreTypeEnum.Metallic && soilRng.chance(0.7)) {
        soil |= SoilCompositionEnum.Iron;
        soil |= SoilCompositionEnum.Nickel;
    }
    if (soilRng.chance(0.06)) soil |= SoilCompositionEnum.Gold;
    if (soilRng.chance(0.08)) soil |= SoilCompositionEnum.Silicon;
    if (soilRng.chance(0.05)) soil |= SoilCompositionEnum.Platinum;

    const tempRng = new SeededRandom(`${id}|attr-temp`);
    const averageTemperatureKelvin = Math.round(
        blackbodyTemperatureKelvin(distanceAU) + tempRng.range(-15, 15)
    );

    return {
        coreType: { value: coreType, discovered: false },
        atmosphericComposition: { value: AtmosphericGasEnum.None, discovered: false },
        soilComposition: { value: soil, discovered: false },
        // Too small to hold a stable liquid or bear life at any meaningful scale.
        liquidComposition: { value: LiquidCompositionEnum.None, discovered: false },
        averageTemperatureKelvin: {
            value: Math.max(20, averageTemperatureKelvin),
            discovered: false,
        },
        vegetation: { value: VegetationEnum.None, discovered: false },
        sentientLife: { value: false, discovered: false },
        lifeformBase: { value: LifeformBaseEnum.None, discovered: false },
        orbitalPeriod: { discovered: false },
        rotationPeriod: { discovered: false },
    };
}

/**
 * Attribute generation for procedural comets. "Atmosphere" here represents the coma —
 * gas sublimating off the icy nucleus — rather than a bound atmosphere.
 */
export function computeCometAttributes(params: { id: string }): IPlanetaryAttributes {
    const { id } = params;

    const coreRng = new SeededRandom(`${id}|attr-core`);
    const coreType = coreRng.chance(0.8) ? CoreTypeEnum.Icy : CoreTypeEnum.RubblePile;

    const comaRng = new SeededRandom(`${id}|attr-atmosphere`);
    let coma = AtmosphericGasEnum.WaterVapor;
    if (comaRng.chance(0.5)) coma |= AtmosphericGasEnum.CarbonDioxide;
    if (comaRng.chance(0.3)) coma |= AtmosphericGasEnum.CarbonMonoxide;
    if (comaRng.chance(0.1)) coma |= AtmosphericGasEnum.Ammonia;

    const soilRng = new SeededRandom(`${id}|attr-soil`);
    let soil = SoilCompositionEnum.WaterIce;
    if (soilRng.chance(0.4)) soil |= SoilCompositionEnum.Carbon;
    if (soilRng.chance(0.3)) soil |= SoilCompositionEnum.Silicates;

    const tempRng = new SeededRandom(`${id}|attr-temp`);
    // Comet nuclei spend most of their orbit far from the star; represents a typical
    // outer-system average rather than a perihelion spike.
    const averageTemperatureKelvin = Math.round(180 + tempRng.range(-40, 40));

    return {
        coreType: { value: coreType, discovered: false },
        atmosphericComposition: { value: coma, discovered: false },
        soilComposition: { value: soil, discovered: false },
        // The nucleus is too small and cold to hold stable liquid or bear life.
        liquidComposition: { value: LiquidCompositionEnum.None, discovered: false },
        averageTemperatureKelvin: {
            value: Math.max(20, averageTemperatureKelvin),
            discovered: false,
        },
        vegetation: { value: VegetationEnum.None, discovered: false },
        sentientLife: { value: false, discovered: false },
        lifeformBase: { value: LifeformBaseEnum.None, discovered: false },
        orbitalPeriod: { discovered: false },
        rotationPeriod: { discovered: false },
    };
}
