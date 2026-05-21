import * as THREE from 'three';
import { SolarSystemGenerator } from './solar-system-generator';
import { SeededRandom } from '../utilities/prng';
import { generateSystemBodyInventory } from './system-body-inventory-generator';
import { randomStarParams } from '../utilities/body-params';
import type { Body } from '../bodies/body';
import { BodyTypeEnum } from '../utilities/utilities';
import type { IStateDependencies } from '../interfaces';
import { MainSequenceStar } from '../bodies/main-sequence-star';
import { G } from '../utilities/consts';

type StarPlacement = {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
};

function generateSeedString(): string {
    return (() => {
        const randPart =
            typeof crypto !== 'undefined' && crypto.getRandomValues
                ? (() => {
                      const bytes = new Uint32Array(2);
                      crypto.getRandomValues(bytes);
                      return `${bytes[0].toString(16)}${bytes[1].toString(16)}`;
                  })()
                : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        return `${randPart}`;
    })();
}

function deriveSubSeed(masterSeed: string, index: number): string {
    return `${masterSeed}|star:${index}`;
}

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

/**
 * Orbital-plane basis:
 * - `u` is the unit position direction in the orbital plane (from COM to star)
 * - `n` is the unit normal of that orbital plane
 *
 * We use base plane = XZ with normal = +Y, then apply:
 * - yaw around Y
 * - inclination around X
 */

function buildUnitPositionDirection(
    phiRad: number,
    yawRad: number,
    inclinationRad: number
): THREE.Vector3 {
    // Base position direction on XZ plane
    const uBase = new THREE.Vector3(Math.cos(phiRad), 0, Math.sin(phiRad));
    const uYaw = applyYawY(uBase, yawRad);
    const u = applyInclinationX(uYaw, inclinationRad).normalize();
    return u;
}

function createStarBody(
    dependencies: IStateDependencies,
    scene: THREE.Scene,
    params: ReturnType<typeof randomStarParams>,
    index: number,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    rotation?: { tilt: number; speed: number }
): MainSequenceStar {
    const id = `proc_star_${index}_${params.seed}`;
    const name = `Proc Star ${index + 1}`;

    return new MainSequenceStar(dependencies, scene, {
        radius: params.radius,
        pos,
        vel,
        mass: params.mass,
        id,
        name,
        temperature: params.temperature,
        lightIntensity: params.lightIntensity,
        lightDistance: 524400,
        rotation:
            rotation ?? { tilt: params.rotationTilt, speed: params.rotationSpeed },
        mesh: undefined,
    });
}

function generateBinaryPlacements(
    rng: SeededRandom,
    masses: [number, number],
    separationDistance: number,
    yawRad: number,
    inclinationDeg: number
): [StarPlacement, StarPlacement] {
    const [m1, m2] = masses;
    const mSum = m1 + m2;

    const r1 = separationDistance * (m2 / mSum);
    const r2 = separationDistance * (m1 / mSum);

    const inclinationRad = (inclinationDeg * Math.PI) / 180;

    // Orbital plane basis
    const normal = (() => {
        const normalBase = new THREE.Vector3(0, 1, 0);
        const nYaw = applyYawY(normalBase, yawRad);
        return applyInclinationX(nYaw, inclinationRad).normalize();
    })();

    // Separation direction in orbital plane (choose uBase = +X in plane, transformed)
    const u = buildUnitPositionDirection(0, yawRad, inclinationRad); // phi=0 => +X in base

    // Velocity direction for star at +u
    // Velocity direction for star at +u
    // Guard against degenerate cross-product => normalize() => NaNs.
    let velDir = new THREE.Vector3().crossVectors(normal, u);
    if (velDir.lengthSq() < 1e-12) {
        velDir = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(1, 0, 0));
        if (velDir.lengthSq() < 1e-12) {
            velDir = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 0, 1));
        }
    }
    velDir.normalize();

    const omega = Math.sqrt((G * mSum) / Math.pow(separationDistance, 3));

    const pos1 = u.clone().multiplyScalar(r1);
    const pos2 = u.clone().multiplyScalar(-r2);

    const vel1 = velDir.clone().multiplyScalar(omega * r1);
    const vel2 = velDir.clone().multiplyScalar(-omega * r2);

    return [
        { pos: pos1, vel: vel1 },
        { pos: pos2, vel: vel2 },
    ];
}

function generateTriplePlacements(
    rng: SeededRandom,
    masses: [number, number, number],
    radii: [number, number, number]
): [StarPlacement, StarPlacement, StarPlacement] {
    const [m1, m2, m3] = masses;
    const mSum = m1 + m2 + m3;

    const yawRad = rng.range(0, Math.PI * 2);
    // Avoid ~0/90° extremes that can make the orbital-plane basis degenerate
    // (cross(normal, u) becomes ~zero => normalize() => NaNs).
    const inclinationDeg = rng.range(5, 85);
    const inclinationRad = (inclinationDeg * Math.PI) / 180;

    const maxRadius = Math.max(radii[0], radii[1], radii[2]);
    const minRi = maxRadius * 3;
    const maxRi = maxRadius * 40;

    const placements: StarPlacement[] = [];

    for (let i = 0; i < 3; i++) {
        const phiRad = rng.range(0, Math.PI * 2);

        // Ensure star isn't too close to COM relative to others by using a per-star min.
        // Also keep distances non-overlapping-ish.
        const base = minRi + (maxRi - minRi) * rng.next();
        const ri = Math.max(base, radii[i] * 6);

        const u = buildUnitPositionDirection(phiRad, yawRad, inclinationRad);

        // Use "orbit around COM" speed to get a coherent swirl; real n-body chaos emerges naturally.
        const speed = Math.sqrt((G * mSum) / Math.max(ri, 1e-9));
        const normalBase = (() => {
            const normalBaseVec = new THREE.Vector3(0, 1, 0);
            const nYaw = applyYawY(normalBaseVec, yawRad);
            return applyInclinationX(nYaw, inclinationRad).normalize();
        })();

        // Guard against degenerate cross-product => normalize() => NaNs.
        let velDir = new THREE.Vector3().crossVectors(normalBase, u);
        if (velDir.lengthSq() < 1e-12) {
            velDir = new THREE.Vector3().crossVectors(normalBase, new THREE.Vector3(1, 0, 0));
            if (velDir.lengthSq() < 1e-12) {
                velDir = new THREE.Vector3().crossVectors(normalBase, new THREE.Vector3(0, 0, 1));
            }
        }
        velDir.normalize();
        const pos = u.clone().multiplyScalar(ri);
        const vel = velDir.multiplyScalar(speed);

        placements.push({ pos, vel });
    }

    return [placements[0], placements[1], placements[2]];
}

export class ProceduralGenerator extends SolarSystemGenerator {
    private prng: SeededRandom;
    private masterSeed: string;

    private dependencies: IStateDependencies;
    private scene: THREE.Scene;

    constructor(seed: string | undefined, dependencies: IStateDependencies, scene: THREE.Scene) {
        super();

        this.dependencies = dependencies;
        this.scene = scene;

        const inputSeed = (seed ?? '').trim();
        this.masterSeed = inputSeed.length > 0 ? inputSeed : generateSeedString();

        console.log('Seed: ', this.masterSeed);
        // Numeric seed for PRNG from master seed string.
        this.prng = new SeededRandom(this.masterSeed);
    }

    generateSolarSystem(): Body[] {
        const inventory = generateSystemBodyInventory(this.prng);
        const starEntry = inventory.find((e) => e.bodyType === BodyTypeEnum.Star);
        const starCount = starEntry?.count ?? 1;

        const rng = this.prng;

        const starParams = Array.from({ length: starCount }, (_, i) =>
            randomStarParams({ seed: deriveSubSeed(this.masterSeed, i) })
        );

        const masses = starParams.map((p) => p.mass) as number[];

        // Place stars according to rules.
        let placements!: StarPlacement[];

        if (starCount === 1) {
            placements = [{ pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(0, 0, 0) }];
        } else if (starCount === 2) {
            const rMax = Math.max(starParams[0].radius, starParams[1].radius);
            const sepMin = Math.max((starParams[0].radius + starParams[1].radius) * 2, rMax * 10);
            const sepMax = sepMin * 50;
            const separationDistance = rng.range(sepMin, sepMax);

            const yawRad = rng.range(0, Math.PI * 2);
            // Avoid ~0/90° extremes that can make the orbital-plane basis degenerate
            // (even with cross-product guards).
            const inclinationDeg = rng.range(5, 85);

            const binary = generateBinaryPlacements(
                rng,
                [masses[0], masses[1]],
                separationDistance,
                yawRad,
                inclinationDeg
            );
            placements = [binary[0], binary[1]];
        } else {
            // 3 stars
            const radii = starParams.map((p) => p.radius) as [number, number, number];
            const triple = generateTriplePlacements(rng, [masses[0], masses[1], masses[2]], radii);
            placements = [triple[0], triple[1], triple[2]];
        }

        // Instantiate bodies
        const bodies: Body[] = [];
        for (let i = 0; i < starCount; i++) {
            const params = starParams[i];
            const placement = placements[i];

            const posOk =
                Number.isFinite(placement.pos.x) &&
                Number.isFinite(placement.pos.y) &&
                Number.isFinite(placement.pos.z);

            const velOk =
                Number.isFinite(placement.vel.x) &&
                Number.isFinite(placement.vel.y) &&
                Number.isFinite(placement.vel.z);

            const rotationTiltOk = Number.isFinite(params.rotationTilt);
            const rotationSpeedOk = Number.isFinite(params.rotationSpeed) && params.rotationSpeed > 0;

            const starOk =
                Number.isFinite(params.mass) &&
                params.mass > 0 &&
                Number.isFinite(params.radius) &&
                params.radius > 0 &&
                Number.isFinite(params.temperature) &&
                params.temperature > 0 &&
                Number.isFinite(params.lightIntensity) &&
                params.lightIntensity > 0 &&
                rotationTiltOk &&
                rotationSpeedOk;

            const rotation = {
                tilt: rotationTiltOk ? params.rotationTilt : 0,
                speed: rotationSpeedOk ? params.rotationSpeed : 0.08,
            };

            if (!posOk || !velOk || !starOk) {
                // Prevent THREE BufferGeometry NaNs from crashing rendering.
                console.error('[procedural] invalid star inputs; substituting defaults', {
                    starIndex: i,
                    pos: placement.pos,
                    vel: placement.vel,
                    params,
                    posOk,
                    velOk,
                    starOk,
                    rotation,
                });

                placement.pos.set(0, 0, 0);
                placement.vel.set(0, 0, 0);
            }

            bodies.push(
                createStarBody(
                    this.dependencies,
                    this.scene,
                    params,
                    i,
                    placement.pos,
                    placement.vel,
                    rotation
                )
            );
        }

        return bodies;
    }
}
