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
import { createShipContainerMesh, loadShipGltfInto } from './ship-model-loader';

/**
 * The Harbinger — the alien invasion fleet's capital ship. A ~1 km forked-bow dreadnought,
 * much larger and heavier than the Osiris.
 *
 * Model: harbinger_mothership.glb, exported from the CGTrader "large alien spacecraft" .blend
 * (no animations in the source). Its forked bow points along +Z in the GLB, matching the ship
 * convention, so no orientation correction is needed. Mirror modifiers are applied, textures are
 * downscaled from 8K to 2K JPEG, and geometry uses EXT_meshopt_compression.
 */
export class HarbingerMothership extends Spaceship {
    constructor(
        dependencies: object,
        scene: THREE.Scene,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        id: string
    ) {
        const SPACESHIP_MASS = 400_000_000 / MASS_SCALE;
        // The model's longest dimension (bow to stern) is fitted to this — ~1 km.
        const SPACESHIP_RADIUS = 600 / 1000 / RADIUS_SCALE;
        // Hull HP set explicitly — the ship's real-world mass scaled by MASS_SCALE
        // (calibrated for planetary bodies) would otherwise yield a near-zero HP pool.
        const SPACESHIP_HEALTH_POINTS = 700;

        // The GLB's emissive maps are sparse window/light details. Blender authored them at
        // emission strength ~30, which clips to flat white through the sim's 8-bit capture
        // target, so the GLB is exported at 1.0 and the intensity is tuned here instead.
        const EMISSIVE_INTENSITY = 2.0;

        // Camera placement (ship-local space; +Z = forward, +Y = up).
        const THIRD_PERSON_OFFSET = new THREE.Vector3(
            0,
            SPACESHIP_RADIUS * 0.25,
            -SPACESHIP_RADIUS * 1.1
        );

        // Flight tuning constants — heavier and more sluggish than the Osiris.
        const FLIGHT_MAX_SPEED = 80 / 1000 / DIST_SCALE;
        const FLIGHT_THRUST_ACCEL = FLIGHT_MAX_SPEED * 0.003;
        const FLIGHT_THRUST_DECEL = FLIGHT_MAX_SPEED * 0.5;
        const FLIGHT_THRUST_DECEL_TOLERANCE = FLIGHT_MAX_SPEED * 0.01;
        const FLIGHT_BOOST_MAX_SPEED = 1.0 / DIST_SCALE; // 1.0 km/s
        const FLIGHT_BOOST_ACCEL = FLIGHT_BOOST_MAX_SPEED * 0.15;
        const FLIGHT_BOOST_DECEL = FLIGHT_BOOST_ACCEL * 3;
        const FLIGHT_WARP_SPEED = C * 5;
        const FLIGHT_WARP_ACCEL = FLIGHT_WARP_SPEED * 0.03;
        const FLIGHT_WARP_DECEL = FLIGHT_WARP_SPEED * 4;
        const FLIGHT_WARP_DECEL_TOLERANCE = FLIGHT_WARP_SPEED * 0.01;
        const FLIGHT_PERP_DECAY = 0.5;
        const FLIGHT_MAX_POINTER_OFFSET = 340;
        const FLIGHT_MAX_TURN_RATE = 0.7;
        const FLIGHT_STEER_SMOOTH_RATE = 0.45;
        const FLIGHT_STEER_DEADZONE = 0.08;
        const FLIGHT_ROLL_SPEED = 2.2;
        const FLIGHT_ROLL_ACCEL = 0.5;
        const FLIGHT_ROLL_FRICTION = 0.8;
        const FLIGHT_BANK_LERP_SPEED = 10.5;
        const FLIGHT_MAX_BANK_ANGLE = 0.12;
        const FLIGHT_MAX_BANK_PITCH = 0.07;
        const FLIGHT_MAX_BANK_YAW = 0.07;
        const FLIGHT_WARP_CHARGE_TIME = 5.0;
        // Autopilot tuning
        const PERFORMANCE_MAX_SPEED = 350 / DIST_SCALE; // 350 km/s
        const PERFORMANCE_THRUST_ACCEL = PERFORMANCE_MAX_SPEED * 0.004;
        const PERFORMANCE_THRUST_DECEL = PERFORMANCE_MAX_SPEED * 0.6;
        const PERFORMANCE_BOOST_MAX_SPEED = 1800 / DIST_SCALE; // 1800 km/s
        const PERFORMANCE_BOOST_ACCEL = PERFORMANCE_BOOST_MAX_SPEED * 0.2;
        const PERFORMANCE_BOOST_DECEL = PERFORMANCE_BOOST_ACCEL * 3;

        const harbingerHandling: ISpaceshipHandling = {
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
        const MODEL_URL = './assets/models/harbinger-mothership/harbinger_mothership.glb';

        // The GLB is authored bow-along-+Z, so no orientation correction.
        const MODEL_ROTATION = new THREE.Euler(0, 0, 0);

        const arcWeaponConfig: Partial<ILightningWeaponConfig> = {
            beamColor: 0x30ff60,
            optimalRange: 35_000 / DIST_SCALE,
            damage: 30,
            coreWidth: 0.03 / DIST_SCALE, // km
            haloWidth: 0.07 / DIST_SCALE, // km
            damageInterval: 0.2,
            coolPerSecond: 1.25,
            wobbleFraction: 0.05,
        };

        super(dependencies, scene, {
            position: position,
            velocity: velocity,
            mass: SPACESHIP_MASS,
            radius: SPACESHIP_RADIUS,
            mesh: containerMesh,
            id: id,
            name: 'Harbinger Mothership',
            handling: harbingerHandling,
            weaponGroups: [
                new WeaponGroup([new LightningWeapon(scene, SPACESHIP_RADIUS, arcWeaponConfig)]),
                new WeaponGroup([
                    new MissileWeapon(scene, SPACESHIP_RADIUS, {
                        salvoSize: 4,
                        missileLength: 0.015 / RADIUS_SCALE, // 15 m
                    }),
                ]),
            ],
            healthPoints: SPACESHIP_HEALTH_POINTS,
            shield: { hullMultiplier: 4, rechargeTime: 180 },
            shipTypeId: 'harbinger_mothership',
            role: ShipRole.Capital,
            thirdPersonOffset: THIRD_PERSON_OFFSET,
        });

        // Kick off the async model load; offsets are applied once the bbox is known.
        loadShipGltfInto(containerMesh, MODEL_URL, SPACESHIP_RADIUS, MODEL_ROTATION)
            .then((localBbox) => {
                this.applyModelOffsets(localBbox);
                // Materials are cloned per ship by the loader, so this doesn't leak to others.
                containerMesh.traverse((child) => {
                    const mesh = child as THREE.Mesh;
                    if (!mesh.isMesh) return;
                    const materials = Array.isArray(mesh.material)
                        ? mesh.material
                        : [mesh.material];
                    for (const material of materials) {
                        if (material instanceof THREE.MeshStandardMaterial) {
                            material.emissiveIntensity = EMISSIVE_INTENSITY;
                        }
                    }
                });
            })
            .catch((e) => {
                console.warn(
                    `Harbinger Mothership GLB load failed for ${MODEL_URL} — using placeholder mesh`,
                    e
                );
            });
    }
}
