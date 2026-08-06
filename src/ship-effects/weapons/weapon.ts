import * as THREE from 'three';
import { Body } from '../../bodies/body';

/**
 * Base class for all ship weapon systems.
 *
 * Each weapon owns its own configuration (constants live inside the class file),
 * its own rendering objects, firing logic, and fire sound.  Ship classes mount a
 * loadout of Weapon classes; swapping weapon classes on a ship is a one-line change.
 *
 * Lifecycle (driven by Spaceship / flight-controllers / animation-loop):
 *   - tryFire(dt, origin, direction, shipVelocity) — called every frame while the
 *     trigger is held and the ship is controllable.  Burst weapons (e.g. BoltWeapon)
 *     rate-limit via an internal cooldown; continuous weapons (e.g. LaserWeapon)
 *     refresh their aim/origin each call.
 *   - stopFire() — called when the trigger is released.  No-op for burst weapons,
 *     terminates beams for continuous weapons.
 *   - update(wallDt, simDt, bodies, cameraPosition, excludeBody) — called once per
 *     frame while the owning ship is in flight mode.
 *   - reset() — clear all active state on flight exit.
 *   - dispose() — release GPU resources on ship destruction.
 */
export abstract class Weapon {
    protected constructor(protected readonly scene: THREE.Scene) {}

    /** Trigger pulled (held). Implementations must not assume single-shot. */
    abstract tryFire(
        dt: number,
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        shipVelocity: THREE.Vector3
    ): void;

    /** Trigger released. Default no-op — burst weapons ignore it. */
    stopFire(): void {}

    abstract update(
        wallDt: number,
        simDt: number,
        bodies: Body[],
        cameraPosition: THREE.Vector3,
        excludeBody?: Body
    ): void;

    /** Clear active projectiles/beams and reset timers. Called on flight exit. */
    reset(): void {}

    /** Release GPU resources. Called on ship destruction. */
    dispose(): void {}
}

/** Constructor signature for a weapon class — used when mounting loadouts on ships. */
export type WeaponConstructor = new (scene: THREE.Scene) => Weapon;
