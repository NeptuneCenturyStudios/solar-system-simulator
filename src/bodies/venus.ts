import * as THREE from 'three';
import { calculateTrajectory, IRotation } from '../physics/physics.js';
import { SUN_MASS, VENUS_AXIS, VENUS_DIST, VENUS_MASS, VENUS_RADIUS, VENUS_ROT_SPEED } from '../utilities/consts.js';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { CelestialBody } from './celestial-body';
import { IStateDependencies } from '../interfaces.js';

const venusTexture = loadSrgbTexture('./assets/textures/venus.jpg');
const venusAtmosphereTexture = loadSrgbTexture('./assets/textures/venus_atmosphere.jpg');

/**
 * Represents the planet Venus in the simulation, including its surface and cloud layer.
 * Sets up Venus's trajectory, material, and cloud rendering.
 */
export class Venus extends CelestialBody {
    /**
     * Constructs a new Venus object with its unique properties, orbit, and cloud layer.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Venus belongs.
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        const trajectory = calculateTrajectory(VENUS_DIST, SUN_MASS);

        const material = new THREE.MeshStandardMaterial({
            map: venusTexture,
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        // Venus's rotation axis is tilted about 177.4 degrees (retrograde rotation), and it rotates once every 243 Earth days.
        // Need to convert the axis degree tilt to a rotation axis vector. The tilt is around the X-axis, so we can calculate the rotation axis as follows:
        const tiltRad = VENUS_AXIS * Math.PI / 180;
                const rotation: IRotation = {
                    axis: new THREE.Vector3(Math.sin(tiltRad), Math.cos(tiltRad), 0).normalize(),
                    speed: VENUS_ROT_SPEED
                };

        super(
            dependencies,
            scene,
            VENUS_RADIUS,
            0xffc649,
            trajectory.pos,
            trajectory.vel,
            VENUS_MASS,
            createUniqueId('venus'),
            'Venus',
            BodyTypeEnum.Planet,
            0xffdd88,
            3500,
            false,
            rotation,
            undefined,
            material
        );

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
        this.clouds.userData = { parentBody: this };
        this.mesh.add(this.clouds);

        this.cloudRotationSpeed = VENUS_ROT_SPEED * 60; // Clouds rotate much faster than the surface
    }

    update(acc: THREE.Vector3, dt: number): void {
        super.update(acc, dt);
    }
}
