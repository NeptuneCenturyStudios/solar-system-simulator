/**
 * Human-readable labels for the discoverable planetary-attribute enums (Phase 3.3), plus the
 * planet/moon subtype labels. Kept free of THREE.js or scene references like body-attributes.ts,
 * so both the Vue attributes modal and the canvas stats HUD (drawing/text-rendering.ts) can
 * import it without dragging the renderer in — and so the two displays can never drift apart.
 */

import {
    AtmosphericGasEnum,
    CoreTypeEnum,
    LifeformBaseEnum,
    LiquidCompositionEnum,
    SoilCompositionEnum,
    VegetationEnum,
} from './body-attributes';
import { MoonTypeEnum, PlanetTypeEnum } from './body-enums';

/** One bit flag paired with its display label. */
export interface IFlagLabel {
    flag: number;
    label: string;
}

/** Label for a single-valued attribute enum. */
export const CORE_TYPE_LABELS: Record<CoreTypeEnum, string> = {
    [CoreTypeEnum.Molten]: 'Molten',
    [CoreTypeEnum.Solid]: 'Solid',
    [CoreTypeEnum.Metallic]: 'Metallic',
    [CoreTypeEnum.Icy]: 'Icy',
    [CoreTypeEnum.GasFluid]: 'Gas / Fluid',
    [CoreTypeEnum.RubblePile]: 'Rubble Pile',
};

export const LIFEFORM_BASE_LABELS: Record<LifeformBaseEnum, string> = {
    [LifeformBaseEnum.None]: 'None',
    [LifeformBaseEnum.CarbonBased]: 'Carbon-based',
    [LifeformBaseEnum.SiliconBased]: 'Silicon-based',
    [LifeformBaseEnum.MethaneBased]: 'Methane-based',
    [LifeformBaseEnum.BoraneBased]: 'Borane-based',
    [LifeformBaseEnum.AmmoniaBased]: 'Ammonia-based',
};

/** Ordered so the rendered list follows the enum's declaration order. */
export const ATMOSPHERIC_GAS_FLAGS: IFlagLabel[] = [
    { flag: AtmosphericGasEnum.Hydrogen, label: 'Hydrogen' },
    { flag: AtmosphericGasEnum.Helium, label: 'Helium' },
    { flag: AtmosphericGasEnum.Nitrogen, label: 'Nitrogen' },
    { flag: AtmosphericGasEnum.Oxygen, label: 'Oxygen' },
    { flag: AtmosphericGasEnum.CarbonDioxide, label: 'Carbon Dioxide' },
    { flag: AtmosphericGasEnum.Methane, label: 'Methane' },
    { flag: AtmosphericGasEnum.Ammonia, label: 'Ammonia' },
    { flag: AtmosphericGasEnum.SulfurDioxide, label: 'Sulfur Dioxide' },
    { flag: AtmosphericGasEnum.Argon, label: 'Argon' },
    { flag: AtmosphericGasEnum.Ozone, label: 'Ozone' },
    { flag: AtmosphericGasEnum.Neon, label: 'Neon' },
    { flag: AtmosphericGasEnum.WaterVapor, label: 'Water Vapor' },
    { flag: AtmosphericGasEnum.CarbonMonoxide, label: 'Carbon Monoxide' },
];

export const SOIL_COMPOSITION_FLAGS: IFlagLabel[] = [
    { flag: SoilCompositionEnum.Silicates, label: 'Silicates' },
    { flag: SoilCompositionEnum.Iron, label: 'Iron' },
    { flag: SoilCompositionEnum.Nickel, label: 'Nickel' },
    { flag: SoilCompositionEnum.Carbon, label: 'Carbon' },
    { flag: SoilCompositionEnum.WaterIce, label: 'Water Ice' },
    { flag: SoilCompositionEnum.Sulfur, label: 'Sulfur' },
    { flag: SoilCompositionEnum.Basalt, label: 'Basalt' },
    { flag: SoilCompositionEnum.IronOxide, label: 'Iron Oxide' },
    { flag: SoilCompositionEnum.Gold, label: 'Gold' },
    { flag: SoilCompositionEnum.Silicon, label: 'Silicon' },
    { flag: SoilCompositionEnum.Platinum, label: 'Platinum' },
    { flag: SoilCompositionEnum.Regolith, label: 'Regolith' },
];

export const LIQUID_COMPOSITION_FLAGS: IFlagLabel[] = [
    { flag: LiquidCompositionEnum.Water, label: 'Water' },
    { flag: LiquidCompositionEnum.LiquidMethane, label: 'Liquid Methane' },
    { flag: LiquidCompositionEnum.LiquidEthane, label: 'Liquid Ethane' },
    { flag: LiquidCompositionEnum.LiquidNitrogen, label: 'Liquid Nitrogen' },
    { flag: LiquidCompositionEnum.LiquidAmmonia, label: 'Liquid Ammonia' },
    { flag: LiquidCompositionEnum.LiquidSulfur, label: 'Liquid Sulfur' },
    { flag: LiquidCompositionEnum.Brine, label: 'Brine' },
];

export const VEGETATION_FLAGS: IFlagLabel[] = [
    { flag: VegetationEnum.Grass, label: 'Grass' },
    { flag: VegetationEnum.Trees, label: 'Trees' },
    { flag: VegetationEnum.Cacti, label: 'Cacti' },
    { flag: VegetationEnum.Algae, label: 'Algae' },
    { flag: VegetationEnum.Fungus, label: 'Fungus' },
    { flag: VegetationEnum.Moss, label: 'Moss' },
    { flag: VegetationEnum.Shrubs, label: 'Shrubs' },
    { flag: VegetationEnum.Kelp, label: 'Kelp' },
];

/**
 * Join every set bit of a flag enum into a comma-separated label list. Returns `emptyLabel` for
 * a zero value — which is a real, confirmed reading ("airless", "no liquid"), not missing data.
 */
export function formatFlagLabels(
    value: number,
    entries: IFlagLabel[],
    emptyLabel = 'None'
): string {
    const labels = entries.filter((entry) => (value & entry.flag) !== 0).map((e) => e.label);
    return labels.length > 0 ? labels.join(', ') : emptyLabel;
}

/** Display label for a planet subtype ("solid" → "Terrestrial"). */
export function planetSubTypeLabel(planetType: PlanetTypeEnum): string {
    switch (planetType) {
        case PlanetTypeEnum.GasGiant:
            return 'Gas Giant';
        case PlanetTypeEnum.IceGiant:
            return 'Ice Giant';
        case PlanetTypeEnum.Terrestrial:
            return 'Terrestrial';
        case PlanetTypeEnum.Volcanic:
            return 'Volcanic';
        case PlanetTypeEnum.Ocean:
            return 'Ocean';
        case PlanetTypeEnum.Frozen:
            return 'Frozen';
        case PlanetTypeEnum.Desert:
            return 'Desert';
        case PlanetTypeEnum.Temperate:
            return 'Temperate';
        default:
            return 'Unknown';
    }
}

/** Display label for a moon subtype. */
export function moonSubTypeLabel(moonType: MoonTypeEnum): string {
    switch (moonType) {
        case MoonTypeEnum.Terrestrial:
            return 'Terrestrial';
        case MoonTypeEnum.Temperate:
            return 'Temperate';
        case MoonTypeEnum.Volcanic:
            return 'Volcanic';
        case MoonTypeEnum.Ocean:
            return 'Ocean';
        case MoonTypeEnum.Frozen:
            return 'Frozen';
        case MoonTypeEnum.Desert:
            return 'Desert';
        default:
            return 'Unknown';
    }
}
