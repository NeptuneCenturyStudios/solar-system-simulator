import * as THREE from 'three';
import { calculateTrajectory, IRotation } from '../physics/physics.js';
import { SUN_MASS, EARTH_MASS, EARTH_DIST, EARTH_RADIUS, EARTH_AXIS, EARTH_ROT_SPEED } from '../utilities/consts.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { CelestialBody } from './celestial-body';
import { IStateDependencies } from '../interfaces.js';

const earthDayTexture = loadSrgbTexture('./assets/textures/earth_day.jpg');
const earthCloudsTexture = loadSrgbTexture('./assets/textures/earth_clouds.jpg');
earthCloudsTexture.wrapS = THREE.RepeatWrapping;
earthCloudsTexture.wrapT = THREE.RepeatWrapping;

/**
 * Represents the planet Earth in the simulation, including its surface and cloud layer.
 * Sets up Earth's trajectory, material, and cloud rendering.
 */
export class Earth extends CelestialBody {
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

        // Earth's rotation axis is tilted about 23.5 degrees to simulate seasons, and it rotates once per day.
        // Need to convert the axis degree tilt to a rotation axis vector. The tilt is around the X-axis, so we can calculate the rotation axis as follows:
        const tiltRad = EARTH_AXIS * Math.PI / 180;
        const rotation: IRotation = {
            axis: new THREE.Vector3(Math.sin(tiltRad), Math.cos(tiltRad), 0).normalize(),
            speed: EARTH_ROT_SPEED
        };

        super(
            dependencies,
            scene,
            EARTH_RADIUS,
            0x2266ff,
            earthTrajectory.pos,
            earthTrajectory.vel,
            EARTH_MASS, // Mass
            createUniqueId('earth'),
            'Earth',
            BodyTypeEnum.Planet,
            0xffffff,
            4500,
            false,
            rotation,
            undefined,
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
        this.cloudRotationSpeed = 0.18;
    }

    update(acc: THREE.Vector3, dt: number) {
        super.update(acc, dt);
    }
}
