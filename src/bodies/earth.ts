import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { SUN_MASS, EARTH_MASS, EARTH_DIST, EARTH_RADIUS, EARTH_AXIS, EARTH_ROT_SPEED } from '../utilities/consts.js';
import { createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet.js';
import { PlanetTypeEnum } from '../utilities/body-params.js';

const earthDayTexture = loadSrgbTexture('./assets/textures/earth_day.jpg');
const earthCloudsTexture = loadSrgbTexture('./assets/textures/earth_clouds.jpg');
earthCloudsTexture.wrapS = THREE.RepeatWrapping;
earthCloudsTexture.wrapT = THREE.RepeatWrapping;

/**
 * Represents the planet Earth in the simulation, including its surface and cloud layer.
 * Sets up Earth's trajectory, material, and cloud rendering.
 */
export class Earth extends Planet {
    /**
     * Constructs a new Earth object with its unique properties, orbit, and cloud layer.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Earth belongs.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        const earthTrajectory = calculateTrajectory(dependencies.getG(), EARTH_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: earthDayTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        super(
            dependencies,
            scene,
            {
                id: createUniqueId('earth'),
                name: 'Earth',
                mass: EARTH_MASS,
                radius: EARTH_RADIUS,
                pos: earthTrajectory.pos,
                vel: earthTrajectory.vel,
                rotation: {
                    tilt: EARTH_AXIS,
                    speed: EARTH_ROT_SPEED,
                },
                trailColor: 0x88ccff,
                maxTrail: 4500,
                bodySubtype: PlanetTypeEnum.Terrestrial,
            },
            material
        );

        // Cloud layer (UV sphere slightly above surface)
        const cloudsMat = new THREE.MeshStandardMaterial({
            map: earthCloudsTexture,
            color: 0xffffff,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            roughness: 1.0,
            metalness: 0.0,
        });

        const cloudsGeo = new THREE.SphereGeometry(this.radius * 1.03, 32, 32);
        this.clouds = new THREE.Mesh(cloudsGeo, cloudsMat);
        this.clouds.renderOrder = 2;
        this.clouds.receiveShadow = true;
        // Make cloud sphere selectable (raycaster maps back to owning body)
        this.clouds.userData = { parentBody: this };
        this.mesh.add(this.clouds);

        // Clouds rotate slightly faster than Earth to simulate moving atmosphere.
        this.cloudRotationSpeed = EARTH_ROT_SPEED * 1.3;
    }

    update(acc: THREE.Vector3, dt: number) {
        super.update(acc, dt);
    }
}
