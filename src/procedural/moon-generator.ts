import * as THREE from 'three';
import type { IStateDependencies } from '../interfaces';
import { SeededRandom } from '../utilities/prng';
import { calculateTrajectory } from '../physics/physics';
import { randomMoonParams } from '../utilities/body-params';
import { generateProceduralBodyName } from './body-naming';
import type { ProceduralPlanetCreation } from './planet-factory';
import { BodyTypeEnum, MoonTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';

export type ProceduralMoonCreation = {
    id: string;
    name: string;
    pos: THREE.Vector3;
    vel: THREE.Vector3;

    /** Distance from parent (used for deterministic orbit generation + moon options). */
    distance: number;
    /** Seeded orbit angle around the parent (used for deterministic naming/initialization options). */
    angle: number;
    /** Optional y variation applied after inclination (used for deterministic moon options). */
    yVariation: number;

    radius: number;
    mass: number;
    rotationSpeed: number;
    rotationTilt: number;
    rotationAzimuth: number;

    /** Used to pick a moon "planet-like" texture pool (excluding gas/ice moon types). */
    moonType: MoonTypeEnum;

    /**
     * Seed used for deterministic ocean textures (procedural ocean generator).
     * Only set for ocean-type moons.
     */
    textureSeed?: string;

    parentIndex: number;
};

function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
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

function pickMoonCount(subtype: PlanetTypeEnum, rng: SeededRandom): number {
    // Heuristic:
    // - Gas/ice giants tend to have more moons
    // - Solid-ish often have 0–2
    const isGasOrIce = subtype === 'gas_giant' || subtype === 'ice_giant';

    if (isGasOrIce) {
        return pickWeighted(rng, [
            { value: 0, weight: 0.2 },
            { value: 1, weight: 0.35 },
            { value: 2, weight: 0.25 },
            { value: 3, weight: 0.13 },
            { value: 4, weight: 0.05 },
            { value: 5, weight: 0.02 },
        ]);
    }

    return pickWeighted(rng, [
        { value: 0, weight: 0.35 },
        { value: 1, weight: 0.4 },
        { value: 2, weight: 0.18 },
        { value: 3, weight: 0.06 },
        { value: 4, weight: 0.01 },
    ]);
}

function pickInclinationDeg(rng: SeededRandom): number {
    // Biased-low inclination: u^2 emphasizes small values while still allowing bigger tilts.
    const u = clamp01(rng.next());
    const maxDeg = 60;
    const inclinationDeg = Math.pow(u, 2.0) * maxDeg;
    return Math.max(0, Math.min(maxDeg, inclinationDeg));
}

export function generateProceduralMoons(params: {
    dependencies: IStateDependencies;
    masterSeed: string;
    planetCreations: ProceduralPlanetCreation[];
}): ProceduralMoonCreation[] {
    const { dependencies, masterSeed, planetCreations } = params;

    if (planetCreations.length === 0) return [];

    const out: ProceduralMoonCreation[] = [];

    // Use a fresh RNG so moon generation doesn't depend on how planets consumed the PRNG.
    const systemRng = new SeededRandom(`${masterSeed}|moons`);

    for (let planetIndex = 0; planetIndex < planetCreations.length; planetIndex++) {
        const planet = planetCreations[planetIndex]!;
        const planetSubtype = planet.bodySubtype;

        // Planet-local RNG (deterministic even if loop order changes)
        const planetMoonRng = new SeededRandom(
            `${masterSeed}|moons|planet:${planetIndex}|${planet.id}`
        );

        const moonCount = pickMoonCount(planetSubtype, planetMoonRng);
        if (moonCount <= 0) continue;

        for (let moonIndex = 0; moonIndex < moonCount; moonIndex++) {
            const moonSeed = `${masterSeed}|moon|planet:${planetIndex}|moon:${moonIndex}|parent:${planet.id}`;

            const moonParams = randomMoonParams(planet.radius, {
                seed: moonSeed,
            });

            // Geometry RNG separated from randomMoonParams so future changes to randomMoonParams
            // won't shift angle/inclination distributions.
            const orbitRng = new SeededRandom(`${moonSeed}|orbit`);

            const angleRad = orbitRng.range(0, Math.PI * 2);
            const inclinationDeg = pickInclinationDeg(orbitRng);

            // Optional out-of-plane variation (kept modest)
            const yVariation = orbitRng.next() * planet.radius * 0.05;

            // Orbital trajectory (circular) relative to planet
            const trajectory = calculateTrajectory(
                dependencies.getG(),
                moonParams.distance,
                planet.mass
            );

            const trajVelZ = trajectory.vel.z;

            // local position/velocity in the planet's XZ plane
            const localPos = new THREE.Vector3(
                Math.cos(angleRad) * moonParams.distance,
                0,
                Math.sin(angleRad) * moonParams.distance
            );

            const localVel = new THREE.Vector3(
                -Math.sin(angleRad) * trajVelZ,
                0,
                Math.cos(angleRad) * trajVelZ
            );

            // Apply inclination by rotating around X
            const inclinationRad = (inclinationDeg * Math.PI) / 180;
            localPos.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);
            localVel.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);

            // Apply optional y variation after inclination (matches existing createSatellite behavior)
            localPos.y += yVariation;

            // World position/velocity
            const pos = planet.pos.clone().add(localPos);
            const vel = planet.vel.clone().add(localVel);

            // Names + IDs
            const id = `proc_moon_${planetIndex}_${moonIndex}_${moonSeed}`;
            const name = generateProceduralBodyName(BodyTypeEnum.Moon, {
                seed: moonSeed,
                sequenceNumber: moonIndex + 1,
                parentName: planet.name,
            });

            // Derive moonType per-moon from its own seed (independent from planetSubtype).
            // We still bias choices based on the parent so ocean worlds feel related,
            // but we do NOT force all moons to match the planet subtype.
            const typeRng = new SeededRandom(`${moonSeed}|moon-type`);

            const moonTypeWeights: Array<{ value: MoonTypeEnum; weight: number }> = (() => {
                const solid = planetSubtype === PlanetTypeEnum.Terrestrial;
                const temperate = planetSubtype === PlanetTypeEnum.Temperate;
                const ocean = planetSubtype === PlanetTypeEnum.Ocean;
                const desert = planetSubtype === PlanetTypeEnum.Desert;
                const frozen = planetSubtype === PlanetTypeEnum.Frozen;
                const volcanic = planetSubtype === PlanetTypeEnum.Volcanic;

                if (temperate) {
                    return [
                        { value: MoonTypeEnum.Temperate, weight: 0.4 },
                        { value: MoonTypeEnum.Terrestrial, weight: 0.25 },
                        { value: MoonTypeEnum.Ocean, weight: 0.15 },
                        { value: MoonTypeEnum.Desert, weight: 0.1 },
                        { value: MoonTypeEnum.Frozen, weight: 0.07 },
                        { value: MoonTypeEnum.Volcanic, weight: 0.03 },
                    ];
                }

                if (ocean) {
                    return [
                        { value: MoonTypeEnum.Ocean, weight: 0.45 },
                        { value: MoonTypeEnum.Terrestrial, weight: 0.28 },
                        { value: MoonTypeEnum.Desert, weight: 0.1 },
                        { value: MoonTypeEnum.Frozen, weight: 0.07 },
                        { value: MoonTypeEnum.Volcanic, weight: 0.05 },
                        { value: MoonTypeEnum.Temperate, weight: 0.05 },
                    ];
                }

                if (desert) {
                    return [
                        { value: MoonTypeEnum.Desert, weight: 0.45 },
                        { value: MoonTypeEnum.Terrestrial, weight: 0.28 },
                        { value: MoonTypeEnum.Ocean, weight: 0.08 },
                        { value: MoonTypeEnum.Frozen, weight: 0.07 },
                        { value: MoonTypeEnum.Volcanic, weight: 0.07 },
                        { value: MoonTypeEnum.Temperate, weight: 0.05 },
                    ];
                }

                if (frozen) {
                    return [
                        { value: MoonTypeEnum.Frozen, weight: 0.45 },
                        { value: MoonTypeEnum.Terrestrial, weight: 0.28 },
                        { value: MoonTypeEnum.Ocean, weight: 0.08 },
                        { value: MoonTypeEnum.Desert, weight: 0.07 },
                        { value: MoonTypeEnum.Volcanic, weight: 0.07 },
                        { value: MoonTypeEnum.Temperate, weight: 0.05 },
                    ];
                }

                if (volcanic) {
                    return [
                        { value: MoonTypeEnum.Volcanic, weight: 0.45 },
                        { value: MoonTypeEnum.Terrestrial, weight: 0.28 },
                        { value: MoonTypeEnum.Desert, weight: 0.08 },
                        { value: MoonTypeEnum.Ocean, weight: 0.07 },
                        { value: MoonTypeEnum.Frozen, weight: 0.07 },
                        { value: MoonTypeEnum.Temperate, weight: 0.05 },
                    ];
                }

                if (solid) {
                    return [
                        { value: MoonTypeEnum.Terrestrial, weight: 0.4 },
                        { value: MoonTypeEnum.Volcanic, weight: 0.15 },
                        { value: MoonTypeEnum.Ocean, weight: 0.13 },
                        { value: MoonTypeEnum.Desert, weight: 0.1 },
                        { value: MoonTypeEnum.Frozen, weight: 0.1 },
                        { value: MoonTypeEnum.Temperate, weight: 0.12 },
                    ];
                }

                // gas_giant / ice_giant parent: still pick a moonType independently.
                return [
                    { value: MoonTypeEnum.Terrestrial, weight: 0.4 },
                    { value: MoonTypeEnum.Ocean, weight: 0.15 },
                    { value: MoonTypeEnum.Frozen, weight: 0.12 },
                    { value: MoonTypeEnum.Desert, weight: 0.1 },
                    { value: MoonTypeEnum.Volcanic, weight: 0.1 },
                    { value: MoonTypeEnum.Temperate, weight: 0.13 },
                ];
            })();

            const moonType = pickWeighted(typeRng, moonTypeWeights);
            const textureSeed =
                moonType === MoonTypeEnum.Terrestrial
                    ? `${moonSeed}|terrestrial-texture-seed`
                    : moonType === MoonTypeEnum.Ocean
                      ? `${moonSeed}|ocean-texture-seed`
                      : moonType === MoonTypeEnum.Desert
                        ? `${moonSeed}|desert-texture-seed`
                        : moonType === MoonTypeEnum.Frozen
                          ? `${moonSeed}|frozen-texture-seed`
                          : moonType === MoonTypeEnum.Volcanic
                            ? `${moonSeed}|volcanic-texture-seed`
                            : moonType === MoonTypeEnum.Temperate
                              ? `${moonSeed}|temperate-texture-seed`
                              : undefined;

            out.push({
                id,
                name,
                pos,
                vel,

                distance: moonParams.distance,
                angle: angleRad,
                yVariation,

                radius: moonParams.radius,
                mass: moonParams.mass,
                rotationSpeed: moonParams.rotationSpeed,
                rotationTilt: moonParams.rotationTilt,
                rotationAzimuth: moonParams.rotationAzimuth,

                moonType,
                textureSeed,

                parentIndex: planetIndex,
            });

            // advance the system rng slightly so it doesn't get stuck unused in future expansions
            systemRng.next();
        }
    }

    return out;
}
