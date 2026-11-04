import * as THREE from 'three';
import { ISpaceshipHandling } from '../../interfaces';
import { C, DIST_SCALE, MASS_SCALE, RADIUS_SCALE } from '../../utilities/consts';
import { Spaceship } from './spaceship';
import {
    createShipContainerMesh,
    loadShipGltfInto,
    modelPointToShipLocal,
} from './ship-model-loader';
import { ILaserWeaponConfig, LaserWeapon } from '../../ship-effects/weapons/laser-weapon';
import { MissileWeapon } from '../../ship-effects/weapons/missile-weapon';
import { WeaponGroup } from '../../ship-effects/weapons/weapon-group';

/**
 * Light fighter. Starts with the same flight tuning as the Zenith, but the values are
 * deliberately duplicated here so each ship can be tweaked independently. Armed with a pair of
 * wingtip lasers that fire together, plus a missile launcher.
 */
export class Dart extends Spaceship {
    constructor(
        dependencies: object,
        scene: THREE.Scene,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        id: string
    ) {
        // Ship radius
        const SPACESHIP_MASS = 75000 / MASS_SCALE;
        const SPACESHIP_RADIUS = 20 / 1000 / RADIUS_SCALE;
        // Hull HP set explicitly — the ship's real-world mass scaled by MASS_SCALE
        // (calibrated for planetary bodies) would otherwise yield a near-zero HP pool.
        const SPACESHIP_HEALTH_POINTS = 20;

        // Camera placement (ship-local space; +Z = forward, +Y = up). Tune these to
        // adjust how the chase cam frames the fighter.
        const THIRD_PERSON_OFFSET = new THREE.Vector3(
            0,
            SPACESHIP_RADIUS * 0.35,
            -SPACESHIP_RADIUS * 1.8
        );

        // Flight tuning constants
        const FLIGHT_MAX_SPEED = 500 / 1000 / DIST_SCALE; // 500 m/s
        const FLIGHT_THRUST_ACCEL = FLIGHT_MAX_SPEED * 0.1;
        const FLIGHT_THRUST_DECEL = FLIGHT_MAX_SPEED * 0.75;
        const FLIGHT_THRUST_DECEL_TOLERANCE = FLIGHT_MAX_SPEED * 0.01;
        const FLIGHT_BOOST_MAX_SPEED = 2.5 / DIST_SCALE; // 2.5 km/s
        const FLIGHT_BOOST_ACCEL = FLIGHT_BOOST_MAX_SPEED * 0.2;
        const FLIGHT_BOOST_DECEL = FLIGHT_BOOST_ACCEL * 5;
        const FLIGHT_WARP_SPEED = C * 5;
        const FLIGHT_WARP_ACCEL = FLIGHT_WARP_SPEED * 0.1;
        const FLIGHT_WARP_DECEL = FLIGHT_WARP_SPEED * 5;
        const FLIGHT_WARP_DECEL_TOLERANCE = FLIGHT_WARP_SPEED * 0.01;
        const FLIGHT_PERP_DECAY = 1.32;
        const FLIGHT_MAX_POINTER_OFFSET = 260;
        const FLIGHT_MAX_TURN_RATE = 1.58;
        const FLIGHT_STEER_SMOOTH_RATE = 0.66;
        const FLIGHT_STEER_DEADZONE = 0.05;
        const FLIGHT_ROLL_SPEED = 5.28;
        const FLIGHT_ROLL_ACCEL = 1.06;
        const FLIGHT_ROLL_FRICTION = 1.06;
        const FLIGHT_BANK_LERP_SPEED = 13.76;
        const FLIGHT_MAX_BANK_ANGLE = 0.35;
        const FLIGHT_MAX_BANK_PITCH = 0.2;
        const FLIGHT_MAX_BANK_YAW = 0.2;
        const FLIGHT_WARP_CHARGE_TIME = 2.0;
        // High speed tuning — normal flight and boost are tuned low for dogfights
        const PERFORMANCE_MAX_SPEED = 500 / DIST_SCALE; // 500 km/s
        const PERFORMANCE_THRUST_ACCEL = PERFORMANCE_MAX_SPEED * 0.1;
        const PERFORMANCE_THRUST_DECEL = PERFORMANCE_MAX_SPEED * 0.75;
        const PERFORMANCE_BOOST_MAX_SPEED = 2500 / DIST_SCALE; // 2500 km/s
        const PERFORMANCE_BOOST_ACCEL = PERFORMANCE_BOOST_MAX_SPEED * 0.2;
        const PERFORMANCE_BOOST_DECEL = PERFORMANCE_BOOST_ACCEL * 5;

        const fighterHandling: ISpaceshipHandling = {
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
        const MODEL_URL = './assets/models/dart/dart.glb';

        // Correct model orientation if the nose is not authored along +Z.
        const MODEL_ROTATION = new THREE.Euler(0, 0, 0);

        // Custom laser weapon config
        const laserWeaponConfig: Partial<ILaserWeaponConfig> = {
            beamColor: 0x0020ff,
            damage: 1,
            coreWidth: 1,
            haloWidth: 4,
            heatPerSecond: 0.5,
            damageInterval: 0.2,
            coolPerSecond: 1.25,
        };

        // Wing gun muzzles in dart.glb's own coordinates (+Z nose, +Y up): the barrel tips under
        // each wingtip, read off the model in Blender. Each one gets its own laser, and the
        // pair fires together as one group.
        const WING_GUN_MUZZLES = [
            new THREE.Vector3(10.253, 1.444, 3.772),
            new THREE.Vector3(-10.253, 1.444, 3.772),
        ];
        const wingLasers = WING_GUN_MUZZLES.map(
            () => new LaserWeapon(scene, SPACESHIP_RADIUS, laserWeaponConfig)
        );

        super(dependencies, scene, {
            position: position,
            velocity: velocity,
            mass: SPACESHIP_MASS,
            radius: SPACESHIP_RADIUS,
            mesh: containerMesh,
            id: id,
            name: 'Dart',
            handling: fighterHandling,
            weaponGroups: [
                new WeaponGroup(wingLasers),
                new WeaponGroup([new MissileWeapon(scene, SPACESHIP_RADIUS)]),
            ],
            healthPoints: SPACESHIP_HEALTH_POINTS,
            shield: { hullMultiplier: 2, rechargeTime: 30 },
            shipTypeId: 'dart',
            thirdPersonOffset: THIRD_PERSON_OFFSET,
        });

        // Kick off the async model load; offsets are applied once the bbox is known.
        loadShipGltfInto(containerMesh, MODEL_URL, SPACESHIP_RADIUS, MODEL_ROTATION)
            .then((localBbox) => {
                this.applyModelOffsets(localBbox);
                // Until the model is in, the lasers fire from the shared nose muzzle.
                wingLasers.forEach((laser, i) => {
                    laser.mountOffset = modelPointToShipLocal(
                        containerMesh,
                        WING_GUN_MUZZLES[i],
                        new THREE.Vector3()
                    );
                });
            })
            .catch((e) => {
                console.warn(`Dart GLB load failed for ${MODEL_URL} — using placeholder mesh`, e);
            });
    }
}
