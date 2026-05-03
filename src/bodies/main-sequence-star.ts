
import { Star, IStarCreationOptions } from './star';
import { IStateDependencies } from '../interfaces';
import * as THREE from 'three';

/**
 * MainSequenceStar: A type of star with main sequence properties (minimal extension for now).
 */
export class MainSequenceStar extends Star {
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
