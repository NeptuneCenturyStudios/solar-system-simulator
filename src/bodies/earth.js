import * as THREE from '../vendors/three.module.js';
import { calculateTrajectory } from '../physics/physics.js';
import { SUN_MASS, EARTH_MASS, EARTH_DIST, EARTH_RADIUS } from '../utilities/consts.js';
import { BodyType } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { CelestialBody } from './celestial-body.js';

const earthDayTexture = loadSrgbTexture('./assets/textures/earth_day.jpg');
const earthCloudsTexture = loadSrgbTexture('./assets/textures/earth_clouds.jpg');
earthCloudsTexture.wrapS = THREE.RepeatWrapping;
earthCloudsTexture.wrapT = THREE.RepeatWrapping;

export class Earth extends CelestialBody {
    constructor(dependencies, scene) {
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
            earthTrajectory.pos.toArray(),
            earthTrajectory.vel.toArray(),
            EARTH_MASS, // Mass
            'camEarth',
            'Earth',
            BodyType.Planet,
            0x00ffff,
            4500,
            false,
            false,
            false,
            { axis: [0, 1, 0], speed: 0.3 },
            null,
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
        // Make cloud sphere selectable (raycaster maps back to owning body)
        this.clouds.userData = { parentBody: this };
        this.mesh.add(this.clouds);

        // Clouds rotate slightly faster than Earth to simulate moving atmosphere.
        this.cloudRotationSpeed = 0.18;
    }

    update(acc, dt) {
        super.update(acc, dt);
    }
}
