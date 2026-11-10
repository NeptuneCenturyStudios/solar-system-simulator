import * as THREE from 'three';
import { Spaceship } from './spaceship';
import { ShipRole } from './ship-team';
import { ISpaceshipHandling } from '../../interfaces';
import { C, DIST_SCALE, MASS_SCALE, RADIUS_SCALE } from '../../utilities/consts';
import {
    ILightningWeaponConfig,
    LightningWeapon,
} from '../../ship-effects/weapons/lightning-weapon';
import { MissileWeapon } from '../../ship-effects/weapons/missile-weapon';
import { WeaponGroup } from '../../ship-effects/weapons/weapon-group';
import {
    createShipContainerMesh,
    loadShipGltfInto,
    modelPointToShipLocal,
} from './ship-model-loader';

/** Spin rates (rad/s) of the Spiral coil around the engine core. */
const SPIRAL_SPIN_IDLE = 0.15;
const SPIRAL_SPIN_THRUST = 0.45;
const SPIRAL_SPIN_MAX = 1.4;
/** The Engine core counter-rotates at this fraction of the Spiral's rate. */
const ENGINE_SPIN_RATIO = -0.35;
/** Exponential easing rate (1/s) of the spin toward its target — a heavy, gradual spool. */
const SPIN_EASE_RATE = 0.8;

/**
 * The World Destroyer — the alien invasion fleet's planet-killer. A spiked, star-shaped
 * dreadnought far larger than the Harbinger, with an exposed engine core wrapped in a coil.
 *
 * Model: world_destroyer.glb, exported from the CGTrader "AlienStarship" Cycles .blend (no
 * animations in the source). Mirror/subsurf modifiers are applied, textures are downscaled to
 * 2K/1K JPEG, and geometry uses EXT_meshopt_compression. The four parts stay separate nodes —
 * `Center`, `Wings`, `Engine`, `Spiral` — so the engine core and its coil can spin in code.
 *
 * As authored the ship is a flat star with the engine hanging below the belly (GLB -Y). It flies
 * upright instead: the model is pitched so the engine points aft (-Z) and the top deck leads,
 * which leaves the long spikes running up and down (ship ±Y).
 */
export class WorldDestroyer extends Spaceship {
    /** The coil around the engine core; spins about its own +Y (the ship's flight axis). */
    private spiralNode: THREE.Object3D | null = null;
    /** The engine core column; counter-rotates slowly inside the coil. */
    private engineNode: THREE.Object3D | null = null;
    /** Current Spiral spin rate (rad/s), eased toward the target each frame. */
    private spiralSpinRate = SPIRAL_SPIN_IDLE;

    constructor(
        dependencies: object,
        scene: THREE.Scene,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        id: string
    ) {
        const SPACESHIP_MASS = 2_000_000_000 / MASS_SCALE;
        // The model's longest dimension (spike tip to spike tip) is fitted to this — 2.5x the
        // Harbinger.
        const SPACESHIP_RADIUS = 1500 / 1000 / RADIUS_SCALE;
        // Hull HP set explicitly — the ship's real-world mass scaled by MASS_SCALE
        // (calibrated for planetary bodies) would otherwise yield a near-zero HP pool.
        const SPACESHIP_HEALTH_POINTS = 800;

        // Camera placement (ship-local space; +Z = forward, +Y = up). The ship is tall rather
        // than long, so the camera sits further back and only slightly above centre.
        const THIRD_PERSON_OFFSET = new THREE.Vector3(
            0,
            SPACESHIP_RADIUS * 0.2,
            -SPACESHIP_RADIUS * 1.2
        );

        // Flight tuning constants — heavier and more sluggish than the Harbinger.
        const FLIGHT_MAX_SPEED = 60 / 1000 / DIST_SCALE;
        const FLIGHT_THRUST_ACCEL = FLIGHT_MAX_SPEED * 0.002;
        const FLIGHT_THRUST_DECEL = FLIGHT_MAX_SPEED * 0.4;
        const FLIGHT_THRUST_DECEL_TOLERANCE = FLIGHT_MAX_SPEED * 0.01;
        const FLIGHT_BOOST_MAX_SPEED = 0.8 / DIST_SCALE; // 0.8 km/s
        const FLIGHT_BOOST_ACCEL = FLIGHT_BOOST_MAX_SPEED * 0.1;
        const FLIGHT_BOOST_DECEL = FLIGHT_BOOST_ACCEL * 3;
        const FLIGHT_WARP_SPEED = C * 4;
        const FLIGHT_WARP_ACCEL = FLIGHT_WARP_SPEED * 0.02;
        const FLIGHT_WARP_DECEL = FLIGHT_WARP_SPEED * 3;
        const FLIGHT_WARP_DECEL_TOLERANCE = FLIGHT_WARP_SPEED * 0.01;
        const FLIGHT_PERP_DECAY = 0.5;
        const FLIGHT_MAX_POINTER_OFFSET = 340;
        const FLIGHT_MAX_TURN_RATE = 0.45;
        const FLIGHT_STEER_SMOOTH_RATE = 0.35;
        const FLIGHT_STEER_DEADZONE = 0.08;
        const FLIGHT_ROLL_SPEED = 1.5;
        const FLIGHT_ROLL_ACCEL = 0.35;
        const FLIGHT_ROLL_FRICTION = 0.8;
        const FLIGHT_BANK_LERP_SPEED = 10.5;
        const FLIGHT_MAX_BANK_ANGLE = 0.08;
        const FLIGHT_MAX_BANK_PITCH = 0.05;
        const FLIGHT_MAX_BANK_YAW = 0.05;
        const FLIGHT_WARP_CHARGE_TIME = 7.0;
        // Autopilot tuning
        const PERFORMANCE_MAX_SPEED = 250 / DIST_SCALE; // 250 km/s
        const PERFORMANCE_THRUST_ACCEL = PERFORMANCE_MAX_SPEED * 0.003;
        const PERFORMANCE_THRUST_DECEL = PERFORMANCE_MAX_SPEED * 0.5;
        const PERFORMANCE_BOOST_MAX_SPEED = 1400 / DIST_SCALE; // 1400 km/s
        const PERFORMANCE_BOOST_ACCEL = PERFORMANCE_BOOST_MAX_SPEED * 0.15;
        const PERFORMANCE_BOOST_DECEL = PERFORMANCE_BOOST_ACCEL * 3;

        const worldDestroyerHandling: ISpaceshipHandling = {
            // Thrust / speed
            flightMaxSpeed: FLIGHT_MAX_SPEED,
            flightThrustAccel: FLIGHT_THRUST_ACCEL,
            flightThrustDecel: FLIGHT_THRUST_DECEL,
            flightThrustDecelTolerance: FLIGHT_THRUST_DECEL_TOLERANCE,

            // Boost
            flightBoostMaxSpeed: FLIGHT_BOOST_MAX_SPEED,
            flightBoostAccel: FLIGHT_BOOST_ACCEL,
            flightBoostDecel: FLIGHT_BOOST_DECEL,

            // Autopilot
            autopilotMaxSpeed: PERFORMANCE_MAX_SPEED,
            autopilotThrustAccel: PERFORMANCE_THRUST_ACCEL,
            autopilotThrustDecel: PERFORMANCE_THRUST_DECEL,
            autopilotBoostMaxSpeed: PERFORMANCE_BOOST_MAX_SPEED,
            autopilotBoostAccel: PERFORMANCE_BOOST_ACCEL,
            autopilotBoostDecel: PERFORMANCE_BOOST_DECEL,

            // Warp
            flightWarpSpeed: FLIGHT_WARP_SPEED,
            flightWarpAccel: FLIGHT_WARP_ACCEL,
            flightWarpDecel: FLIGHT_WARP_DECEL,
            flightWarpDecelTolerance: FLIGHT_WARP_DECEL_TOLERANCE,

            // Perpendicular drift decay (simple mode)
            flightPerpDecay: FLIGHT_PERP_DECAY,

            // Steering feel
            flightMaxPointerOffset: FLIGHT_MAX_POINTER_OFFSET,
            flightMaxTurnRate: FLIGHT_MAX_TURN_RATE,
            flightSteerSmoothRate: FLIGHT_STEER_SMOOTH_RATE,
            flightSteerDeadzone: FLIGHT_STEER_DEADZONE,

            // Roll
            flightRollSpeed: FLIGHT_ROLL_SPEED,
            flightRollAccel: FLIGHT_ROLL_ACCEL,
            flightRollFriction: FLIGHT_ROLL_FRICTION,

            // Visual banking
            flightBankLerpSpeed: FLIGHT_BANK_LERP_SPEED,
            flightMaxBankAngle: FLIGHT_MAX_BANK_ANGLE,
            flightMaxBankPitch: FLIGHT_MAX_BANK_PITCH,
            flightMaxBankYaw: FLIGHT_MAX_BANK_YAW,

            // Misc
            flightWarpChargeTime: FLIGHT_WARP_CHARGE_TIME,
        };

        const containerMesh = createShipContainerMesh();
        const MODEL_URL = './assets/models/world-destroyer/world_destroyer.glb';

        // Pitch +90° about X: the GLB's -Y (engine / belly) becomes ship -Z (aft) and its +Y
        // (top deck) becomes +Z (forward), so the ship flies upright with the engine trailing.
        const MODEL_ROTATION = new THREE.Euler(Math.PI / 2, 0, 0);

        // Bow arc muzzle in world_destroyer.glb's own coordinates (Y-up): the lip of the
        // circular opening at the centre of the top deck, on the spin axis (Blender (0, 0, 0.167)).
        // The model pitch carries it to ship +Z, the bow.
        const BOW_GUN_MUZZLE = new THREE.Vector3(0, 0.167, 0);

        const arcWeaponConfig: Partial<ILightningWeaponConfig> = {
            beamColor: 0x30ff60,
            optimalRange: 35_000 / DIST_SCALE,
            damage: 500,
            coreWidth: 0.06 / DIST_SCALE, // km
            haloWidth: 0.13 / DIST_SCALE, // km
            damageInterval: 0.2,
            coolPerSecond: 1.0,
            wobbleFraction: 0.05,
        };
        const bowArc = new LightningWeapon(scene, SPACESHIP_RADIUS, arcWeaponConfig);

        super(dependencies, scene, {
            position: position,
            velocity: velocity,
            mass: SPACESHIP_MASS,
            radius: SPACESHIP_RADIUS,
            mesh: containerMesh,
            id: id,
            name: 'World Destroyer',
            handling: worldDestroyerHandling,
            weaponGroups: [
                new WeaponGroup([bowArc]),
                new WeaponGroup([
                    new MissileWeapon(scene, SPACESHIP_RADIUS, {
                        damage: 100,
                        salvoSize: 6,
                        missileLength: 0.02 / RADIUS_SCALE, // 20 m
                    }),
                ]),
            ],
            healthPoints: SPACESHIP_HEALTH_POINTS,
            shield: { hullMultiplier: 4, rechargeTime: 300 },
            shipTypeId: 'world_destroyer',
            role: ShipRole.Capital,
            thirdPersonOffset: THIRD_PERSON_OFFSET,
        });

        // Kick off the async model load; offsets are applied once the bbox is known.
        loadShipGltfInto(containerMesh, MODEL_URL, SPACESHIP_RADIUS, MODEL_ROTATION)
            .then((localBbox) => {
                this.applyModelOffsets(localBbox);
                // Until the model is in, the arc fires from the shared default muzzle.
                bowArc.mountOffset = modelPointToShipLocal(
                    containerMesh,
                    BOW_GUN_MUZZLE,
                    new THREE.Vector3()
                );
                // The exhaust is the ring at the foot of the Engine column, on the spin axis
                // (Blender z = -4.01, so GLB y = -4.01). The bbox default would put the flame
                // well below it, because the spikes make the ship tall.
                this.setEngineNozzles([new THREE.Vector3(0, -4.01, 0)]);
                // Each ship gets its own clone of the template, so these nodes are this ship's.
                this.spiralNode = containerMesh.getObjectByName('Spiral') ?? null;
                this.engineNode = containerMesh.getObjectByName('Engine') ?? null;
            })
            .catch((e) => {
                console.warn(
                    `World Destroyer GLB load failed for ${MODEL_URL} — using placeholder mesh`,
                    e
                );
            });
    }

    /**
     * Spins the engine coil and counter-rotates the engine core. The coil idles slowly, spools up
     * under thrust, and runs fastest while boosting, charging or holding warp, or while the
     * weapons are hot.
     */
    override updateModelAnimation(dt: number): void {
        if (dt <= 0 || (!this.spiralNode && !this.engineNode)) return;

        let targetRate = this.thrustActive ? SPIRAL_SPIN_THRUST : SPIRAL_SPIN_IDLE;
        if (this.controlInput.boost || this.warpCharging || this.warpActive) {
            targetRate = SPIRAL_SPIN_MAX;
        }
        let weaponHeat = 0;
        for (const weapon of this.weapons) weaponHeat = Math.max(weaponHeat, weapon.thermalLoad);
        const combatRate = THREE.MathUtils.lerp(SPIRAL_SPIN_IDLE, SPIRAL_SPIN_MAX, weaponHeat);
        targetRate = Math.max(targetRate, combatRate);

        // Framerate-independent exponential ease toward the target rate.
        const blend = 1 - Math.exp(-SPIN_EASE_RATE * dt);
        this.spiralSpinRate += (targetRate - this.spiralSpinRate) * blend;

        // Both nodes' pivots sit on the spin axis, which is their local +Y (the ship's flight
        // axis after the model pitch). Wrap the angle so it never grows without bound.
        const spiralStep = this.spiralSpinRate * dt;
        if (this.spiralNode) {
            this.spiralNode.rotation.y = (this.spiralNode.rotation.y + spiralStep) % (Math.PI * 2);
        }
        if (this.engineNode) {
            this.engineNode.rotation.y =
                (this.engineNode.rotation.y + spiralStep * ENGINE_SPIN_RATIO) % (Math.PI * 2);
        }
    }
}
