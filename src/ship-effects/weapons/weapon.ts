import * as THREE from 'three';
import { Body } from '../../bodies/body';
import { LoopSoundController } from '../../utilities/audio';

/**
 * Structural owner contract for weapons.  Satisfied by Spaceship (and any
 * future armed body) without an import cycle: Body does not import weapon.ts.
 */
export interface IWeaponOwner extends Body {
    /** Local-space offset to the weapon muzzle (nose). */
    muzzleOffset: THREE.Vector3;
}

/** Sound trigger lifecycle configurable per weapon. */
export interface IWeaponSound {
    /**
     * One-shot sound played on each trigger rising edge (e.g. the blaster).
     * Mutually exclusive with `loop`.
     */
    fire?: () => void;
    /**
     * Loop sound started on the trigger rising edge and stopped when the
     * trigger is released / reset / disposed (e.g. the laser beam).
     * Mutually exclusive with `fire`.
     */
    loop?: () => LoopSoundController | null;
}

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
     *   - update(wallDt, simDt, bodies, cameraPosition, owner) — called once per
     *     frame while the owning ship is in flight mode.
 *   - reset() — clear all active state on flight exit.
 *   - dispose() — release GPU resources on ship destruction.
 */
export abstract class Weapon {
    /** Per-weapon sound triggers (one-shot and/or loop), or null if silent. */
    protected weaponSound: IWeaponSound | null = null;
    /** Active loop controller — started by beginSound(), stopped by stopFire()/reset()/dispose(). */
    private loopSound: LoopSoundController | null = null;

    protected constructor(protected readonly scene: THREE.Scene) {}

    /**
     * Play the weapon's fire sound.  Subclasses call this from tryFire() on the
     * trigger rising edge:
     *   - Loop weapons start their loop here; retries each frame until the
     *     audio buffer finishes loading (mirrors the warp-loop pattern), then
     *     keeps it playing until stopFire()/reset()/dispose().
     *   - One-shot weapons (or silent weapons with no sound configured) play
     *     their sound immediately and return.
     */
    protected beginSound(): void {
        const loopFactory = this.weaponSound?.loop;
        if (loopFactory) {
            // Loop already running — nothing to do (prevents stack-ups on
            // rapid re-fire while the buffer is still loading).
            if (this.loopSound) return;
            this.loopSound = loopFactory();
            return;
        }
        this.weaponSound?.fire?.();
    }

    /**
     * Keep retrying to start a pending loop sound.  Call from update() while
     * the trigger is held; the loop factory returns null until its audio
     * buffer finishes decoding, so this picks it up mid-hold.  No-op once the
     * loop is running or when the weapon has no loop sound.
     */
    protected updateLoopSound(): void {
        const loopFactory = this.weaponSound?.loop;
        if (!loopFactory || this.loopSound) return;
        this.loopSound = loopFactory();
    }

    /** Stop the weapon's loop sound. Fades out briefly to avoid a click. */
    protected endLoopSound(fadeDuration = 0.15): void {
        if (!this.loopSound) return;
        this.loopSound.stop(fadeDuration);
        this.loopSound = null;
    }

    /** Trigger pulled (held). Implementations must not assume single-shot. */
    abstract tryFire(
        dt: number,
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        shipVelocity: THREE.Vector3
    ): void;

    /** Trigger released. Base stops any looping weapon sound. */
    stopFire(): void {
        this.endLoopSound();
    }

    abstract update(
        wallDt: number,
        simDt: number,
        bodies: Body[],
        cameraPosition: THREE.Vector3,
        owner: IWeaponOwner
    ): void;

    /** Clear active projectiles/beams, stop loop sounds, and reset timers. Called on flight exit. */
    reset(): void {
        if (this.loopSound) {
            this.loopSound.stop(0);
            this.loopSound = null;
        }
    }

    /** Release GPU + audio resources. Called on ship destruction. */
    dispose(): void {
        this.loopSound?.dispose();
        this.loopSound = null;
    }
}

/** Constructor signature for a weapon class — used when mounting loadouts on ships. */
export type WeaponConstructor = new (scene: THREE.Scene) => Weapon;
