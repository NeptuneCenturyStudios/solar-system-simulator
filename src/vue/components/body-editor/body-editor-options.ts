/** Static option lists for the Add/Edit Object panel. */
import {
    BodyTypeKeyEnum,
    MoonTypeEnum,
    PlanetTypeEnum,
    PresetBodyKeyEnum,
} from '../../../bodies/body-enums';

export interface SelectOption<T extends string = string> {
    value: T;
    label: string;
}

export interface SelectOptionGroup<T extends string = string> {
    label: string;
    options: SelectOption<T>[];
}

/** Whether the Add panel creates a real solar system preset or a custom body. */
export enum AddBodyModeEnum {
    Preset = 'preset',
    Custom = 'custom',
}

/** Every body the default solar system creates, grouped the way the System Explorer reads. */
export const PRESET_BODY_GROUPS: SelectOptionGroup<PresetBodyKeyEnum>[] = [
    { label: 'Stars', options: [{ value: PresetBodyKeyEnum.Sun, label: 'Sun' }] },
    {
        label: 'Planets',
        options: [
            { value: PresetBodyKeyEnum.Mercury, label: 'Mercury' },
            { value: PresetBodyKeyEnum.Venus, label: 'Venus' },
            { value: PresetBodyKeyEnum.Earth, label: 'Earth' },
            { value: PresetBodyKeyEnum.Mars, label: 'Mars' },
            { value: PresetBodyKeyEnum.Jupiter, label: 'Jupiter' },
            { value: PresetBodyKeyEnum.Saturn, label: 'Saturn' },
            { value: PresetBodyKeyEnum.Uranus, label: 'Uranus' },
            { value: PresetBodyKeyEnum.Neptune, label: 'Neptune' },
        ],
    },
    {
        label: 'Dwarf Planets',
        options: [
            { value: PresetBodyKeyEnum.Ceres, label: 'Ceres' },
            { value: PresetBodyKeyEnum.Pluto, label: 'Pluto' },
        ],
    },
    {
        label: 'Moons',
        options: [
            { value: PresetBodyKeyEnum.EarthMoon, label: 'Moon (Earth)' },
            { value: PresetBodyKeyEnum.Io, label: 'Io (Jupiter)' },
            { value: PresetBodyKeyEnum.Europa, label: 'Europa (Jupiter)' },
            { value: PresetBodyKeyEnum.Ganymede, label: 'Ganymede (Jupiter)' },
            { value: PresetBodyKeyEnum.Callisto, label: 'Callisto (Jupiter)' },
            { value: PresetBodyKeyEnum.Titan, label: 'Titan (Saturn)' },
            { value: PresetBodyKeyEnum.Charon, label: 'Charon (Pluto)' },
        ],
    },
    {
        label: 'Asteroids',
        options: [
            { value: PresetBodyKeyEnum.Vesta, label: 'Vesta' },
            { value: PresetBodyKeyEnum.Pallas, label: 'Pallas' },
            { value: PresetBodyKeyEnum.Hygiea, label: 'Hygiea' },
        ],
    },
    { label: 'Comets', options: [{ value: PresetBodyKeyEnum.Halley, label: "Halley's Comet" }] },
    { label: 'Spacecraft', options: [{ value: PresetBodyKeyEnum.Iss, label: 'ISS (Earth)' }] },
];

/** Body types the custom form can create. */
export const BODY_TYPE_OPTIONS: SelectOption<BodyTypeKeyEnum>[] = [
    { value: BodyTypeKeyEnum.Star, label: 'Star' },
    { value: BodyTypeKeyEnum.Planet, label: 'Planet' },
    { value: BodyTypeKeyEnum.Moon, label: 'Moon' },
    { value: BodyTypeKeyEnum.Asteroid, label: 'Asteroid' },
    { value: BodyTypeKeyEnum.Comet, label: 'Comet' },
    { value: BodyTypeKeyEnum.BlackHole, label: 'Black Hole' },
    { value: BodyTypeKeyEnum.Wormhole, label: 'Wormhole' },
];

export const PLANET_TYPE_OPTIONS: SelectOption<PlanetTypeEnum>[] = [
    { value: PlanetTypeEnum.Terrestrial, label: 'Solid' },
    { value: PlanetTypeEnum.GasGiant, label: 'Gas Giant' },
    { value: PlanetTypeEnum.IceGiant, label: 'Ice Giant' },
    { value: PlanetTypeEnum.Temperate, label: 'Temperate' },
    { value: PlanetTypeEnum.Volcanic, label: 'Volcanic' },
    { value: PlanetTypeEnum.Frozen, label: 'Frozen' },
    { value: PlanetTypeEnum.Ocean, label: 'Ocean' },
    { value: PlanetTypeEnum.Desert, label: 'Desert' },
];

export const MOON_TYPE_OPTIONS: SelectOption<MoonTypeEnum>[] = [
    { value: MoonTypeEnum.Terrestrial, label: 'Solid' },
    { value: MoonTypeEnum.Temperate, label: 'Temperate' },
    { value: MoonTypeEnum.Volcanic, label: 'Volcanic' },
    { value: MoonTypeEnum.Ocean, label: 'Ocean' },
    { value: MoonTypeEnum.Frozen, label: 'Frozen' },
    { value: MoonTypeEnum.Desert, label: 'Desert' },
];

/** Readable label for a planet/moon subtype key, or the key itself when unknown. */
export function subtypeLabel(key: string): string {
    return PLANET_TYPE_OPTIONS.find((o) => o.value === key)?.label ?? key;
}
