import * as THREE from 'three';
import { Spaceship } from './spaceship';
import { ISpaceshipHandling, IWeaponConfig } from '../interfaces';
import { C, SPACESHIP_RADIUS } from '../utilities/consts';
import { playWeaponFire } from '../utilities/audio';

// Flight tuning constants
const FLIGHT_MAX_SPEED = C * 0.005;
const FLIGHT_THRUST_ACCEL = FLIGHT_MAX_SPEED * 0.1;
const FLIGHT_THRUST_DECEL = FLIGHT_MAX_SPEED * 0.75;
const FLIGHT_THRUST_DECEL_TOLERANCE = FLIGHT_MAX_SPEED * 0.01;
const FLIGHT_BOOST_MAX_SPEED = C * 0.5;
const FLIGHT_BOOST_ACCEL = FLIGHT_BOOST_MAX_SPEED * 0.5;
const FLIGHT_BOOST_DECEL = FLIGHT_BOOST_MAX_SPEED * 0.5;
const FLIGHT_WARP_SPEED = C * 100;
const FLIGHT_WARP_ACCEL = FLIGHT_WARP_SPEED * 0.1;
const FLIGHT_WARP_DECEL = FLIGHT_WARP_SPEED * 0.99;
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
const FLIGHT_WARP_CHARGE_TIME = 2.0;

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

    // Misc
    flightWarpChargeTime: FLIGHT_WARP_CHARGE_TIME,
};

/**
 * A massive Star Destroyer.
 */
export class StarDestroyer extends Spaceship {
    constructor(
        dependencies: object,
        scene: THREE.Scene,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        id: string,
        modelName: string = 'star_destroyer'
    ) {

        // Weapon tuning for the Star Destroyer
        const starDestroyerWeaponConfig: IWeaponConfig = {
            baseSpeed: C * 0.2, // fast bolts relative to top speeds
            particleLifetime: 4.0,
            boltLength: SPACESHIP_RADIUS * 40,
            boltColor: 0x00eeff,
            boltHeadSize: SPACESHIP_RADIUS * 2400,
            fireRate: 10.56,
            damage: 1,
            fireSound: playWeaponFire,
        };

        super(
            dependencies,
            scene,
            position,
            velocity,
            id,
            modelName,
            fighterHandling,
            starDestroyerWeaponConfig
        );
    }
}
