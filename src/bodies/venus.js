import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { SUN_MASS, VENUS_DIST, VENUS_MASS } from '../utilities/consts.js';
import { BodyType, createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { CelestialBody } from './celestial-body.js';

const venusTexture = loadSrgbTexture('./assets/textures/venus.jpg');
const venusAtmosphereTexture = loadSrgbTexture('./assets/textures/venus_atmosphere.jpg');

export class Venus extends CelestialBody {
    constructor(dependencies, scene) {
        const trajectory = calculateTrajectory(VENUS_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: venusTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        super(
            dependencies,
            scene,
            7.6, // 0.950 × Earth
            0xffc649,
            trajectory.pos.toArray(),
            trajectory.vel.toArray(),
            VENUS_MASS,
            createUniqueId('venus'),
            'Venus',
            BodyType.Planet,
            0xffdd88,
            3500,
            false,
            true,
            false,
            { axis: [0, 1, 0], speed: -0.08 },
            null,
            material
        );

        // Cloud / atmosphere layer (similar to Earth clouds)
        const cloudsMat = new THREE.MeshStandardMaterial({
            map: venusAtmosphereTexture,
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

        // Give the atmosphere a subtle drift for visual interest.
        this.cloudRotationSpeed = 0.12;
    }

    update(acc, dt) {
        super.update(acc, dt);
    }
}
