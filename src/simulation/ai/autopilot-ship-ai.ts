import * as THREE from 'three';
import { ShipAI } from './ship-ai';
import { ApproachManeuver } from './maneuvers/approach-maneuver';
import { NaturalOrbitManeuver } from './maneuvers/natural-orbit-maneuver';
import { ArtificialOrbitManeuver } from './maneuvers/artificial-orbit-maneuver';
import { chooseOrbitNormal } from './maneuvers/maneuver';
import type { IManeuver, IManeuverContext, ManeuverActivity } from './maneuvers/maneuver';
import { isShipTarget, orbitRadiusFor } from './navigation/target-geometry';
import type { OrbitKind } from './navigation/target-geometry';
import { settingsStore } from '../../settings/settings-store';
import { playSoundEffect, SoundEffect } from '../../utilities/audio';
import { flightState } from '../simulation';
import { formatDistance } from './ai-debug-format';
import type { Body } from '../../bodies/body';
import type { Spaceship } from '../../bodies/ships/spaceship';
import type { AutopilotPhase } from '../../interfaces';

/** Fraction of the orbit radius the target can pull away by before the orbit is abandoned and
 *  the approach flown again. */
const REAPPROACH_FACTOR = 1;

/** Options for an autopilot command. Each is read every frame, so a provider backed by a setting
 *  applies changes live. Defaults read the player's Flight Controls settings. */
export interface IAutopilotShipAIOptions {
    /** How to hold position around a celestial body. Ignored for ships (always artificial). */
    orbitKind?: () => OrbitKind;
    /** Artificial orbit distance, meters, surface (or hull) to hull. */
    orbitDistanceM?: () => number;
}

/**
 * The Ship AI autopilot: fly to a target and hold an orbit around it.
 *
 * A *command* — a small state machine over the reusable maneuvers in `ai/maneuvers/`:
 *
 *   APPROACH (warp / boost / thrust / tier changes as needed) → ORBIT (natural or artificial)
 *
 * and back to APPROACH if the target pulls away from the orbit. Like every ShipAI it flies only
 * through `ship.controlInput`, so it handles exactly like the player's ship would on the same
 * inputs, and nothing in it is specific to the player: any ship can be given one (e.g. through
 * `createNpcShip({ ai })`) to send it somewhere.
 *
 * Progress is published as an AutopilotPhase in the classic autopilot's vocabulary, so the flight
 * HUD, target indicator and cancel semantics work unchanged:
 * ALIGN / WARP_CHARGING / WARP / APPROACH / BRAKE while approaching, CIRCULARIZE while entering
 * the orbit, TIDAL_LOCK once it holds.
 */
export class AutopilotShipAI extends ShipAI {
    readonly name: string = 'Autopilot';

    /** Where the ship is going. */
    readonly target: Body;

    /** Current phase, for the HUD. */
    phase: AutopilotPhase = 'ALIGN';

    private readonly options: Required<IAutopilotShipAIOptions>;
    private stage: 'approach' | 'orbit' = 'approach';
    /** Set when the preferred orbit kind proved infeasible here; overrides the option. */
    private forcedKind: OrbitKind | null = null;
    /** Orbit kind flown on the previous frame, to notice a live change of the setting. */
    private lastKind: OrbitKind | null = null;
    private outpacedReported = false;
    private establishedReported = false;

    private readonly approach = new ApproachManeuver();
    private readonly natural = new NaturalOrbitManeuver();
    private readonly artificial = new ArtificialOrbitManeuver();
    private readonly ctx: IManeuverContext;

    constructor(ship: Spaceship, target: Body, options: IAutopilotShipAIOptions = {}) {
        super(ship);
        this.target = target;
        this.options = {
            orbitKind: options.orbitKind ?? (() => settingsStore.settings.autopilotOrbitMode),
            orbitDistanceM:
                options.orbitDistanceM ?? (() => settingsStore.settings.autopilotOrbitDistanceM),
        };
        this.ctx = {
            ship,
            target,
            avoidance: this.avoidance,
            orbitRadius: 0,
            orbitNormal: new THREE.Vector3(0, 1, 0),
        };
        // Provisional plane for the approach's entry direction; re-chosen when the orbit begins.
        chooseOrbitNormal(ship, target, ship.lowSpeedHandling.flightMaxSpeed, this.ctx.orbitNormal);
    }

    /** The orbit kind in force: ships are always circled under power. */
    private orbitKind(): OrbitKind {
        if (isShipTarget(this.target)) return 'artificial';
        return this.forcedKind ?? this.options.orbitKind();
    }

    private orbitManeuver(kind: OrbitKind): NaturalOrbitManeuver | ArtificialOrbitManeuver {
        return kind === 'natural' ? this.natural : this.artificial;
    }

    /** Centre-to-centre radius of the orbit being flown to or held (u), as of the last update. */
    get orbitRadius(): number {
        return this.ctx.orbitRadius;
    }

    /** True while the orbit is established — cancelling then leaves the ship coasting on it. */
    get inOrbit(): boolean {
        return this.phase === 'TIDAL_LOCK';
    }

    /**
     * Queue a one-shot message for the player's event log. Only the ship the player flies (or
     * last flew) reports — its queue is drained by drainAutopilotEvents(); an NPC's never is.
     */
    private report(message: string, isOrbitNotify = false): void {
        if (this.ship !== flightState.knownShip) return;
        this.ship.autopilotEventMessages.push({ message, isOrbitNotify });
    }

    private targetName(): string {
        return this.target.name || 'target';
    }

    private beginOrbit(kind: OrbitKind): void {
        this.stage = 'orbit';
        chooseOrbitNormal(
            this.ship,
            this.target,
            this.ship.lowSpeedHandling.flightMaxSpeed * 0.1,
            this.ctx.orbitNormal
        );
        this.orbitManeuver(kind).reset();
        this.establishedReported = false;
        if (this.ship === flightState.knownShip) {
            playSoundEffect(SoundEffect.AutopilotDestinationReached);
        }
    }

    update(_dt: number, simDt: number): void {
        const ship = this.ship;
        const target = this.target;
        if (target._isDisposed || !target.mesh) {
            // The callers cancel the autopilot when the target dies; until then, let go.
            ship.resetControlInput();
            ship.updateBoostDecelState();
            return;
        }

        let kind = this.orbitKind();
        if (this.lastKind !== null && kind !== this.lastKind && this.stage === 'orbit') {
            this.orbitManeuver(kind).reset();
            this.establishedReported = false;
        }
        this.lastKind = kind;
        this.ctx.orbitRadius = orbitRadiusFor(
            ship,
            target,
            kind,
            this.options.orbitDistanceM(),
            this.avoidance
        );

        if (this.stage === 'orbit') {
            // Lost it — the target pulled away (or the ship was knocked off). Chase again.
            const dist = ship.mesh.position.distanceTo(target.mesh.position);
            if (dist - this.ctx.orbitRadius > this.ctx.orbitRadius * REAPPROACH_FACTOR) {
                this.stage = 'approach';
                this.approach.reset();
            }
        }

        if (this.stage === 'approach') {
            const status = this.approach.update(this.ctx, simDt);
            if (status === 'outpaced') {
                if (!this.outpacedReported) {
                    this.outpacedReported = true;
                    this.report(
                        `⚠ Autopilot: unable to catch ${this.targetName()} — still pursuing.`
                    );
                }
            } else if (status === 'done') {
                this.outpacedReported = false;
                this.beginOrbit(kind);
            }
            if (this.stage === 'approach') {
                this.phase = this.phaseFor(this.approach.activity, false);
                return;
            }
        }

        let maneuver = this.orbitManeuver(kind);
        let status = maneuver.update(this.ctx, simDt);
        if (status === 'infeasible') {
            const fallback: OrbitKind = kind === 'natural' ? 'artificial' : 'natural';
            // Ships have no fallback, and a fallback that was already tried has none either.
            if (!isShipTarget(target) && this.forcedKind !== fallback) {
                this.report(
                    kind === 'natural'
                        ? `Autopilot: ${this.targetName()} has too little gravity to orbit — holding a powered orbit instead.`
                        : `Autopilot: gravity at ${this.targetName()} is too strong for a powered orbit — entering a natural orbit instead.`
                );
                this.forcedKind = fallback;
                kind = fallback;
                this.lastKind = kind;
                this.ctx.orbitRadius = orbitRadiusFor(
                    ship,
                    target,
                    kind,
                    this.options.orbitDistanceM(),
                    this.avoidance
                );
                maneuver = this.orbitManeuver(kind);
                maneuver.reset();
                status = maneuver.update(this.ctx, simDt);
            }
            if (status === 'infeasible') {
                // Nothing will hold here; drift rather than thrash.
                ship.resetControlInput();
                ship.updateBoostDecelState();
            }
        }

        if (maneuver.established && !this.establishedReported) {
            this.establishedReported = true;
            this.report(
                kind === 'natural'
                    ? `✓ Autopilot: stable orbit around ${this.targetName()} achieved.`
                    : `✓ Autopilot: orbiting ${this.targetName()} at ${formatDistance(this.orbitGap())}.`,
                true
            );
        }
        this.phase = this.phaseFor(maneuver.activity, maneuver.established);
    }

    /** Current surface-to-hull distance of the orbit radius (for messages). */
    private orbitGap(): number {
        const shipR = Number.isFinite(this.ship.radius) ? this.ship.radius : 0;
        const targetR = Number.isFinite(this.target.radius) ? this.target.radius : 0;
        return this.ctx.orbitRadius - shipR - targetR;
    }

    /** Map a maneuver's activity onto the classic HUD's phase vocabulary. */
    private phaseFor(activity: ManeuverActivity, established: boolean): AutopilotPhase {
        switch (activity) {
            case 'warp-charging':
                return 'WARP_CHARGING';
            case 'warp':
                return 'WARP';
            case 'turning':
                return 'ALIGN';
            case 'braking':
                return 'BRAKE';
            case 'inserting':
                return established ? 'TIDAL_LOCK' : 'CIRCULARIZE';
            case 'orbiting':
                return 'TIDAL_LOCK';
            case 'evading':
            case 'approach':
                return this.stage === 'orbit' ? 'CIRCULARIZE' : 'APPROACH';
        }
    }

    override debugLines(): string[] {
        const maneuver: IManeuver =
            this.stage === 'approach' ? this.approach : this.orbitManeuver(this.orbitKind());
        const dist = this.ship.mesh.position.distanceTo(this.target.mesh.position);
        return [
            `${this.name} → ${this.targetName()} · ${this.phase}`,
            `Orbit ${this.orbitKind()} at ${formatDistance(this.orbitGap())}  dist ${formatDistance(dist - this.ctx.orbitRadius)} from orbit`,
            ...maneuver.debugLines(),
        ];
    }
}
