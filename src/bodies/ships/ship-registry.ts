import * as THREE from 'three';
import { Spaceship } from './spaceship';
import { Zenith } from './zenith';
import { StarDestroyer } from './star-destroyer';
import { OsirisMothership } from './osirus-mothership';
/**
 * Describes a selectable ship type for the Flight Controls ship dropdown.
 * All ships share the same constructor signature, so the registry can
 * instantiate any ship uniformly.
 */
export interface IShipType {
    /** Stable identifier; also used as the `<option value>` in the dropdown. */
    id: string;
    /** Human-readable name shown in the dropdown. */
    label: string;
    create(
        dependencies: object,
        scene: THREE.Scene,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        id: string
    ): Spaceship;
}

/**
 * Registry of all spawnable ship types.  The Flight Controls dropdown is
 * populated from this array, so adding a new ship class is a one-line entry
 * here (plus its class and model files).
 */
export const SHIP_TYPES: IShipType[] = [
    {
        id: 'zenith',
        label: 'Zenith',
        create: (dependencies, scene, position, velocity, id) =>
            new Zenith(dependencies, scene, position, velocity, id),
    },
    {
        id: 'star_destroyer',
        label: 'Star Destroyer',
        create: (dependencies, scene, position, velocity, id) =>
            new StarDestroyer(dependencies, scene, position, velocity, id),
    },
    {
        id: 'osiris_mothership',
        label: 'Osiris Mothership',
        create: (dependencies, scene, position, velocity, id) =>
            new OsirisMothership(dependencies, scene, position, velocity, id),
    },
];

/** Resolve a ship type id to its registry entry, falling back to the first. */
export function getShipTypeById(id: string | null | undefined): IShipType {
    const match = SHIP_TYPES.find((shipType) => shipType.id === id);
    return match ?? SHIP_TYPES[0];
}
