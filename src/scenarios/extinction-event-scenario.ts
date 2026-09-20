import * as THREE from 'three';

import type { Body } from '../bodies/body';
import { createRandomAsteroidBody } from '../bodies/asteroid-variants';
import { createRandomCometBody } from '../bodies/comet-variants';
import { BodyTypeEnum } from '../bodies/body-enums';
import type { Earth } from '../bodies/earth';
import type { Spaceship } from '../bodies/ships/spaceship';
import { NotificationType } from '../event-log/event-log';
import type { IScenario, IStateDependencies } from '../interfaces';
import { ScenarioLock } from '../interfaces';
import { triggerScenarioMessage } from '../drawing/scenario-message-hud';
import { generateProceduralBodyName } from '../procedural/body-naming';
import { rngFor } from '../procedural/seed-utils';
import type { SeededRandom } from '../utilities/prng';
import { scenarioMusic } from '../utilities/scenario-music';
import { createUniqueId } from '../utilities/utilities';
import { reportScenarioOutcome } from './scenario-outcome';
import {
    CERES_MASS,
    CERES_RADIUS,
    EXTINCTION_EVENT_APPROACH_SPEED_MAX,
    EXTINCTION_EVENT_APPROACH_SPEED_MIN,
    EXTINCTION_EVENT_ASTEROID_RADIUS_MAX,
    EXTINCTION_EVENT_ASTEROID_RADIUS_MIN,
    EXTINCTION_EVENT_COMET_CHANCE,
    EXTINCTION_EVENT_COMET_RADIUS_MAX,
    EXTINCTION_EVENT_COMET_RADIUS_MIN,
    EXTINCTION_EVENT_IMPACT_MARGIN,
    EXTINCTION_EVENT_MAX_ELEVATION_DEG,
    EXTINCTION_EVENT_MISS_DISTANCE_FACTOR,
    EXTINCTION_EVENT_SHIP_CLEARANCE,
    EXTINCTION_EVENT_SPAWN_ATTEMPTS,
    EXTINCTION_EVENT_SPAWN_DISTANCE_MAX,
    EXTINCTION_EVENT_SPAWN_DISTANCE_MIN,
    EXTINCTION_EVENT_THREAT_COUNT,
    EXTINCTION_EVENT_TRAIL_LENGTH,
} from '../utilities/consts';

/** One asteroid or comet tracked toward its own resolution (destroyed, impact, or miss). */
interface TrackedThreat {
    body: Body;
    /** This threat's own spawn distance × EXTINCTION_EVENT_MISS_DISTANCE_FACTOR. */
    missDistance: number;
}

/**
 * Scenario: an extinction-level event — every one of ~100 asteroids and comets is already
 * inbound on Earth from the moment the scenario starts, rather than arriving in escalating
 * waves. Each threat rolls its own spawn distance and approach speed, so even though every
 * body exists from frame one, they still arrive at staggered times.
 *
 * Resolution and win/loss follow the same poll-based pattern as Asteroid Defense: outcomes
 * are read from each tracked body's disposed state and distance to Earth every frame, rather
 * than hooked into collision code. The player wins once every threat has resolved — destroyed,
 * missed, or impacted Earth without destroying it — while Earth still stands; Earth or the
 * player's ship being destroyed first ends the scenario in failure.
 */
export class ExtinctionEventScenario implements IScenario {
    readonly name = 'Extinction Event';
    readonly music = scenarioMusic(
        'musinova-minimal-underscore-piano-pulse-loop-edit-518250.mp3',
        true
    );
    readonly locks = [ScenarioLock.AddBody, ScenarioLock.EditBody, ScenarioLock.DeleteBody];

    /** Bulk density anchored to Ceres, shared by asteroids and comets so mass tracks radius. */
    private static readonly THREAT_DENSITY = CERES_MASS / Math.pow(CERES_RADIUS, 3);

    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    private readonly earth: Earth;
    private readonly playerShip: Spaceship | null;
    private readonly seed: string;

    /** Threats not yet resolved. */
    private tracked: TrackedThreat[] = [];
    // Running tallies, used for both the win check and the persistent counter banner.
    private destroyed = 0;
    private impacts = 0;
    private missed = 0;
    /** Set once the scenario has ended; every further update is a no-op. */
    private finished = false;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        earth: Earth,
        playerShip: Spaceship | null,
        seed: string
    ) {
        this.dependencies = dependencies;
        this.scene = scene;
        this.earth = earth;
        this.playerShip = playerShip;
        this.seed = seed;
    }

    start(): void {
        this.tracked = [];
        this.destroyed = 0;
        this.impacts = 0;
        this.missed = 0;
        this.finished = false;
        this.dependencies.setPanelManagerVisible(false);

        for (let i = 0; i < EXTINCTION_EVENT_THREAT_COUNT; i++) {
            this.tracked.push(this.spawnThreat(i));
        }

        this.dependencies.addEvent({
            message: `Extinction-level event detected: ${EXTINCTION_EVENT_THREAT_COUNT} bodies inbound. Defend Earth!`,
            notificationType: NotificationType.Alert,
        });
        triggerScenarioMessage('WARNING: Extinction-level event inbound. Defend Earth!', {
            holdSecs: 6,
            fontSizePx: 32,
        });
    }

    update(simDt: number): void {
        if (this.finished) return;

        // Earth gone, or the player's ship destroyed, ends the scenario in failure.
        if (this.earth._isDisposed) {
            this.finishFailed('Earth has been destroyed.');
            return;
        }
        if (this.playerShip && this.playerShip._isDisposed) {
            this.finishFailed('Your ship has been destroyed.');
            return;
        }

        // Paused: hold every timer and leave outcomes for the next running frame.
        if (simDt <= 0) return;

        if (this.tracked.length > 0) {
            const resolvedThisFrame = this.resolveTrackedThreats();
            if (resolvedThisFrame > 0) {
                triggerScenarioMessage(
                    `Threats neutralized: ${this.destroyed + this.impacts + this.missed} / ${EXTINCTION_EVENT_THREAT_COUNT}`
                );
            }
            if (this.tracked.length === 0) this.finishSucceeded();
        }
    }

    dispose(): void {
        // The threats are ordinary bodies; the system teardown disposes them.
        this.tracked = [];
        this.dependencies.setPanelManagerVisible(true);
    }

    /**
     * Classify and drop every tracked threat that has hit Earth, been destroyed, or missed.
     * Returns how many resolved this frame, so the caller only re-flashes the counter banner
     * when the count actually changed.
     */
    private resolveTrackedThreats(): number {
        const earthPos = this.earth.mesh.position;
        const before = this.tracked.length;

        this.tracked = this.tracked.filter(({ body, missDistance }) => {
            const distance = body.mesh.position.distanceTo(earthPos);

            if (body._isDisposed) {
                const impactDistance =
                    (this.earth.radius + body.radius) * EXTINCTION_EVENT_IMPACT_MARGIN;
                if (distance <= impactDistance) {
                    this.impacts++;
                    this.dependencies.addEvent({
                        message: `${body.name} struck Earth!`,
                        notificationType: NotificationType.Alert,
                    });
                } else {
                    this.destroyed++;
                }
                return false;
            }

            if (distance > missDistance) {
                this.missed++;
                // The body:dead listener removes it from the simulation's body list.
                body.die({ skipExplosion: true, skipImpactSound: true });
                return false;
            }

            return true;
        });

        return before - this.tracked.length;
    }

    /** End the scenario in failure and report it once, with the scenario-agnostic shape. */
    private finishFailed(reason: string): void {
        this.finished = true;
        const resolved = this.destroyed + this.impacts + this.missed;
        this.dependencies.addEvent({
            message: `${reason} Scenario failed with ${resolved} / ${EXTINCTION_EVENT_THREAT_COUNT} threats resolved.`,
            notificationType: NotificationType.Alert,
        });
        reportScenarioOutcome({
            outcome: 'failed',
            scenarioName: this.name,
            message: reason,
            stats: [
                {
                    label: 'Threats neutralized',
                    value: `${resolved} / ${EXTINCTION_EVENT_THREAT_COUNT}`,
                },
            ],
        });
    }

    /** End the scenario in success: every threat resolved with Earth intact. */
    private finishSucceeded(): void {
        this.finished = true;
        this.dependencies.addEvent({
            message: `All ${EXTINCTION_EVENT_THREAT_COUNT} threats resolved. Earth is safe!`,
            notificationType: NotificationType.Success,
        });
        reportScenarioOutcome({
            outcome: 'succeeded',
            scenarioName: this.name,
            stats: [
                {
                    label: 'Threats neutralized',
                    value: `${EXTINCTION_EVENT_THREAT_COUNT} / ${EXTINCTION_EVENT_THREAT_COUNT}`,
                },
            ],
        });
    }

    /**
     * Spawn one threat (asteroid or comet, randomly) on a collision course with Earth and add
     * it to the simulation. Spawn distance and approach speed are both rolled per-threat, so
     * a scenario's worth of threats created in the same frame still arrive at staggered times.
     */
    private spawnThreat(index: number): TrackedThreat {
        const typeRng = rngFor(this.seed, 'extinctionEventType', index);
        const rng = rngFor(this.seed, 'extinctionEvent', index);
        // Dedicated stream for the variant roll, so the geometry stream stays independent of
        // which variant registry (asteroid or comet) ends up being drawn from.
        const variantRng = rngFor(this.seed, 'extinctionEventVariant', index);

        const isComet = typeRng.next() < EXTINCTION_EVENT_COMET_CHANCE;

        const direction = this.pickSpawnDirection(rng);
        const spawnDistance = rng.range(
            EXTINCTION_EVENT_SPAWN_DISTANCE_MIN,
            EXTINCTION_EVENT_SPAWN_DISTANCE_MAX
        );
        const approachSpeed = rng.range(
            EXTINCTION_EVENT_APPROACH_SPEED_MIN,
            EXTINCTION_EVENT_APPROACH_SPEED_MAX
        );

        const pos = this.earth.mesh.position.clone().addScaledVector(direction, spawnDistance);
        // Co-moving with Earth, plus a straight-line approach back along the spawn direction.
        const vel = this.earth.velocity.clone().addScaledVector(direction, -approachSpeed);

        const size = isComet
            ? rng.range(EXTINCTION_EVENT_COMET_RADIUS_MIN, EXTINCTION_EVENT_COMET_RADIUS_MAX)
            : rng.range(EXTINCTION_EVENT_ASTEROID_RADIUS_MIN, EXTINCTION_EVENT_ASTEROID_RADIUS_MAX);
        const mass = ExtinctionEventScenario.THREAT_DENSITY * Math.pow(size, 3);

        const bodyType = isComet ? BodyTypeEnum.Comet : BodyTypeEnum.Asteroid;
        const name = generateProceduralBodyName(bodyType, {
            seed: `${this.seed}|extinctionThreat:${index}`,
            sequenceNumber: index + 1,
        });
        const options = {
            id: createUniqueId(isComet ? 'extinction_comet' : 'extinction_asteroid'),
            name,
            pos,
            vel,
            radius: size,
            mass,
            rotation: {
                tilt: rng.range(0, 180),
                azimuth: rng.range(0, 360),
                speed: rng.range(0.3, 1.0),
            },
            maxTrail: EXTINCTION_EVENT_TRAIL_LENGTH,
        };

        const body: Body = isComet
            ? createRandomCometBody(this.dependencies, this.scene, options, variantRng)
            : createRandomAsteroidBody(this.dependencies, this.scene, options, variantRng);
        body.isThreat = true;

        this.dependencies.addBody(body);

        return {
            body,
            missDistance: spawnDistance * EXTINCTION_EVENT_MISS_DISTANCE_FACTOR,
        };
    }

    /**
     * Random unit vector from Earth toward a spawn point: any azimuth, and an elevation within
     * ±EXTINCTION_EVENT_MAX_ELEVATION_DEG of Earth's orbital plane. Re-rolls (a bounded number
     * of times) when the spawn point would land on top of the player's ship.
     */
    private pickSpawnDirection(rng: SeededRandom): THREE.Vector3 {
        const maxElevation = THREE.MathUtils.degToRad(EXTINCTION_EVENT_MAX_ELEVATION_DEG);
        const earthPos = this.earth.mesh.position;
        const ship = this.playerShip;
        const direction = new THREE.Vector3();
        const spawnPos = new THREE.Vector3();
        // Any single threat's own rolled spawn distance isn't known yet at direction-pick
        // time, so clearance is checked against the nearest possible spawn distance — the
        // worst case for landing on top of the ship.
        const clearanceCheckDistance = EXTINCTION_EVENT_SPAWN_DISTANCE_MIN;

        for (let attempt = 0; attempt < EXTINCTION_EVENT_SPAWN_ATTEMPTS; attempt++) {
            const azimuth = rng.range(0, Math.PI * 2);
            const elevation = rng.range(-maxElevation, maxElevation);
            direction.set(
                Math.cos(elevation) * Math.cos(azimuth),
                Math.sin(elevation),
                Math.cos(elevation) * Math.sin(azimuth)
            );

            if (!ship || ship._isDisposed) break;
            spawnPos.copy(earthPos).addScaledVector(direction, clearanceCheckDistance);
            if (spawnPos.distanceTo(ship.mesh.position) >= EXTINCTION_EVENT_SHIP_CLEARANCE) break;
        }

        return direction;
    }
}
