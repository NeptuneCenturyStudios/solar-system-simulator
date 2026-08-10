import * as THREE from 'three';
import { Spaceship } from './spaceship';
import { ISpaceshipHandling } from '../../interfaces';
import { C, MASS_SCALE, RADIUS_SCALE, SCALE_FACTOR } from '../../utilities/consts';
import { ILaserWeaponConfig, LaserWeapon } from '../../ship-effects/weapons/laser-weapon';
import { createShipContainerMesh, loadShipModelInto } from './ship-model-loader';

/**
 * A massive alien mothership.
 */
export class OsirisMothership extends Spaceship {
    constructor(
        dependencies: object,
        scene: THREE.Scene,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        id: string
    ) {
        const SPACESHIP_MASS = (40_000_000 / MASS_SCALE) * SCALE_FACTOR;
        const SPACESHIP_RADIUS = (2 / RADIUS_SCALE) * SCALE_FACTOR;

        // Camera placement (ship-local space; +Z = forward, +Y = up). Tune these to
        // adjust how the chase cam frames the destroyer.
        const THIRD_PERSON_OFFSET = new THREE.Vector3(
            0,
            SPACESHIP_RADIUS * 0.35,
            -SPACESHIP_RADIUS * 1
        );

        // Flight tuning constants — deliberately much heavier/sluggish than the Zenith fighter
        const FLIGHT_MAX_SPEED = C * 0.003;
        const FLIGHT_THRUST_ACCEL = FLIGHT_MAX_SPEED * 0.025;
        const FLIGHT_THRUST_DECEL = FLIGHT_MAX_SPEED * 0.35;
        const FLIGHT_THRUST_DECEL_TOLERANCE = FLIGHT_MAX_SPEED * 0.01;
        const FLIGHT_BOOST_MAX_SPEED = C * 0.4;
        const FLIGHT_BOOST_ACCEL = FLIGHT_BOOST_MAX_SPEED * 0.2;
        const FLIGHT_BOOST_DECEL = FLIGHT_BOOST_MAX_SPEED * 0.25;
        const FLIGHT_WARP_SPEED = C * 100;
        const FLIGHT_WARP_ACCEL = FLIGHT_WARP_SPEED * 0.04;
        const FLIGHT_WARP_DECEL = FLIGHT_WARP_SPEED * 0.9;
        const FLIGHT_WARP_DECEL_TOLERANCE = FLIGHT_WARP_SPEED * 0.01;
        const FLIGHT_PERP_DECAY = 0.5;
        const FLIGHT_MAX_POINTER_OFFSET = 340;
        const FLIGHT_MAX_TURN_RATE = 0.55;
        const FLIGHT_STEER_SMOOTH_RATE = 0.28;
        const FLIGHT_STEER_DEADZONE = 0.08;
        const FLIGHT_ROLL_SPEED = 1.6;
        const FLIGHT_ROLL_ACCEL = 0.32;
        const FLIGHT_ROLL_FRICTION = 0.5;
        const FLIGHT_BANK_LERP_SPEED = 4.5;
        const FLIGHT_MAX_BANK_ANGLE = 0.12;
        const FLIGHT_MAX_BANK_PITCH = 0.07;
        const FLIGHT_WARP_CHARGE_TIME = 5.0;

        const destroyerHandling: ISpaceshipHandling = {
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
        const MODEL_NAME = 'osiris-mothership/mother ship';
        
        // Correct model orientation so that the rear is facing the camera and not the front
        const MODEL_ROTATION = new THREE.Euler(
            THREE.MathUtils.degToRad(180),
            0,
            THREE.MathUtils.degToRad(180),
        );

        const laserWeaponConfig: Partial<ILaserWeaponConfig> = {
            beamColor: 0x00ff00,
            damage: 100000,
            coreWidth: 5,
            haloWidth: 15,
        };

        super(dependencies, scene, {
            position: position,
            velocity: velocity,
            mass: SPACESHIP_MASS,
            radius: SPACESHIP_RADIUS,
            mesh: containerMesh,
            id: id,
            name: 'Osiris Mothership',
            handling: destroyerHandling,
            weapons: [new LaserWeapon(scene, SPACESHIP_RADIUS, laserWeaponConfig)],
            shipTypeId: 'osiris_mothership',
            thirdPersonOffset: THIRD_PERSON_OFFSET,
        });

        // Kick off the async model load; offsets are applied once the bbox is known.
        loadShipModelInto(containerMesh, MODEL_NAME, SPACESHIP_RADIUS, MODEL_ROTATION)
            .then((localBbox) => {
                this.applyModelOffsets(localBbox);
            })
            .catch((e) => {
                console.warn(
                    `Osiris Mothership OBJ/MTL load failed for ${MODEL_NAME} — using placeholder mesh`,
                    e
                );
            });
    }
}
