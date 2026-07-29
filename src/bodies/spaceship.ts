import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { Body } from './body';
import { SCALE_FACTOR, SPACESHIP_MASS, SPACESHIP_RADIUS } from '../utilities/consts.js';
import { IShipEffect } from '../ship-effects/ship-effect-base.js';
import { ShipFlame } from '../ship-effects/ship-flame.js';
import { BodyTypeEnum } from './body-enums';
import { WarpSoundController, playWarpLoop } from '../utilities/audio.js';
import { IDeathOptions, ISpaceshipHandling } from '../interfaces';
import { autopilotState, cameraState, flightState, simulationState } from '../simulation/simulation';


const SF = SCALE_FACTOR / SCALE_FACTOR;

/**
 * Player-controllable spaceship body.
 * Ship local axes: +Z = forward, +Y = up, +X = right.
 * Geometry is assembled from merged primitives scaled by SCALE_FACTOR.
 * Extends Body so gravity applies automatically when added to simulationState.bodies.
 */
export class Spaceship extends Body {
    /** Local-space offset for 1st-person cockpit camera. */
    cockpitOffset: THREE.Vector3;
    /** Local-space offset for 3rd-person chase camera. */
    thirdPersonOffset: THREE.Vector3;
    /** Local-space offset to the engine nozzle (used for the trail origin). */
    thrusterOffset: THREE.Vector3;
    /** Glowing engine exhaust trail rendered as a connected line in world space. */
    trail: IShipEffect;
    /** Handling characteristics of the spaceship. */
    handling: ISpaceshipHandling;

    /** Active warp loop sound controller, or null if not currently playing. */
    private _warpSound: WarpSoundController | null = null;

    /**
     * Constructs a new Spaceship object with camera offsets and placeholder geometry.
     * @param dependencies External dependencies for the spaceship.
     * @param scene The THREE.Scene to which the spaceship belongs.
     * @param position The initial position of the spaceship.
     * @param velocity The initial velocity of the spaceship.
     * @param id Unique identifier for the spaceship.
     * @param modelName Base filename (without extension) of the OBJ/MTL model to load.
     * @param handling The handling characteristics of the spaceship.
     */
    constructor(
        dependencies: object,
        scene: THREE.Scene,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        id: string,
        modelName: string = 'Lo_poly_Spaceship_01_by_Liz_Reddington',
        handling: ISpaceshipHandling
    ) {
        // Invisible placeholder mesh — replaced by the loaded OBJ group once ready.
        const placeholderGeometry = new THREE.BoxGeometry(0.001, 0.001, 0.001);
        const placeholderMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const placeholderMesh = new THREE.Mesh(placeholderGeometry, placeholderMaterial);

        // ── Base class ────────────────────────────────────────────────────────
        super(
            dependencies,
            scene,
            SPACESHIP_MASS,
            SPACESHIP_RADIUS,
            position,
            velocity,
            placeholderMesh,
            id,
            'Spaceship',
            BodyTypeEnum.SpaceShip
        );

        // Store the handling characteristics for use in flight control calculations.
        this.handling = handling;

        // Initial camera offsets (approximate; updated precisely after OBJ loads).
        this.cockpitOffset = new THREE.Vector3(0, 0.3 * SF, 0.52 * SF);
        this.thrusterOffset = new THREE.Vector3(0, -0.1 * SF, -0.9 * SF);
        this.thirdPersonOffset = new THREE.Vector3(
            0,
            SPACESHIP_RADIUS * 0.35,
            -SPACESHIP_RADIUS * 1.8
        );

        // Engine exhaust trail (Line-based, no gaps at any speed)
        this.trail = new ShipFlame(scene);

        // Keep default label (shows in bodies table) but hide it during flight
        if (this.label) this.label.visible = false;
        if (this.labelLine) this.labelLine.visible = false;

        // ── Async OBJ + MTL load ──────────────────────────────────────────────
        this._loadModel(modelName);
    }

    /**
     * Loads an OBJ/MTL model, scales it to fit SPACESHIP_RADIUS, centres it on this.mesh,
     * and updates cockpit/thruster offsets from the resulting bounding box.
     * Safe to call from the constructor and from loadModel().
     */
    private _loadModel(modelName: string): void {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('./assets/models/');
        mtlLoader
            .loadAsync(`${modelName}.mtl`)
            .then((materials) => {
                materials.preload();
                const objLoader = new OBJLoader();
                objLoader.setMaterials(materials);
                return objLoader.loadAsync(`./assets/models/${modelName}.obj`);
            })
            .then((group) => {
                // Compute bounding box of the unscaled model (group at world origin, no parent).
                const bbox = new THREE.Box3().setFromObject(group);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const longestDim = Math.max(size.x, size.y, size.z);
                const scale = SPACESHIP_RADIUS / longestDim;
                group.scale.setScalar(scale);

                // Re-compute bbox after scaling to find the center.
                group.updateMatrixWorld(true);
                const scaledBbox = new THREE.Box3().setFromObject(group);
                const center = new THREE.Vector3();
                scaledBbox.getCenter(center);
                group.position.sub(center);

                // Compute LOCAL bbox now — before adding to this.mesh — so world space
                // equals mesh-local space and the values are valid as local offsets.
                group.updateMatrixWorld(true);
                const localBbox = new THREE.Box3().setFromObject(group);

                group.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.renderOrder = 2; // draw after effects (renderOrder 1)
                    }
                });

                this.mesh.add(group);

                // Update camera/thruster offsets from the local bbox.
                this.cockpitOffset.set(0, localBbox.max.y * 0.5, localBbox.max.z * 0.75);
                this.thrusterOffset.set(0, localBbox.min.y * 0.3, localBbox.min.z);
            })
            .catch((e) => {
                console.warn('Spaceship OBJ/MTL load failed — using placeholder mesh', e);
            });
    }

    /**
     * Swaps the visual model without affecting physics state.
     * Disposes any previously loaded OBJ group children attached to this.mesh,
     * resets camera/thruster offsets to constructor defaults, then asynchronously
     * loads and attaches the new model.
     * @param modelName Base filename (without extension) of the OBJ/MTL model to load.
     */
    loadModel(modelName: string): void {
        // Remove and dispose any Group children (the previously loaded OBJ models).
        const groupsToRemove = this.mesh.children.filter(
            (c) => c instanceof THREE.Group
        ) as THREE.Group[];

        for (const group of groupsToRemove) {
            group.traverse((child) => {
                const mesh = child as THREE.Mesh;
                if (mesh.isMesh) {
                    mesh.geometry?.dispose();
                    if (Array.isArray(mesh.material)) {
                        mesh.material.forEach((m) => m.dispose());
                    } else {
                        mesh.material?.dispose();
                    }
                }
            });
            this.mesh.remove(group);
        }

        // Reset offsets to initial defaults (will be overwritten once the new model loads).
        this.cockpitOffset.set(0, 0.3 * SF, 0.52 * SF);
        this.thrusterOffset.set(0, -0.1 * SF, -0.9 * SF);
        this.thirdPersonOffset.set(0, SPACESHIP_RADIUS * 0.35, -SPACESHIP_RADIUS * 1.8);

        this._loadModel(modelName);
    }

    // Flight Controllers
    /**
     * Apply manual thrust for one physics substep.
     * Called from inside the physics substep loop so thrust and gravity interleave
     * correctly at any time scale.
     */
    applyFlightThrustSubstep(dt: number): void {
        if (this._isDisposed || !this.mesh) return;
        if (simulationState.isPaused || simulationState.timeScale === 0) return;
    
        // Autopilot handles its own thrust — stay out of its way.
        if (autopilotState.isActive) return;
        // Warp/boost deceleration is handled frame-level; do not add thrust during those.
        if (flightState.warpActive || flightState.warpDecelerating || flightState.boostDecelerating) return;
    
        const keys = cameraState.keys;
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(flightState.flightCameraQuat);
        const fwdSpeed = this.velocity.dot(forward);
    
        if (!flightState.isAdvancedMode) {
            // ── Simple mode ──────────────────────────────────────────────────
            // While a thrust key is held: forward thrust is ADDED to velocity so
            // gravity accumulates freely and is never overwritten.
            // Perpendicular drift is always decayed while any thrust key is held.
            const thrustActive = keys.shift || keys.w || keys.s;
            if (thrustActive) {
                const shiftEffective = keys.shift && fwdSpeed < this.handling.flightBoostMaxSpeed;
                const wEffective = keys.w && fwdSpeed < this.handling.flightMaxSpeed;
    
                if (shiftEffective) {
                    const delta = Math.min(this.handling.flightBoostAccel * dt, this.handling.flightBoostMaxSpeed - fwdSpeed);
                    this.velocity.addScaledVector(forward, delta);
                } else if (wEffective && !keys.shift) {
                    const delta = Math.min(this.handling.flightThrustAccel * dt, this.handling.flightMaxSpeed - fwdSpeed);
                    this.velocity.addScaledVector(forward, delta);
                } else if (keys.s) {
                    // Decelerate — continuously applied even at fwdSpeed == 0 so
                    // gravity cannot cause flickering brake on/off cycles.
                    const ceiling = -this.handling.flightMaxSpeed;
                    const decelRate = fwdSpeed > this.handling.flightMaxSpeed ? this.handling.flightBoostDecel : this.handling.flightThrustDecel;
                    const delta = Math.max(-decelRate * dt, ceiling - fwdSpeed);
                    this.velocity.addScaledVector(forward, delta);
                }
    
                // Decay perpendicular drift when any thrust key is held.
                const newFwdSpd = this.velocity.dot(forward);
                const perpVel = this.velocity.clone().addScaledVector(forward, -newFwdSpd);
                const decay = Math.max(0, 1 - this.handling.flightPerpDecay * dt);
                perpVel.multiplyScalar(decay);
                this.velocity.copy(forward).multiplyScalar(newFwdSpd).add(perpVel);
            }
        } else {
            // ── Advanced mode ────────────────────────────────────────────────
            // Thrust adds to velocity without removing gravity-accumulated
            // perpendicular components, so orbital mechanics work at all times.
            if (keys.shift) {
                if (fwdSpeed < this.handling.flightBoostMaxSpeed) {
                    const delta = Math.min(this.handling.flightBoostAccel * dt, this.handling.flightBoostMaxSpeed - fwdSpeed);
                    this.velocity.addScaledVector(forward, delta);
                }
            } else if (keys.w) {
                if (fwdSpeed < this.handling.flightMaxSpeed) {
                    const delta = Math.min(this.handling.flightThrustAccel * dt, this.handling.flightMaxSpeed - fwdSpeed);
                    this.velocity.addScaledVector(forward, delta);
                }
            } else if (keys.s) {
                if (fwdSpeed > -this.handling.flightMaxSpeed) {
                    const delta = Math.max(-this.handling.flightThrustDecel * dt, -this.handling.flightMaxSpeed - fwdSpeed);
                    this.velocity.addScaledVector(forward, delta);
                }
            }
        }
    }

    /**
     * Call once per frame to manage the warp loop sound effect.
     * The sound plays continuously; volume is driven by ship speed and camera distance.
     *
     * @param speedVolume   0–1 speed-based volume (0 at rest → 1 at full warp speed).
     * @param distanceFade  0–1 camera-distance multiplier (1 = close/in-cockpit, 0 = too far).
     */
    updateWarpSound(speedVolume: number, distanceFade: number): void {
        // Start the sound on first call (or retry each frame if buffer wasn't loaded yet)
        if (!this._warpSound) {
            const ctrl = playWarpLoop();
            if (ctrl) {
                this._warpSound = ctrl;
            }
        }

        // Update volume every frame: speed × distance
        if (this._warpSound && !this._warpSound.isFadingOut) {
            this._warpSound.setVolume(speedVolume * distanceFade);
        }
    }

    /**
     * Override die() to clean up the warp sound controller.
     */
    die(deathOptions?: IDeathOptions): void {
        if (this._warpSound) {
            this._warpSound.dispose();
            this._warpSound = null;
        }
        super.die(deathOptions);
    }
}
