/** Static option lists for the Add/Edit Object panel. */

export interface SelectOption {
    value: string;
    label: string;
}

export interface SelectOptionGroup {
    label: string;
    options: SelectOption[];
}

/** Every body the default solar system creates, grouped the way the System Explorer reads. */
export const PRESET_BODY_GROUPS: SelectOptionGroup[] = [
    { label: 'Stars', options: [{ value: 'sun', label: 'Sun' }] },
    {
        label: 'Planets',
        options: [
            { value: 'mercury', label: 'Mercury' },
            { value: 'venus', label: 'Venus' },
            { value: 'earth', label: 'Earth' },
            { value: 'mars', label: 'Mars' },
            { value: 'jupiter', label: 'Jupiter' },
            { value: 'saturn', label: 'Saturn' },
            { value: 'uranus', label: 'Uranus' },
            { value: 'neptune', label: 'Neptune' },
        ],
    },
    {
        label: 'Dwarf Planets',
        options: [
            { value: 'ceres', label: 'Ceres' },
            { value: 'pluto', label: 'Pluto' },
        ],
    },
    {
        label: 'Moons',
        options: [
            { value: 'earth_moon', label: 'Moon (Earth)' },
            { value: 'io', label: 'Io (Jupiter)' },
            { value: 'europa', label: 'Europa (Jupiter)' },
            { value: 'ganymede', label: 'Ganymede (Jupiter)' },
            { value: 'callisto', label: 'Callisto (Jupiter)' },
            { value: 'titan', label: 'Titan (Saturn)' },
            { value: 'charon', label: 'Charon (Pluto)' },
        ],
    },
    {
        label: 'Asteroids',
        options: [
            { value: 'vesta', label: 'Vesta' },
            { value: 'pallas', label: 'Pallas' },
            { value: 'hygiea', label: 'Hygiea' },
        ],
    },
    { label: 'Comets', options: [{ value: 'halley', label: "Halley's Comet" }] },
    { label: 'Spacecraft', options: [{ value: 'iss', label: 'ISS (Earth)' }] },
];

/** Body types the custom form can create. */
export const BODY_TYPE_OPTIONS: SelectOption[] = [
    { value: 'sun', label: 'Star' },
    { value: 'planet', label: 'Planet' },
    { value: 'moon', label: 'Moon' },
    { value: 'asteroid', label: 'Asteroid' },
    { value: 'comet', label: 'Comet' },
    { value: 'black_hole', label: 'Black Hole' },
    { value: 'wormhole', label: 'Wormhole' },
];

export const PLANET_TYPE_OPTIONS: SelectOption[] = [
    { value: 'solid', label: 'Solid' },
    { value: 'gas_giant', label: 'Gas Giant' },
    { value: 'ice_giant', label: 'Ice Giant' },
    { value: 'temperate', label: 'Temperate' },
    { value: 'volcanic', label: 'Volcanic' },
    { value: 'frozen', label: 'Frozen' },
    { value: 'ocean', label: 'Ocean' },
    { value: 'desert', label: 'Desert' },
];

export const MOON_TYPE_OPTIONS: SelectOption[] = [
    { value: 'solid', label: 'Solid' },
    { value: 'temperate', label: 'Temperate' },
    { value: 'volcanic', label: 'Volcanic' },
    { value: 'ocean', label: 'Ocean' },
    { value: 'frozen', label: 'Frozen' },
    { value: 'desert', label: 'Desert' },
];

/** Readable label for a planet/moon subtype key, or the key itself when unknown. */
export function subtypeLabel(key: string): string {
    return PLANET_TYPE_OPTIONS.find((o) => o.value === key)?.label ?? key;
}
