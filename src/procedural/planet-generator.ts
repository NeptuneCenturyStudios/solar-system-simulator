import * as THREE from 'three';
import type { StarParams } from '../utilities/body-params';
import { EARTH_DIST } from '../utilities/consts';
import { calculateOrbitalSpeed } from '../physics/physics';
import { IStateDependencies } from '../interfaces';
import { BodyTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';
import { generateProceduralBodyName } from './body-naming';
import type { ProceduralPlanetCreation } from './planet-factory';
import { PlanetBodyType, type ProceduralPlanetSubtype } from './planet-factory';
import { randomPlanetParams } from '../utilities/body-params';
import { SeededRandom } from '../utilities/prng';

import { buildUnitPositionDirection, safeUnitCross } from './orbital-math';
import { rngFor } from './seed-utils';

type StarPlacement = {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
};

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
    const temperate = base + 1.3 * smoothGaussian(t, 0.5, 0.18);
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
            { value: PlanetTypeEnum.Temperate, weight: temperate },
            { value: PlanetTypeEnum.Desert, weight: desert },
            { value: PlanetTypeEnum.Volcanic, weight: volcanic },
            { value: PlanetTypeEnum.Ocean, weight: ocean },
            { value: PlanetTypeEnum.Frozen, weight: frozen },
        ]);
    }

    return pickWeighted(rng, [
        { value: PlanetTypeEnum.Terrestrial, weight: terrestrial },
        { value: PlanetTypeEnum.Temperate, weight: temperate },
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
    if (subtype === PlanetTypeEnum.Temperate) return 'temperate';
    return 'solid';
}

export function generateProceduralPlanets(params: {
    dependencies: IStateDependencies;
    masterSeed: string;

    planetCount: number;
    starParams: StarParams[];
    starPlacements: StarPlacement[];
}): ProceduralPlanetCreation[] {
    const { dependencies, masterSeed, planetCount, starParams, starPlacements } = params;

    if (planetCount <= 0) return [];

    const starCount = starParams.length;
    if (starCount === 0) return [];

    const maxStarRadius = Math.max(...starParams.map((s) => s.radius));
    const minDistWorld = Math.max(EARTH_DIST * 0.25, maxStarRadius * 12);
    const maxDistWorld = EARTH_DIST * 8;

    const minAU = minDistWorld / EARTH_DIST;
    const maxAU = maxDistWorld / EARTH_DIST;

    // Distances first: generate deterministic per-planet candidate distances,
    // then sort to establish near->far indices used for subtype weighting.
    const distances: number[] = [];
    for (let k = 0; k < planetCount; k++) {
        const distanceRng = rngFor(masterSeed, 'planetDistance', k);

        const logMin = Math.log(Math.max(1e-6, minAU));
        const logMax = Math.log(Math.max(logMin + 1e-6, maxAU));

        const u = distanceRng.next();
        const au = Math.exp(logMin + u * (logMax - logMin));

        distances.push(au * EARTH_DIST);
    }
    distances.sort((a, b) => a - b);

    const planetCreations: ProceduralPlanetCreation[] = [];

    for (let i = 0; i < planetCount; i++) {
        const distance = distances[i]!;
        const distanceT01 = planetCount <= 1 ? 0 : i / Math.max(1, planetCount - 1);

        // Each planetary attribute comes from its own derived RNG stream,
        // so generation is stable even if other generators change call order.
        const dwarfRng = rngFor(masterSeed, 'planetDwarf', i);
        const isDwarf = dwarfRng.chance(0.1);

        const subtypeRng = rngFor(masterSeed, 'planetSubtype', i);
        const subtype = pickPlanetSubtypeByDistance({
            rng: subtypeRng,
            distanceT01,
            isDwarf,
        });

        const bodyType: PlanetBodyType = isDwarf ? BodyTypeEnum.DwarfPlanet : BodyTypeEnum.Planet;

        const starIndex = i % starCount;
        const hostStar = starParams[starIndex]!;
        const hostPlacement = starPlacements[starIndex]!;

        const customTypeString = planetSubtypeToCustomPlanetTypeString(subtype);
        const subSeed = `${masterSeed}|planet:${i}|star:${starIndex}|type:${customTypeString}|t:${distanceT01.toFixed(3)}`;

        const planetParams = randomPlanetParams(customTypeString, {
            seed: subSeed,
        });

        const orbitalRng = rngFor(masterSeed, 'planetOrbit', i);

        // Biased-low inclination:
        // u^2 biases heavily toward 0, but still allows up to 90.
        const inclinationDeg = Math.pow(orbitalRng.next(), 2.0) * 90;
        const inclinationRad = (inclinationDeg * Math.PI) / 180;

        const yawRad = orbitalRng.range(0, Math.PI * 2);
        const phiRad = orbitalRng.range(0, Math.PI * 2);

        // Unit radial direction within orbital plane
        const u = buildUnitPositionDirection(phiRad, yawRad, inclinationRad);

        // Orbital normal for tangential direction
        // (same math as earlier module: build normal from yaw+inclination)
        const normalBase = new THREE.Vector3(0, 1, 0);
        const nYaw = normalBase.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRad);
        const normal = nYaw.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad).normalize();

        const tangentialDir = safeUnitCross(normal, u);

        const eccentricity = orbitalRng.range(0, 0.6);
        const speed = calculateOrbitalSpeed(dependencies.getG(), distance, hostStar.mass, eccentricity);

        const pos = hostPlacement.pos.clone().addScaledVector(u, distance);
        const vel = hostPlacement.vel.clone().addScaledVector(tangentialDir, speed);

        const id = `proc_planet_${i}_${subSeed}`;
        const sequenceNumber = i + 1;

        const name = generateProceduralBodyName(bodyType, {
            seed: subSeed,
            sequenceNumber,
            planetSubtype: subtype,
        });

        // Texture pool index: deterministic-ish from i (keeps stable across seeds if planetCount fixed).
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
            textureSeed: subSeed,
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
