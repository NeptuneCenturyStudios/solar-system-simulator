import * as THREE from 'three';
import { FollowShipAI } from './follow-ship-ai';
import {
    AI_AIM_CONE_ANGLE,
    AI_AIM_JITTER_ANGLE,
    AI_AIM_JITTER_PERIOD,
    AI_BURST_FIRE_TIME,
    AI_BURST_REST_TIME,
    AI_CLOSING_SPEED_TOLERANCE,
    AI_COMBAT_CLOSING_TOLERANCE_RATE,
    AI_FIRE_RANGE,
    NPC_COMBAT_FOLLOW_DISTANCE,
} from '../../utilities/consts';
import { muzzleWorldPosition } from '../../ship-effects/weapons/weapon';
import type { Spaceship } from '../../bodies/ships/spaceship';
import type { ISpaceshipHandling } from '../../interfaces';

// Scratch objects — reused every frame to keep the per-frame allocation count at zero, the
// invariant the whole AI layer is written to.
const _muzzle = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

/** Below this the intercept quadratic's leading coefficient is treated as zero. */
const INTERCEPT_EPSILON = 1e-12;

/**
 * A ship AI that hunts the player: everything {@link FollowShipAI} does to pursue and hold
 * station, plus gunnery.
 *
 * Pursuit is inherited wholesale rather than reimplemented — `update()` runs the base controller
 * first and then decides only whether to pull the trigger. That keeps steering, throttle, boost,
 * warp and obstacle avoidance identical to the follow AI, so combat behaviour can be tuned
 * without disturbing flight behaviour.
 *
 * Fair fight
 * ----------
 * The NPC is held to the same restrictions the player flies under. It aims within a cone of
 * AI_AIM_CONE_ANGLE about its own nose — matching the circle the player's reticle is clamped to —
 * so it cannot shoot behind itself and has to steer its target into the cone before it can
 * engage. It fires the ship's own mounted weapons through the same code path the player's
 * trigger uses, so cooldown, rate of fire, projectile speed and thermal load are not merely
 * similar but literally the same.
 *
 * It is not, however, a turret: the firing solution carries a drifting angular error, and the
 * trigger runs on a burst rhythm rather than being held down. Both are there to make it beatable
 * and to keep it clear of its own overheat lockout.
 */
export class CombatShipAI extends FollowShipAI {
    readonly name: string = 'Combat';

    /** Seconds remaining in the current burst or rest phase. */
    private burstTimer = AI_BURST_FIRE_TIME;
    /** True during the firing half of the burst cycle. */
    private triggerOpen = true;

    /** Current aim error, in radians of yaw/pitch off the firing solution. */
    private jitterYaw = 0;
    private jitterPitch = 0;
    /** Error being drifted toward; re-rolled every AI_AIM_JITTER_PERIOD. */
    private jitterTargetYaw = 0;
    private jitterTargetPitch = 0;
    /** Seconds until the next re-roll. */
    private jitterTimer = 0;

    constructor(ship: Spaceship) {
        super(ship, NPC_COMBAT_FOLLOW_DISTANCE);
    }

    /**
     * The inherited tolerance floors itself at a fraction of the ship's normal max speed, which
     * at a 500 m hold distance is roughly six times the largest speed this controller ever
     * commands. Left alone, every closing speed up to 1.5 km/s would read as "on station" and the
     * ship would coast straight through its target and back out again, never braking.
     *
     * Scaling the floor off the hold distance instead keeps the dead band proportionate to the
     * approach it is actually damping.
     */
    protected override closingSpeedTolerance(
        desiredClosing: number,
        _h: ISpaceshipHandling
    ): number {
        return Math.max(
            this.followDistance * AI_COMBAT_CLOSING_TOLERANCE_RATE,
            Math.abs(desiredClosing) * AI_CLOSING_SPEED_TOLERANCE
        );
    }

    /**
     * Slowest projectile this ship mounts, which is the one needing the most lead.
     *
     * Infinity when every weapon is hitscan, which collapses the intercept solve below to
     * "aim where the target is now" — the correct answer for a beam.
     */
    private slowestMuzzleSpeed(): number {
        let slowest = Infinity;
        for (const weapon of this.ship.weapons) {
            if (weapon.muzzleSpeed < slowest) slowest = weapon.muzzleSpeed;
        }
        return slowest;
    }

    /**
     * Time of flight to an intercept, or a negative number when no shot exists.
     *
     * Solved in the shooter's frame. A bolt leaves with world velocity `dir * S + shipVelocity`
     * (Galilean — see BoltWeapon.tryFire), so working relative to the shooter cancels its own
     * velocity out of the problem entirely and leaves the standard quadratic:
     *
     *     | r + w·t | = S·t        with r the offset to the target and w its relative velocity
     *     (|w|² − S²)·t² + 2(r·w)·t + |r|² = 0
     *
     * The relative form is not a refinement here — both ships share a large orbital velocity, and
     * solving in world coordinates would put the lead point hundreds of metres out.
     *
     * @param r Offset from muzzle to target.
     * @param w Target velocity relative to the shooter.
     * @param s Projectile muzzle speed.
     */
    private interceptTime(r: THREE.Vector3, w: THREE.Vector3, s: number): number {
        if (!Number.isFinite(s)) return 0; // hitscan — no lead needed

        const a = w.lengthSq() - s * s;
        const b = 2 * r.dot(w);
        const c = r.lengthSq();

        // Target closing at exactly projectile speed: the quadratic degenerates to a line.
        if (Math.abs(a) < INTERCEPT_EPSILON) {
            return b < 0 ? -c / b : -1;
        }

        const disc = b * b - 4 * a * c;
        // Only reachable when the target outruns the projectile (|w| > S), which a boosting ship
        // can do. There is genuinely no intercept — hold fire rather than shooting at nothing.
        if (disc < 0) return -1;

        const sqrtDisc = Math.sqrt(disc);
        const t1 = (-b - sqrtDisc) / (2 * a);
        const t2 = (-b + sqrtDisc) / (2 * a);

        // Soonest arrival that is actually in the future.
        const lo = Math.min(t1, t2);
        const hi = Math.max(t1, t2);
        if (lo > 0) return lo;
        if (hi > 0) return hi;
        return -1;
    }

    /**
     * Advance the burst cycle and the aim wander.
     *
     * @param dt Wall-clock seconds. Both are weapon-side rhythms, and the weapons themselves run
     *   their cooldown and thermal models on the wall clock, so these have to agree with them
     *   rather than with sim time.
     */
    private advanceTimers(dt: number): void {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
            this.triggerOpen = !this.triggerOpen;
            this.burstTimer = this.triggerOpen ? AI_BURST_FIRE_TIME : AI_BURST_REST_TIME;
        }

        this.jitterTimer -= dt;
        if (this.jitterTimer <= 0) {
            this.jitterTimer = AI_AIM_JITTER_PERIOD;
            this.jitterTargetYaw = (Math.random() * 2 - 1) * AI_AIM_JITTER_ANGLE;
            this.jitterTargetPitch = (Math.random() * 2 - 1) * AI_AIM_JITTER_ANGLE;
        }

        // Time-based exponential decay toward the rolled target, so the wander's speed is the
        // same on a 60 Hz and a 144 Hz display. A flat per-frame blend would drift faster the
        // higher the refresh rate, making the AI measurably more accurate on better hardware.
        const blend = 1 - Math.exp(-dt / AI_AIM_JITTER_PERIOD);
        this.jitterYaw += (this.jitterTargetYaw - this.jitterYaw) * blend;
        this.jitterPitch += (this.jitterTargetPitch - this.jitterPitch) * blend;
    }

    override update(dt: number, simDt: number): void {
        // Fly first. Every exit path of the base controller leaves controlInput.fire false — it
        // is cleared on the normal path, inside the warp cruise, and by resetControlInput() when
        // there is no target — so what follows starts from a released trigger and only has to
        // decide whether to raise it.
        super.update(dt, simDt);

        this.advanceTimers(dt);

        const ship = this.ship;
        if (ship.weapons.length === 0) return;

        // ── Hold-fire gates ──────────────────────────────────────────────────
        // Order is load-bearing. ObstacleAvoidance.evaluate() is not called on the base
        // controller's warp-cruise or no-target paths, so `avoidance.last` is a stale
        // previous-frame result on exactly those frames; the two gates that rule them out have
        // to come first.

        // Warp locks out weapons, the same as it does for the player.
        if (ship.warpActive || ship.warpCharging || ship.warpDecelerating) return;

        const target = this.getTarget();
        if (!target) return;

        // About to fly into something. Flying clear takes priority over shooting.
        if (this.avoidance.last.flee) return;

        // Between bursts.
        if (!this.triggerOpen) return;

        // Let a hot weapon cool rather than holding a trigger that does nothing — the thermal
        // model deliberately stops cooling while the trigger is held.
        for (const weapon of ship.weapons) {
            if (weapon.isOverheated) return;
        }

        // ── Firing solution ──────────────────────────────────────────────────
        muzzleWorldPosition(ship, _muzzle);
        _toTarget.subVectors(target.mesh.position, _muzzle);
        const dist = _toTarget.length();
        if (dist > AI_FIRE_RANGE || dist < INTERCEPT_EPSILON) return;

        _relVel.subVectors(target.velocity, ship.velocity);
        const flightTime = this.interceptTime(_toTarget, _relVel, this.slowestMuzzleSpeed());
        if (flightTime < 0) return; // target outruns the projectile — no shot exists

        // Lead the target to where it will be, then aim at that point from the muzzle.
        _aim.copy(target.mesh.position)
            .addScaledVector(target.velocity, flightTime)
            .sub(_muzzle)
            .normalize();

        // ── Aim cone ─────────────────────────────────────────────────────────
        // Measured about the control frame's forward axis, not the mesh's: the player's cone is
        // centred on the chase camera, which tracks the control frame, while mesh.quaternion
        // carries the visual bank on top and would tilt the cone with every turn.
        _forward.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
        _right.set(1, 0, 0).applyQuaternion(ship.controlFrameQuat);
        _up.set(0, 1, 0).applyQuaternion(ship.controlFrameQuat);

        // Jitter before the cone test, so the direction actually fired is the one checked — the
        // ship can never put a round outside its own cone.
        _aim.addScaledVector(_right, this.jitterYaw)
            .addScaledVector(_up, this.jitterPitch)
            .normalize();

        if (_forward.dot(_aim) < Math.cos(AI_AIM_CONE_ANGLE)) return;

        ship.controlInput.aimDir.copy(_aim);
        ship.controlInput.fire = true;
    }
}
