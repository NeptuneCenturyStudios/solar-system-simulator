import { Star, IStarCreationOptions } from './star';
import { IStateDependencies } from '../interfaces';
import { loadSrgbTexture } from '../drawing/textures';
import { BodyTypeEnum } from '../utilities/utilities';
import { IRotation } from '../physics/physics';
import * as THREE from 'three';
import { SCALE_FACTOR, SUN_MASS } from '../utilities/consts';

const WHITE_DWARF_RADIUS = 8 * SCALE_FACTOR;

/**
 * Computes the radius of a white dwarf for a given mass using the inverse cubic root relationship:
 *   R = WHITE_DWARF_RADIUS * (SUN_MASS / mass)^(1/3)
 * No clamping is applied.
 * @param mass The mass of the white dwarf (simulation units)
 * @returns The radius of the white dwarf (simulation units)
 */
function massToWhiteDwarfRadius(mass: number): number {
    return WHITE_DWARF_RADIUS * Math.pow(SUN_MASS / mass, 1 / 3);
}

const WHITE_DWARF_TEMPERATURE = 10000;
const WHITE_DWARF_LIGHT_INTENSITY = 10000000;
const WHITE_DWARF_LIGHT_DISTANCE = 500;

export class WhiteDwarf extends Star {
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        pos: THREE.Vector3,
        mass: number,
        id: string,
        name: string,
        rotation: IRotation
    ) {
        const whiteDwarfTexture = loadSrgbTexture('./assets/textures/white_dwarf.jpg');

        // Mass to radius relationship for white dwarfs (no clamping)
        const radius = massToWhiteDwarfRadius(mass);

        const options: IStarCreationOptions = {
            pos,
            vel: new THREE.Vector3(0, 0, 0),
            mass,
            radius,
            id,
            name,
            temperature: WHITE_DWARF_TEMPERATURE,
            lightIntensity: WHITE_DWARF_LIGHT_INTENSITY,
            lightDistance: WHITE_DWARF_LIGHT_DISTANCE,
            rotation,
        };

        const textures = {
            sunTexture: whiteDwarfTexture,
            redStarTexture: null,
            orangeStarTexture: null,
            whiteStarTexture: null,
            blueStarTexture: null,
            whiteDwarfTexture: whiteDwarfTexture,
            brownDwarfTexture: null,
        };

        super(dependencies, scene, options, textures);

        this.bodyType = BodyTypeEnum.WhiteDwarf | BodyTypeEnum.Star;
    }
}
