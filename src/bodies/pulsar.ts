import { Star, IStarCreationOptions } from './star';
import { IStateDependencies } from '../interfaces';
import * as THREE from 'three';

/**
 * Pulsar: A type of star with special properties (minimal extension for now).
 */
export class Pulsar extends Star {
	constructor(
		dependencies: IStateDependencies,
		scene: THREE.Scene,
		options: IStarCreationOptions,
		textures: {
			sunTexture: THREE.Texture;
			redStarTexture: THREE.Texture;
			orangeStarTexture: THREE.Texture;
			whiteStarTexture: THREE.Texture;
			blueStarTexture: THREE.Texture;
			whiteDwarfTexture: THREE.Texture;
			brownDwarfTexture: THREE.Texture;
		}
	) {
		super(dependencies, scene, options, textures);
	}
}
