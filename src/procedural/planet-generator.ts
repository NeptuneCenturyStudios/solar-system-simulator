import * as THREE from 'three';
import { SeededRandom } from '../utilities/prng';
import { EARTH_DIST } from '../utilities/consts';
import { BodyTypeEnum } from '../utilities/utilities';
import type { StarParams } from '../utilities/body-params';
import { PlanetTypeEnum } from '../utilities/body-params';
import { generateProceduralBodyName } from './body-naming';
import type { ProceduralPlanetCreation } from './planet-factory';
import { PlanetBodyType, ProceduralPlanetSubtype } from './planet-factory';
import { randomPlanetParams } from '../utilities/body-params';
import { calculateOrbitalSpeed } from '../physics/physics';
import { IStateDependencies } from '../interfaces';

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

function pickWeighted<T>(rng: SeededRandom, choices: Array<{ value: T; weight: number }>): T {
    const totalWeight = choices.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
    if (totalWeight <= 0) return choices[0]!.value;

    const roll = rng.next() * totalWeight;
    let acc = 0;
    for (const c of choices) {
        acc += Math.max(0, c.weight);
        if (roll < acc) return c.value;
    }
    return choices[choices.length - 1]!.value;
}

function smoothGaussian(x: number, mu: number, sigma: number): number {
    const d = x - mu;
    return Math.exp(-(d * d) / (2 * sigma * sigma));
}

function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

function pickPlanetSubtypeByDistance(params: {
    rng: SeededRandom;
    distanceT01: number; // 0..1 near->far
    isDwarf: boolean;
}): PlanetTypeEnum {
    const { rng, distanceT01, isDwarf } = params;

    // Distance bands (heuristic):
    // - inner (t~0.0..0.35): desert/volcanic
    // - mid (t~0.35..0.7): terrestrial/ocean
    // - outer (t~0.7..1.0): gas/ice/frozen
    const t = clamp01(distanceT01);

    // Baseline so every subtype can appear at any distance.
    const base = 0.15;

    const terrestrial = base + 1.2 * smoothGaussian(t, 0.55, 0.18);
    const desert = base + 1.5 * smoothGaussian(t, 0.18, 0.16);
    const volcanic = base + 1.3 * smoothGaussian(t, 0.22, 0.16);
    const ocean = base + 1.05 * smoothGaussian(t, 0.6, 0.18);

    const gasGiant = base + 1.25 * smoothGaussian(t, 0.83, 0.14);
    const iceGiant = base + 1.1 * smoothGaussian(t, 0.78, 0.14);
    const frozen = base + 1.0 * smoothGaussian(t, 0.88, 0.14);

    if (isDwarf) {
        // Dwarf cannot be gas/ice giants.
        return pickWeighted(rng, [
            { value: PlanetTypeEnum.Terrestrial, weight: terrestrial },
            { value: PlanetTypeEnum.Desert, weight: desert },
            { value: PlanetTypeEnum.Volcanic, weight: volcanic },
            { value: PlanetTypeEnum.Ocean, weight: ocean },
            { value: PlanetTypeEnum.Frozen, weight: frozen },
        ]);
    }

    return pickWeighted(rng, [
        { value: PlanetTypeEnum.Terrestrial, weight: terrestrial },
        { value: PlanetTypeEnum.Desert, weight: desert },
        { value: PlanetTypeEnum.Volcanic, weight: volcanic },
        { value: PlanetTypeEnum.Ocean, weight: ocean },
        { value: PlanetTypeEnum.Frozen, weight: frozen },
        { value: PlanetTypeEnum.GasGiant, weight: gasGiant },
        { value: PlanetTypeEnum.IceGiant, weight: iceGiant },
    ]);
}

function planetSubtypeToCustomPlanetTypeString(subtype: PlanetTypeEnum): ProceduralPlanetSubtype {
    // Used only to call randomPlanetParams which expects UI-like strings.
    // PlanetTypeEnum values already match the required strings for solid-like (Terrestrial='solid'),
    // and also match gas/ice/basics.
    if (subtype === PlanetTypeEnum.GasGiant) return 'gas_giant';
    if (subtype === PlanetTypeEnum.IceGiant) return 'ice_giant';
    if (subtype === PlanetTypeEnum.Volcanic) return 'volcanic';
    if (subtype === PlanetTypeEnum.Ocean) return 'ocean';
    if (subtype === PlanetTypeEnum.Frozen) return 'frozen';
    if (subtype === PlanetTypeEnum.Desert) return 'desert';
    return 'solid';
}

function safeUnitCross(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
    const out = new THREE.Vector3().crossVectors(a, b);
    if (out.lengthSq() < 1e-12) {
        // Degenerate: pick a stable fallback orthogonal-ish vector.
        const fallback =
            Math.abs(a.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        out.copy(new THREE.Vector3().crossVectors(a, fallback));
    }
    out.normalize();
    return out;
}

export function generateProceduralPlanets(params: {
    dependencies: IStateDependencies;
    masterSeed: string;
    prng: SeededRandom;
    planetCount: number;
    starParams: StarParams[];
    starPlacements: StarPlacement[];
}): ProceduralPlanetCreation[] {
    const { dependencies, masterSeed, prng, planetCount, starParams, starPlacements } = params;

    if (planetCount <= 0) return [];

    const starCount = starParams.length;
    if (starCount === 0) return [];

    const maxStarRadius = Math.max(...starParams.map((s) => s.radius));
    const minDistWorld = Math.max(EARTH_DIST * 0.25, maxStarRadius * 12);
    const maxDistWorld = EARTH_DIST * 8;

    const minAU = minDistWorld / EARTH_DIST;
    const maxAU = maxDistWorld / EARTH_DIST;

    // Distances first (deterministic), then sort for near->far subtype weighting.
    const distances: number[] = [];
    for (let i = 0; i < planetCount; i++) {
        const logMin = Math.log(Math.max(1e-6, minAU));
        const logMax = Math.log(Math.max(logMin + 1e-6, maxAU));
        const u = prng.next();
        const au = Math.exp(logMin + u * (logMax - logMin));
        distances.push(au * EARTH_DIST);
    }
    distances.sort((a, b) => a - b);

    const planetCreations: ProceduralPlanetCreation[] = [];

    for (let i = 0; i < planetCount; i++) {
        const distance = distances[i]!;
        const distanceT01 = planetCount <= 1 ? 0 : i / Math.max(1, planetCount - 1);

        // Dwarf roll (10%)
        const isDwarf = prng.chance(0.1);

        const subtype = pickPlanetSubtypeByDistance({
            rng: prng,
            distanceT01,
            isDwarf,
        });

        const bodyType: PlanetBodyType = isDwarf ? BodyTypeEnum.DwarfPlanet : BodyTypeEnum.Planet;

        const starIndex = i % starCount;
        const hostStar = starParams[starIndex]!;
        const hostPlacement = starPlacements[starIndex]!;

        // Planet subtype drives mass/radius ranges:
        const customTypeString = planetSubtypeToCustomPlanetTypeString(subtype);
        const subSeed = `${masterSeed}|planet:${i}|star:${starIndex}|type:${customTypeString}|t:${distanceT01.toFixed(3)}`;
        const planetParams = randomPlanetParams(customTypeString, {
            // Seed ensures procedural determinism if caller reruns with same masterSeed.
            seed: subSeed,
        });

        // Biased-low inclination:
        // u^2 biases heavily toward 0, but still allows up to 90.
        const inclinationDeg = Math.pow(prng.next(), 2.0) * 90;
        const inclinationRad = (inclinationDeg * Math.PI) / 180;

        // Orbital plane orientation
        const yawRad = prng.range(0, Math.PI * 2);

        // Random phase angle in the orbital plane
        const phiRad = prng.range(0, Math.PI * 2);

        // Radial direction within that orbital plane
        const u = buildUnitPositionDirection(phiRad, yawRad, inclinationRad);

        // Orbital normal for tangential direction
        const normalBase = new THREE.Vector3(0, 1, 0);
        const nYaw = applyYawY(normalBase, yawRad);
        const normal = applyInclinationX(nYaw, inclinationRad).normalize();

        const tangentialDir = safeUnitCross(normal, u); // perpendicular to u in orbital plane

         // Eccentricity in [0..0.6], mapped into speed factor (0 => circular)
        const eccentricity = prng.range(0, 0.6);
        const speed = calculateOrbitalSpeed(dependencies.getG(), distance, hostStar.mass, eccentricity);
        
        const pos = hostPlacement.pos.clone().addScaledVector(u, distance);
        const vel = hostPlacement.vel.clone().addScaledVector(tangentialDir, speed);

        // Name + ids
        const id = `proc_planet_${i}_${subSeed}`;
        const sequenceNumber = i + 1;

        const name = generateProceduralBodyName(bodyType, {
            seed: subSeed,
            sequenceNumber,
            planetSubtype: subtype,
        });

        // Texture pool index (deterministic-ish from i)
        const textureIndex = i;

        planetCreations.push({
            id,
            name,
            pos,
            vel,
            bodyType,
            bodySubtype: subtype,
            radius: planetParams.radius,
            mass: planetParams.mass,
            rotationSpeed: planetParams.rotationSpeed,
            textureIndex,
        });
    }

    // Defensive finite check (prevents NaN physics blowups)
    for (const c of planetCreations) {
        const ok =
            Number.isFinite(c.pos.x) &&
            Number.isFinite(c.pos.y) &&
            Number.isFinite(c.pos.z) &&
            Number.isFinite(c.vel.x) &&
            Number.isFinite(c.vel.y) &&
            Number.isFinite(c.vel.z) &&
            Number.isFinite(c.radius) &&
            Number.isFinite(c.mass) &&
            Number.isFinite(c.rotationSpeed);

        if (!ok) {
            c.pos.set(0, 0, 0);
            c.vel.set(0, 0, 0);
            c.radius = Math.max(1, c.radius);
            c.mass = Math.max(1e-6, c.mass);
            c.rotationSpeed = 0.1;
        }
    }

    return planetCreations;
}
