import { Star, IStarCreationOptions } from './star';
import { IStateDependencies } from '../interfaces';
import { loadSrgbTexture } from '../drawing/textures';
import { BodyTypeEnum } from '../utilities/utilities';
import { IRotation } from '../physics/physics';
import * as THREE from 'three';

const WHITE_DWARF_RADIUS = 8;
const WHITE_DWARF_TEMPERATURE = 50000;
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

        const options: IStarCreationOptions = {
            pos,
            vel: new THREE.Vector3(0, 0, 0),
            mass,
            radius: WHITE_DWARF_RADIUS,
            id,
            name,
            temperature: WHITE_DWARF_TEMPERATURE,
            lightIntensity: WHITE_DWARF_LIGHT_INTENSITY,
            lightDistance: WHITE_DWARF_LIGHT_DISTANCE,
            rotation
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
