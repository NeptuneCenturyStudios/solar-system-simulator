import * as THREE from 'three';
import { Moon } from './moon';
import { calculateTrajectory } from '../physics/physics';
import { stateVectorsFromElements } from '../procedural/orbital-math';
import { SeededRandom } from '../utilities/prng';
import { getRoughnessForMoonTexture, getMetalnessForMoonTexture } from '../drawing/textures';
import {
    MOON_PERIGEE_DIST,
    MOON_APOGEE_DIST,
    MOON_INCLINATION,
    MOON_LONG_ASC_NODE,
    MOON_ARG_PERIGEE,
} from '../utilities/consts';

import type { CelestialBody } from './celestial-body';
import { MoonTypeEnum } from './body-enums';
import { IMoonCreationOptions, IMoonOrbitElements } from '../interfaces';
import { pickMoonTextureForMoonType } from '../procedural/moon-factory';
import { buildBodySphereGeometry } from '../utilities/utilities';

/** A moon's position and velocity relative to its parent, in world-aligned axes. */
interface LocalOrbitState {
    localPos: THREE.Vector3;
    localVel: THREE.Vector3;
}

/**
 * Earth's real lunar orbit, ready to hand to {@link createMoon}. Values are the J2000 mean
 * elements from consts.ts: semi-major axis (perigee + apogee) / 2, eccentricity ≈ 0.0549, and
 * the Moon's 5.145° inclination to the ecliptic.
 *
 * Exposed as a function rather than a frozen constant so each call site gets its own object
 * identity and nothing can mutate a shared one.
 */
export function earthMoonOrbitElements(): IMoonOrbitElements {
    return {
        semiMajorAxis: (MOON_PERIGEE_DIST + MOON_APOGEE_DIST) / 2,
        eccentricity:
            (MOON_APOGEE_DIST - MOON_PERIGEE_DIST) / (MOON_APOGEE_DIST + MOON_PERIGEE_DIST),
        inclinationRad: THREE.MathUtils.degToRad(MOON_INCLINATION),
        longitudeAscendingNodeRad: THREE.MathUtils.degToRad(MOON_LONG_ASC_NODE),
        argumentOfPeriapsisRad: THREE.MathUtils.degToRad(MOON_ARG_PERIGEE),
    };
}

/**
 * Places the moon on a flat, circular orbit at `config.distance` in the parent's local XZ
 * plane. `config.angle` is the in-plane orbital angle (0 = +X axis, π/2 = +Z axis) and
 * `config.yVariation` applies a small random out-of-plane offset.
 */
function circularLocalState(
    parent: CelestialBody,
    config: IMoonCreationOptions,
    angle: number
): LocalOrbitState {
    const trajectory = calculateTrajectory(parent.dependencies.getG(), config.distance, parent.mass);
    const speed = trajectory.vel.z; // magnitude of the circular orbital speed

    const localPos = new THREE.Vector3(
        Math.cos(angle) * config.distance,
        config.yVariation !== undefined ? (Math.random() - 0.5) * config.yVariation : 0,
        Math.sin(angle) * config.distance
    );
    const localVel = new THREE.Vector3(-Math.sin(angle) * speed, 0, Math.cos(angle) * speed);

    return { localPos, localVel };
}

/**
 * Places the moon on a real Keplerian orbit about the parent, built from `config.orbitElements`.
 * `config.angle` is the true anomaly measured from periapsis (0 = periapsis, π = apoapsis).
 *
 * `mu` uses the parent's mass *plus the moon's own* — the correct two-body value for the
 * relative orbit. (The plain circular path above reuses a parent-only `mu`, which is fine for
 * the negligible mass ratio of the Galilean moons but ~1.2% off for Earth's Moon.)
 */
function keplerianLocalState(
    parent: CelestialBody,
    config: IMoonCreationOptions,
    angle: number
): LocalOrbitState {
    const elements = config.orbitElements!;
    const mu = parent.dependencies.getG() * (parent.mass + config.mass);

    const { pos, vel } = stateVectorsFromElements({
        semiMajorAxis: elements.semiMajorAxis,
        eccentricity: elements.eccentricity,
        inclinationRad: elements.inclinationRad,
        longitudeAscendingNodeRad: elements.longitudeAscendingNodeRad,
        argumentOfPeriapsisRad: elements.argumentOfPeriapsisRad,
        trueAnomalyRad: angle,
        mu,
    });

    return { localPos: pos, localVel: vel };
}

export function createMoon(
    parent: CelestialBody,
    scene: THREE.Scene,
    config: IMoonCreationOptions
): Moon {
    const moonType = config.moonType;

    // If a texture is provided in the config, use it; otherwise, pick a texture based on the moon type
    const seededFromConfig = new SeededRandom(`${config.id}|moonTexture`);
    const texture = config.texture ?? pickMoonTextureForMoonType(moonType, seededFromConfig);

    const angle = config.angle !== undefined ? config.angle : 0;

    const { localPos, localVel } = config.orbitElements
        ? keplerianLocalState(parent, config, angle)
        : circularLocalState(parent, config, angle);

    const pos = parent.mesh.position.clone().add(localPos);
    const vel = parent.velocity.clone().add(localVel);

    const moonName = config.name || 'Moon';
    const moonGeometry = buildBodySphereGeometry(config.radius);

    const moonMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        color: 0xffffff,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: getRoughnessForMoonTexture(moonType),
        metalness: getMetalnessForMoonTexture(moonType),
    });

    const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);

    // Tidal locking spins the moon about its orbital normal so that the same face stays pointed
    // at the parent — the lock sits in the true orbital plane, which matters once the orbit is
    // inclined. For a coplanar orbit this is ±Y, identical to the fixed axis it replaces.
    const spinAxis = new THREE.Vector3().crossVectors(localPos, localVel);
    if (spinAxis.lengthSq() < 1e-12) spinAxis.set(0, 1, 0);
    else spinAxis.normalize();

    // Angular speed of the relative orbit at creation, used to seed the tidal-lock servo.
    const rLenSq = Math.max(1e-12, localPos.lengthSq());
    const omega = localPos.clone().cross(localVel).length() / rLenSq;

    const resolvedMoonType: MoonTypeEnum = moonType ?? MoonTypeEnum.Terrestrial;

    return new Moon(parent.dependencies, scene, {
        distance: config.distance,
        angle,
        yVariation: config.yVariation ?? 0,
        tidalLock: {
            target: parent,
            spinAxisWorld: spinAxis,
            faceAxisLocal: new THREE.Vector3(0, 0, 1),
            angularSpeed: omega,
        },
        radius: config.radius,
        pos,
        vel,
        mass: config.mass,
        id: config.id,
        name: moonName,
        trailColor: config.trailColor || 0xffffff,
        maxTrail: config.maxTrail || 1500,
        rotation: { tilt: 0, speed: 0.15 + Math.random() * 0.35 },
        mesh: moonMesh,
        moonType: resolvedMoonType,
        attributes: config.attributes,
    });
}
