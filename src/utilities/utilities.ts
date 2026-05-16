import * as THREE from 'three';
import { Body } from '../bodies/body';
import { calculateTrajectory } from '../physics/physics';
import { CelestialBody, ISatelliteBasicCreationOptions } from '../bodies/celestial-body';
import { ISS } from '../bodies/iss';

export enum BodyTypeEnum {
    None = 0,
    Star = 1 << 0,
    Planet = 1 << 1,
    Moon = 1 << 2,
    Asteroid = 1 << 3,
    Comet = 1 << 4,
    BlackHole = 1 << 5,
    GasGiant = 1 << 6,
    IceGiant = 1 << 7,
    DwarfPlanet = 1 << 8,
    WhiteDwarf = 1 << 9,
    SpaceShip = 1 << 10,
    BrownDwarf = 1 << 11,
    Pulsar = 1 << 12,
    Satellite = 1 << 13,
}

// Shared body-type helper. Checks bodyType flags only.
export function isBodyType(body: Body, type: BodyTypeEnum) {
    return !!(body && body.bodyType && body.bodyType & type);
}

// Utility to pick a random element from an array
export function pickRandom<T>(arr: Array<T>): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function createUniqueId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

export function createSatellite(scene: THREE.Scene, parent: CelestialBody, config: ISatelliteBasicCreationOptions) {
        // Calculate orbital trajectory based on parent's mass
        const trajectory = calculateTrajectory(
            parent.dependencies.getG(),
            config.distance,
            parent.mass
        );

        // Default angle is 0, but can be specified for multiple moons
        const angle = config.angle !== undefined ? config.angle : 0;

        // Calculate position and velocity in orbital plane
        const localPos = new THREE.Vector3(
            Math.cos(angle) * config.distance,
            0,
            Math.sin(angle) * config.distance
        );
        const localVel = new THREE.Vector3(
            -Math.sin(angle) * trajectory.vel.z,
            0,
            Math.cos(angle) * trajectory.vel.z
        );

        // Apply inclination rotation if specified
        if (config.inclinationDeg !== undefined) {
            const inclinationRad = THREE.MathUtils.degToRad(config.inclinationDeg);
            localPos.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);
            localVel.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);
        }
        // Optionally add random yVariation
        if (config.yVariation !== undefined) {
            localPos.y += (Math.random() - 0.5) * config.yVariation;
        }

        // Translate to parent position and velocity
        const posX = parent.mesh.position.x + localPos.x;
        const posY = parent.mesh.position.y + localPos.y;
        const posZ = parent.mesh.position.z + localPos.z;
        const velX = parent.velocity.x + localVel.x;
        const velY = parent.velocity.y + localVel.y;
        const velZ = parent.velocity.z + localVel.z;

        // Compute initial orbital angular speed about parent (instantaneous, based on spawn r and vrel).
        // ω = |r × v| / |r|²
        const r0 = new THREE.Vector3(posX, posY, posZ).sub(parent.mesh.position);
        const vrel0 = new THREE.Vector3(velX, velY, velZ).sub(parent.velocity);
        const rLenSq = Math.max(1e-12, r0.lengthSq());
        // For perfect-looking locking, we will correct orientation each frame (see update()).
        // Still store ω at spawn so if tidalLock is disabled later, it continues spinning at its spawn rate.
        const omega = r0.clone().cross(vrel0).length() / rLenSq;

        const satellite = new ISS(parent.dependencies, scene, {
            id: config.id,
            name: config.name,
            mass: config.mass,
            radius: config.radius,
            pos: new THREE.Vector3(posX, posY, posZ),
            vel: new THREE.Vector3(velX, velY, velZ),
            angle: angle,
            yVariation: posY,
            distance: config.distance,
            trailColor: config.trailColor || 0xffffff,
            maxTrail: config.maxTrail || 1500,
            rotation: { tilt: 0, speed: 0 },
            tidalLock: {
                target: parent,
                spinAxisWorld: new THREE.Vector3(0, 1, 0),
                faceAxisLocal: new THREE.Vector3(0, 0, 1),
                angularSpeed: omega,
            },
        });

        return satellite;
    }