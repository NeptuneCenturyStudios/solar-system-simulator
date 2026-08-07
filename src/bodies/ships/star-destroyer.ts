import * as THREE from 'three';
import { Spaceship } from './spaceship';
import { ISpaceshipHandling } from '../../interfaces';
import { C, MASS_SCALE, RADIUS_SCALE, SCALE_FACTOR } from '../../utilities/consts';
import { LaserWeapon } from '../../ship-effects/weapons/laser-weapon';
import { createShipContainerMesh, loadShipModelInto } from './ship-model-loader';

/**
 * A massive Star Destroyer.
 */
export class StarDestroyer extends Spaceship {
    constructor(
        dependencies: object,
        scene: THREE.Scene,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        id: string
    ) {
        const SPACESHIP_MASS = (40_000_000 / MASS_SCALE) * SCALE_FACTOR;
        const SPACESHIP_RADIUS = (0.8 / RADIUS_SCALE) * SCALE_FACTOR;

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

        const containerMesh = createShipContainerMesh();
        const MODEL_NAME = 'star-destroyer';
        // The OBJ is authored with its length axis ~39° off +Z (prow near
        // (2.9, 3.8), stern midpoint near (-2.2, -2.5)) and its bridge already
        // at +Y.  Yawing about Y points the prow along +Z (forward), matching
        // the game's ship-axis convention.  -41.4° is the exact angle at which
        // the hull's port/starboard bbox halves are equal (x:[-3.53, 3.53]);
        // -39° left the nose ~2.2° off the flight axis.  No pitch/roll needed.
        const MODEL_ROTATION = new THREE.Euler(
            0,
            THREE.MathUtils.degToRad(-41.4),
            0
        );

        super(dependencies, scene, {
            position: position,
            velocity: velocity,
            mass: SPACESHIP_MASS,
            radius: SPACESHIP_RADIUS,
            mesh: containerMesh,
            id: id,
            name: 'StarDestroyer',
            handling: fighterHandling,
            weapons: [new LaserWeapon(scene, SPACESHIP_RADIUS)],
        });

        // Kick off the async model load; offsets are applied once the bbox is known.
        loadShipModelInto(containerMesh, MODEL_NAME, SPACESHIP_RADIUS, MODEL_ROTATION)
            .then((localBbox) => {
                this.applyModelOffsets(localBbox);
            })
            .catch((e) => {
                console.warn(
                    `StarDestroyer OBJ/MTL load failed for ${MODEL_NAME} — using placeholder mesh`,
                    e
                );
            });
    }
}
