import * as THREE from 'three';
import { SeededRandom } from '../utilities/prng';
import { EARTH_DIST } from '../utilities/consts';
import { BodyTypeEnum } from '../utilities/utilities';
import type { StarParams } from '../utilities/body-params';
import { randomAsteroidParams } from '../utilities/body-params';
import { generateProceduralBodyName } from './body-naming';
import { calculateOrbitalSpeed } from '../physics/physics';
import type { ProceduralAsteroidCreation } from './asteroid-factory';
import type { IStateDependencies } from '../interfaces';

type StarPlacement = {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
};

function applyYawY(v: THREE.Vector3, yawRad: number): THREE.Vector3 {
    const out = v.clone();
    out.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRad);
    return out;
}

function applyInclinationX(v: THREE.Vector3, inclinationRad: number): THREE.Vector3 {
    const out = v.clone();
    out.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);
    return out;
}

function buildUnitPositionDirection(
    phiRad: number,
    yawRad: number,
    inclinationRad: number
): THREE.Vector3 {
    const uBase = new THREE.Vector3(Math.cos(phiRad), 0, Math.sin(phiRad));
    const uYaw = applyYawY(uBase, yawRad);
    const u = applyInclinationX(uYaw, inclinationRad).normalize();
    return u;
}

function safeUnitCross(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
    const out = new THREE.Vector3().crossVectors(a, b);
    if (out.lengthSq() < 1e-12) {
        const fallback =
            Math.abs(a.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        out.copy(new THREE.Vector3().crossVectors(a, fallback));
    }
    out.normalize();
    return out;
}

/**
 * Deterministically generates asteroid orbital placements for a procedural solar system.
 *
 * Asteroids are placed in the "belt zone" between inner and outer regions of the system
 * (roughly 1.5–4 AU relative to the primary star), with moderate inclinations and
 * higher eccentricities than planets.
 */
export function generateProceduralAsteroids(params: {
    dependencies: IStateDependencies;
    masterSeed: string;
    asteroidCount: number;
    starParams: StarParams[];
    starPlacements: StarPlacement[];
}): ProceduralAsteroidCreation[] {
    const { dependencies, masterSeed, asteroidCount, starParams, starPlacements } = params;

    if (asteroidCount <= 0) return [];

    const starCount = starParams.length;
    if (starCount === 0) return [];

    // Use a fresh seeded RNG so asteroid generation is independent of other body generators.
    const rng = new SeededRandom(`${masterSeed}|asteroids`);

    const maxStarRadius = Math.max(...starParams.map((s) => s.radius));

    // Belt zone: roughly 1.5–4 AU from the primary star (scaled to world units).
    const minDistAU = 1.5;
    const maxDistAU = 4.0;
    const minDistWorld = Math.max(EARTH_DIST * minDistAU, maxStarRadius * 12);
    const maxDistWorld = EARTH_DIST * maxDistAU;

    const creations: ProceduralAsteroidCreation[] = [];

    for (let i = 0; i < asteroidCount; i++) {
        const subSeed = `${masterSeed}|asteroid:${i}`;
        const asteroidParams = randomAsteroidParams({ seed: subSeed });

        // Each asteroid orbits a star (round-robin for multi-star systems).
        const starIndex = i % starCount;
        const hostStar = starParams[starIndex]!;
        const hostPlacement = starPlacements[starIndex]!;

        // Random orbital distance within the belt zone (log-uniform).
        const logMin = Math.log(Math.max(1e-6, minDistWorld));
        const logMax = Math.log(Math.max(logMin + 1e-6, maxDistWorld));
        const distance = Math.exp(logMin + rng.next() * (logMax - logMin));

        // Asteroid belts have higher inclinations than planets (up to ~30°).
        const inclinationDeg = Math.pow(rng.next(), 1.5) * 30;
        const inclinationRad = (inclinationDeg * Math.PI) / 180;
        const yawRad = rng.range(0, Math.PI * 2);
        const phiRad = rng.range(0, Math.PI * 2);

        const u = buildUnitPositionDirection(phiRad, yawRad, inclinationRad);

        const normalBase = new THREE.Vector3(0, 1, 0);
        const nYaw = applyYawY(normalBase, yawRad);
        const normal = applyInclinationX(nYaw, inclinationRad).normalize();
        const tangentialDir = safeUnitCross(normal, u);

        // Asteroids have higher orbital eccentricities (0–0.4).
        const eccentricity = rng.range(0, 0.4);
        const speed = calculateOrbitalSpeed(dependencies.getG(), distance, hostStar.mass, eccentricity);

        const pos = hostPlacement.pos.clone().addScaledVector(u, distance);
        const vel = hostPlacement.vel.clone().addScaledVector(tangentialDir, speed);

        const id = `proc_asteroid_${i}_${subSeed}`;
        const name = generateProceduralBodyName(BodyTypeEnum.Asteroid, {
            seed: subSeed,
            sequenceNumber: i + 1,
        });

        creations.push({
            id,
            name,
            pos,
            vel,
            radius: asteroidParams.radius,
            mass: asteroidParams.mass,
        });
    }

    // Defensive finite check.
    for (const c of creations) {
        const ok =
            Number.isFinite(c.pos.x) &&
            Number.isFinite(c.pos.y) &&
            Number.isFinite(c.pos.z) &&
            Number.isFinite(c.vel.x) &&
            Number.isFinite(c.vel.y) &&
            Number.isFinite(c.vel.z) &&
            Number.isFinite(c.radius) &&
            Number.isFinite(c.mass);

        if (!ok) {
            c.pos.set(0, 0, 0);
            c.vel.set(0, 0, 0);
            c.radius = Math.max(0.05, c.radius);
            c.mass = Math.max(1e-6, c.mass);
        }
    }

    return creations;
}
