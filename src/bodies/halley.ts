import * as THREE from 'three';

import {
    SUN_MASS,
    COMET_PERIHELION_DIST,
    COMET_APHELION_DIST,
    COMET_RADIUS,
    COMET_MASS,
} from '../utilities/consts.js';

import { Comet } from './comet';
import { IStateDependencies } from '../interfaces.js';
import { MTLLoader, OBJLoader } from 'three/examples/jsm/Addons.js';

/**
 * Represents Halley's Comet in the simulation, with a realistic elliptical orbit and physical properties.
 * Inherits from Comet and sets up Halley-specific trajectory and material.
 */
export class Halley extends Comet {
    /**
     * Constructs a new Halley object with its unique elliptical orbit and properties.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Halley belongs.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        trueAnomaly: number = Math.PI
    ) {
        // Halley-like elliptical orbit
        const perihelion = COMET_PERIHELION_DIST; // Just outside Mars (scaled)
        const aphelion = COMET_APHELION_DIST; // Scaled
        const semiMajorAxis = (perihelion + aphelion) / 2;
        const ecc = (aphelion - perihelion) / (aphelion + perihelion);
        const semiLatusRectum = semiMajorAxis * (1 - ecc * ecc);
        const inclination = Math.PI / 6; // 30 degrees inclination

        // --- Fixed orbital plane basis vectors ---
        // ê_r: unit vector from sun toward periapsis (opposite of the original aphelion direction)
        const er = new THREE.Vector3(
            -Math.cos(Math.PI / 4),
            -Math.sin(inclination) * 0.5,
            -Math.sin(Math.PI / 4)
        ).normalize();

        // ê_t: in-plane tangential direction 90° ahead of periapsis (direction of motion at periapsis).
        // Derived from the original velocity direction at aphelion, then Gram-Schmidt
        // orthogonalized against ê_r so both vectors span the fixed orbital plane.
        const etRaw = new THREE.Vector3(
            Math.sin(Math.PI / 4) * Math.cos(inclination),
            -Math.sin(inclination) * 0.3,
            -Math.cos(Math.PI / 4) * Math.cos(inclination)
        );
        etRaw.addScaledVector(er, -etRaw.dot(er));
        const et = etRaw.normalize();

        // --- Kepler position and velocity at the given true anomaly ---
        const gEff = dependencies.getG();
        const nu = trueAnomaly;
        const r = semiLatusRectum / (1 + ecc * Math.cos(nu));

        const pos = new THREE.Vector3()
            .addScaledVector(er, r * Math.cos(nu))
            .addScaledVector(et, r * Math.sin(nu));

        // vis-viva perifocal formula: v = sqrt(GM/p) * [-sin(ν) ê_r + (e+cos(ν)) ê_t]
        const velScale = Math.sqrt((gEff * SUN_MASS) / semiLatusRectum);
        const vel = new THREE.Vector3()
            .addScaledVector(er, -velScale * Math.sin(nu))
            .addScaledVector(et, velScale * (ecc + Math.cos(nu)));

        // Geometry factory returns a placeholder geometry until OBJ loads
        const geometryFactory = () => new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const placeholderMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const placeholderMesh = new THREE.Mesh(geometryFactory(), placeholderMaterial);

        super(dependencies, scene, {
            pos,
            vel,
            mass: COMET_MASS,
            id: 'halley',
            name: 'Halley',
            radius: COMET_RADIUS,
            rotation: { tilt: 0, speed: 0.05 },
            trailColor: 0xaaaaaa,
            maxTrail: 2000,
            mesh: placeholderMesh,
        });

        // Async OBJ + MTL load for Comet model
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('./assets/models/');
        mtlLoader
            .loadAsync('asteroid1.mtl')
            .then((materials) => {
                materials.preload();
                const objLoader = new OBJLoader();
                objLoader.setMaterials(materials);
                return objLoader.loadAsync('./assets/models/asteroid.obj');
            })
            .then((group) => {
                // Compute bounding box of the unscaled model
                const bbox = new THREE.Box3().setFromObject(group);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const longestDim = Math.max(size.x, size.y, size.z);
                // Use this.radius to match the instance's radius
                const scale = this.radius / (longestDim * 0.5);
                group.scale.setScalar(scale);

                // Re-compute bbox after scaling to find the center
                group.updateMatrixWorld(true);
                const scaledBbox = new THREE.Box3().setFromObject(group);
                const center = new THREE.Vector3();
                scaledBbox.getCenter(center);
                group.position.sub(center);

                this.mesh.add(group);
            })
            .catch((e) => {
                console.warn('asteroid1 OBJ/MTL load failed — using placeholder mesh', e);
            });
    }
}
