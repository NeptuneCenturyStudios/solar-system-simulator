/**
 * Turns a body's hidden science data into display rows for the Phase 3.3 attributes modal.
 * Pure — no THREE.js or scene references — so the sim side builds the rows and hands Vue plain
 * strings, the same way sim-bridge.ts snapshots bodies instead of exposing live Body objects.
 */

import type { IPlanetaryAttributes } from './body-attributes';
import {
    ATMOSPHERIC_GAS_FLAGS,
    CORE_TYPE_LABELS,
    formatFlagLabels,
    LIFEFORM_BASE_LABELS,
    LIQUID_COMPOSITION_FLAGS,
    SOIL_COMPOSITION_FLAGS,
    VEGETATION_FLAGS,
} from './body-attribute-labels';
import { formatETA, formatMass, formatRadius } from '../utilities/display-format';

/** Placeholder shown for an attribute the player has not yet discovered. */
export const UNDISCOVERED_PLACEHOLDER = '???';

/** Shown where a value genuinely does not apply — e.g. the orbital period of a central star. */
export const NOT_APPLICABLE_PLACEHOLDER = '—';

/** One label/value line in the attributes modal. */
export interface IBodyAttributeRow {
    /** Stable key for Vue's `v-for` (attribute name, e.g. "coreType"). */
    key: string;
    label: string;
    /** Formatted value, or UNDISCOVERED_PLACEHOLDER when `discovered` is false. */
    value: string;
    /** False renders the row dimmed as not-yet-scanned. */
    discovered: boolean;
}

/** Live periods resolved by the sim side; null when unavailable or still undiscovered. */
export interface IBodyPeriods {
    orbitalPeriod: number | null;
    rotationPeriod: number | null;
}

/** Always-known physical data, shown for every scannable body. */
export interface IBodyBasicData {
    typeLabel: string;
    /** Planet/moon subtype ("Temperate", "Gas Giant"), or null for other body types. */
    subTypeLabel: string | null;
    mass: number;
    radius: number;
    /** Surface temperature in Kelvin, for stars only. */
    temperatureKelvin: number | null;
}

/** Kelvin with its Celsius equivalent, e.g. "288 K (15 °C)". */
function formatTemperature(kelvin: number): string {
    const celsius = Math.round(kelvin - 273.15);
    return `${Math.round(kelvin).toLocaleString()} K (${celsius.toLocaleString()} °C)`;
}

/** A period in simulation seconds, or the placeholder when it isn't available. */
function formatPeriodRow(
    key: string,
    label: string,
    seconds: number | null,
    discovered: boolean,
    placeholder: string = UNDISCOVERED_PLACEHOLDER
): IBodyAttributeRow {
    const known = discovered && seconds !== null && Number.isFinite(seconds);
    return {
        key,
        label,
        value: known ? formatETA(seconds) : placeholder,
        discovered: known,
    };
}

/** Boolean attribute rows read as Yes/No rather than a raw flag. */
function formatBooleanRow(
    key: string,
    label: string,
    value: boolean,
    discovered: boolean
): IBodyAttributeRow {
    return {
        key,
        label,
        value: discovered ? (value ? 'Yes' : 'No') : UNDISCOVERED_PLACEHOLDER,
        discovered,
    };
}

/** Build the always-visible basic data rows. */
export function buildBasicRows(data: IBodyBasicData): IBodyAttributeRow[] {
    const rows: IBodyAttributeRow[] = [
        { key: 'type', label: 'Type', value: data.typeLabel, discovered: true },
    ];

    if (data.subTypeLabel) {
        rows.push({
            key: 'subType',
            label: 'Sub Type',
            value: data.subTypeLabel,
            discovered: true,
        });
    }

    rows.push(
        { key: 'mass', label: 'Mass', value: formatMass(data.mass), discovered: true },
        { key: 'radius', label: 'Radius', value: formatRadius(data.radius), discovered: true }
    );

    if (data.temperatureKelvin !== null && Number.isFinite(data.temperatureKelvin)) {
        rows.push({
            key: 'temperature',
            label: 'Surface Temperature',
            value: formatTemperature(data.temperatureKelvin),
            discovered: true,
        });
    }

    return rows;
}

/**
 * Build the discoverable science rows. Only fields the body actually carries are emitted —
 * gas/ice giants have no soil or liquid at all, so those rows are absent rather than shown
 * as permanently blank. Undiscovered fields render the placeholder.
 */
export function buildScienceRows(
    attributes: IPlanetaryAttributes | undefined,
    periods: IBodyPeriods
): IBodyAttributeRow[] {
    const rows: IBodyAttributeRow[] = [];

    if (!attributes) {
        // A body with no science payload (star, black hole, wormhole) has nothing to discover,
        // so a period it doesn't have reads as "not recorded" rather than "???".
        rows.push(
            formatPeriodRow(
                'orbitalPeriod',
                'Orbital Period',
                periods.orbitalPeriod,
                true,
                NOT_APPLICABLE_PLACEHOLDER
            ),
            formatPeriodRow(
                'rotationPeriod',
                'Rotation Period',
                periods.rotationPeriod,
                true,
                NOT_APPLICABLE_PLACEHOLDER
            )
        );
        return rows;
    }

    const { coreType, atmosphericComposition, soilComposition, liquidComposition } = attributes;

    if (coreType) {
        rows.push({
            key: 'coreType',
            label: 'Core Type',
            value: coreType.discovered ? CORE_TYPE_LABELS[coreType.value] : UNDISCOVERED_PLACEHOLDER,
            discovered: coreType.discovered,
        });
    }

    if (atmosphericComposition) {
        rows.push({
            key: 'atmosphericComposition',
            label: 'Atmosphere',
            value: atmosphericComposition.discovered
                ? formatFlagLabels(
                      atmosphericComposition.value,
                      ATMOSPHERIC_GAS_FLAGS,
                      'None (airless)'
                  )
                : UNDISCOVERED_PLACEHOLDER,
            discovered: atmosphericComposition.discovered,
        });
    }

    if (soilComposition) {
        rows.push({
            key: 'soilComposition',
            label: 'Soil Composition',
            value: soilComposition.discovered
                ? formatFlagLabels(soilComposition.value, SOIL_COMPOSITION_FLAGS)
                : UNDISCOVERED_PLACEHOLDER,
            discovered: soilComposition.discovered,
        });
    }

    if (liquidComposition) {
        rows.push({
            key: 'liquidComposition',
            label: 'Liquid Composition',
            value: liquidComposition.discovered
                ? formatFlagLabels(liquidComposition.value, LIQUID_COMPOSITION_FLAGS)
                : UNDISCOVERED_PLACEHOLDER,
            discovered: liquidComposition.discovered,
        });
    }

    if (attributes.averageTemperatureKelvin) {
        const temp = attributes.averageTemperatureKelvin;
        rows.push({
            key: 'averageTemperatureKelvin',
            label: 'Mean Temperature',
            value: temp.discovered ? formatTemperature(temp.value) : UNDISCOVERED_PLACEHOLDER,
            discovered: temp.discovered,
        });
    }

    if (attributes.vegetation) {
        rows.push({
            key: 'vegetation',
            label: 'Vegetation',
            value: attributes.vegetation.discovered
                ? formatFlagLabels(attributes.vegetation.value, VEGETATION_FLAGS)
                : UNDISCOVERED_PLACEHOLDER,
            discovered: attributes.vegetation.discovered,
        });
    }

    if (attributes.sentientLife) {
        rows.push(
            formatBooleanRow(
                'sentientLife',
                'Sentient Life',
                attributes.sentientLife.value,
                attributes.sentientLife.discovered
            )
        );
    }

    if (attributes.lifeformBase) {
        rows.push({
            key: 'lifeformBase',
            label: 'Lifeform Basis',
            value: attributes.lifeformBase.discovered
                ? LIFEFORM_BASE_LABELS[attributes.lifeformBase.value]
                : UNDISCOVERED_PLACEHOLDER,
            discovered: attributes.lifeformBase.discovered,
        });
    }

    const orbitalDiscovered = !!attributes.orbitalPeriod?.discovered;
    const rotationDiscovered = !!attributes.rotationPeriod?.discovered;

    rows.push(
        formatPeriodRow(
            'orbitalPeriod',
            'Orbital Period',
            periods.orbitalPeriod,
            orbitalDiscovered
        ),
        formatPeriodRow(
            'rotationPeriod',
            'Rotation Period',
            periods.rotationPeriod,
            rotationDiscovered
        )
    );

    return rows;
}

/** True when the body carries at least one discoverable science attribute. */
export function hasScienceData(attributes: IPlanetaryAttributes | undefined): boolean {
    if (!attributes) return false;
    return Boolean(
        attributes.coreType ||
        attributes.atmosphericComposition ||
        attributes.soilComposition ||
        attributes.liquidComposition ||
        attributes.averageTemperatureKelvin ||
        attributes.vegetation ||
        attributes.sentientLife ||
        attributes.lifeformBase
    );
}
