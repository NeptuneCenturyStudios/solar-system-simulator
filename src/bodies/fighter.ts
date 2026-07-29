import * as THREE from 'three';
import { Spaceship } from "./spaceship";
import { ISpaceshipHandling } from '../interfaces';
import { C } from '../utilities/consts';

// Fighter class extends Spaceship with additional properties and methods specific to fighter ships.
export class Fighter extends Spaceship {
    /** Additional properties specific to Fighter can be added here. */

    /**
     *
     */
    constructor(
            dependencies: object,
            scene: THREE.Scene,
            position: THREE.Vector3,
            velocity: THREE.Vector3,
            id: string,
            modelName: string = 'Lo_poly_Spaceship_01_by_Liz_Reddington'
        ) {

        // Flight tuning constants ===
        const FLIGHT_MAX_SPEED = C * 0.005; // A perceptible fraction of light speed (u/s) — already contains SCALE_FACTOR
        const FLIGHT_THRUST_ACCEL = FLIGHT_MAX_SPEED * 0.1; // acceleration rate while W/S held (u/s²)
        const FLIGHT_THRUST_DECEL = FLIGHT_MAX_SPEED * 0.75; // deceleration rate while W/S held (u/s²)
        const FLIGHT_THRUST_DECEL_TOLERANCE = FLIGHT_MAX_SPEED * 0.01; // tolerance for deceleration to stop (u/s²)
        const FLIGHT_BOOST_MAX_SPEED = C * 0.5;
        const FLIGHT_BOOST_ACCEL = FLIGHT_BOOST_MAX_SPEED * 0.5; // acceleration rate while Shift held (u/s²)
        const FLIGHT_BOOST_DECEL = FLIGHT_BOOST_MAX_SPEED * 0.5; // decel rate after boost ends (u/s²)
        const FLIGHT_WARP_SPEED = C * 100; // top warp speed (u/s) — FLIGHT_BOOST_MAX_SPEED already contains SCALE_FACTOR
        const FLIGHT_WARP_ACCEL = FLIGHT_WARP_SPEED * .1; // accel rate while warp engaged (u/s²)
        const FLIGHT_WARP_DECEL = FLIGHT_WARP_SPEED * .99; // decel rate after warp ends (u/s²)
        const FLIGHT_WARP_DECEL_TOLERANCE = FLIGHT_WARP_SPEED * 0.01; // tolerance for deceleration to stop (u/s²)

        const FLIGHT_PERP_DECAY = 1.32; // per second


        // Create a handling object with the specific flight characteristics for the Fighter class.
        const handling: ISpaceshipHandling = {
            flightMaxSpeed: FLIGHT_MAX_SPEED,
            flightThrustAccel: FLIGHT_THRUST_ACCEL,
            flightThrustDecel: FLIGHT_THRUST_DECEL,
            flightThrustDecelTolerance: FLIGHT_THRUST_DECEL_TOLERANCE,
            flightBoostMaxSpeed: FLIGHT_BOOST_MAX_SPEED,
            flightBoostAccel: FLIGHT_BOOST_ACCEL,
            flightBoostDecel: FLIGHT_BOOST_DECEL,
            flightWarpSpeed: FLIGHT_WARP_SPEED,
            flightWarpAccel: FLIGHT_WARP_ACCEL,
            flightWarpDecel: FLIGHT_WARP_DECEL,
            flightWarpDecelTolerance: FLIGHT_WARP_DECEL_TOLERANCE,
            flightPerpDecay: FLIGHT_PERP_DECAY
        };

        super(
            dependencies,
            scene,
            position,
            velocity,
            id,
            modelName,
            handling
        );
    }
}