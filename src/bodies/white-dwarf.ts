import { Star } from './star';
import { IStateDependencies } from '../interfaces';
import { loadSrgbTexture } from '../drawing/textures';
import { SUN_LIGHT_INTENSITY } from '../utilities/consts';
import { IRotation } from '../interfaces';
import * as THREE from 'three';
import { EARTH_RADIUS, SUN_MASS } from '../utilities/consts';
import { BodyTypeEnum } from './body-enums';

const WHITE_DWARF_RADIUS = EARTH_RADIUS;

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
const WHITE_DWARF_LIGHT_INTENSITY = SUN_LIGHT_INTENSITY * 0.0001; // White dwarfs are much dimmer than main sequence stars
// Update the light distance to match the dimmer intensity, so that the light falls off appropriately in the simulation.
const WHITE_DWARF_LIGHT_DISTANCE = SUN_LIGHT_INTENSITY / WHITE_DWARF_LIGHT_INTENSITY * 1000; // Scale distance based on intensity ratio

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

        const geometry = new THREE.SphereGeometry(radius, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            map: whiteDwarfTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.95,
        });
        const mesh = new THREE.Mesh(geometry, material);

        const textures = {
            sunTexture: whiteDwarfTexture,
            redStarTexture: null,
            orangeStarTexture: null,
            whiteStarTexture: null,
            blueStarTexture: null,
            whiteDwarfTexture: whiteDwarfTexture,
            brownDwarfTexture: null,
        };

        super(
            dependencies,
            scene,
            {
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
                mesh: mesh,
            },
            textures
        );

        this.bodyType = BodyTypeEnum.WhiteDwarf | BodyTypeEnum.Star;
    }
}
