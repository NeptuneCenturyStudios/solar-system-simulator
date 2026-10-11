import * as THREE from 'three';
import { FollowShipAI, hullRadius } from './follow-ship-ai';
import {
    AI_AIM_CONE_ANGLE,
    AI_AIM_JITTER_ANGLE,
    AI_AIM_JITTER_PERIOD,
    AI_BURST_FIRE_TIME,
    AI_BURST_REST_TIME,
    AI_CLOSING_SPEED_TOLERANCE,
    AI_COMBAT_CLOSING_TOLERANCE_RATE,
    AI_DASH_ALIGN_ANGLE,
    AI_DASH_COOLDOWN,
    AI_DASH_MAX_TIME,
    AI_DASH_MIN_DISTANCE,
    AI_DOGFIGHT_BREAK_ANGLE,
    AI_DOGFIGHT_COLLISION_DISTANCE,
    AI_DOGFIGHT_DISENGAGE_FACTOR,
    AI_DOGFIGHT_ENGAGE_RANGE,
    AI_DOGFIGHT_EXTEND_DISTANCE,
    AI_DOGFIGHT_EXTEND_MAX_TIME,
    AI_DOGFIGHT_EXTEND_MIN_TIME,
    AI_DOGFIGHT_FLANK_OFFSET,
    AI_DOGFIGHT_HEAD_ON_ANGLE,
    AI_DOGFIGHT_HEAD_ON_BREAK_TIME,
    AI_DOGFIGHT_OVERSHOOT_DISTANCE,
    AI_DOGFIGHT_OVERSHOOT_OPENING_SPEED,
    AI_DOGFIGHT_POSITION_MAX_LEAD,
    AI_DOGFIGHT_TAIL_DISTANCE,
    AI_DOGFIGHT_TAIL_ENTER_ASPECT,
    AI_DOGFIGHT_TAIL_EXIT_ASPECT,
    AI_DOGFIGHT_THREAT_ANGLE,
    AI_EVADE_CONE_ANGLE,
    AI_EVADE_DASH_DISTANCE,
    AI_EVADE_JINK_MAX_ANGLE,
    AI_EVADE_JINK_MAX_PERIOD,
    AI_EVADE_JINK_MIN_ANGLE,
    AI_EVADE_JINK_MIN_PERIOD,
    AI_EVADE_MAX_WEIGHT,
    AI_EVADE_RANGE,
    AI_EVADE_SHOT_WEIGHT_FACTOR,
    AI_FIRE_RANGE,
    AI_FOLLOW_APPROACH_GAIN,
    AI_THRUST_ALIGN_ANGLE,
    NPC_COMBAT_FOLLOW_DISTANCE,
} from '../../utilities/consts';
import { muzzleWorldPosition } from '../../ship-effects/weapons/weapon';
import type { Spaceship } from '../../bodies/ships/spaceship';
import type { ISpaceshipHandling } from '../../interfaces';
import { formatAngleFromCos, formatDistance, formatSpeed, formatThrottle } from './ai-debug-format';

// Scratch objects — reused every frame to keep the per-frame allocation count at zero, the
// invariant the whole AI layer is written to.
const _muzzle = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _heading = new THREE.Vector3();
const _targetFwd = new THREE.Vector3();
const _side = new THREE.Vector3();
const _evade = new THREE.Vector3();
const _evadeU = new THREE.Vector3();
const _evadeV = new THREE.Vector3();
const _goal = new THREE.Vector3();
const _toGoal = new THREE.Vector3();

/** Below this the intercept quadratic's leading coefficient is treated as zero. */
const INTERCEPT_EPSILON = 1e-12;

/**
 * The two halves of a dogfight.
 *
 * - `attack`: turn in on the target and press the attack, leading it into the gun cone.
 * - `extend`: break off at an angle, run out to a safe separation, then come back round.
 */
type DogfightState = 'attack' | 'extend';

/** What a boost dash is for. */
type DashKind = 'reposition' | 'evade';

/** Why the last attack was broken off — shown on the debug overlay. */
type BreakReason = 'collision' | 'head-on' | 'overshoot';

/** Why the trigger is (or isn't) down this frame — shown on the debug overlay. */
type GunStatus =
    | 'FIRING'
    | 'no weapons'
    | 'warp'
    | 'no target'
    | 'avoiding obstacle'
    | 'burst rest'
    | 'all overheated'
    | 'out of range'
    | 'no intercept'
    | 'outside cone';

/**
 * A ship AI that hunts the player: everything {@link FollowShipAI} does to pursue and hold
 * station, plus gunnery.
 *
 * Flight has two regimes:
 *
 * - **Approach** (beyond AI_DOGFIGHT_ENGAGE_RANGE): inherited wholesale from the follow AI —
 *   boost, warp, braking and obstacle avoidance are identical, so the long-range chase is tuned
 *   in one place.
 * - **Dogfight** (inside it): the follow AI's station-keeping is the wrong tool up close. It
 *   points the nose at the target and regulates range along that line, so a target that closes
 *   in gets backed away from — in reverse, still facing it — and every engagement becomes a
 *   face-to-face shootout. The dogfight instead never flies backwards: it attacks nose-first,
 *   and when the geometry turns bad (head-on merge, overshoot, about to ram) it breaks off at an
 *   angle, extends to a safe distance and turns back in for another pass.
 *
 * While attacking it works for the target's tail rather than its nose: until it is behind the
 * target it steers for a point there, and taps boost in short dashes to jump to it — which is
 * what breaks the endless equal-turn-rate circle. Once on the tail it switches to a lead-pursuit
 * gun run (see attackHeading / updateDash).
 *
 * In either dogfight state the ship also evades: while it sits in the target's line of fire it
 * bends its course across that line, jinking to alternate sides, so the target has to work to
 * keep it in the reticle, and dashes across that line when lined up to (see evasionWeight /
 * evadeDirection).
 *
 * The obstacle-avoidance emergency (`flee`) is always handed back to the follow AI, which
 * already knows how to run from a hazard.
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

    /** True while inside the dogfight regime (latched with hysteresis around the engage range). */
    private dogfighting = false;
    /** Current dogfight manoeuvre. */
    private state: DogfightState = 'attack';
    /** Sim-seconds spent in the current extend. */
    private extendTimer = 0;
    /** True when the last extend ran out its clock rather than reaching a safe separation —
     *  i.e. the target stayed on the NPC's tail, and the next break should go the other way. */
    private extendTimedOut = false;
    /** World heading locked in when the current extend began. */
    private readonly extendHeading = new THREE.Vector3();
    /** Side (unit, world space) the last break turned toward. */
    private readonly breakSide = new THREE.Vector3(1, 0, 0);

    /** Sim-seconds until the next jink while evading. */
    private jinkTimer = 0;
    /** Current jink swing (radians, signed) about the straight-out-of-the-cone direction. */
    private jinkAngle = 0;
    /** Last evasion direction, the fallback when the geometry gives no preferred side. */
    private readonly lastEvade = new THREE.Vector3(1, 0, 0);

    /** True once the ship has worked its way onto the target's tail (latched with hysteresis). */
    private onTail = false;
    /** Where the ship is trying to get to while positioning, un-led; valid while !onTail. */
    private readonly positionGoal = new THREE.Vector3();

    /** True while a boost dash is holding the boost. */
    private dashing = false;
    /** What the current (or last) dash was for. */
    private dashKind: DashKind = 'reposition';
    /** Sim-seconds the current dash has held boost. */
    private dashTimer = 0;
    /** Sim-seconds until another dash may start. */
    private dashCooldown = 0;
    /** World point the current dash is trying to reach. */
    private readonly dashGoal = new THREE.Vector3();

    // ── Debug telemetry (read only by debugLines) ────────────────────────────
    /** Why the last attack was broken off, or null if none has been yet. */
    private debugBreakReason: BreakReason | null = null;
    /** Sim-seconds since the last break. */
    private debugSinceBreak = 0;
    /** Evasion's share of the heading on the last dogfight frame (0 = not evading). */
    private debugEvadeWeight = 0;
    /** How the last extend ended, or null while none has. */
    private debugExtendExit: 'clear' | 'pinned, turning in' | 'timeout' | null = null;
    /** Gunnery outcome of the last update. */
    private debugGun: GunStatus = 'no target';
    /** Cosine between the nose and the (jittered) firing solution on the last cone test. */
    private debugAimCos = 1;

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
     * Muzzle speed of the weapon that will actually fire — the ship's selected mount.
     *
     * Only the selected weapon responds to the trigger (see Spaceship.fireWeapon), so the lead
     * solve must use its speed rather than the loadout's slowest. Infinity for a hitscan weapon
     * (e.g. the laser), which collapses the intercept solve below to "aim where the target is
     * now" — the correct answer for a beam.
     */
    private activeMuzzleSpeed(): number {
        return this.ship.activeWeapon?.muzzleSpeed ?? Infinity;
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

    /**
     * Decide whether this frame is flown as a dogfight or handed to the follow AI's approach.
     *
     * Never while the warp drive is doing anything — the follow AI owns warp, and a dogfight
     * would release the warp intent mid-charge. Hysteresis on the range keeps the mode from
     * chattering at the boundary.
     */
    private updateDogfightLatch(target: Spaceship | null): void {
        const ship = this.ship;
        if (!target || ship.warpActive || ship.warpCharging || ship.warpDecelerating) {
            this.dogfighting = false;
            this.dashing = false;
            return;
        }

        const range = this.hullGap(target, ship.mesh.position.distanceTo(target.mesh.position));
        const wasDogfighting = this.dogfighting;
        this.dogfighting = wasDogfighting
            ? range <= AI_DOGFIGHT_ENGAGE_RANGE * AI_DOGFIGHT_DISENGAGE_FACTOR
            : range < AI_DOGFIGHT_ENGAGE_RANGE;

        if (this.dogfighting && !wasDogfighting) {
            this.state = 'attack';
            this.extendTimedOut = false;
            this.onTail = false;
        }
        // Handing the frame back to the follow AI drops any dash; it owns the boost from here.
        if (!this.dogfighting) this.dashing = false;
    }

    /**
     * Whether the attack has to be broken off this frame, and if so why.
     *
     * @param range Hull-to-hull distance to the target.
     * @param closing Closing speed (positive = closing).
     * @param noseOnTarget Cosine between this ship's nose and the bearing to the target.
     * @param facing Cosine between the target's nose and the bearing back to this ship.
     */
    private shouldBreak(
        range: number,
        closing: number,
        noseOnTarget: number,
        facing: number
    ): BreakReason | null {
        // About to ram, whatever the geometry.
        if (closing > 0 && range < AI_DOGFIGHT_COLLISION_DISTANCE) return 'collision';

        // Head-on merge: both noses on each other and about to meet. Pass, don't joust. Judged on
        // time to collision, so a slow merge still gets its shots in before the break.
        const headOn = Math.cos(AI_DOGFIGHT_HEAD_ON_ANGLE);
        if (
            closing > 0 &&
            range < closing * AI_DOGFIGHT_HEAD_ON_BREAK_TIME &&
            noseOnTarget > headOn &&
            facing > headOn
        ) {
            return 'head-on';
        }

        // Overshoot: we flew past the target, and it is now behind us with its nose on us while
        // we pull apart. Turning back across its guns at this range just hands it the shot — get
        // out and come round again. The opening-speed test is what keeps a target that is merely
        // *chasing* us from counting: then the right answer is to turn and fight, which the
        // attack state already does.
        if (
            noseOnTarget < 0 &&
            facing > 0 &&
            range < AI_DOGFIGHT_OVERSHOOT_DISTANCE &&
            closing < -AI_DOGFIGHT_OVERSHOOT_OPENING_SPEED
        ) {
            return 'overshoot';
        }
        return null;
    }

    /**
     * Start an extend: lock a heading AI_DOGFIGHT_BREAK_ANGLE off the nose, toward the side
     * that takes this ship out of the target's line of fire.
     *
     * Expects `_forward` (this ship's nose), `_dir` (bearing to the target) and `_targetFwd`
     * (the target's nose) to be current.
     *
     * @param dist Centre-to-centre distance to the target.
     */
    private beginExtend(target: Spaceship, dist: number): void {
        const ship = this.ship;

        if (this.extendTimedOut) {
            // Still pinned after a full extend: jink the other way rather than repeat a break
            // the target has already followed once.
            _side.copy(this.breakSide).negate();
        } else {
            // The side of the target's nose line this ship already sits on — breaking toward it
            // moves away from the target's guns rather than across them.
            _side.subVectors(ship.mesh.position, target.mesh.position);
            _side.addScaledVector(_targetFwd, -_side.dot(_targetFwd));
        }

        // Perpendicular to our own nose, so the break is a turn and not a change of speed.
        _side.addScaledVector(_forward, -_side.dot(_forward));
        if (_side.length() < dist * 1e-3) {
            // Dead on the target's nose line: no geometric preference, take the pilot's right.
            _side.set(-1, 0, 0).applyQuaternion(ship.controlFrameQuat);
        }
        _side.normalize();
        this.breakSide.copy(_side);

        this.extendHeading
            .copy(_forward)
            .multiplyScalar(Math.cos(AI_DOGFIGHT_BREAK_ANGLE))
            .addScaledVector(_side, Math.sin(AI_DOGFIGHT_BREAK_ANGLE))
            .normalize();

        // Keep the break heading off the target's hull. Against a fighter a 60° break always
        // clears it, but a capital ship can fill more than that of the view: from 200 m off a
        // 500 m-radius hull, a heading 60° off a nose pointed at its centre still runs into its
        // side. Swing the heading out to at least the hull's angular radius (padded by the
        // collision margin) about the bearing — a tangent, at worst.
        const clearRadius = hullRadius(target) + hullRadius(ship) + AI_DOGFIGHT_COLLISION_DISTANCE;
        const minAngle = Math.asin(Math.min(1, clearRadius / dist));
        const cosToTarget = this.extendHeading.dot(_dir);
        if (cosToTarget > Math.cos(minAngle)) {
            // Away from the bearing, on the side the break already leans toward.
            _side.copy(this.extendHeading).addScaledVector(_dir, -cosToTarget);
            if (_side.length() < 1e-6) {
                _side.copy(this.breakSide).addScaledVector(_dir, -this.breakSide.dot(_dir));
            }
            _side.normalize();
            this.extendHeading
                .copy(_dir)
                .multiplyScalar(Math.cos(minAngle))
                .addScaledVector(_side, Math.sin(minAngle))
                .normalize();
        }

        this.state = 'extend';
        this.extendTimer = 0;
    }

    /**
     * Heading for the attack, written into `out`.
     *
     * Two phases, latched on the target's aspect with hysteresis:
     *
     * - **Positioning** (not yet behind it): steer for a point AI_DOGFIGHT_TAIL_DISTANCE behind
     *   the target, swung wide round our side of it while we are still in front of its nose.
     *   Pure pursuit at equal turn rates only ever chases the target round a circle; going for
     *   its tail instead is what wins the position, and the point is also what a reposition
     *   dash aims at (see updateDash).
     * - **Tail** (aspect past AI_DOGFIGHT_TAIL_ENTER_ASPECT): lead pursuit — steer for where the
     *   gun solution says the target will be, so turning in also brings it into the aim cone.
     *
     * Expects `_toTarget`, `_relVel` (target relative to us) and `_targetFwd` to be current.
     */
    private attackHeading(
        target: Spaceship,
        dist: number,
        facing: number,
        out: THREE.Vector3
    ): THREE.Vector3 {
        // facing is cos(aspect), so "aspect beyond X" is "facing below cos X".
        this.onTail = this.onTail
            ? facing < Math.cos(AI_DOGFIGHT_TAIL_EXIT_ASPECT)
            : facing < Math.cos(AI_DOGFIGHT_TAIL_ENTER_ASPECT);

        if (this.onTail) {
            const flightTime = this.interceptTime(_toTarget, _relVel, this.activeMuzzleSpeed());
            out.copy(_toTarget);
            if (flightTime > 0) out.addScaledVector(_relVel, flightTime);
            return out.normalize();
        }

        // Our side of the target's nose line (target → us, minus the along-nose component).
        _side.copy(_toTarget).negate();
        _side.addScaledVector(_targetFwd, -_side.dot(_targetFwd));
        if (_side.length() > dist * 1e-3) {
            _side.normalize();
        } else {
            _side.set(-1, 0, 0).applyQuaternion(this.ship.controlFrameQuat);
        }

        // Behind it by the tail distance, hull to hull. Swung wide while we are ahead of its
        // nose, so the way round passes outside its guns rather than through them; measured
        // from the hull so the point clears a capital ship.
        const behind = AI_DOGFIGHT_TAIL_DISTANCE + hullRadius(target) + hullRadius(this.ship);
        const lateral =
            THREE.MathUtils.clamp(facing, 0, 1) * (AI_DOGFIGHT_FLANK_OFFSET + hullRadius(target));
        this.positionGoal
            .copy(target.mesh.position)
            .addScaledVector(_targetFwd, -behind)
            .addScaledVector(_side, lateral);

        // Lead the point by roughly how long it will take to get there at normal speed, since
        // it moves with the target.
        _toGoal.subVectors(this.positionGoal, this.ship.mesh.position);
        const lead = Math.min(
            _toGoal.length() / this.ship.handling.flightMaxSpeed,
            AI_DOGFIGHT_POSITION_MAX_LEAD
        );
        out.copy(_toGoal).addScaledVector(_relVel, lead);
        return out.normalize();
    }

    /**
     * True when a straight run of `length` along the nose stays clear of the target's hull.
     *
     * Padded by how far the two ships can move relative to each other during a whole dash, so
     * a target crossing the path can't be run into either.
     *
     * Expects `_forward` and `_relVel` to be current.
     */
    private dashPathClear(target: Spaceship, length: number): boolean {
        const ship = this.ship;
        _toGoal.subVectors(target.mesh.position, ship.mesh.position);
        const along = THREE.MathUtils.clamp(_toGoal.dot(_forward), 0, length);
        const miss = _toGoal.addScaledVector(_forward, -along).length();
        const clearance =
            hullRadius(target) +
            hullRadius(ship) +
            AI_DOGFIGHT_COLLISION_DISTANCE +
            _relVel.length() * AI_DASH_MAX_TIME;
        return miss > clearance;
    }

    /**
     * Run the boost dash: decide whether to start, hold or release one. Returns true while the
     * boost should be held this frame.
     *
     * A dash is a short tap of boost — at boost acceleration a fraction of a second moves the
     * ship hundreds of metres, then releasing hands it to the ship's own boost-decel phase,
     * which sheds the excess back to normal max speed. Two uses:
     *
     * - **Reposition**: while working toward the target's tail and lined up on the positioning
     *   point, close the distance in one jump instead of chasing round the circle.
     * - **Evade**: while in the target's line of fire and lined up on the evasive heading, jump
     *   across it and out of the aim cone.
     *
     * The boost is released early enough that the decel phase finishes at the goal rather than
     * past it, measured on the speed the ship has now.
     *
     * @param heading The heading the ship is steering for this frame (post-avoidance).
     * @param evading Whether evasion is active this frame.
     * @param speedLimit Avoidance speed cap; a dash never runs past it.
     * @param hazardAhead Whether avoidance is currently steering round something.
     */
    private updateDash(
        target: Spaceship,
        heading: THREE.Vector3,
        evading: boolean,
        speedLimit: number,
        hazardAhead: boolean,
        simDt: number
    ): boolean {
        const ship = this.ship;
        const h = ship.handling;
        this.dashCooldown = Math.max(0, this.dashCooldown - simDt);
        const fwdSpeed = ship.forwardSpeedInFrame(_forward);

        if (this.dashing) {
            this.dashTimer += simDt;
            const remaining = _toGoal.subVectors(this.dashGoal, ship.mesh.position).dot(_forward);
            // Distance the boost-decel phase will take to shed back down to normal max speed.
            const shed =
                fwdSpeed > h.flightMaxSpeed
                    ? (fwdSpeed * fwdSpeed - h.flightMaxSpeed * h.flightMaxSpeed) /
                      (2 * h.flightBoostDecel)
                    : 0;
            const arrive = remaining <= shed + fwdSpeed * simDt;
            const offLine = _forward.dot(heading) < Math.cos(AI_DASH_ALIGN_ANGLE * 2);
            const expired = this.dashTimer > AI_DASH_MAX_TIME;
            if (arrive || offLine || expired || fwdSpeed >= speedLimit || hazardAhead) {
                this.dashing = false;
                this.dashCooldown = AI_DASH_COOLDOWN;
                return false;
            }
            return true;
        }

        if (this.dashCooldown > 0 || ship.boostDecelerating || ship.stopBraking) return false;
        if (hazardAhead || speedLimit <= h.flightMaxSpeed) return false;
        if (_forward.dot(heading) < Math.cos(AI_DASH_ALIGN_ANGLE)) return false;

        let kind: DashKind;
        if (this.state === 'attack' && !this.onTail) {
            kind = 'reposition';
            _goal.copy(this.positionGoal);
        } else if (evading) {
            kind = 'evade';
            _goal.copy(ship.mesh.position).addScaledVector(_forward, AI_EVADE_DASH_DISTANCE);
        } else {
            return false;
        }

        const along = _toGoal.subVectors(_goal, ship.mesh.position).dot(_forward);
        if (along < AI_DASH_MIN_DISTANCE) return false;
        if (!this.dashPathClear(target, along)) return false;

        this.dashing = true;
        this.dashKind = kind;
        this.dashTimer = 0;
        this.dashGoal.copy(_goal);
        return true;
    }

    /**
     * How much of the heading to give to evasion this frame (0 = none).
     *
     * Non-zero only while this ship sits inside AI_EVADE_CONE_ANGLE of the target's nose and
     * within AI_EVADE_RANGE of its hull. Half weight at the cone's edge rising to full on the
     * nose, so the ship always makes a real effort to leave the cone, and more of one the
     * more squarely it is lined up. Scaled down while it has its own shot, so a firing pass is
     * a trade of safety for damage rather than abandoned the moment the target looks back.
     *
     * @param range Hull-to-hull distance.
     * @param facing Cosine between the target's nose and the bearing back to this ship.
     * @param noseOnTarget Cosine between this ship's nose and the bearing to the target.
     */
    private evasionWeight(range: number, facing: number, noseOnTarget: number): number {
        if (range > AI_EVADE_RANGE) return 0;
        const cosCone = Math.cos(AI_EVADE_CONE_ANGLE);
        if (facing <= cosCone) return 0;

        const centred = THREE.MathUtils.clamp((facing - cosCone) / (1 - cosCone), 0, 1);
        let weight = AI_EVADE_MAX_WEIGHT * (0.5 + 0.5 * centred);

        const hasShot = noseOnTarget > Math.cos(AI_AIM_CONE_ANGLE) && range < AI_FIRE_RANGE;
        if (hasShot) weight *= AI_EVADE_SHOT_WEIGHT_FACTOR;
        return weight;
    }

    /**
     * Direction to slide in to get out of the target's line of fire, written into `out`.
     *
     * Always perpendicular to the line of sight, since that is the motion that changes the
     * target's aim angle; motion along it does not. The base direction points away from the
     * target's nose axis, the quickest way out of its cone. Each jink then swings it to
     * alternate sides of that by a random angle, so the ship weaves outward rather than
     * sliding along a straight line a pilot could lead.
     *
     * Expects `_dir` (bearing to the target) and `_targetFwd` to be current.
     *
     * @param simDt Sim-seconds this frame. The jink rhythm is a manoeuvre the ship flies, so
     *   it runs on sim time like the rest of the flight model.
     */
    private evadeDirection(target: Spaceship, simDt: number, out: THREE.Vector3): THREE.Vector3 {
        this.jinkTimer -= simDt;
        if (this.jinkTimer <= 0) {
            this.jinkTimer = THREE.MathUtils.lerp(
                AI_EVADE_JINK_MIN_PERIOD,
                AI_EVADE_JINK_MAX_PERIOD,
                Math.random()
            );
            const swing = THREE.MathUtils.lerp(
                AI_EVADE_JINK_MIN_ANGLE,
                AI_EVADE_JINK_MAX_ANGLE,
                Math.random()
            );
            // Alternate sides; the first jink picks one at random.
            const side =
                this.jinkAngle === 0 ? (Math.random() < 0.5 ? -1 : 1) : -Math.sign(this.jinkAngle);
            this.jinkAngle = side * swing;
        }

        // u: away from the target's nose axis (target → us, minus the along-nose part), then
        // flattened onto the plane perpendicular to the line of sight.
        _evadeU.subVectors(this.ship.mesh.position, target.mesh.position);
        _evadeU.addScaledVector(_targetFwd, -_evadeU.dot(_targetFwd));
        _evadeU.addScaledVector(_dir, -_evadeU.dot(_dir));
        if (_evadeU.lengthSq() < 1e-12 * _toTarget.lengthSq()) {
            // Dead on the target's nose: no quickest side. Keep sliding the way we last went.
            _evadeU.copy(this.lastEvade).addScaledVector(_dir, -this.lastEvade.dot(_dir));
            if (_evadeU.lengthSq() < 1e-12) {
                _evadeU.set(-1, 0, 0).applyQuaternion(this.ship.controlFrameQuat);
                _evadeU.addScaledVector(_dir, -_evadeU.dot(_dir));
            }
        }
        _evadeU.normalize();
        // v: the other perpendicular, completing the plane the jinks swing in.
        _evadeV.crossVectors(_dir, _evadeU).normalize();

        out.copy(_evadeU)
            .multiplyScalar(Math.cos(this.jinkAngle))
            .addScaledVector(_evadeV, Math.sin(this.jinkAngle));
        this.lastEvade.copy(out);
        return out;
    }

    /**
     * Fly one dogfight frame. Returns false when obstacle avoidance calls for an emergency
     * escape (or the geometry is degenerate), so the caller can hand the frame to the follow AI.
     */
    private flyDogfight(target: Spaceship, simDt: number): boolean {
        const ship = this.ship;
        const input = ship.controlInput;
        const h = ship.handling;

        _toTarget.subVectors(target.mesh.position, ship.mesh.position);
        const dist = _toTarget.length();
        if (dist < INTERCEPT_EPSILON) return false;
        _dir.copy(_toTarget).divideScalar(dist);
        // Hull-to-hull — every range decision below uses this; bearings still use centres.
        const range = this.hullGap(target, dist);

        _forward.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
        _targetFwd.set(0, 0, 1).applyQuaternion(target.controlFrameQuat);

        // 1 = target's nose dead on us, -1 = we're sitting on its tail.
        const facing = -_targetFwd.dot(_dir);
        const noseOnTarget = _forward.dot(_dir);

        // Target velocity relative to us, and the closing speed it implies.
        _relVel.subVectors(target.velocity, ship.velocity);
        const closing = -_relVel.dot(_dir);

        // ── Manoeuvre selection ──────────────────────────────────────────────
        this.debugSinceBreak += simDt;
        if (this.state === 'attack') {
            const reason = this.shouldBreak(range, closing, noseOnTarget, facing);
            if (reason) {
                this.debugBreakReason = reason;
                this.debugSinceBreak = 0;
                this.beginExtend(target, dist);
            }
        } else {
            this.extendTimer += simDt;
            const committed = this.extendTimer > AI_DOGFIGHT_EXTEND_MIN_TIME;
            // Opened up enough room to turn round and line up a fresh attack.
            const clear = committed && range > AI_DOGFIGHT_EXTEND_DISTANCE;
            // Still tracked by a target that is keeping pace: running won't shake it, and every
            // second spent running is a second of free shots. Turn and fight instead.
            const pinned = committed && facing > Math.cos(AI_DOGFIGHT_THREAT_ANGLE) && closing >= 0;
            const timedOut = this.extendTimer > AI_DOGFIGHT_EXTEND_MAX_TIME;
            if (clear || pinned || timedOut) {
                this.state = 'attack';
                this.debugExtendExit = clear ? 'clear' : pinned ? 'pinned, turning in' : 'timeout';
                // Didn't get clear: if the fight forces another break soon, go the other way.
                this.extendTimedOut = !clear;
            }
        }

        if (this.state === 'extend') _heading.copy(this.extendHeading);
        else this.attackHeading(target, dist, facing, _heading);

        // ── Evasion ──────────────────────────────────────────────────────────
        // In the target's line of fire: bend whatever we were about to fly across it. Applied
        // before avoidance, so the evasive heading is still filtered for hazards like any other.
        const evadeWeight = this.evasionWeight(range, facing, noseOnTarget);
        this.debugEvadeWeight = evadeWeight;
        if (evadeWeight > 0) {
            this.evadeDirection(target, simDt, _evade);
            _heading
                .multiplyScalar(1 - evadeWeight)
                .addScaledVector(_evade, evadeWeight)
                .normalize();
        } else {
            // Out of the cone: the next time it's threatened, start a fresh jink straight away.
            this.jinkTimer = 0;
        }
        const evading = evadeWeight > 0;

        // ── Obstacle avoidance ───────────────────────────────────────────────
        const avoid = this.avoidance.evaluate(_heading, simDt);
        if (avoid.flee) {
            this.dashing = false;
            return false;
        }

        this.steerToward(avoid.heading);

        this.debugPhase =
            this.state === 'extend'
                ? 'EXTEND'
                : this.onTail
                  ? 'ATTACK · TAIL'
                  : 'ATTACK · POSITION';
        this.debugRange = range;
        this.debugClosing = closing;

        // ── Throttle ─────────────────────────────────────────────────────────
        // Boost is only ever tapped, as a dash (see updateDash): held for even a second it would
        // fling the ship kilometres out of the fight. Warp never.
        input.warp = false;
        input.fire = false;

        const dash = this.updateDash(
            target,
            avoid.heading,
            evading,
            avoid.speedLimit,
            avoid.hazard !== null,
            simDt
        );
        if (dash) {
            input.boost = true;
            input.thrust = true;
            input.brake = false;
            ship.thrustActive = true;
            ship.updateBoostDecelState();
            return true;
        }
        input.boost = false;

        const aligned = _forward.dot(avoid.heading) > Math.cos(AI_THRUST_ALIGN_ANGLE);

        // Brake only ever slows forward flight; it never runs on into reverse. Backing away
        // nose-on from a target that is closing in is exactly the behaviour this replaces.
        const fwdSpeed = ship.forwardSpeedInFrame(_forward);
        const canBrake = fwdSpeed > h.flightThrustDecel * simDt;

        let thrust: boolean;
        let brake = false;
        if (this.state === 'extend') {
            // Run for it once on the break heading.
            thrust = aligned;
            this.debugDesiredClosing = 0;
        } else if (!this.onTail) {
            // Working round to its tail: the positioning point moves with the target, so get
            // there as fast as normal flight allows.
            thrust = aligned;
            this.debugDesiredClosing = h.flightMaxSpeed;
        } else {
            // Close to the hold distance behind a target that is running; press the attack
            // flat out against one that is turning in to face us. The "back off" half of the
            // hold command is stopped at zero speed by the brake gate above.
            const holdClosing = THREE.MathUtils.clamp(
                (range - this.followDistance) * AI_FOLLOW_APPROACH_GAIN,
                -h.flightMaxSpeed,
                h.flightMaxSpeed
            );
            const press = THREE.MathUtils.clamp(facing, 0, 1);
            const desiredClosing = Math.min(
                THREE.MathUtils.lerp(holdClosing, h.flightMaxSpeed, press),
                avoid.speedLimit
            );
            const tolerance = this.closingSpeedTolerance(desiredClosing, h);
            this.debugDesiredClosing = desiredClosing;

            // While evading, speed is what carries the ship across the target's view (angular
            // rate = lateral speed / range), so keep the throttle open and never brake.
            thrust = aligned && (evading || closing < desiredClosing - tolerance);
            // Off-axis, bleeding speed also tightens the turn radius (turn rate is fixed).
            brake = !evading && !thrust && canBrake && closing > desiredClosing + tolerance;
        }

        // Stay under any avoidance speed cap, extending or not.
        if (thrust && fwdSpeed >= avoid.speedLimit) thrust = false;

        input.thrust = thrust;
        input.brake = brake;
        ship.thrustActive = thrust || brake;
        ship.updateBoostDecelState();
        return true;
    }

    override update(dt: number, simDt: number): void {
        // Fly first. Every exit path of both flight regimes leaves controlInput.fire false — the
        // dogfight clears it explicitly, and the base controller clears it on the normal path,
        // inside the warp cruise, and via resetControlInput() when there is no target — so what
        // follows starts from a released trigger and only has to decide whether to raise it.
        const flightTarget = this.getTarget();
        this.updateDogfightLatch(flightTarget);
        if (!(this.dogfighting && flightTarget && this.flyDogfight(flightTarget, simDt))) {
            super.update(dt, simDt);
        }

        this.advanceTimers(dt);

        this.debugGun = this.updateGunnery();
    }

    /** Decide whether to fire this frame. Returns the outcome, for the debug overlay. */
    private updateGunnery(): GunStatus {
        const ship = this.ship;
        if (ship.weapons.length === 0) return 'no weapons';

        // ── Hold-fire gates ──────────────────────────────────────────────────
        // Order is load-bearing. ObstacleAvoidance.evaluate() is not called on the base
        // controller's warp-cruise or no-target paths, so `avoidance.last` is a stale
        // previous-frame result on exactly those frames; the two gates that rule them out have
        // to come first.

        // Warp locks out weapons, the same as it does for the player.
        if (ship.warpActive || ship.warpCharging || ship.warpDecelerating) return 'warp';

        const target = this.getTarget();
        if (!target) return 'no target';

        // About to fly into something. Flying clear takes priority over shooting.
        if (this.avoidance.last.flee) return 'avoiding obstacle';

        // Between bursts.
        if (!this.triggerOpen) return 'burst rest';

        // Thermal management. Only the selected weapon fires, and its heat only drains while its
        // trigger is released — so if it is hot, switch to a cool mount rather than holding a
        // trigger that does nothing. With nothing cool left, hold fire and let them all cool.
        const activeWeapon = ship.activeWeapon;
        if (activeWeapon?.isOverheated) {
            const coolIndex = ship.weapons.findIndex((w) => !w.isOverheated);
            if (coolIndex === -1) return 'all overheated';
            ship.selectWeapon(coolIndex);
        }

        // ── Firing solution ──────────────────────────────────────────────────
        muzzleWorldPosition(ship, _muzzle);
        _toTarget.subVectors(target.mesh.position, _muzzle);
        const dist = _toTarget.length();
        if (dist < INTERCEPT_EPSILON) return 'out of range';
        // Range to the hull: a capital ship is in reach once its near side is.
        if (dist - hullRadius(target) > AI_FIRE_RANGE) return 'out of range';

        _relVel.subVectors(target.velocity, ship.velocity);
        const flightTime = this.interceptTime(_toTarget, _relVel, this.activeMuzzleSpeed());
        if (flightTime < 0) return 'no intercept'; // target outruns the projectile

        // Lead the target to where it will be — in the shooter's frame, the same frame the
        // intercept was solved in. The bolt inherits this ship's velocity, so leading by the
        // target's world velocity would be off by this ship's own motion × flight time.
        _aim.copy(_toTarget).addScaledVector(_relVel, flightTime).normalize();

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

        this.debugAimCos = _forward.dot(_aim);
        if (this.debugAimCos < Math.cos(AI_AIM_CONE_ANGLE)) return 'outside cone';

        ship.controlInput.aimDir.copy(_aim);
        ship.controlInput.fire = true;
        return 'FIRING';
    }

    override debugLines(): string[] {
        const ship = this.ship;

        let header = this.dogfighting
            ? `${this.name} · DOGFIGHT ${this.debugPhase}`
            : `${this.name} · ${this.debugPhase}`;
        if (this.dogfighting && this.state === 'extend') {
            header += ` ${this.extendTimer.toFixed(1)}s`;
        }
        const lines = [header];

        // Geometry is measured live rather than recorded, so it is right in either regime.
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
        const target = this.getTarget();
        if (target) {
            const dir = new THREE.Vector3().subVectors(target.mesh.position, ship.mesh.position);
            const dist = dir.length();
            dir.divideScalar(Math.max(dist, INTERCEPT_EPSILON));
            const targetFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(target.controlFrameQuat);
            const closing = -new THREE.Vector3()
                .subVectors(target.velocity, ship.velocity)
                .dot(dir);

            // Nose off: how far this ship has to turn to point at the target.
            // Aspect: angle off the target's nose — 0° it is pointing straight at us, 180° we
            // are sitting on its tail.
            lines.push(
                `Range ${formatDistance(this.hullGap(target, dist))} (hull)  closing ${formatSpeed(closing, true)}`,
                `Nose off ${formatAngleFromCos(fwd.dot(dir))}  aspect ${formatAngleFromCos(-targetFwd.dot(dir))}`
            );
        }

        let throttle = `Speed ${formatSpeed(ship.forwardSpeedInFrame(fwd))}  ${formatThrottle(ship.controlInput)}`;
        if (this.dogfighting && this.state === 'attack' && this.onTail && !this.dashing) {
            throttle += `  want ${formatSpeed(this.debugDesiredClosing, true)}`;
        }
        lines.push(throttle);

        let gun = `Gun ${this.debugGun}`;
        if (this.debugGun === 'outside cone') gun += ` (${formatAngleFromCos(this.debugAimCos)})`;
        lines.push(gun);

        if (this.debugBreakReason) {
            lines.push(
                `Last break ${this.debugBreakReason}, ${this.debugSinceBreak.toFixed(0)}s ago`
            );
        }
        if (this.dogfighting) {
            lines.push(
                this.debugEvadeWeight > 0
                    ? `Evade ${Math.round(this.debugEvadeWeight * 100)}%  jink ${Math.round(THREE.MathUtils.radToDeg(this.jinkAngle))}°`
                    : 'Evade: clear of your cone'
            );
        }
        if (this.dogfighting) {
            lines.push(
                this.dashing
                    ? `Dash BOOST ${this.dashKind} ${this.dashTimer.toFixed(2)}s`
                    : this.dashCooldown > 0
                      ? `Dash cooldown ${this.dashCooldown.toFixed(1)}s (last: ${this.dashKind})`
                      : 'Dash ready'
            );
        }
        if (this.debugExtendExit) lines.push(`Last extend ended: ${this.debugExtendExit}`);

        return lines;
    }
}
