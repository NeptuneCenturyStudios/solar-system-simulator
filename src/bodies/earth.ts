import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { SUN_MASS, EARTH_MASS, EARTH_DIST, EARTH_RADIUS } from '../utilities/consts.js';
import { BodyType, createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { CelestialBody } from './celestial-body.js';
import { IStateDependencies } from '../interfaces.js';

const earthDayTexture = loadSrgbTexture('./assets/textures/earth_day.jpg');
const earthCloudsTexture = loadSrgbTexture('./assets/textures/earth_clouds.jpg');
earthCloudsTexture.wrapS = THREE.RepeatWrapping;
earthCloudsTexture.wrapT = THREE.RepeatWrapping;

export class Earth extends CelestialBody {
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        const earthTrajectory = calculateTrajectory(EARTH_DIST, SUN_MASS);

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
            EARTH_RADIUS,
            0x2266ff,
            earthTrajectory.pos,
            earthTrajectory.vel,
            EARTH_MASS, // Mass
            createUniqueId('earth'),
            'Earth',
            BodyType.Planet,
            0xffffff,
            4500,
            false,
            { axis: new THREE.Vector3(0, 1, 0), speed: 0.3 },
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
