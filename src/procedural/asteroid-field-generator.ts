import * as THREE from 'three';

import { SolarSystemGenerator } from './solar-system-generator';
import { Sun } from '../bodies/sun';
import { Earth } from '../bodies/earth';
import { Asteroid } from '../bodies/asteroid';
import { createMoon } from '../bodies/create-moon';
import { calculateOrbitalSpeed } from '../physics/physics';
import { generateProceduralBodyName } from './body-naming';
import { pickRandomSpaceTexture, generateSeedString, rngFor } from './seed-utils';
import { createUniqueId } from '../utilities/utilities';
import { moonTexture } from '../drawing/textures';
import {
    ASTEROID_FIELD_ORBIT_RADIUS,
    ASTEROID_FIELD_COUNT,
    ASTEROID_FIELD_ARC_DEG,
    ASTEROID_FIELD_EARTH_LEAD_DEG,
    ASTEROID_FIELD_RADIAL_JITTER,
    ASTEROID_FIELD_VERTICAL_HALF_HEIGHT,
    ASTEROID_FIELD_RADIUS_MIN,
    ASTEROID_FIELD_RADIUS_MAX,
    ASTEROID_FIELD_TRAIL_LENGTH,
    ASTEROID_FIELD_TIME_SCALE,
    ASTEROID_FIELD_CAMERA_DISTANCE,
    CERES_MASS,
    CERES_RADIUS,
    SUN_MASS,
    MOON_DIST_FROM_EARTH,
    MOON_MASS,
    MOON_RADIUS,
} from '../utilities/consts';
import { BodyTypeEnum, MoonTypeEnum } from '../bodies/body-enums';
import type { Body } from '../bodies/body';
import type { ISolarSystemGenerationResult, IStateDependencies } from '../interfaces';
import { ProceduralGenerationReporter } from './procedural-generation-progress';

/**
 * Scenario: Earth (with its Moon) flies a tight circular orbit around the Sun and plows
 * straight through a dense band of asteroids parked in that same orbit.
 *
 * Why the band is counter-orbiting
 * --------------------------------
 * The naive layout — asteroids sitting in Earth's orbital path with the same circular
 * velocity — never produces a collision: Earth and the band simply coast along together
 * with zero relative motion. Placing the band on a circular orbit at a *different* radius
 * is no better, because two coplanar circular orbits at different radii never intersect.
 *
 * So the band orbits BACKWARDS (retrograde). A retrograde circular orbit is just as stable
 * as a prograde one — it never spirals inward — but it closes on Earth at twice the orbital
 * speed, so Earth sweeps through the whole band. Every asteroid is placed at exactly
 * {@link ASTEROID_FIELD_ORBIT_RADIUS}, which gives them all an identical orbital speed and
 * guarantees they never collide with one another; only Earth and the Moon can hit them.
 *
 * Each collision resolves through the normal mass-dominance rule (see MASS_DOMINANCE_RATIO
 * in physics.ts): Earth outmasses an asteroid by ~10⁴, so Earth is always the winner and the
 * asteroid is absorbed. The Moon outmasses them too, so it eats anything it clips on the way.
 * Absorption events use the default (console-only) log method, so a full pass is silent
 * rather than a burst of notifications.
 *
 * The scenario launches at a preset gravity multiplier and a modest time scale (see
 * launchSystem in index.ts) so the motion is immediately watchable at sim start.
 */
export class AsteroidFieldGenerator extends SolarSystemGenerator {
    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    private readonly masterSeed: string;

    /** Dusty trail colour so a 150-strong swarm reads as a single field, not a light show. */
    private static readonly ASTEROID_TRAIL_COLOR = 0xa89a88;
    /** Asteroid bulk density anchored to Ceres, so mass and radius stay consistent. */
    private static readonly ASTEROID_DENSITY = CERES_MASS / Math.pow(CERES_RADIUS, 3);

    constructor(dependencies: IStateDependencies, scene: THREE.Scene, seed?: string) {
        super();
        this.dependencies = dependencies;
        this.scene = scene;
        const inputSeed = (seed ?? '').trim();
        // Only the skydome is seeded; the layout is fixed so every run plays out identically.
        this.masterSeed = inputSeed.length > 0 ? inputSeed : generateSeedString();
        this.seed = this.masterSeed;
        console.info('[asteroid-field] using master seed:', this.masterSeed);
    }

    /**
     * Builds the dense counter-orbiting asteroid band and appends it to `bodies`.
     *
     * The band occupies the arc `[0, ASTEROID_FIELD_ARC_DEG]` on Earth's orbit. Earth starts
     * `ASTEROID_FIELD_EARTH_LEAD_DEG` behind that arc and travels prograde while the band
     * travels retrograde, so the two close on each other almost immediately and Earth then
     * mows through the entire band.
     */
    private createAsteroidBand(bodies: Body[], gForce: number): void {
        const radius = ASTEROID_FIELD_ORBIT_RADIUS;
        const arcRad = THREE.MathUtils.degToRad(ASTEROID_FIELD_ARC_DEG);

        // Circular speed at the shared radius; every asteroid uses this same value so none
        // of them drift relative to each other (and therefore never self-collide).
        const orbitalSpeed = calculateOrbitalSpeed(gForce, radius, SUN_MASS, 0);

        for (let i = 0; i < ASTEROID_FIELD_COUNT; i++) {
            const id = `scenario_asteroid_${i}`;
            const name = generateProceduralBodyName(BodyTypeEnum.Asteroid, {
                seed: `${this.masterSeed}|asteroid:${i}`,
                sequenceNumber: i + 1,
            });

            // Angle along the band, with a little jitter so the spacing isn't a perfect fan.
            const angleRng = rngFor(this.masterSeed, 'asteroidAngle', i);
            const t = ASTEROID_FIELD_COUNT > 1 ? i / (ASTEROID_FIELD_COUNT - 1) : 0;
            const angle = t * arcRad + angleRng.range(-0.004, 0.004);

            const radialRng = rngFor(this.masterSeed, 'asteroidRadius', i);
            const r =
                radius +
                radialRng.range(-ASTEROID_FIELD_RADIAL_JITTER, ASTEROID_FIELD_RADIAL_JITTER);

            const heightRng = rngFor(this.masterSeed, 'asteroidHeight', i);
            const y = heightRng.range(
                -ASTEROID_FIELD_VERTICAL_HALF_HEIGHT,
                ASTEROID_FIELD_VERTICAL_HALF_HEIGHT
            );

            const sizeRng = rngFor(this.masterSeed, 'asteroidSize', i);
            const size = sizeRng.range(ASTEROID_FIELD_RADIUS_MIN, ASTEROID_FIELD_RADIUS_MAX);

            const pos = new THREE.Vector3(r * Math.cos(angle), y, r * Math.sin(angle));

            // Retrograde tangential velocity: the negative of the prograde perpendicular.
            const vel = new THREE.Vector3(
                -orbitalSpeed * -Math.sin(angle),
                0,
                -orbitalSpeed * Math.cos(angle)
            );

            const tiltRng = rngFor(this.masterSeed, 'asteroidTilt', i);
            const azimuthRng = rngFor(this.masterSeed, 'asteroidAzimuth', i);
            const spinRng = rngFor(this.masterSeed, 'asteroidSpin', i);

            const asteroid = new Asteroid(this.dependencies, this.scene, {
                id,
                name,
                pos,
                vel,
                radius: size,
                mass: AsteroidFieldGenerator.ASTEROID_DENSITY * Math.pow(size, 3),
                rotation: {
                    tilt: tiltRng.range(0, 180),
                    azimuth: azimuthRng.range(0, 360),
                    speed: spinRng.range(0.3, 1.0),
                },
                trailColor: AsteroidFieldGenerator.ASTEROID_TRAIL_COLOR,
                maxTrail: ASTEROID_FIELD_TRAIL_LENGTH,
            });

            bodies.push(asteroid);
        }
    }

    async generateSolarSystemAsync(
        reporter?: ProceduralGenerationReporter
    ): Promise<ISolarSystemGenerationResult> {
        const bodies: Body[] = [];
        const gForce = this.dependencies.getG();

        const totalBodies = 3 + ASTEROID_FIELD_COUNT; // Sun + Earth + Moon + asteroids
        reporter?.setTotal(totalBodies);

        // ── Sun (static at the origin) ───────────────────────────────────────
        const sun = new Sun(this.dependencies, this.scene);
        bodies.push(sun);
        reporter?.report({
            completed: 1,
            total: totalBodies,
            workUnit: { phase: 'stars', label: 'Creating Sun' },
        });
        await this.yieldToEventLoop();

        // ── Earth (starts trailing the band, travelling prograde into it) ────
        const earthStartAngle = THREE.MathUtils.degToRad(-ASTEROID_FIELD_EARTH_LEAD_DEG);
        const earth = new Earth(
            this.dependencies,
            this.scene,
            earthStartAngle,
            ASTEROID_FIELD_ORBIT_RADIUS
        );
        bodies.push(earth);
        reporter?.report({
            completed: 2,
            total: totalBodies,
            workUnit: { phase: 'planets', label: 'Creating Earth' },
        });
        await this.yieldToEventLoop();

        // ── Moon (orbits Earth, and mows asteroids alongside it) ─────────────
        const moon = createMoon(earth, this.scene, {
            distance: MOON_DIST_FROM_EARTH,
            radius: MOON_RADIUS,
            mass: MOON_MASS,
            pos: new THREE.Vector3(), // overridden by createMoon
            vel: new THREE.Vector3(), // overridden by createMoon
            id: createUniqueId('moon'),
            name: 'Moon',
            moonType: MoonTypeEnum.Terrestrial,
            texture: moonTexture,
            trailColor: 0xffffff,
            maxTrail: 1500,
            angle: 0,
        });
        bodies.push(moon);
        reporter?.report({
            completed: 3,
            total: totalBodies,
            workUnit: { phase: 'moons', label: 'Creating Moon' },
        });
        await this.yieldToEventLoop();

        // ── Dense counter-orbiting asteroid band ─────────────────────────────
        this.createAsteroidBand(bodies, gForce);
        reporter?.report({
            completed: totalBodies,
            total: totalBodies,
            workUnit: { phase: 'asteroids', label: `Creating ${ASTEROID_FIELD_COUNT} asteroids` },
        });
        await this.yieldToEventLoop();

        return {
            system: {
                bodies,
                spaceTexture: pickRandomSpaceTexture(this.masterSeed),
            },
            options: {
                // Modest time scale so Earth is already visibly moving when the system appears.
                timeScale: ASTEROID_FIELD_TIME_SCALE,
                // The scenario is only legible if the camera actually frames Earth — the default
                // Sun-centred view leaves Earth (and its sub-pixel swarm) off screen. Follow Earth
                // from far enough back to include the Moon and the incoming asteroid band.
                camera: {
                    focusBody: earth,
                    distance: ASTEROID_FIELD_CAMERA_DISTANCE,
                    viewDirection: new THREE.Vector3(0.35, 0.45, 1),
                },
            },
            scenario: null,
        };
    }
}
