import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Body } from './body.js';
import { ShipTrail } from './ship-trail.js';
import { BodyTypeEnum } from '../utilities/utilities.js';
import { SCALE_FACTOR } from '../utilities/consts.js';

const SF = SCALE_FACTOR;

/**
 * Player-controllable spaceship body.
 * Ship local axes: +Z = forward, +Y = up, +X = right.
 * Geometry is assembled from merged primitives scaled by SCALE_FACTOR.
 * Extends Body so gravity applies automatically when added to simulationState.bodies.
 */
export class Spaceship extends Body {
    radius: number;
    /** Local-space offset for 1st-person cockpit camera. */
    cockpitOffset: THREE.Vector3;
    /** Local-space offset for 3rd-person chase camera. */
    thirdPersonOffset: THREE.Vector3;
    /** Local-space offset to the engine nozzle (used for the trail origin). */
    thrusterOffset: THREE.Vector3;
    /** Glowing engine exhaust trail rendered as a connected line in world space. */
    trail: ShipTrail;

    constructor(
        dependencies: object,
        scene: THREE.Scene,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        id: string
    ) {
        // ── Geometry ──────────────────────────────────────────────────────────
        // All parts are authored in local space where +Z is forward (ship nose).
        // CylinderGeometry is Y-up by default; rotate 90° around X to align it to Z.

        // Main hull — elongated cylinder, slightly wider at the rear
        const hull = new THREE.CylinderGeometry(0.18 * SF, 0.32 * SF, 1.6 * SF, 8);
        hull.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));

        // Cockpit dome — sits on top-front of hull
        const cockpit = new THREE.SphereGeometry(0.22 * SF, 10, 8);
        cockpit.applyMatrix4(
            new THREE.Matrix4().makeTranslation(0, 0.28 * SF, 0.52 * SF)
        );

        // Left wing — swept-back flat box
        const wingL = new THREE.BoxGeometry(1.1 * SF, 0.06 * SF, 0.55 * SF);
        wingL.applyMatrix4(
            new THREE.Matrix4().makeTranslation(-0.72 * SF, -0.06 * SF, -0.12 * SF)
        );

        // Right wing (mirror of left)
        const wingR = new THREE.BoxGeometry(1.1 * SF, 0.06 * SF, 0.55 * SF);
        wingR.applyMatrix4(
            new THREE.Matrix4().makeTranslation(0.72 * SF, -0.06 * SF, -0.12 * SF)
        );

        // Engine nacelle — left
        const nacL = new THREE.CylinderGeometry(0.07 * SF, 0.1 * SF, 0.65 * SF, 6);
        nacL.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        nacL.applyMatrix4(
            new THREE.Matrix4().makeTranslation(-0.3 * SF, -0.1 * SF, -0.58 * SF)
        );

        // Engine nacelle — right
        const nacR = new THREE.CylinderGeometry(0.07 * SF, 0.1 * SF, 0.65 * SF, 6);
        nacR.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        nacR.applyMatrix4(
            new THREE.Matrix4().makeTranslation(0.3 * SF, -0.1 * SF, -0.58 * SF)
        );

        const merged = mergeGeometries([hull, cockpit, wingL, wingR, nacL, nacR]);
        // mergeGeometries returns null if all geometries have the same attribute count.
        // Fall back to a simple box so the ship is still spawnable.
        const geometry = merged ?? new THREE.BoxGeometry(2 * SF, 0.5 * SF, 1.5 * SF);

        // Center the geometry so the mesh origin sits at the bounding-box center.
        // Without this the roll axis passes above/below the visual center of the ship
        // (the cockpit dome shifts the bbox upward), making the ship appear to orbit
        // a point rather than spin in place.
        geometry.computeBoundingBox();
        const geoCenter = new THREE.Vector3();
        if (geometry.boundingBox) {
            geometry.boundingBox.getCenter(geoCenter);
            geometry.translate(-geoCenter.x, -geoCenter.y, -geoCenter.z);
        }

        // ── Material ──────────────────────────────────────────────────────────
        const material = new THREE.MeshStandardMaterial({
            color: 0x7799bb,
            metalness: 0.85,
            roughness: 0.25,
            emissive: 0x001122,
            emissiveIntensity: 0.1,
        });

        // ── Base class ────────────────────────────────────────────────────────
        super(
            dependencies,
            scene,
            /* mass — tiny so it barely perturbs celestial orbits */ 0.05,
            position,
            velocity,
            geometry,
            material,
            id,
            'Spaceship',
            BodyTypeEnum.SpaceShip
        );

        // ── Ship-specific properties ──────────────────────────────────────────
        // Collision radius: half the total wingspan (wing tip to centre ≈ 0.72 + hull half-width)
        this.radius = 1.3 * SF;

        // 1st-person camera sits inside the cockpit dome.
        // geoCenter offset is subtracted so the offset matches the shifted geometry.
        this.cockpitOffset = new THREE.Vector3(0, 0.3 * SF - geoCenter.y, 0.52 * SF - geoCenter.z);

        // Engine nozzle — midpoint between the two nacelle exits at the rear.
        this.thrusterOffset = new THREE.Vector3(0, -0.1 * SF - geoCenter.y, -0.9 * SF - geoCenter.z);

        // 3rd-person camera: well behind and slightly above (large offset; geoCenter is negligible).
        this.thirdPersonOffset = new THREE.Vector3(0, 3 * SF, -8 * SF);

        // Shadows
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        // Engine exhaust trail (Line-based, no gaps at any speed)
        this.trail = new ShipTrail(scene);

        // Keep default label (shows in bodies table) but hide it during flight
        if (this.label) this.label.visible = false;
        if (this.labelLine) this.labelLine.visible = false;
    }
}
