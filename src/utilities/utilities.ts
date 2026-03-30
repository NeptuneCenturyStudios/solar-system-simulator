import { Body } from '../bodies/body';

// Bitwise flags for body classification (can be OR'd together)
// Extended with Gas/Ice giants and dwarf planets for more detailed types
export const BodyType = Object.freeze({
    None: 0,
    Star: 1 << 0,
    Planet: 1 << 1,
    Moon: 1 << 2,
    Asteroid: 1 << 3,
    Comet: 1 << 4,
    BlackHole: 1 << 5,
    GasGiant: 1 << 6,
    IceGiant: 1 << 7,
    DwarfPlanet: 1 << 8,
    SpaceShip: 1 << 9,
});

export enum BodyTypeEnum {
    None = 0,
    Star = 1 << 0,
    Planet = 1 << 1,
    Moon = 1 << 2,
    Asteroid = 1 << 3,
    Comet = 1 << 4,
    BlackHole = 1 << 5,
    GasGiant = 1 << 6,
    IceGiant = 1 << 7,
    DwarfPlanet = 1 << 8,
    SpaceShip = 1 << 9,
}

// Shared body-type helper. Checks bodyType flags only.
export function isBodyType(body: Body, type) {
    return !!(body && body.bodyType && body.bodyType & type);
}

// Utility to pick a random element from an array
export function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function createUniqueId(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}
