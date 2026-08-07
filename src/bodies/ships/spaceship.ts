import * as THREE from 'three';
import { Body } from '../body';
import { SCALE_FACTOR } from '../../utilities/consts.js';
import { IShipEffect } from '../../ship-effects/ship-effect-base.js';
import { ShipFlame } from '../../ship-effects/ship-flame.js';
import { BodyTypeEnum } from '../body-enums';
import { SoundEffect, WarpSoundController, playSoundEffect, playWarpLoop } from '../../utilities/audio.js';
import { WarpEffect } from '../../effects/warp-effect.js';
import { IDeathOptions, ISpaceshipHandling, AutopilotPhase, IWarpStepResult, ISpaceshipCreationOptions } from '../../interfaces';
import { Weapon } from '../../ship-effects/weapons/weapon';
import { autopilotState, cameraState, flightState, simulationState } from '../../simulation/simulation';
import { G } from '../../utilities/consts';
import {
    AUTOPILOT_ORBIT_ALTITUDE_FACTOR,
    AUTOPILOT_BRAKE_PAD,
    AUTOPILOT_BRAKE_DONE_SPEED,
    AUTOPILOT_CIRCULARIZE_RATE,
    AUTOPILOT_CIRCULARIZE_GRAVITY_MARGIN,
} from '../../utilities/consts';
import { triggerScreenFlash } from '../../effects/screen-flash';


const SF = SCALE_FACTOR / SCALE_FACTOR;

/**
 * Player-controllable spaceship body.
 * Ship local axes: +Z = forward, +Y = up, +X = right.
 * Geometry is assembled from merged primitives scaled by SCALE_FACTOR.
 * Extends Body so gravity applies automatically when added to simulationState.bodies.
 *
 * Owns its flight-control logic via applyFlightThrustSubstep and the new ship-level
 * methods for roll, steering, warp/boost deceleration, and visual banking.  Frame-level
 * state transitions (warp charging, button combos) and camera management stay in
 * flight-controllers.ts / animation-loop.ts.
 *
 * The autopilot phase machine (autopilotStep) lives here and calls the ship's own
 * flight control methods (applyThrust, steerToward, orientTopToward) instead of
 * directly manipulating velocity and quaternion. This ensures autopilot uses the
 * same handling characteristics as manual flight.
 */
export class Spaceship extends Body {
    /** Local-space offset for 1st-person cockpit camera. */
    cockpitOffset: THREE.Vector3;
    /** Local-space offset for 3rd-person chase camera. */
    thirdPersonOffset: THREE.Vector3;
    /** Local-space offset to the engine nozzle (used for the trail origin). */
    thrusterOffset: THREE.Vector3;
    /** Local-space offset to the weapon muzzle (nose). Weapon origins are anchored here. */
    muzzleOffset: THREE.Vector3;
    /** Glowing engine exhaust trail rendered as a connected line in world space. */
    trail: IShipEffect;
    /** Handling characteristics of the spaceship. */
    handling: ISpaceshipHandling;
    /** Weapon systems mounted on this ship. Empty for unarmed ships. Subclasses mount a loadout of Weapon classes. */
    weapons: Weapon[] = [];

    /** Current angular roll velocity (rad/s). Decays when key released. */
    rollVelocity: number = 0;
    /** Smoothed steering values in [-1, 1]. Lerp toward raw target each frame. */
    steerX: number = 0;
    steerY: number = 0;
    /** Visual roll offset relative to camera frame (radians). */
    shipBankRoll: number = 0;
    /** Visual pitch offset relative to camera frame (radians). */
    shipBankPitch: number = 0;
    /** Whether Shift was held on the previous frame. */
    prevShiftHeld: boolean = false;

    // ── Warp drive state ─────────────────────────────────────────────────────
    /** Accumulated charge time (seconds) during the warp charging phase (0 → FLIGHT_WARP_CHARGE_TIME). */
    warpChargeTimer: number = 0;
    /** True while warp is being charged (space bar held / autopilot WARP_CHARGING). */
    warpCharging: boolean = false;
    /** True when warp speed is active (manual or autopilot WARP phase). */
    warpActive: boolean = false;
    /** True during phase-1 decel: shedding speed from warp → boost max. */
    warpDecelerating: boolean = false;
    /** True during phase-2 decel: shedding speed from boost max → normal max. */
    boostDecelerating: boolean = false;
    /** Visual warp tunnel effect. Owned by the ship; created in constructor. */
    warpEffect: WarpEffect;

    // ── Autopilot state ──────────────────────────────────────────────────────
    /** True while the autopilot is engaged and controlling the ship. */
    autopilotActive: boolean = false;
    /** The body the autopilot is navigating toward. */
    autopilotTarget: Body | null = null;
    /** Current autopilot phase, or null when not engaged. */
    autopilotPhase: AutopilotPhase | null = null;
    /** True while the autopilot approach phase is using boost speed. */
    autopilotBoostActive: boolean = false;
    /** Distance to target when BRAKE phase started — used for the velocity blend smoothstep. */
    autopilotBrakeEntryDistance: number = 0;
    /** Holds pending phase-change messages for the caller to drain after autopilotStep returns. */
    autopilotEventMessages: { message: string; isOrbitNotify: boolean; }[] = [];

    /** Active warp loop sound controller, or null if not currently playing. */
    private _warpSound: WarpSoundController | null = null;

    // ── Autopilot threshold computation (derived from handling at runtime) ──────

    /**
     * Threshold distance for switching from boost to normal approach decel.
     * Computed from the ship's own handling object, not global constants.
     */
    get autopilotBoostThreshold(): number {
        const h = this.handling;
        return (
            1.5 *
            ((h.flightBoostMaxSpeed * h.flightBoostMaxSpeed -
                h.flightMaxSpeed * h.flightMaxSpeed) /
                (2 * h.flightBoostDecel) +
                (h.flightMaxSpeed * h.flightMaxSpeed) / (2 * h.flightThrustDecel))
        );
    }

    /**
     * Minimum runway (u) that APPROACH needs to safely brake from normal speed to a stop.
     */
    get autopilotApproachMinDistance(): number {
        const h = this.handling;
        return (
            AUTOPILOT_BRAKE_PAD *
            (((h.flightMaxSpeed + AUTOPILOT_BRAKE_DONE_SPEED) *
                (h.flightMaxSpeed + AUTOPILOT_BRAKE_DONE_SPEED)) /
                (2 * h.flightThrustDecel))
        );
    }

    /**
     * Target arc length (u) for the BRAKE blend.
     */
    get autopilotBrakeArcDist(): number {
        return this.handling.flightMaxSpeed * 10;
    }

    /**
     * Distance (u) above which autopilot engages warp for fast transit.
     */
    get autopilotWarpThreshold(): number {
        const h = this.handling;
        return (
            1.5 *
                ((h.flightWarpSpeed * h.flightWarpSpeed -
                    h.flightBoostMaxSpeed * h.flightBoostMaxSpeed) /
                    (2 * h.flightWarpDecel)) +
            this.autopilotBoostThreshold
        );
    }

    /** Acceleration rate used to engage warp during autopilot approach (same as handling). */
    get autopilotWarpAccel(): number {
        return this.handling.flightWarpAccel;
    }

    /** Deceleration rate used to scrub warp speed during autopilot approach (same as handling). */
    get autopilotWarpDecel(): number {
        return this.handling.flightWarpDecel;
    }

    /**
     * Constructs a new Spaceship object with camera offsets and placeholder geometry.
     * The concrete ship subclass builds and loads its own visual model onto the
     * supplied container mesh (see ship-model-loader.ts); the base class only
     * passes the mesh through to Body.
     * @param dependencies External dependencies for the spaceship.
     * @param scene The THREE.Scene to which the spaceship belongs.
     * @param position The initial position of the spaceship.
     * @param velocity The initial velocity of the spaceship.
     * @param id Unique identifier for the spaceship.
     * @param mesh The mesh (visual container) to attach to the body.
     * @param handling The handling characteristics of the spaceship.
     */
    constructor(
        dependencies: object,
        scene: THREE.Scene,
        options: ISpaceshipCreationOptions
    ) {
        // ── Base class ────────────────────────────────────────────────────────
        super(
            dependencies,
            scene,
            options.mass,
            options.radius,
            options.position,
            options.velocity,
            options.mesh,
            options.id,
            'Spaceship',
            BodyTypeEnum.SpaceShip
        );

        // Store the handling characteristics for use in flight control calculations.
        this.handling = options.handling;

        this.weapons = options.weapons;

        // Initial camera offsets (approximate; updated precisely after OBJ loads).
        this.cockpitOffset = new THREE.Vector3(0, 0.3 * SF, 0.52 * SF);
        this.thrusterOffset = new THREE.Vector3(0, -0.1 * SF, -0.9 * SF);
        this.thirdPersonOffset = new THREE.Vector3(
            0,
            options.radius * 0.35,
            -options.radius * 1.8
        );

        // Initial muzzle off the nose (approximate; updated precisely after OBJ loads).
        this.muzzleOffset = new THREE.Vector3(0, 0, options.radius);

        // Engine exhaust trail (Line-based, no gaps at any speed)
        this.trail = new ShipFlame(scene, this.radius);

        // Warp tunnel effect — visibility is speed-driven (no explicit start/stop needed)
        this.warpEffect = new WarpEffect(scene);

        // Keep default label (shows in bodies table) but hide it during flight
        if (this.label) this.label.visible = false;
        if (this.labelLine) this.labelLine.visible = false;
    }

    /** Fire all mounted weapons toward `aimDir`. No-op if this ship is unarmed. */
    fireWeapon(dt: number, muzzlePos: THREE.Vector3, aimDir: THREE.Vector3): void {
        for (const weapon of this.weapons) {
            weapon.tryFire(dt, muzzlePos, aimDir, this.velocity);
        }
    }

    /** Release the trigger on all mounted weapons (stops continuous beams). */
    stopFire(): void {
        for (const weapon of this.weapons) {
            weapon.stopFire();
        }
    }

    /**
     * Positions the cockpit/thruster/muzzle anchors from the loaded model's
     * bounding box (in ship-local space).  Concrete ship subclasses call this
     * after loadShipModelInto() resolves, since the base class no longer owns
     * model loading.
     * @param localBbox Bounding box of the loaded model in mesh-local coordinates.
     */
    protected applyModelOffsets(localBbox: THREE.Box3): void {
        // Update camera/thruster offsets from the local bbox.
        this.cockpitOffset.set(0, localBbox.max.y * 0.5, localBbox.max.z * 0.75);
        this.thrusterOffset.set(0, localBbox.min.y * 0.3, localBbox.min.z);
        // Muzzle sits at the forward-most point of the hull (+Z = nose).
        this.muzzleOffset.set(0, localBbox.max.y * 0.25, localBbox.max.z);
    }

    /**
     * Disposes all loaded OBJ group children attached to this.mesh.
     * Called from die(); also usable by subclasses that replace their model.
     */
    protected disposeModelChildren(): void {
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
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  Flight Control Methods (owned by the ship)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Apply a thrust impulse along a given direction.
     * This is the fundamental "apply force" building block used by both
     * manual flight (via applyFlightThrustSubstep) and the autopilot.
     * It adds `direction * magnitude` to velocity.
     */
    applyThrust(direction: THREE.Vector3, magnitude: number): void {
        this.velocity.addScaledVector(direction, magnitude);
    }

    /**
     * Smoothly rotate the ship's +Z axis toward a world-space direction.
     * Rate-limited by the ship's handling.flightMaxTurnRate.
     * @param worldDirection  The direction to point the ship's nose toward (must be non-zero).
     * @param dt              Physics substep delta time.
     */
    steerToward(worldDirection: THREE.Vector3, dt: number): void {
        const fwdLen = worldDirection.length();
        if (fwdLen < 1e-10) return;
        const fwd = worldDirection.clone().normalize();
        const eye = this.mesh.position.clone().add(fwd);
        const m = new THREE.Matrix4().lookAt(eye, this.mesh.position, new THREE.Vector3(0, 1, 0));
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m);
        this.mesh.quaternion.rotateTowards(targetQuat, this.handling.flightMaxTurnRate * dt);
    }

    /**
     * Orient the ship so its +Y (top) points toward a world position (tidal-lock style)
     * while its +Z (forward) aligns with a given direction. Calls steerToward under the hood.
     * @param bodyPosition  The world position to face the ship's top toward (e.g. planet centre).
     * @param fwdDirection  The world direction for the ship's +Z axis.
     * @param dt            Physics substep delta time.
     */
    orientTopToward(bodyPosition: THREE.Vector3, fwdDirection: THREE.Vector3, dt: number): void {
        const radial = new THREE.Vector3().subVectors(bodyPosition, this.mesh.position);
        if (radial.lengthSq() < 1e-10) return;
        radial.normalize();

        const fwdLen = fwdDirection.length();
        if (fwdLen < 1e-10) return;
        const fwdNorm = fwdDirection.clone().normalize();

        // Use Matrix4.lookAt to build the orientation:
        //   eye    = shipPos + fwdNorm
        //   target = shipPos
        //   up     = radial (toward the body centre)
        const eye = this.mesh.position.clone().add(fwdNorm);
        const m = new THREE.Matrix4().lookAt(eye, this.mesh.position, radial);
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m);
        this.mesh.quaternion.rotateTowards(targetQuat, this.handling.flightMaxTurnRate * dt);
    }

    /**
     * Apply manual thrust for one physics substep.
     * Called from inside the physics substep loop so thrust and gravity interleave
     * correctly at any time scale.
     */
    applyFlightThrustSubstep(dt: number): void {
        if (this._isDisposed || !this.mesh) return;
        if (simulationState.isPaused || simulationState.timeScale === 0) return;

        // Autopilot handles its own thrust — stay out of its way.
        if (this.autopilotActive) return;
        // Warp/boost deceleration is handled frame-level; do not add thrust during those.
        if (this.warpActive || this.warpDecelerating || this.boostDecelerating) return;

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
     * Apply warp deceleration for one frame step.
     * Phase 1: shed speed from FLIGHT_WARP_SPEED down to FLIGHT_BOOST_MAX_SPEED
     *          using the warp deceleration rate.
     * Returns true while still in phase 1, false when boost speed has been reached
     * (caller should then set ship.boostDecelerating = true).
     */
    applyWarpDecelerationStep(simDt: number, forward: THREE.Vector3): boolean {
        const fwdSpd = this.velocity.dot(forward);
        const unclamped = fwdSpd - this.handling.flightWarpDecel * simDt;
        if (unclamped > this.handling.flightBoostMaxSpeed) {
            this.velocity.copy(forward).multiplyScalar(unclamped);
            return true; // still in warp decel
        }
        // Reached boost speed — snap and signal done.
        this.velocity.copy(forward).multiplyScalar(this.handling.flightBoostMaxSpeed);
        return false;
    }

    /**
     * Apply boost deceleration for one frame step.
     * Phase 2: shed speed from FLIGHT_BOOST_MAX_SPEED down to FLIGHT_MAX_SPEED
     *          using the boost deceleration rate.
     * Returns true while still decelerating, false when normal max speed has been reached.
     */
    applyBoostDecelerationStep(simDt: number, forward: THREE.Vector3): boolean {
        const fwdSpd = this.velocity.dot(forward);
        const unclamped = fwdSpd - this.handling.flightBoostDecel * simDt;
        if (unclamped > this.handling.flightMaxSpeed) {
            this.velocity.copy(forward).multiplyScalar(unclamped);
            return true; // still in boost decel
        }
        // Reached normal max — snap and signal done.
        this.velocity.copy(forward).multiplyScalar(this.handling.flightMaxSpeed);
        return false;
    }

    /**
     * Accelerate toward warp speed for one frame step.
     */
    applyWarpAccelerationStep(simDt: number, forward: THREE.Vector3): void {
        const fwdSpd = this.velocity.dot(forward);
        if (fwdSpd < this.handling.flightWarpSpeed) {
            const delta = Math.min(this.handling.flightWarpAccel * simDt, this.handling.flightWarpSpeed - fwdSpd);
            this.velocity.addScaledVector(forward, delta);
        } else {
            // Clamp to warp max just in case gravity accelerates beyond it.
            this.velocity.copy(forward).multiplyScalar(this.handling.flightWarpSpeed);
        }
    }

    /**
     * Unified warp/boost speed step for one physics tick.
     * Handles all three phases (warp-active acceleration, warp decel → boost,
     * boost decel → idle) and returns a result object the caller uses to
     * update HUD and state.
     *
     * Call this from flight-controllers.ts (manual cockpit) and animation-loop.ts
     * (background non-flight) instead of duplicating the per-phase logic.
     *
     * Does NOT handle warp charging; the caller/ship's autopilotStep manages
     * charging independently.
     *
     * @param simDt  Physics-scaled delta time for this step.
     * @param forward  Direction of forward thrust (camera-quat or ship-quat +Z).
     * @returns IWarpStepResult describing the post-step phase and speed.
     */
    advanceWarpSpeed(simDt: number, forward: THREE.Vector3): IWarpStepResult {
        if (this.warpActive) {
            this.applyWarpAccelerationStep(simDt, forward);
            const fwdSpd = this.velocity.dot(forward);
            return { phase: 'warp_active', forwardSpeed: fwdSpd, decelDone: false };
        }

        if (this.warpDecelerating) {
            const stillDecel = this.applyWarpDecelerationStep(simDt, forward);
            const fwdSpd = this.velocity.dot(forward);
            if (!stillDecel) {
                // Phase 1 complete: reached boost speed.
                this.warpDecelerating = false;
                // Auto-start boost decel for the caller; they may override.
                this.boostDecelerating = true;
                return { phase: 'boost_decel', forwardSpeed: fwdSpd, decelDone: true };
            }
            return { phase: 'warp_decel', forwardSpeed: fwdSpd, decelDone: false };
        }

        if (this.boostDecelerating) {
            const stillDecel = this.applyBoostDecelerationStep(simDt, forward);
            const fwdSpd = this.velocity.dot(forward);
            if (!stillDecel) {
                this.boostDecelerating = false;
                return { phase: 'idle', forwardSpeed: fwdSpd, decelDone: true };
            }
            return { phase: 'boost_decel', forwardSpeed: fwdSpd, decelDone: false };
        }

        // Idle — no warp/boost state.
        const fwdSpd = this.velocity.dot(forward);
        return { phase: 'idle', forwardSpeed: fwdSpd, decelDone: false };
    }

    /**
     * Apply roll with inertia for one frame.
     * @param dt  Wall-clock seconds (non-physics-scaled).
     * @param rollLeft  True if A (left roll) is held.
     * @param rollRight True if D (right roll) is held.
     * @returns The angular delta (radians) to apply to the camera quaternion.
     */
    applyRoll(dt: number, rollLeft: boolean, rollRight: boolean): number {
        const h = this.handling;
        const rollTarget = rollLeft
            ? -h.flightRollSpeed
            : rollRight
              ? h.flightRollSpeed
              : 0;

        if (rollLeft || rollRight) {
            const dir = rollTarget > 0 ? 1 : -1;
            this.rollVelocity += dir * h.flightRollAccel * dt;
            this.rollVelocity = THREE.MathUtils.clamp(
                this.rollVelocity,
                -h.flightRollSpeed,
                h.flightRollSpeed
            );
        } else {
            if (Math.abs(this.rollVelocity) < h.flightRollFriction * dt) {
                this.rollVelocity = 0;
            } else {
                this.rollVelocity -=
                    Math.sign(this.rollVelocity) * h.flightRollFriction * dt;
            }
        }

        return this.rollVelocity * dt;
    }

    /**
     * Apply steering smoothing and compute yaw/pitch deltas for one frame.
     * @param dt  Wall-clock seconds.
     * @param rawX  Normalised horizontal pointer position after deadzone [-1..1].
     * @param rawY  Normalised vertical pointer position after deadzone [-1..1].
     * @returns yawDelta, pitchDelta, and a banking quaternion for the ship mesh.
     */
    applySteering(
        dt: number,
        rawX: number,
        rawY: number
    ): { yawDelta: number; pitchDelta: number; bankQuat: THREE.Quaternion } {
        const h = this.handling;
        const steerAlpha = 1 - Math.exp(-h.flightSteerSmoothRate * dt);

        this.steerX += (rawX - this.steerX) * steerAlpha;
        this.steerY += (rawY - this.steerY) * steerAlpha;

        const yawDelta = -this.steerX * h.flightMaxTurnRate * dt;
        const pitchDelta = this.steerY * h.flightMaxTurnRate * dt;

        // Visual banking
        const bankAlpha = 1 - Math.exp(-h.flightBankLerpSpeed * dt);
        this.shipBankRoll +=
            (this.steerX * h.flightMaxBankAngle - this.shipBankRoll) * bankAlpha;
        this.shipBankPitch +=
            (this.steerY * h.flightMaxBankPitch - this.shipBankPitch) * bankAlpha;

        const bankQuat = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(this.shipBankPitch, 0, this.shipBankRoll, 'XYZ')
        );

        return { yawDelta, pitchDelta, bankQuat };
    }

    /**
     * Zero all ship-local flight control state (roll, steer, banking, prevShift).
     * Call on flight-mode exit and re-entry so the ship doesn't retain stale inputs.
     */
    resetFlightControlState(): void {
        this.rollVelocity = 0;
        this.steerX = 0;
        this.steerY = 0;
        this.shipBankRoll = 0;
        this.shipBankPitch = 0;
        this.prevShiftHeld = false;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  Autopilot Step (phase machine — runs per physics substep)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Run one autopilot substep.  Must only be called when this.autopilotActive is true.
     *
     * Uses the ship's own flight control methods (applyThrust, steerToward, orientTopToward)
     * to navigate toward this.autopilotTarget through a series of phases:
     *   ALIGN → (WARP_CHARGING → WARP) → APPROACH → BRAKE → CIRCULARIZE → TIDAL_LOCK
     *
     * After this method returns, the caller should drain autopilotEventMessages for
     * one-shot events (sound, HUD notifications).
     */
    autopilotStep(dt: number): void {
        if (!this.autopilotActive) return;

        // ── Safety guards ────────────────────────────────────────────────────
        const target = this.autopilotTarget;
        const targetAlive = target && !target._isDisposed && target.mesh && simulationState.bodies.includes(target);
        if (!targetAlive) {
            // Ship or target died — caller handles cancel + event
            return;
        }

        // ── Derived values ───────────────────────────────────────────────────
        const shipPos = this.mesh.position;
        const targetPos = target.mesh.position;

        const toTarget = new THREE.Vector3().subVectors(targetPos, shipPos);
        const distance = toTarget.length();
        const orbitRadius = (target.radius ?? 10) * AUTOPILOT_ORBIT_ALTITUDE_FACTOR;
        const relVel = new THREE.Vector3().subVectors(this.velocity, target.velocity);
        const approachSpeed = relVel.length();

        // ── Phase transitions ────────────────────────────────────────────────
        const toTargetDir = toTarget.clone().normalize();

        // Three-phase stopping distance: shed warp→boost at warp decel,
        // boost→normal at boost decel, normal→stop at thrust decel.
        const h = this.handling;
        const effectiveStopDist =
            approachSpeed > h.flightBoostMaxSpeed
                ? (approachSpeed * approachSpeed - h.flightBoostMaxSpeed * h.flightBoostMaxSpeed) /
                      (2 * h.flightWarpDecel) +
                  (h.flightBoostMaxSpeed * h.flightBoostMaxSpeed -
                      h.flightMaxSpeed * h.flightMaxSpeed) /
                      (2 * h.flightBoostDecel) +
                  (h.flightMaxSpeed * h.flightMaxSpeed) / (2 * h.flightThrustDecel)
                : approachSpeed > h.flightMaxSpeed
                  ? (approachSpeed * approachSpeed - h.flightMaxSpeed * h.flightMaxSpeed) /
                        (2 * h.flightBoostDecel) +
                    (h.flightMaxSpeed * h.flightMaxSpeed) / (2 * h.flightThrustDecel)
                  : Math.max(approachSpeed, h.flightMaxSpeed) ** 2 / (2 * h.flightThrustDecel);
        const brakeDistance = effectiveStopDist * AUTOPILOT_BRAKE_PAD;

        // Max-warp braking threshold — only used by ALIGN to decide whether to
        // bother entering warp at all.  Not used for the WARP → APPROACH
        // transition (see below), which uses the current-speed brakeDistance.
        const dynamicWarpThreshold = this.autopilotWarpThreshold + orbitRadius;

        if (this.autopilotPhase === 'WARP') {
            // Compute the stopping distance from the ship's current approach
            // speed, then add the same 1.5× safety margin the original
            // dynamicWarpThreshold used.  This way a ship that hasn't reached
            // full warp speed uses a proportionally smaller threshold and
            // stays in warp closer to the target.
            const warpStopDist = effectiveStopDist * 1.5 + orbitRadius;
            if (distance <= warpStopDist) {
                this.warpActive = false;
                this.autopilotPhase = 'APPROACH';
            }
        }

        if (this.autopilotPhase === 'APPROACH') {
            const nearApproachSpeed = approachSpeed <= h.flightMaxSpeed + AUTOPILOT_BRAKE_DONE_SPEED;
            const brakeEntryTrigger = orbitRadius + Math.max(brakeDistance, this.autopilotBrakeArcDist);
            if (nearApproachSpeed && distance <= brakeEntryTrigger) {
                this.autopilotPhase = 'BRAKE';
                this.autopilotBrakeEntryDistance = distance;
            }
        }

        if (this.autopilotPhase === 'BRAKE') {
            const radialClosingSpeed = -relVel.dot(toTargetDir);
            const withinOrbit = distance <= orbitRadius * 1.02;
            const driftedToOrbit = distance <= orbitRadius * 1.1 && radialClosingSpeed < 1;
            if (withinOrbit || driftedToOrbit) {
                this.autopilotPhase = 'CIRCULARIZE';
            }
        }

        // ── Phase execution ──────────────────────────────────────────────────
        const gEff = G * simulationState.gMultiplier;

        if (this.autopilotPhase === 'ALIGN') {
            // Rotate toward the target without applying any thrust.
            flightState.thrustActive = false;
            this.steerToward(toTargetDir, dt);

            const shipForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
            if (shipForward.dot(toTargetDir) >= Math.cos(THREE.MathUtils.degToRad(3))) {
                if (distance > dynamicWarpThreshold) {
                    this.autopilotPhase = 'WARP_CHARGING';
                    this.startWarpCharge();
                } else if (distance <= orbitRadius + this.autopilotApproachMinDistance) {
                    this.autopilotPhase = 'BRAKE';
                    this.autopilotBrakeEntryDistance = distance;
                } else {
                    this.autopilotPhase = 'APPROACH';
                }
            }
        } else if (this.autopilotPhase === 'WARP_CHARGING') {
            // Advance charge. The caller reads this.warpChargeTimer / FLIGHT_WARP_CHARGE_TIME
            // for the HUD fill bar.
            this.updateWarpCharge(dt);
            // Point toward target while charging.
            this.steerToward(toTargetDir, dt);
            flightState.thrustActive = false;

            if (this.warpChargeTimer >= this.handling.flightWarpChargeTime) {
                this.engageWarp();
                this.autopilotPhase = 'WARP';
                this.autopilotEventMessages.push({
                    message: '⚡ Autopilot warp engaged.',
                    isOrbitNotify: false
                });
            }
        } else if (this.autopilotPhase === 'WARP') {
            // Accelerate toward warp speed along the current direction to target.
            this.applyWarpAccelerationStep(dt, toTargetDir);
            flightState.currentSpeed = this.velocity.length();
            flightState.thrustActive = true;
            this.steerToward(toTargetDir, dt);
        } else if (this.autopilotPhase === 'APPROACH') {
            const boostDecelDist =
                (h.flightBoostMaxSpeed * h.flightBoostMaxSpeed -
                    h.flightMaxSpeed * h.flightMaxSpeed) /
                (2 * h.flightBoostDecel);
            const effectiveBoostThreshold = orbitRadius + this.autopilotApproachMinDistance + boostDecelDist;

            const useBoost = distance > effectiveBoostThreshold;
            this.autopilotBoostActive = useBoost;
            const targetSpeed = useBoost ? h.flightBoostMaxSpeed : h.flightMaxSpeed;

            const desiredVel = new THREE.Vector3()
                .copy(target.velocity)
                .addScaledVector(toTargetDir, targetSpeed);

            const velDelta = new THREE.Vector3().subVectors(desiredVel, this.velocity);
            const deltaLen = velDelta.length();

            if (deltaLen > 1e-6) {
                const accelDir = velDelta.clone().normalize();
                const relFwd = relVel.dot(toTargetDir);
                if (relFwd >= targetSpeed) {
                    const fwdComp = accelDir.dot(toTargetDir);
                    if (fwdComp > 0) {
                        accelDir.addScaledVector(toTargetDir, -fwdComp);
                        const len = accelDir.length();
                        if (len > 1e-6) accelDir.divideScalar(len);
                    }
                }
                const needsDecel = approachSpeed > targetSpeed + AUTOPILOT_BRAKE_DONE_SPEED;
                const rate = needsDecel
                    ? approachSpeed > h.flightBoostMaxSpeed
                        ? h.flightWarpDecel
                        : approachSpeed > h.flightMaxSpeed
                          ? h.flightBoostDecel
                          : h.flightThrustDecel
                    : useBoost
                      ? h.flightBoostAccel
                      : h.flightThrustAccel;
                const accelMag = Math.min(rate * dt, deltaLen);
                this.applyThrust(accelDir, accelMag);
            }

            this.steerToward(toTargetDir, dt);
            flightState.thrustActive = deltaLen > 1e-6;
        } else if (this.autopilotPhase === 'BRAKE' && gEff > 0) {
            const radial = new THREE.Vector3().subVectors(shipPos, targetPos);
            if (radial.lengthSq() < 1e-10) return;
            const r = radial.length();
            radial.normalize();

            const worldUp = new THREE.Vector3(0, 1, 0);
            const tangential = new THREE.Vector3().crossVectors(radial, worldUp).normalize();
            if (tangential.lengthSq() < 1e-10) {
                tangential.crossVectors(radial, new THREE.Vector3(0, 0, 1)).normalize();
            }

            const vOrbit = Math.sqrt((gEff * target.mass) / r);
            const brakeSpan = Math.max(this.autopilotBrakeEntryDistance - orbitRadius, 1);
            const rawT = 1 - (distance - orbitRadius) / brakeSpan;
            const t = Math.max(0, Math.min(1, rawT));
            const alpha = t * t * (3 - 2 * t); // smoothstep

            const brakeApproachSpeed = relVel.length();
            const brakeDecel = brakeApproachSpeed > h.flightBoostMaxSpeed
                ? h.flightWarpDecel
                : brakeApproachSpeed > h.flightMaxSpeed
                  ? h.flightBoostDecel
                  : h.flightThrustDecel;
            const maxInwardForSpan = Math.sqrt(2 * brakeDecel * brakeSpan);
            const inwardSpeed = Math.min(h.flightMaxSpeed, maxInwardForSpan) * (1 - alpha);
            const desiredVel = new THREE.Vector3()
                .copy(target.velocity)
                .addScaledVector(tangential, vOrbit * alpha)
                .addScaledVector(toTargetDir, inwardSpeed);

            // Explicit gravity compensation.
            const gravAccel = (gEff * target.mass) / (r * r);
            const tangentialSpeed = relVel.dot(tangential);
            const speedRatio = Math.max(0, Math.min(1, tangentialSpeed / vOrbit));
            const gravCompFraction = 1 - speedRatio * speedRatio;
            this.velocity.addScaledVector(radial, gravAccel * gravCompFraction * dt);

            const velDelta = new THREE.Vector3().subVectors(desiredVel, this.velocity);
            const deltaLen = velDelta.length();

            if (deltaLen > 1e-6) {
                const thrustDir = velDelta.clone().normalize();
                const brakeMag = Math.min(brakeDecel * dt, deltaLen);
                this.applyThrust(thrustDir, brakeMag);
                this.steerToward(toTargetDir, dt);
                flightState.thrustActive = deltaLen > 1;
            } else {
                flightState.thrustActive = false;
            }
        } else if (this.autopilotPhase === 'CIRCULARIZE' && gEff > 0) {
            const radial = new THREE.Vector3().subVectors(shipPos, targetPos);
            if (radial.lengthSq() < 1e-10) {
                this.mesh.position.addScaledVector(new THREE.Vector3(1, 0, 0), orbitRadius);
                return;
            }

            const r = radial.length();
            radial.normalize();

            const worldUp = new THREE.Vector3(0, 1, 0);
            const tangential = new THREE.Vector3().crossVectors(radial, worldUp).normalize();
            if (tangential.lengthSq() < 1e-10) {
                tangential.crossVectors(radial, new THREE.Vector3(0, 0, 1)).normalize();
            }

            const vOrbit = Math.sqrt((gEff * target.mass) / r);
            const bodyRadius = target.radius ?? 10;
            const altitude = Math.max(r - bodyRadius, 1);
            const gravAccel = (gEff * target.mass) / (r * r);
            const safeRate = AUTOPILOT_CIRCULARIZE_GRAVITY_MARGIN * vOrbit * Math.sqrt(gravAccel / altitude);
            const effectiveRate = Math.max(AUTOPILOT_CIRCULARIZE_RATE, safeRate);

            const tangentialSpeed = relVel.dot(tangential);
            const speedRatio = Math.max(0, Math.min(1, tangentialSpeed / vOrbit));
            const gravCompFraction = 1 - speedRatio * speedRatio;
            this.velocity.addScaledVector(radial, gravAccel * gravCompFraction * dt);

            const desiredVel = new THREE.Vector3()
                .copy(target.velocity)
                .addScaledVector(tangential, vOrbit);

            const velDelta = new THREE.Vector3().subVectors(desiredVel, this.velocity);
            const deltaLen = velDelta.length();

            if (deltaLen < AUTOPILOT_BRAKE_DONE_SPEED) {
                // Close enough — snap the residual and complete.
                this.velocity.copy(desiredVel);
                flightState.thrustActive = false;
                this.autopilotPhase = 'TIDAL_LOCK';
                this.autopilotEventMessages.push({
                    message: `✓ Autopilot: Stable orbit around ${target.name || 'the body'} achieved. Tidal lock engaged.`,
                    isOrbitNotify: true
                });
            } else {
                const thrustDir = velDelta.clone().normalize();
                const mag = Math.min(effectiveRate * dt, deltaLen);
                this.applyThrust(thrustDir, mag);
                this.steerToward(toTargetDir, dt);
                flightState.thrustActive = true;
            }
        } else if (this.autopilotPhase === 'TIDAL_LOCK' && gEff > 0) {
            const radial = new THREE.Vector3().subVectors(shipPos, targetPos);
            if (radial.lengthSq() < 1e-10) return;
            radial.normalize();

            const worldUp = new THREE.Vector3(0, 1, 0);
            const tangential = new THREE.Vector3().crossVectors(radial, worldUp).normalize();
            if (tangential.lengthSq() < 1e-10) {
                tangential.crossVectors(radial, new THREE.Vector3(0, 0, 1)).normalize();
            }

            // Use the relative velocity direction as forward, falling back to the
            // tangential orbit direction if the ship's velocity is negligible.
            const relVel = new THREE.Vector3().subVectors(this.velocity, target.velocity);
            const fwdDir = relVel.lengthSq() > 1e-6 ? relVel.clone().normalize() : tangential;

            this.orientTopToward(targetPos, fwdDir, dt);
            flightState.thrustActive = false;
        }

        // ── Sync ship-local autopilot state to global singleton ────────────
        autopilotState.isActive = this.autopilotActive;
        autopilotState.targetBody = this.autopilotTarget;
        autopilotState.phase = this.autopilotPhase;
        autopilotState.isBoostActive = this.autopilotBoostActive;
        autopilotState.brakeEntryDistance = this.autopilotBrakeEntryDistance;
    }

    // ─────────────────────────────────────────────────────────────────────────────

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

    // ── Warp charging API ────────────────────────────────────────────────────

    /**
     * Begin a warp charge cycle.  Resets the timer and clears the voice-played debounce.
     */
    startWarpCharge(): void {
        this.warpCharging = true;
        this.warpChargeTimer = 0;
    }

    /**
     * Advance the warp charge timer by `dt` seconds.
     * @returns Fill ratio in [0, 1].  Returns 1.0 when fully charged.
     */
    updateWarpCharge(dt: number): number {
        this.warpChargeTimer = Math.min(this.warpChargeTimer + dt, this.handling.flightWarpChargeTime);
        return this.warpChargeTimer / this.handling.flightWarpChargeTime;
    }

    /**
     * Abort an in-progress warp charge without engaging warp.
     */
    cancelWarpCharge(): void {
        this.warpCharging = false;
        this.warpChargeTimer = 0;
    }

    // ── Warp state transitions ────────────────────────────────────────────────

    /**
     * Transition from WARP_CHARGING → WARP active.  Caller is responsible for
     * triggering flash, sound, and HUD updates.
     */
    engageWarp(): void {
        this.warpActive = true;
        this.warpCharging = false;
        this.warpChargeTimer = 0;

        triggerScreenFlash(200, 0.01, 2.5);
        playSoundEffect(SoundEffect.WarpDriveActive);
    }

    /**
     * Transition from WARP active → phase-1 deceleration (warp → boost speed).
     */
    beginWarpDecel(): void {
        this.warpActive = false;
        this.warpDecelerating = true;
    }

    /**
     * Clear all warp flags and timers.  Use on ship destruction or hard reset.
     */
    resetWarpState(): void {
        this.warpChargeTimer = 0;
        this.warpCharging = false;
        this.warpActive = false;
        this.warpDecelerating = false;
        this.boostDecelerating = false;
    }

    // ── Autopilot state reset ────────────────────────────────────────────────

    /**
     * Clear all autopilot state.  Call on autopilot cancel or ship destruction.
     */
    resetAutopilotState(): void {
        this.autopilotActive = false;
        this.autopilotTarget = null;
        this.autopilotPhase = null;
        this.autopilotBoostActive = false;
        this.autopilotBrakeEntryDistance = 0;
    }

    // ── Warp effect helpers ───────────────────────────────────────────────────

    /**
     * Update the warp tunnel visual.  Call once per frame while the ship exists.
     * @param dt        Delta time in seconds.
     * @param maxSpeed  Speed at which the effect reaches full opacity (pass FLIGHT_WARP_SPEED).
     */
    updateWarpEffect(dt: number, maxSpeed: number): void {
        this.warpEffect.update(dt, this.mesh.position, this.velocity, maxSpeed);
    }

    /**
     * Apply a distance-based fade to the warp tunnel (0 = hidden, 1 = fully visible).
     */
    setWarpEffectOpacity(fade: number): void {
        this.warpEffect.setOpacity(fade);
    }

    /**
     * Override die() to clean up the warp sound controller, warp effect, and autopilot state.
     */
    die(deathOptions?: IDeathOptions): void {
        if (this._warpSound) {
            this._warpSound.dispose();
            this._warpSound = null;
        }
        this.warpEffect.forceHide();
        this.warpEffect.dispose();
        this.disposeModelChildren();
        for (const weapon of this.weapons) weapon.dispose();
        this.weapons = [];
        this.resetAutopilotState();
        super.die(deathOptions);
    }
}
