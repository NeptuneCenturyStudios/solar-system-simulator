import * as THREE from 'three';
import { Body } from '../../bodies/body';
import { IDamageEffectiveness } from '../../interfaces';
import { LoopSoundController } from '../../utilities/audio.js';
import { IBodyRayHit, IWeaponOwner, Weapon, muzzleWorldPosition, raycastBodies } from './weapon';

/**
 * Configuration every continuous beam weapon shares: how far it reaches, what it costs to hold,
 * and what it does to whatever it touches. Subclasses extend this with their own look — the
 * laser's core/halo widths, the lightning's propagation speed and crackle rate.
 *
 * Nothing here knows how the beam is *drawn*. That is the whole point: the damage, heat, sound
 * and pause semantics below are identical whether the beam is a straight line of light or a
 * jagged arc, and two copies of them would drift apart.
 */
export interface IBeamWeaponConfig {
    /** Maximum beam reach in world units. */
    maxRange: number;
    /** Beam colour (outer glow). */
    beamColor: number;
    /** HP damage dealt per damage tick while the beam touches a body. */
    damage: number;
    /**
     * Distance (world units) out to which the beam deals full damage. Beyond it the beam has
     * diverged into a wider spot, so damage falls off with the inverse square of distance:
     * 2× optimal range = 25 %, 10× = 1 %.
     */
    optimalRange: number;
    /** Damage multiplier against shields (1 = full damage). */
    shieldEffectiveness: number;
    /** Damage multiplier against hulls and unshielded bodies (1 = full damage). */
    hullEffectiveness: number;
    /** Minimum seconds between damage ticks on the same body. */
    damageInterval: number;
    /** Thermal load gained per second while the trigger is held (0..1 scale). */
    heatPerSecond: number;
    /** Thermal load lost per second while the trigger is released (0..1 scale). */
    coolPerSecond: number;
    /**
     * Starts the continuous beam sound when the trigger is pulled. Receives the muzzle position;
     * the loop is then moved with the muzzle each frame. The returned controller is stopped
     * automatically on trigger release / reset / dispose.
     */
    loopSound?: (position: THREE.Vector3) => LoopSoundController | null;
}

/**
 * A held beam: fires while the trigger is down, hitscan along a straight axis, and grows out
 * from the muzzle at a fixed speed until it reaches its target or its maximum range.
 *
 * Subclasses supply three things and nothing else:
 *   - {@link propagationSpeed} — how fast the leading edge travels (u/s);
 *   - {@link renderBeam} — how to draw it, given the origin, axis and current length;
 *   - {@link setBeamVisible} — how to hide it when it stops firing.
 *
 * Everything else — the trigger edges, the ray-sphere hit test, the throttled `weapon:hit`
 * dispatch, thermal build-up and cool-down, the loop sound, and the rule that a beam frozen by
 * a pause stays on screen until the sim resumes — lives here once.
 *
 * Damage always travels along the straight axis between muzzle and tip, whatever the beam is
 * drawn to look like. A jagged arc is decoration; the shot still goes where it was aimed.
 */
export abstract class BeamWeaponBase extends Weapon {
    /** The shared half of this weapon's configuration. */
    protected readonly beam: IBeamWeaponConfig;

    /** Shield/hull multipliers sent with every hit — built once from the config. */
    private readonly effectiveness: IDamageEffectiveness;

    /** True while the trigger is held (beam active). */
    protected active = false;
    /** True if the beam was active on the previous update (edge detection). */
    private prevBeamVisible = false;

    /** Current-frame world-space muzzle position, re-read from the owner's live transform. */
    protected readonly curOrigin = new THREE.Vector3();
    /** Normalised world-space aim direction for the current frame. */
    protected readonly direction = new THREE.Vector3(0, 0, 1);
    /** World-space beam tip (impact point or the leading edge's current position). */
    protected readonly tip = new THREE.Vector3();

    /** Seconds until the next permitted damage tick. */
    private hitCooldown = 0;

    /** How far the leading edge has grown from the muzzle; resets on each trigger pull. */
    protected beamFront = 0;

    /** Scratch for the per-frame beam hit test. */
    protected readonly hit: IBodyRayHit = { t: 0, body: null };

    /**
     * Speed (world units/s) the leading edge advances at while the trigger is held. Sim-time
     * based, so the beam's growth follows the time scale and freezes while paused.
     */
    protected abstract get propagationSpeed(): number;

    protected constructor(scene: THREE.Scene, beam: IBeamWeaponConfig) {
        super(scene);
        this.beam = beam;
        this.effectiveness = {
            shield: beam.shieldEffectiveness,
            hull: beam.hullEffectiveness,
        };
    }

    override get damageEffectiveness(): Readonly<IDamageEffectiveness> {
        return this.effectiveness;
    }

    /** Full-damage range: past it the beam still reaches, but falls off with distance². */
    override get effectiveRange(): number {
        return this.beam.optimalRange;
    }

    /**
     * Damage multiplier for a hit at `distance` world units: 1 inside optimal range, then
     * inverse-square (spot area grows with distance², so intensity drops with it).
     */
    override damageFalloffAt(distance: number): number {
        const optimal = this.beam.optimalRange;
        if (distance <= optimal) return 1;
        const ratio = optimal / distance;
        return ratio * ratio;
    }

    // ── Firing ───────────────────────────────────────────────────────────────

    /**
     * Refresh the beam aim while the trigger is held. Starts the beam loop sound on the rising
     * edge only.
     */
    override tryFire(
        dt: number,
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        _shipVelocity: THREE.Vector3,
        _target: Body | null
    ): void {
        const wasActive = this.active;
        this.active = true;
        this.direction.copy(direction).normalize();

        if (this.overheated) return;
        this.addHeat(this.beam.heatPerSecond * dt);

        if (!wasActive) {
            this.beginSound(origin);
        }
    }

    /** Release the trigger — cuts the beam and fades out the beam sound. */
    override stopFire(): void {
        this.active = false;
        this.beamFront = 0;
        super.stopFire();
    }

    // ── Per-frame ────────────────────────────────────────────────────────────

    /**
     * Advance the beam: grow the leading edge, cast the ray-sphere hit test, position the tip
     * and dispatch throttled `weapon:hit` events, then hand the geometry to {@link renderBeam}.
     *
     * @param isPaused True while the sim is paused — freezes cooldown/thermal decay, and defers
     *   the hide-on-release transition so a beam that was visible when the sim was paused (e.g.
     *   via flight exit) stays on screen until the sim actually resumes.
     */
    override update(
        _wallDt: number,
        simDt: number,
        bodies: Body[],
        cameraPosition: THREE.Vector3,
        owner: IWeaponOwner,
        isPaused: boolean
    ): void {
        if (!isPaused) {
            this.hitCooldown -= simDt;
            this.updateThermal(simDt, this.active, this.beam.coolPerSecond);
        }

        if (!this.active || this.overheated) {
            // Hide the beam when the trigger is released or the weapon overheats — but only once
            // the sim is actually running, so a beam frozen by a pause stays visible until the
            // sim resumes.
            if (this.prevBeamVisible && !isPaused) {
                this.setBeamVisible(false);
                this.prevBeamVisible = false;
                this.endLoopSound();
            }
            return;
        }

        // This update runs AFTER the physics step, so the owner's transform is already the
        // post-physics one — read the muzzle straight off the live mesh. No extrapolation, so
        // the beam stays pinned to the nose under thrust/boost and while steering.
        muzzleWorldPosition(owner, this.curOrigin, this);

        // Keep the beam sound at the muzzle so it fades and pans with the ship. If the buffer
        // hadn't finished decoding when the trigger was pulled, this also retries starting the
        // loop every frame while the beam stays active.
        this.updateLoopSound(this.curOrigin);

        // The hit test doesn't depend on the leading edge, so it runs first: that lets the
        // edge's advance know how far it actually has to go this shot.
        const { t: hitT, body: hitBody } = raycastBodies(
            this.curOrigin,
            this.direction,
            this.beam.maxRange,
            bodies,
            owner,
            this.hit
        );

        const reach = Math.min(hitT, this.beam.maxRange);
        this.beamFront = Math.min(
            this.beamFront + this.advanceFront(simDt, reach),
            this.beam.maxRange
        );
        this.onBeamTick(simDt);

        // The visible beam stops at the first body it reaches; the leading edge may still be
        // travelling toward it.
        const renderLength = Math.min(this.beamFront, hitT);
        this.tip.copy(this.curOrigin).addScaledVector(this.direction, renderLength);

        // Only score a hit once the leading edge has actually arrived at the body.
        if (hitBody && this.beamFront >= hitT && this.hitCooldown <= 0) {
            this.hitCooldown = this.beam.damageInterval;
            window.dispatchEvent(
                new CustomEvent('weapon:hit', {
                    detail: {
                        body: hitBody,
                        position: this.tip.clone(),
                        damage: this.beam.damage * this.damageFalloffAt(hitT),
                        effectiveness: this.effectiveness,
                        shooter: owner,
                    },
                })
            );
        }

        this.renderBeam(this.curOrigin, this.direction, renderLength, cameraPosition);

        if (!this.prevBeamVisible) {
            this.setBeamVisible(true);
            this.prevBeamVisible = true;
        }
    }

    /**
     * Distance the leading edge advances this frame. The default travels at
     * {@link propagationSpeed}; a subclass can instead cover a fixed fraction of `reach` per
     * second, so the beam lands in the same time however far away its target is.
     * @param simDt Sim-time seconds advanced this frame.
     * @param reach Distance to the first body hit, or to `maxRange` if nothing is in the way.
     */
    protected advanceFront(simDt: number, _reach: number): number {
        return this.propagationSpeed * simDt;
    }

    /**
     * Per-frame hook for subclass animation state (the laser's brightness shimmer, the
     * lightning's crackle timer). Called only while the beam is live, before it is drawn.
     * @param simDt Sim-time seconds advanced this frame.
     */
    protected onBeamTick(_simDt: number): void {}

    /**
     * Draw the beam for this frame.
     * @param origin World-space muzzle position.
     * @param direction Unit aim direction (the straight damage axis).
     * @param length World-space length from `origin` to the current tip.
     * @param cameraPosition Camera world position, for camera-relative geometry.
     */
    protected abstract renderBeam(
        origin: THREE.Vector3,
        direction: THREE.Vector3,
        length: number,
        cameraPosition: THREE.Vector3
    ): void;

    /** Show or hide every object this beam draws with. */
    protected abstract setBeamVisible(visible: boolean): void;

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /** Cut the beam, stop the loop sound, and reset timers. Not called automatically on flight exit. */
    override reset(): void {
        this.active = false;
        this.prevBeamVisible = false;
        this.hitCooldown = 0;
        this.beamFront = 0;
        this.setBeamVisible(false);
        super.reset();
    }
}
