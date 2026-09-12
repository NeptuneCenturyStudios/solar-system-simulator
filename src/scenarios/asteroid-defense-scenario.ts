import * as THREE from 'three';

import { Asteroid } from '../bodies/asteroid';
import { BodyTypeEnum } from '../bodies/body-enums';
import type { Earth } from '../bodies/earth';
import type { Spaceship } from '../bodies/ships/spaceship';
import { NotificationType } from '../event-log/event-log';
import type { IScenario, IStateDependencies } from '../interfaces';
import { triggerScenarioMessage } from '../drawing/scenario-message-hud';
import { generateProceduralBodyName } from '../procedural/body-naming';
import { rngFor } from '../procedural/seed-utils';
import { flightState } from '../simulation/simulation';
import type { SeededRandom } from '../utilities/prng';
import { createUniqueId } from '../utilities/utilities';
import { reportScenarioOutcome } from './scenario-outcome';
import {
    ASTEROID_DEFENSE_APPROACH_SPEED,
    ASTEROID_DEFENSE_FIRST_WAVE_DELAY,
    ASTEROID_DEFENSE_FLIGHT_WARNING_HOLD_SECONDS,
    ASTEROID_DEFENSE_IMPACT_MARGIN,
    ASTEROID_DEFENSE_MAX_WAVES,
    ASTEROID_DEFENSE_MAX_ELEVATION_DEG,
    ASTEROID_DEFENSE_MISS_DISTANCE_FACTOR,
    ASTEROID_DEFENSE_RADIUS_MAX,
    ASTEROID_DEFENSE_RADIUS_MIN,
    ASTEROID_DEFENSE_SHIP_CLEARANCE,
    ASTEROID_DEFENSE_SPAWN_ATTEMPTS,
    ASTEROID_DEFENSE_SPAWN_DISTANCE,
    ASTEROID_DEFENSE_TRAIL_LENGTH,
    ASTEROID_DEFENSE_WAVE_DELAY,
    CERES_MASS,
    CERES_RADIUS,
} from '../utilities/consts';

/**
 * Scenario: waves of asteroids are thrown at Earth for the player to shoot down.
 *
 * Wave N holds N asteroids, each spawned at its own random angle around Earth. The next wave
 * follows ASTEROID_DEFENSE_WAVE_DELAY sim-seconds after every asteroid in the current one has
 * resolved — hit Earth, been destroyed, or missed.
 *
 * Collision course
 * ----------------
 * Each asteroid spawns in Earth's co-moving frame: it inherits Earth's heliocentric velocity
 * plus ASTEROID_DEFENSE_APPROACH_SPEED aimed straight at Earth. Sitting at essentially Earth's
 * distance from the Sun, it also feels essentially the same solar pull, so relative to Earth it
 * travels in a straight line — both Earth's velocity and its curving orbit are accounted for.
 * Earth's own gravity only focuses the path further, and the Moon orbits outside the spawn
 * sphere, so nothing lies across an approach path.
 *
 * Resolution
 * ----------
 * Outcomes are polled each frame rather than hooked into collision code: a tracked asteroid
 * that is disposed is classified by where it died (Body.die() leaves mesh.position intact).
 * Dying next to Earth is an impact — the collision destroys the asteroid and Earth takes
 * kinetic-energy damage (see resolveCollision) — and dying anywhere else means the player (or
 * the ship itself) destroyed it. An asteroid that
 * somehow drifts well past its spawn distance has missed and is removed, so a stray rock can
 * never stall the wave.
 */
export class AsteroidDefenseScenario implements IScenario {
    readonly name = 'Asteroid Defense';

    /** Asteroid bulk density anchored to Ceres, so mass and radius stay consistent. */
    private static readonly ASTEROID_DENSITY = CERES_MASS / Math.pow(CERES_RADIUS, 3);
    /** Warm trail colour so incoming asteroids stand out against the starfield. */
    private static readonly ASTEROID_TRAIL_COLOR = 0xffaa66;

    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    private readonly earth: Earth;
    private readonly seed: string;

    /** Number of the wave currently in flight (0 before the first spawns). */
    private wave = 0;
    /** Asteroids of the current wave that have not resolved yet. */
    private tracked: Asteroid[] = [];
    /** Sim-seconds until the next wave spawns; only counts down while no wave is in flight. */
    private nextWaveTimer = 0;
    /** Total asteroids spawned so far — drives names and per-asteroid seeds. */
    private spawnedCount = 0;
    // Outcome tallies for the current wave, reported when it clears.
    private waveImpacts = 0;
    private waveDestroyed = 0;
    private waveMissed = 0;
    /** Waves fully cleared so far — the score reported when the scenario ends. */
    private wavesCleared = 0;
    /** Set once the scenario has ended; every further update is a no-op. */
    private finished = false;
    /** Set once flight mode is observed active; a later drop to inactive fails the scenario. */
    private hasEnteredFlightMode = false;
    /** The player's ship, watched so its destruction ends the scenario in failure. */
    private readonly playerShip: Spaceship | null;

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
        this.wave = 0;
        this.tracked = [];
        this.spawnedCount = 0;
        this.wavesCleared = 0;
        this.finished = false;
        this.hasEnteredFlightMode = false;
        this.nextWaveTimer = ASTEROID_DEFENSE_FIRST_WAVE_DELAY;
        this.dependencies.setPanelManagerVisible(false);

        this.dependencies.addEvent({
            message: 'Defend Earth! The first asteroid is inbound.',
            notificationType: NotificationType.Info,
        });
        triggerScenarioMessage('WARNING: Exiting flight mode (ESC) will fail this scenario!', {
            holdSecs: ASTEROID_DEFENSE_FLIGHT_WARNING_HOLD_SECONDS,
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
        // if (this.playerShip) {
        //     if (flightState.isActive) {
        //         this.hasEnteredFlightMode = true;
        //     } else if (this.hasEnteredFlightMode) {
        //         this.finishFailed('You exited flight mode.');
        //         return;
        //     }
        // }

        // Paused: hold every timer and leave outcomes for the next running frame.
        if (simDt <= 0) return;

        if (this.tracked.length > 0) {
            this.resolveTrackedAsteroids();
            if (this.tracked.length === 0) this.onWaveCleared();
            return;
        }

        this.nextWaveTimer -= simDt;
        if (this.nextWaveTimer <= 0) this.spawnWave();
    }

    dispose(): void {
        // The asteroids are ordinary bodies; the system teardown disposes them.
        this.tracked = [];
        this.dependencies.setPanelManagerVisible(true);
    }

    /** Classify and drop every tracked asteroid that has hit Earth, been destroyed, or missed. */
    private resolveTrackedAsteroids(): void {
        const earthPos = this.earth.mesh.position;
        const missDistance =
            ASTEROID_DEFENSE_SPAWN_DISTANCE * ASTEROID_DEFENSE_MISS_DISTANCE_FACTOR;

        this.tracked = this.tracked.filter((asteroid) => {
            const distance = asteroid.mesh.position.distanceTo(earthPos);

            if (asteroid._isDisposed) {
                const impactDistance =
                    (this.earth.radius + asteroid.radius) * ASTEROID_DEFENSE_IMPACT_MARGIN;
                if (distance <= impactDistance) {
                    this.waveImpacts++;
                    this.dependencies.addEvent({
                        message: `${asteroid.name} struck Earth!`,
                        notificationType: NotificationType.Alert,
                    });
                } else {
                    this.waveDestroyed++;
                }
                return false;
            }

            if (distance > missDistance) {
                this.waveMissed++;
                // The body:dead listener removes it from the simulation's body list.
                asteroid.die({ skipExplosion: true, skipImpactSound: true });
                return false;
            }

            return true;
        });
    }

    private onWaveCleared(): void {
        this.wavesCleared = this.wave;

        const parts = [
            `${this.waveDestroyed} destroyed`,
            `${this.waveImpacts} impact${this.waveImpacts === 1 ? '' : 's'}`,
        ];
        if (this.waveMissed > 0) parts.push(`${this.waveMissed} missed`);

        this.dependencies.addEvent({
            message: `Wave ${this.wave} cleared: ${parts.join(', ')}.`,
            notificationType:
                this.waveImpacts > 0 ? NotificationType.Warning : NotificationType.Success,
        });

        // Earth still stands after the final wave: the player has won.
        if (this.wave >= ASTEROID_DEFENSE_MAX_WAVES) {
            this.finishSucceeded();
            return;
        }

        this.nextWaveTimer = ASTEROID_DEFENSE_WAVE_DELAY;
    }

    /** End the scenario in failure and report it once, with the scenario-agnostic shape. */
    private finishFailed(reason: string): void {
        this.finished = true;
        this.dependencies.addEvent({
            message: `${reason} Scenario failed during wave ${this.wave}.`,
            notificationType: NotificationType.Alert,
        });
        reportScenarioOutcome({
            outcome: 'failed',
            scenarioName: this.name,
            message: reason,
            stats: [
                {
                    label: 'Waves survived',
                    value: `${this.wavesCleared} / ${ASTEROID_DEFENSE_MAX_WAVES}`,
                },
            ],
        });
    }

    /** End the scenario in success: every wave was cleared with Earth intact. */
    private finishSucceeded(): void {
        this.finished = true;
        this.dependencies.addEvent({
            message: `All ${ASTEROID_DEFENSE_MAX_WAVES} waves survived. Earth is safe!`,
            notificationType: NotificationType.Success,
        });
        reportScenarioOutcome({
            outcome: 'succeeded',
            scenarioName: this.name,
            stats: [
                {
                    label: 'Waves cleared',
                    value: `${ASTEROID_DEFENSE_MAX_WAVES} / ${ASTEROID_DEFENSE_MAX_WAVES}`,
                },
            ],
        });
    }

    private spawnWave(): void {
        this.wave++;
        this.waveImpacts = 0;
        this.waveDestroyed = 0;
        this.waveMissed = 0;

        // Wave N holds N asteroids.
        for (let i = 0; i < this.wave; i++) {
            this.tracked.push(this.spawnAsteroid());
        }

        this.dependencies.addEvent({
            message: `Wave ${this.wave} incoming: ${this.wave} asteroid${this.wave === 1 ? '' : 's'}.`,
            notificationType: NotificationType.Warning,
        });
        triggerScenarioMessage(`Wave ${this.wave} / ${ASTEROID_DEFENSE_MAX_WAVES}`);
    }

    /** Spawn one asteroid on a collision course with Earth and add it to the simulation. */
    private spawnAsteroid(): Asteroid {
        const index = this.spawnedCount++;
        const rng = rngFor(this.seed, 'asteroidDefense', index);

        const direction = this.pickSpawnDirection(rng);
        const pos = this.earth.mesh.position
            .clone()
            .addScaledVector(direction, ASTEROID_DEFENSE_SPAWN_DISTANCE);
        // Co-moving with Earth, plus a straight-line approach back along the spawn direction.
        const vel = this.earth.velocity
            .clone()
            .addScaledVector(direction, -ASTEROID_DEFENSE_APPROACH_SPEED);

        const size = rng.range(ASTEROID_DEFENSE_RADIUS_MIN, ASTEROID_DEFENSE_RADIUS_MAX);

        const asteroid = new Asteroid(this.dependencies, this.scene, {
            id: createUniqueId('defense_asteroid'),
            name: generateProceduralBodyName(BodyTypeEnum.Asteroid, {
                seed: `${this.seed}|defenseAsteroid:${index}`,
                sequenceNumber: index + 1,
            }),
            pos,
            vel,
            radius: size,
            mass: AsteroidDefenseScenario.ASTEROID_DENSITY * Math.pow(size, 3),
            rotation: {
                tilt: rng.range(0, 180),
                azimuth: rng.range(0, 360),
                speed: rng.range(0.3, 1.0),
            },
            trailColor: AsteroidDefenseScenario.ASTEROID_TRAIL_COLOR,
            maxTrail: ASTEROID_DEFENSE_TRAIL_LENGTH,
        });
        asteroid.isThreat = true;

        this.dependencies.addBody(asteroid);
        return asteroid;
    }

    /**
     * Random unit vector from Earth toward a spawn point: any azimuth, and an elevation within
     * ±ASTEROID_DEFENSE_MAX_ELEVATION_DEG of Earth's orbital plane. Re-rolls (a bounded number
     * of times) when the spawn point would land on top of the player's ship.
     */
    private pickSpawnDirection(rng: SeededRandom): THREE.Vector3 {
        const maxElevation = THREE.MathUtils.degToRad(ASTEROID_DEFENSE_MAX_ELEVATION_DEG);
        const earthPos = this.earth.mesh.position;
        const ship = flightState.knownShip;
        const direction = new THREE.Vector3();
        const spawnPos = new THREE.Vector3();

        for (let attempt = 0; attempt < ASTEROID_DEFENSE_SPAWN_ATTEMPTS; attempt++) {
            const azimuth = rng.range(0, Math.PI * 2);
            const elevation = rng.range(-maxElevation, maxElevation);
            direction.set(
                Math.cos(elevation) * Math.cos(azimuth),
                Math.sin(elevation),
                Math.cos(elevation) * Math.sin(azimuth)
            );

            if (!ship || ship._isDisposed) break;
            spawnPos.copy(earthPos).addScaledVector(direction, ASTEROID_DEFENSE_SPAWN_DISTANCE);
            if (spawnPos.distanceTo(ship.mesh.position) >= ASTEROID_DEFENSE_SHIP_CLEARANCE) break;
        }

        return direction;
    }
}
