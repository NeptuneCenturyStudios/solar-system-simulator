import * as THREE from 'three';
import { brakingSpeedLimit } from '../obstacle-avoidance';
import { flyVelocity } from '../navigation/velocity-control';
import { selectSpeedTier } from '../navigation/speed-tier';
import { lastWarpPlan, updateWarpCruise, wantWarp } from '../navigation/warp-navigation';
import { steerToward } from '../navigation/steering';
import { formatDistance, formatSpeed, formatThrottle } from '../ai-debug-format';
import {
    AI_APPROACH_SAFETY_PAD,
    AI_AUTOPILOT_ARRIVAL_TOLERANCE,
    AI_AUTOPILOT_LOW_TIER_RELEASE,
    AI_AUTOPILOT_OUTPACED_TIME,
    AI_HIGH_SPEED_HANDOFF_RANGE,
} from '../../../utilities/consts';
import type { Spaceship } from '../../../bodies/ships/spaceship';
import type { Body } from '../../../bodies/body';
import type { IManeuver, IManeuverContext, ManeuverActivity, ManeuverStatus } from './maneuver';
import { orbitFrame } from './maneuver';

// Scratch — reused every frame.
const _toTarget = new THREE.Vector3();
const _directDir = new THREE.Vector3();
const _entryDir = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _desiredVel = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _forward = new THREE.Vector3();

/**
 * Get to the edge of the target's orbit, arriving roughly at rest relative to it and already
 * travelling the right way round.
 *
 * - **Far out**: warp, through the shared warp navigation, whenever the corridor is clear and the
 *   run pays for itself. The target is excluded from the corridor test — the run stops at its
 *   orbit, well outside it.
 * - **Otherwise**: fly the world velocity `target.velocity + entryDir × closing`. Matching the
 *   target's own velocity is what lets the approach end at rest relative to a moving planet or
 *   ship; `closing` follows the ship's braking curve, so it arrives without overshooting.
 *
 * `entryDir` aims at the point where the line from the ship touches the orbit circle (in the orbit
 * plane), not at the target's centre: far away the two are the same, close in it bends the
 * approach onto a tangential arrival, ready for the orbit to take over without a sharp turn.
 *
 * When the closing speed this needs is beyond what the ship can fly, the target simply gets away.
 * That is allowed — the maneuver keeps chasing and reports `outpaced` once it has been losing
 * ground for a while.
 */
export class ApproachManeuver implements IManeuver {
    activity: ManeuverActivity = 'turning';

    /** Sim-seconds spent saturated while the range opened. */
    private outpacedTimer = 0;
    /** Centre distance on the previous frame, for the range-opening test. */
    private prevDist = Infinity;

    // Debug telemetry.
    private debugGap = 0;
    private debugClosing = 0;
    private debugRelSpeed = 0;
    private debugCommanded = 0;
    private debugShip: Spaceship | null = null;
    private debugWarpWorth = false;
    private debugWarpLeg = 0;
    private debugWarpCap = 0;
    private debugEtaWarp = Infinity;
    private debugEtaConventional = Infinity;
    private debugWarpReason = '';
    private debugHazard = '';

    reset(): void {
        this.activity = 'turning';
        this.outpacedTimer = 0;
        this.prevDist = Infinity;
    }

    /**
     * Closing speed to command at `gap` from the orbit.
     *
     * Follows the braking curve of the tier being flown. On the high tier, against a target the
     * low tier could hold station with, the curve is planned to arrive at the low-speed handoff
     * range rather than at the orbit, so the ship is already inside the low envelope when
     * selectSpeedTier() drops it there; the low tier's own curve then closes the rest.
     */
    private closingSpeed(ship: Spaceship, target: Body, gap: number): number {
        if (gap <= 0) return 0;
        const low = ship.lowSpeedHandling;
        const lowCurve = brakingSpeedLimit(gap / AI_APPROACH_SAFETY_PAD, low);
        if (!ship.highSpeedMode) return lowCurve;

        const high = ship.autopilotHandling;
        const targetSlow =
            target.velocity.length() < low.flightBoostMaxSpeed * AI_AUTOPILOT_LOW_TIER_RELEASE;
        if (!targetSlow) return brakingSpeedLimit(gap / AI_APPROACH_SAFETY_PAD, high);

        const toHandoff = Math.max(0, gap - AI_HIGH_SPEED_HANDOFF_RANGE);
        return Math.max(lowCurve, brakingSpeedLimit(toHandoff / AI_APPROACH_SAFETY_PAD, high));
    }

    /** Fill `_desiredVel` for this frame and return the closing speed used. */
    private buildDesiredVelocity(ship: Spaceship, target: Body, gap: number): number {
        const closing = this.closingSpeed(ship, target, gap);
        _desiredVel.copy(target.velocity).addScaledVector(_entryDir, closing);
        return closing;
    }

    update(ctx: IManeuverContext, simDt: number): ManeuverStatus {
        const { ship, target, avoidance } = ctx;
        const input = ship.controlInput;
        this.debugShip = ship;

        _toTarget.subVectors(target.mesh.position, ship.mesh.position);
        const dist = _toTarget.length();
        const R = ctx.orbitRadius;
        const gap = dist - R;
        this.debugGap = gap;
        if (dist <= 0) {
            this.activity = 'approach';
            return 'done';
        }
        _directDir.copy(_toTarget).divideScalar(dist);

        _relVel.subVectors(ship.velocity, target.velocity);
        this.debugRelSpeed = _relVel.length();

        // ── Warp cruise ──────────────────────────────────────────────────────
        // Ahead of everything else: at warp the drive is the only live control.
        if (ship.warpActive) {
            this.activity = 'warp';
            this.debugWarpReason = 'in warp';
            this.debugHazard = '';
            updateWarpCruise(ship, avoidance, gap, _directDir, simDt, target);
            this.prevDist = dist;
            return 'running';
        }

        // ── Arrived? ─────────────────────────────────────────────────────────
        if (Math.abs(gap) <= R * AI_AUTOPILOT_ARRIVAL_TOLERANCE) {
            this.activity = 'braking';
            this.prevDist = dist;
            return 'done';
        }

        // ── Entry direction ──────────────────────────────────────────────────
        // Toward the tangent point of the orbit circle, on the side that sets up travel round the
        // orbit in the latched sense. Inside the orbit radius there is no tangent; head straight
        // out along the radial instead (gap < 0 makes closing zero, so this is just a heading).
        orbitFrame(ship, target, ctx.orbitNormal, _radial, _normal, _tangent);
        if (dist > R) {
            const sinA = R / dist;
            const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
            _entryDir.copy(_directDir).multiplyScalar(cosA).addScaledVector(_tangent, sinA);
        } else {
            _entryDir.copy(_radial);
        }

        // ── Speed tier, then the velocity to fly ─────────────────────────────
        // The tier decides the braking curve, and the velocity decides the tier, so build once on
        // the current tier, pick, and rebuild if the pick changed it.
        const wasHigh = ship.highSpeedMode;
        let closing = this.buildDesiredVelocity(ship, target, gap);
        selectSpeedTier(ship, _desiredVel.length(), gap);
        if (ship.highSpeedMode !== wasHigh) closing = this.buildDesiredVelocity(ship, target, gap);
        this.debugClosing = closing;

        const flown = flyVelocity(ship, avoidance, _desiredVel, simDt, target);
        this.debugCommanded = flown.commandedSpeed;

        // ── Warp ─────────────────────────────────────────────────────────────
        // Held as a level, as the follow AI does. The rest of the controls stay live while it
        // spools, so the nose keeps tracking the target until the drive lights.
        input.warp = wantWarp(ship, avoidance, gap, _directDir, avoidance.last, simDt, target);
        this.debugWarpWorth = lastWarpPlan.worth;
        this.debugWarpLeg = lastWarpPlan.leg;
        this.debugWarpCap = lastWarpPlan.speedCap;
        this.debugEtaWarp = lastWarpPlan.etaWarp;
        this.debugEtaConventional = lastWarpPlan.etaConventional;
        this.debugWarpReason = lastWarpPlan.reason;
        const hazard = avoidance.last.hazard;
        this.debugHazard = hazard ? hazard.name || 'body' : '';

        // A warp would get there sooner: put the nose on the direct line, which is what the
        // charge needs (warp is flown on a locked heading). The velocity being flown points a
        // little off it — by the target's own motion — and a fast target can put that outside
        // the warp alignment cone, so without this the charge would never start, or would
        // abort part-way through the spool.
        if (lastWarpPlan.worth) steerToward(ship, _directDir);

        _forward.set(0, 0, 1).applyQuaternion(ship.controlFrameQuat);
        if (flown.flee) this.activity = 'evading';
        else if (ship.warpCharging) this.activity = 'warp-charging';
        else if (!flown.aligned) this.activity = 'turning';
        else if (ship.forwardSpeedInFrame(_forward) > flown.commandedSpeed * 1.05)
            this.activity = 'braking';
        else this.activity = 'approach';

        // ── Outpaced? ────────────────────────────────────────────────────────
        // Only a velocity beyond the ship's limit while the gap is still growing counts — a
        // target that is merely fast but being reeled in is fine.
        if (flown.saturated && dist > this.prevDist) {
            this.outpacedTimer += simDt;
        } else {
            this.outpacedTimer = Math.max(0, this.outpacedTimer - simDt);
        }
        this.prevDist = dist;

        return this.outpacedTimer > AI_AUTOPILOT_OUTPACED_TIME ? 'outpaced' : 'running';
    }

    debugLines(): string[] {
        const ship = this.debugShip;
        const lines = [
            `Approach · ${this.activity.toUpperCase()}`,
            `Gap to orbit ${formatDistance(this.debugGap)}  rel speed ${formatSpeed(this.debugRelSpeed)}`,
            `Closing want ${formatSpeed(this.debugClosing)}  set ${formatSpeed(this.debugCommanded)}`,
        ];
        if (ship) {
            lines.push(
                `Throttle ${formatThrottle(ship.controlInput)}  ${ship.highSpeedMode ? 'HIGH' : 'LOW'} speed`
            );
        }
        lines.push(
            `Warp: ${this.debugWarpReason || '—'}${this.debugHazard ? `  · avoiding ${this.debugHazard}` : ''}`
        );
        if (Number.isFinite(this.debugEtaConventional)) {
            const warp = Number.isFinite(this.debugEtaWarp)
                ? `warp ${formatEta(this.debugEtaWarp)} (leg ${formatDistance(this.debugWarpLeg)}, cap ${formatSpeed(this.debugWarpCap)})`
                : 'warp n/a';
            lines.push(
                `ETA boost ${formatEta(this.debugEtaConventional)}  ${warp}${this.debugWarpWorth ? '  → WARP' : ''}`
            );
        }
        if (this.outpacedTimer > 0) lines.push(`Losing ground ${this.outpacedTimer.toFixed(1)}s`);
        return lines;
    }
}

/** Sim-seconds as a compact ETA (s / min / h). */
function formatEta(seconds: number): string {
    if (seconds < 120) return `${Math.round(seconds)}s`;
    if (seconds < 7200) return `${Math.round(seconds / 60)}min`;
    return `${(seconds / 3600).toFixed(1)}h`;
}
