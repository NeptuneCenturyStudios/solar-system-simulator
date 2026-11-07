import * as THREE from 'three';
import { Spaceship } from './spaceship';
import { Zenith } from './zenith';
import { Dart } from './dart';
import { OsirisMothership } from './osirus-mothership';
import { HarbingerMothership } from './harbinger-mothership';
import { Wraith } from './wraith';
import { Stinger } from './stinger';
import { ShipTeam, TEAM_ALIEN, TEAM_EARTH } from './ship-team';

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
    /** The team this ship class fights for by default (scenarios may override it). */
    defaultTeam: ShipTeam;
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
        defaultTeam: TEAM_EARTH,
        create: (dependencies, scene, position, velocity, id) =>
            new Zenith(dependencies, scene, position, velocity, id),
    },
    {
        id: 'dart',
        label: 'Dart',
        defaultTeam: TEAM_EARTH,
        create: (dependencies, scene, position, velocity, id) =>
            new Dart(dependencies, scene, position, velocity, id),
    },
    {
        id: 'osiris_mothership',
        label: 'Osiris Mothership',
        defaultTeam: TEAM_EARTH,
        create: (dependencies, scene, position, velocity, id) =>
            new OsirisMothership(dependencies, scene, position, velocity, id),
    },
    {
        id: 'harbinger_mothership',
        label: 'Harbinger Mothership',
        defaultTeam: TEAM_ALIEN,
        create: (dependencies, scene, position, velocity, id) =>
            new HarbingerMothership(dependencies, scene, position, velocity, id),
    },
    {
        id: 'wraith',
        label: 'Wraith',
        defaultTeam: TEAM_ALIEN,
        create: (dependencies, scene, position, velocity, id) =>
            new Wraith(dependencies, scene, position, velocity, id),
    },
    {
        id: 'stinger',
        label: 'Stinger',
        defaultTeam: TEAM_ALIEN,
        create: (dependencies, scene, position, velocity, id) =>
            new Stinger(dependencies, scene, position, velocity, id),
    },
];

/** Resolve a ship type id to its registry entry, falling back to the first. */
export function getShipTypeById(id: string | null | undefined): IShipType {
    const match = SHIP_TYPES.find((shipType) => shipType.id === id);
    return match ?? SHIP_TYPES[0];
}
