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
    const totalStarMass = starParams.reduce((sum, s) => sum + s.mass, 0);

    // For multi-star systems, compute the binary separation to classify orbit types.
    // S-type: planet orbits one star, stable within ~0.3 × binarySeparation of that star.
    // P-type: planet orbits the barycentre, stable beyond ~2.0 × binarySeparation.
    const binarySeparation =
        starCount > 1 ? starPlacements[0]!.pos.distanceTo(starPlacements[1]!.pos) : 0;

    const S_STABLE_FRACTION = 0.3;
    const P_STABLE_MULTIPLE = 2.0;

    const sMinDist = Math.max(EARTH_DIST * 0.1, maxStarRadius * 12);
    const sMaxDist = binarySeparation * S_STABLE_FRACTION;
    const sZoneValid = starCount > 1 && sMaxDist > sMinDist;

    const pMinDist = Math.max(
        EARTH_DIST * 0.25,
        maxStarRadius * 12,
        binarySeparation * P_STABLE_MULTIPLE
    );
    const pMaxDist = Math.max(EARTH_DIST * 8, binarySeparation * 10.0);
    const pZoneValid = pMinDist < pMaxDist;

    type OrbitPlan = { distance: number; isSType: boolean; hostStarIndex: number };

    // Per-planet: choose S-type or P-type, sample a distance within that zone.
    const orbitPlans: OrbitPlan[] = [];
    for (let k = 0; k < planetCount; k++) {
        const distanceRng = rngFor(masterSeed, 'planetDistance', k);
        const orbitTypeRng = rngFor(masterSeed, 'planetOrbitType', k);

        let isSType: boolean;
        let hostStarIndex = 0;

        if (starCount === 1) {
            isSType = false;
        } else if (sZoneValid && pZoneValid) {
            isSType = orbitTypeRng.chance(0.5);
        } else if (sZoneValid) {
            isSType = true;
        } else {
            isSType = false;
        }

        if (isSType) {
            hostStarIndex = orbitTypeRng.chance(0.5) ? 1 : 0;
        }

        const zoneMin = isSType ? sMinDist : pMinDist;
        const zoneMax = isSType ? sMaxDist : pMaxDist;

        const logMin = Math.log(Math.max(1e-6, zoneMin / EARTH_DIST));
        const logMax = Math.log(Math.max(logMin + 1e-6, zoneMax / EARTH_DIST));
        const u = distanceRng.next();
        const distance = Math.exp(logMin + u * (logMax - logMin)) * EARTH_DIST;

        orbitPlans.push({ distance, isSType, hostStarIndex });
    }
    orbitPlans.sort((a, b) => a.distance - b.distance);

    const planetCreations: ProceduralPlanetCreation[] = [];

    for (let i = 0; i < planetCount; i++) {
        const plan = orbitPlans[i]!;
        const distance = plan.distance;
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

        const customTypeString = planetSubtypeToCustomPlanetTypeString(subtype);
        // S-type orbits use one star as the gravitational anchor;
        // P-type orbits use the system barycenter (always at origin).
        const hostStarIndex = plan.isSType ? plan.hostStarIndex : -1;
        const hostMass = plan.isSType ? starParams[plan.hostStarIndex]!.mass : totalStarMass;
        const hostPos = plan.isSType
            ? starPlacements[plan.hostStarIndex]!.pos
            : new THREE.Vector3(0, 0, 0);
        const hostVel = plan.isSType
            ? starPlacements[plan.hostStarIndex]!.vel
            : new THREE.Vector3(0, 0, 0);

        const subSeed = `${masterSeed}|planet:${i}|orbit:${plan.isSType ? `stype:${hostStarIndex}` : 'ptype'}|type:${customTypeString}|t:${distanceT01.toFixed(3)}`;

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

        // r_peri = distance × (1−e)/(1+e); clamp so periapsis clears all stars
        // and stays integrable (distance×0.3 floor caps e ≈ 0.54 max).
        const minPeriapsis = plan.isSType
            ? Math.max(starParams[plan.hostStarIndex]!.radius * 5, distance * 0.3)
            : Math.max(
                  maxStarRadius * 5,
                  starPlacements[0]!.pos.length() + starParams[0]!.radius * 3,
                  starCount > 1 ? starPlacements[1]!.pos.length() + starParams[1]!.radius * 3 : 0,
                  binarySeparation * P_STABLE_MULTIPLE,
                  distance * 0.3
              );
        const eMax = Math.max(0, (distance - minPeriapsis) / (distance + minPeriapsis));
        const eccentricity = Math.min(orbitalRng.range(0, 0.6), eMax);
        const speed = calculateOrbitalSpeed(dependencies.getG(), distance, hostMass, eccentricity);

        const pos = hostPos.clone().addScaledVector(u, distance);
        const vel = hostVel.clone().addScaledVector(tangentialDir, speed);

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
            rotationTilt: planetParams.rotationTilt,
            rotationAzimuth: planetParams.rotationAzimuth,
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
            c.rotationTilt = 0;
            c.rotationAzimuth = 0;
        }
    }

    return planetCreations;
}
