import { SeededRandom } from '../utilities/prng';
import { MoonTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';
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
import { clamp01 } from './noise-utils';

type SolidSubtype = PlanetTypeEnum | MoonTypeEnum;

const CORE_TYPE_WEIGHTS: Record<string, Array<{ value: CoreTypeEnum; weight: number }>> = {
    [PlanetTypeEnum.Terrestrial]: [
        { value: CoreTypeEnum.Solid, weight: 0.5 },
        { value: CoreTypeEnum.Metallic, weight: 0.3 },
        { value: CoreTypeEnum.Molten, weight: 0.2 },
    ],
    [PlanetTypeEnum.Temperate]: [
        { value: CoreTypeEnum.Solid, weight: 0.6 },
        { value: CoreTypeEnum.Metallic, weight: 0.25 },
        { value: CoreTypeEnum.Molten, weight: 0.15 },
    ],
    [PlanetTypeEnum.Desert]: [
        { value: CoreTypeEnum.Solid, weight: 0.7 },
        { value: CoreTypeEnum.Metallic, weight: 0.2 },
        { value: CoreTypeEnum.Molten, weight: 0.1 },
    ],
    [PlanetTypeEnum.Volcanic]: [
        { value: CoreTypeEnum.Molten, weight: 0.7 },
        { value: CoreTypeEnum.Solid, weight: 0.2 },
        { value: CoreTypeEnum.Metallic, weight: 0.1 },
    ],
    [PlanetTypeEnum.Ocean]: [
        { value: CoreTypeEnum.Solid, weight: 0.6 },
        { value: CoreTypeEnum.Metallic, weight: 0.2 },
        { value: CoreTypeEnum.Icy, weight: 0.2 },
    ],
    [PlanetTypeEnum.Frozen]: [
        { value: CoreTypeEnum.Icy, weight: 0.75 },
        { value: CoreTypeEnum.Solid, weight: 0.25 },
    ],
};

const DWARF_CORE_TYPE_WEIGHTS: Array<{ value: CoreTypeEnum; weight: number }> = [
    { value: CoreTypeEnum.RubblePile, weight: 0.35 },
    { value: CoreTypeEnum.Icy, weight: 0.4 },
    { value: CoreTypeEnum.Solid, weight: 0.25 },
];

function isGasOrIceGiant(subtype: SolidSubtype): boolean {
    return subtype === PlanetTypeEnum.GasGiant || subtype === PlanetTypeEnum.IceGiant;
}

export function computeCoreType(
    rng: SeededRandom,
    subtype: SolidSubtype,
    isDwarf: boolean
): CoreTypeEnum {
    if (isGasOrIceGiant(subtype)) return CoreTypeEnum.GasFluid;
    if (isDwarf) return pickWeighted(rng, DWARF_CORE_TYPE_WEIGHTS);

    const table = CORE_TYPE_WEIGHTS[subtype] ?? CORE_TYPE_WEIGHTS[PlanetTypeEnum.Terrestrial]!;
    return pickWeighted(rng, table);
}

type GasRoll = { gas: AtmosphericGasEnum; chance: number };

const SOLID_ATMOSPHERE_ROLLS: Record<string, GasRoll[]> = {
    [PlanetTypeEnum.Terrestrial]: [
        { gas: AtmosphericGasEnum.Nitrogen, chance: 0.5 },
        { gas: AtmosphericGasEnum.Oxygen, chance: 0.2 },
        { gas: AtmosphericGasEnum.CarbonDioxide, chance: 0.3 },
        { gas: AtmosphericGasEnum.Argon, chance: 0.15 },
    ],
    [PlanetTypeEnum.Temperate]: [
        { gas: AtmosphericGasEnum.Nitrogen, chance: 0.6 },
        { gas: AtmosphericGasEnum.Oxygen, chance: 0.35 },
        { gas: AtmosphericGasEnum.WaterVapor, chance: 0.3 },
        { gas: AtmosphericGasEnum.CarbonDioxide, chance: 0.2 },
        { gas: AtmosphericGasEnum.Argon, chance: 0.15 },
    ],
    [PlanetTypeEnum.Desert]: [
        { gas: AtmosphericGasEnum.CarbonDioxide, chance: 0.5 },
        { gas: AtmosphericGasEnum.Nitrogen, chance: 0.25 },
        { gas: AtmosphericGasEnum.Argon, chance: 0.1 },
    ],
    [PlanetTypeEnum.Volcanic]: [
        { gas: AtmosphericGasEnum.SulfurDioxide, chance: 0.45 },
        { gas: AtmosphericGasEnum.CarbonDioxide, chance: 0.35 },
        { gas: AtmosphericGasEnum.Nitrogen, chance: 0.1 },
    ],
    [PlanetTypeEnum.Ocean]: [
        { gas: AtmosphericGasEnum.Nitrogen, chance: 0.55 },
        { gas: AtmosphericGasEnum.Oxygen, chance: 0.3 },
        { gas: AtmosphericGasEnum.WaterVapor, chance: 0.4 },
        { gas: AtmosphericGasEnum.CarbonDioxide, chance: 0.15 },
    ],
    [PlanetTypeEnum.Frozen]: [
        { gas: AtmosphericGasEnum.Nitrogen, chance: 0.3 },
        { gas: AtmosphericGasEnum.Methane, chance: 0.35 },
        { gas: AtmosphericGasEnum.CarbonMonoxide, chance: 0.15 },
        { gas: AtmosphericGasEnum.CarbonDioxide, chance: 0.1 },
    ],
};

export function computeAtmosphericComposition(
    rng: SeededRandom,
    subtype: SolidSubtype
): AtmosphericGasEnum {
    if (subtype === PlanetTypeEnum.GasGiant) {
        let gas = AtmosphericGasEnum.Hydrogen | AtmosphericGasEnum.Helium;
        if (rng.chance(0.5)) gas |= AtmosphericGasEnum.Methane;
        if (rng.chance(0.4)) gas |= AtmosphericGasEnum.Ammonia;
        return gas;
    }
    if (subtype === PlanetTypeEnum.IceGiant) {
        let gas =
            AtmosphericGasEnum.Hydrogen | AtmosphericGasEnum.Helium | AtmosphericGasEnum.Methane;
        if (rng.chance(0.3)) gas |= AtmosphericGasEnum.Ammonia;
        return gas;
    }

    const rolls =
        SOLID_ATMOSPHERE_ROLLS[subtype] ?? SOLID_ATMOSPHERE_ROLLS[PlanetTypeEnum.Terrestrial]!;
    let gas = AtmosphericGasEnum.None;
    for (const roll of rolls) {
        if (rng.chance(roll.chance)) gas |= roll.gas;
    }
    return gas;
}

type SoilTable = {
    base: SoilCompositionEnum;
    rolls: Array<{ mineral: SoilCompositionEnum; chance: number }>;
};

const SOLID_SOIL_TABLE: Record<string, SoilTable> = {
    [PlanetTypeEnum.Terrestrial]: {
        base: SoilCompositionEnum.Silicates,
        rolls: [
            { mineral: SoilCompositionEnum.Iron, chance: 0.35 },
            { mineral: SoilCompositionEnum.Basalt, chance: 0.2 },
            { mineral: SoilCompositionEnum.Carbon, chance: 0.15 },
        ],
    },
    [PlanetTypeEnum.Temperate]: {
        base: SoilCompositionEnum.Silicates,
        rolls: [
            { mineral: SoilCompositionEnum.Carbon, chance: 0.25 },
            { mineral: SoilCompositionEnum.Iron, chance: 0.2 },
        ],
    },
    [PlanetTypeEnum.Desert]: {
        base: SoilCompositionEnum.Silicates | SoilCompositionEnum.IronOxide,
        rolls: [{ mineral: SoilCompositionEnum.Sulfur, chance: 0.1 }],
    },
    [PlanetTypeEnum.Volcanic]: {
        base: SoilCompositionEnum.Basalt,
        rolls: [
            { mineral: SoilCompositionEnum.Sulfur, chance: 0.3 },
            { mineral: SoilCompositionEnum.Silicates, chance: 0.3 },
            { mineral: SoilCompositionEnum.IronOxide, chance: 0.15 },
        ],
    },
    [PlanetTypeEnum.Ocean]: {
        base: SoilCompositionEnum.Silicates,
        rolls: [
            { mineral: SoilCompositionEnum.WaterIce, chance: 0.2 },
            { mineral: SoilCompositionEnum.Carbon, chance: 0.2 },
        ],
    },
    [PlanetTypeEnum.Frozen]: {
        base: SoilCompositionEnum.WaterIce,
        rolls: [
            { mineral: SoilCompositionEnum.Silicates, chance: 0.2 },
            { mineral: SoilCompositionEnum.Regolith, chance: 0.3 },
        ],
    },
};

const DWARF_SOIL_TABLE: SoilTable = {
    base: SoilCompositionEnum.Regolith,
    rolls: [
        { mineral: SoilCompositionEnum.WaterIce, chance: 0.3 },
        { mineral: SoilCompositionEnum.Carbon, chance: 0.3 },
        { mineral: SoilCompositionEnum.Silicates, chance: 0.3 },
        { mineral: SoilCompositionEnum.Iron, chance: 0.15 },
    ],
};

/** Rolled independently of subtype, on top of whatever the subtype table produced. */
const TRACE_MINERAL_ROLLS: Array<{ mineral: SoilCompositionEnum; chance: number }> = [
    { mineral: SoilCompositionEnum.Gold, chance: 0.06 },
    { mineral: SoilCompositionEnum.Silicon, chance: 0.08 },
    { mineral: SoilCompositionEnum.Platinum, chance: 0.05 },
];

export function computeSoilComposition(
    rng: SeededRandom,
    subtype: SolidSubtype,
    coreType: CoreTypeEnum,
    isDwarf: boolean
): SoilCompositionEnum | undefined {
    if (isGasOrIceGiant(subtype)) return undefined;

    const table = isDwarf
        ? DWARF_SOIL_TABLE
        : (SOLID_SOIL_TABLE[subtype] ?? SOLID_SOIL_TABLE[PlanetTypeEnum.Terrestrial]!);

    let soil = table.base;
    for (const roll of table.rolls) {
        if (rng.chance(roll.chance)) soil |= roll.mineral;
    }

    // A metallic core biases toward an iron-rich surface/regolith.
    if (coreType === CoreTypeEnum.Metallic && rng.chance(0.7)) {
        soil |= SoilCompositionEnum.Iron;
    }

    for (const roll of TRACE_MINERAL_ROLLS) {
        if (rng.chance(roll.chance)) soil |= roll.mineral;
    }

    return soil;
}

type LiquidRoll = { liquid: LiquidCompositionEnum; chance: number };

/**
 * A liquid needs the right atmosphere/temperature band to stay liquid rather than freezing
 * or boiling off, so methane/ethane oceans are only offered on Frozen worlds that already
 * rolled a methane-bearing atmosphere (mirrors Titan), and sulfur lakes only on volcanic
 * worlds. Water/brine are the default liquid for anything temperate enough to hold it.
 */
const LIQUID_ROLLS: Record<string, LiquidRoll[]> = {
    [PlanetTypeEnum.Ocean]: [
        { liquid: LiquidCompositionEnum.Water, chance: 0.95 },
        { liquid: LiquidCompositionEnum.Brine, chance: 0.15 },
    ],
    [PlanetTypeEnum.Temperate]: [
        { liquid: LiquidCompositionEnum.Water, chance: 0.6 },
        { liquid: LiquidCompositionEnum.Brine, chance: 0.1 },
    ],
    [PlanetTypeEnum.Terrestrial]: [{ liquid: LiquidCompositionEnum.Water, chance: 0.35 }],
    [PlanetTypeEnum.Desert]: [{ liquid: LiquidCompositionEnum.Brine, chance: 0.05 }],
    [PlanetTypeEnum.Volcanic]: [{ liquid: LiquidCompositionEnum.LiquidSulfur, chance: 0.25 }],
};

export function computeLiquidComposition(
    rng: SeededRandom,
    subtype: SolidSubtype,
    atmosphere: AtmosphericGasEnum,
    isDwarf: boolean
): LiquidCompositionEnum | undefined {
    if (isGasOrIceGiant(subtype)) return undefined;

    let liquid = LiquidCompositionEnum.None;

    if (isDwarf) {
        // Subsurface brine/water reservoirs, like Ceres — no surface liquid at these temperatures.
        if (rng.chance(0.2)) liquid |= LiquidCompositionEnum.Water;
        if (rng.chance(0.1)) liquid |= LiquidCompositionEnum.Brine;
        return liquid;
    }

    if (subtype === PlanetTypeEnum.Frozen) {
        const hasMethaneAtmosphere = (atmosphere & AtmosphericGasEnum.Methane) !== 0;
        if (hasMethaneAtmosphere) {
            if (rng.chance(0.4)) liquid |= LiquidCompositionEnum.LiquidMethane;
            if (rng.chance(0.3)) liquid |= LiquidCompositionEnum.LiquidEthane;
        } else if (rng.chance(0.15)) {
            liquid |= LiquidCompositionEnum.Water; // subsurface
        }
        return liquid;
    }

    const rolls = LIQUID_ROLLS[subtype];
    if (rolls) {
        for (const roll of rolls) {
            if (rng.chance(roll.chance)) liquid |= roll.liquid;
        }
    }

    return liquid;
}

const TEMPERATURE_OFFSET_KELVIN: Record<string, number> = {
    [PlanetTypeEnum.Volcanic]: 80,
    [PlanetTypeEnum.Desert]: 40,
    [PlanetTypeEnum.Terrestrial]: 10,
    [PlanetTypeEnum.Temperate]: 0,
    [PlanetTypeEnum.Ocean]: -20,
    [PlanetTypeEnum.Frozen]: -60,
    [PlanetTypeEnum.GasGiant]: -10,
    [PlanetTypeEnum.IceGiant]: -10,
};

/**
 * Baseline mirrors the Gaussian-by-distance shape already used for subtype selection in
 * planet-generator.ts's pickPlanetSubtypeByDistance: hot near the star (t≈0), cold far out
 * (t≈1). Not real physics — a game-appropriate blackbody-flavored curve.
 */
export function computeAverageTemperatureKelvin(
    rng: SeededRandom,
    subtype: SolidSubtype,
    distanceT01: number
): number {
    const t = clamp01(distanceT01);
    const baseline = 700 - t * 650;
    const offset = TEMPERATURE_OFFSET_KELVIN[subtype] ?? 0;
    const jitter = rng.range(-30, 30);
    return Math.max(20, Math.round(baseline + offset + jitter));
}

type LifeChance = { withWater: number; withoutWater: number };

/**
 * Explicit top-level probability that a body with *some* liquid solvent actually develops
 * life at all — this is the number that should be tuned to answer "how common is life."
 * Temperate is the clear standout; every other subtype is deliberately low so Temperate
 * reads as the one type worth prioritizing with a probe. Gas/ice giants never reach this
 * function (no liquid), so they aren't listed.
 *
 * `withWater` applies when actual liquid water is present; `withoutWater` applies when the
 * only liquid rolled is something else (brine-only, or an exotic liquid like methane/sulfur) —
 * real water is a meaningfully better bet for life than a brine puddle or a hydrocarbon lake.
 * Most subtypes keep the two equal (unchanged from before); only Ocean currently
 * differentiates, since an ocean world that actually has water is a much stronger candidate
 * than one that only rolled brine.
 */
const LIFE_CHANCE_BY_SUBTYPE: Record<string, LifeChance> = {
    [PlanetTypeEnum.Temperate]: { withWater: 0.75, withoutWater: 0.75 },
    [PlanetTypeEnum.Ocean]: { withWater: 0.4, withoutWater: 0.2 },
    [PlanetTypeEnum.Terrestrial]: { withWater: 0.15, withoutWater: 0.15 },
    [PlanetTypeEnum.Frozen]: { withWater: 0.08, withoutWater: 0.08 },
    [PlanetTypeEnum.Desert]: { withWater: 0.05, withoutWater: 0.05 },
    [PlanetTypeEnum.Volcanic]: { withWater: 0.05, withoutWater: 0.05 },
};
const DEFAULT_LIFE_CHANCE: LifeChance = { withWater: 0.05, withoutWater: 0.05 };
/** Dwarf planets/moons use a flat low chance regardless of subtype (e.g. Ceres-like subsurface microbes). */
const DWARF_LIFE_CHANCE: LifeChance = { withWater: 0.05, withoutWater: 0.05 };

/** Chance that a life-bearing body's life is sentient. Low everywhere; higher on Temperate
 *  worlds, but still rare there too — this is meant to be a jackpot discovery, not the norm. */
const SENTIENT_CHANCE_TEMPERATE = 0.03;
const SENTIENT_CHANCE_OTHER = 0.01;

type VegetationProfile = {
    /** Guaranteed once life is confirmed — decouples "does it have life" from "how varied is it." */
    primary: VegetationEnum;
    optional: Array<{ plant: VegetationEnum; chance: number }>;
};

/** Used when the body has plain liquid water — breathable-air, Earth-like flora. */
const WATER_VEGETATION_PROFILES: Record<string, VegetationProfile> = {
    [PlanetTypeEnum.Temperate]: {
        primary: VegetationEnum.Grass,
        optional: [
            { plant: VegetationEnum.Trees, chance: 0.7 },
            { plant: VegetationEnum.Shrubs, chance: 0.5 },
            { plant: VegetationEnum.Moss, chance: 0.35 },
            { plant: VegetationEnum.Fungus, chance: 0.3 },
        ],
    },
    [PlanetTypeEnum.Terrestrial]: {
        primary: VegetationEnum.Grass,
        optional: [
            { plant: VegetationEnum.Shrubs, chance: 0.4 },
            { plant: VegetationEnum.Trees, chance: 0.3 },
            { plant: VegetationEnum.Moss, chance: 0.2 },
        ],
    },
    [PlanetTypeEnum.Ocean]: {
        primary: VegetationEnum.Algae,
        optional: [{ plant: VegetationEnum.Kelp, chance: 0.6 }],
    },
    [PlanetTypeEnum.Desert]: {
        primary: VegetationEnum.Cacti,
        optional: [{ plant: VegetationEnum.Shrubs, chance: 0.3 }],
    },
};

/** Used when the only liquid present is exotic (methane/ethane/ammonia/sulfur) or brine-only —
 *  hardy extremophile-flavored growth rather than breathable-air flora. */
const EXTREMOPHILE_VEGETATION_PROFILE: VegetationProfile = {
    primary: VegetationEnum.Algae,
    optional: [
        { plant: VegetationEnum.Fungus, chance: 0.4 },
        { plant: VegetationEnum.Moss, chance: 0.3 },
    ],
};

const LIFEFORM_BASE_WEIGHTS: Array<{ value: LifeformBaseEnum; weight: number }> = [
    { value: LifeformBaseEnum.CarbonBased, weight: 0.85 },
    { value: LifeformBaseEnum.SiliconBased, weight: 0.06 },
    { value: LifeformBaseEnum.MethaneBased, weight: 0.04 },
    { value: LifeformBaseEnum.AmmoniaBased, weight: 0.03 },
    { value: LifeformBaseEnum.BoraneBased, weight: 0.02 },
];

/**
 * Whether life exists at all is one explicit roll against LIFE_CHANCE_BY_SUBTYPE — kept
 * separate from which vegetation flags end up set, so the "how common is life" probability
 * is a single readable number per subtype rather than an emergent product of several
 * independent flag rolls (which previously let Ocean end up more life-prone than Temperate).
 * No liquid solvent at all means no life, full stop, regardless of subtype.
 */
export function computeLifeAttributes(params: {
    rng: SeededRandom;
    subtype: SolidSubtype;
    isDwarf: boolean;
    liquidComposition: LiquidCompositionEnum | undefined;
}): { vegetation: VegetationEnum; sentientLife: boolean; lifeformBase: LifeformBaseEnum } {
    const { rng, subtype, isDwarf, liquidComposition } = params;
    const noLife = {
        vegetation: VegetationEnum.None,
        sentientLife: false,
        lifeformBase: LifeformBaseEnum.None,
    };

    // Falsy also covers LiquidCompositionEnum.None, since it's 0.
    if (!liquidComposition) return noLife;

    const hasWater = (liquidComposition & LiquidCompositionEnum.Water) !== 0;
    const chances = isDwarf
        ? DWARF_LIFE_CHANCE
        : (LIFE_CHANCE_BY_SUBTYPE[subtype] ?? DEFAULT_LIFE_CHANCE);
    const lifeChance = hasWater ? chances.withWater : chances.withoutWater;
    if (!rng.chance(lifeChance)) return noLife;

    const hasExoticLiquid =
        (liquidComposition &
            (LiquidCompositionEnum.LiquidMethane |
                LiquidCompositionEnum.LiquidEthane |
                LiquidCompositionEnum.LiquidAmmonia |
                LiquidCompositionEnum.LiquidSulfur)) !==
        0;

    const profile = hasWater
        ? (WATER_VEGETATION_PROFILES[subtype] ??
          WATER_VEGETATION_PROFILES[PlanetTypeEnum.Terrestrial]!)
        : EXTREMOPHILE_VEGETATION_PROFILE;

    let vegetation = profile.primary;
    for (const roll of profile.optional) {
        if (rng.chance(roll.chance)) vegetation |= roll.plant;
    }

    const sentientChance =
        subtype === PlanetTypeEnum.Temperate && !isDwarf
            ? SENTIENT_CHANCE_TEMPERATE
            : SENTIENT_CHANCE_OTHER;
    const sentientLife = rng.chance(sentientChance);

    let weights = LIFEFORM_BASE_WEIGHTS;
    if (!hasWater && hasExoticLiquid) {
        // Skew toward the exotic base matching the liquid actually present.
        const exoticBase =
            (liquidComposition & LiquidCompositionEnum.LiquidAmmonia) !== 0
                ? LifeformBaseEnum.AmmoniaBased
                : (liquidComposition &
                        (LiquidCompositionEnum.LiquidMethane |
                            LiquidCompositionEnum.LiquidEthane)) !==
                    0
                  ? LifeformBaseEnum.MethaneBased
                  : LifeformBaseEnum.SiliconBased;

        weights = LIFEFORM_BASE_WEIGHTS.map((w) =>
            w.value === exoticBase ? { value: w.value, weight: w.weight * 6 } : w
        );
    }

    const lifeformBase = pickWeighted(rng, weights);
    return { vegetation, sentientLife, lifeformBase };
}

/**
 * Top-level entry point for procedural planet/dwarf-planet/moon attribute generation.
 * All values are generated regardless of discovery state; every attribute starts
 * undiscovered (discovered: false) since procedural bodies require probe discovery.
 */
export function computePlanetaryAttributes(params: {
    id: string;
    subtype: SolidSubtype;
    isDwarf: boolean;
    distanceT01: number;
}): IPlanetaryAttributes {
    const { id, subtype, isDwarf, distanceT01 } = params;

    const coreType = computeCoreType(new SeededRandom(`${id}|attr-core`), subtype, isDwarf);
    const atmosphericComposition = computeAtmosphericComposition(
        new SeededRandom(`${id}|attr-atmosphere`),
        subtype
    );
    const soilComposition = computeSoilComposition(
        new SeededRandom(`${id}|attr-soil`),
        subtype,
        coreType,
        isDwarf
    );
    const liquidComposition = computeLiquidComposition(
        new SeededRandom(`${id}|attr-liquid`),
        subtype,
        atmosphericComposition,
        isDwarf
    );
    const averageTemperatureKelvin = computeAverageTemperatureKelvin(
        new SeededRandom(`${id}|attr-temp`),
        subtype,
        distanceT01
    );
    const life = computeLifeAttributes({
        rng: new SeededRandom(`${id}|attr-life`),
        subtype,
        isDwarf,
        liquidComposition,
    });

    const attributes: IPlanetaryAttributes = {
        coreType: { value: coreType, discovered: false },
        atmosphericComposition: { value: atmosphericComposition, discovered: false },
        averageTemperatureKelvin: { value: averageTemperatureKelvin, discovered: false },
        vegetation: { value: life.vegetation, discovered: false },
        sentientLife: { value: life.sentientLife, discovered: false },
        lifeformBase: { value: life.lifeformBase, discovered: false },
        orbitalPeriod: { discovered: false },
        rotationPeriod: { discovered: false },
    };

    if (soilComposition !== undefined) {
        attributes.soilComposition = { value: soilComposition, discovered: false };
    }
    if (liquidComposition !== undefined) {
        attributes.liquidComposition = { value: liquidComposition, discovered: false };
    }

    return attributes;
}
