import * as THREE from 'three';
import { Body } from '../bodies/body';
import { calculateTrajectory } from '../physics/physics';
import { CelestialBody } from '../bodies/celestial-body';
import { ISS } from '../bodies/iss';
import { BodyTypeEnum } from '../bodies/body-enums';
import { ISatelliteCreationOptions } from '../interfaces';
import { settingsStore } from '../settings/settings-store';
import { ECLIPTIC_NORTH } from '../camera/north-up';

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

export function createSatellite(
    scene: THREE.Scene,
    parent: CelestialBody,
    config: ISatelliteCreationOptions
) {
    // Calculate orbital trajectory based on parent's mass
    const trajectory = calculateTrajectory(
        parent.dependencies.getG(),
        config.distance,
        parent.mass
    );

    // Default angle is 0, but can be specified for multiple moons
    const angle = config.angle !== undefined ? config.angle : 0;
    const speed = trajectory.vel.length();

    // Orbit in the parent's EQUATORIAL frame: satellite inclinations (the ISS's 51.64°) are
    // measured from the parent's equator, not the ecliptic. The parent's spin pole is its
    // mesh's local +Y; the node line is where the equator crosses the ecliptic.
    const pole = new THREE.Vector3(0, 1, 0).applyQuaternion(parent.mesh.quaternion).normalize();
    const node = new THREE.Vector3().crossVectors(ECLIPTIC_NORTH, pole);
    if (node.lengthSq() < 1e-12) node.set(1, 0, 0);
    else node.normalize();
    const nodeQuarter = new THREE.Vector3().crossVectors(pole, node); // node × pole = 90° ahead

    // Prograde circular orbit in the equator (node × nodeQuarter = pole, so it turns with the
    // parent's spin), starting `angle` past the node.
    const localPos = new THREE.Vector3()
        .addScaledVector(node, Math.cos(angle) * config.distance)
        .addScaledVector(nodeQuarter, Math.sin(angle) * config.distance);
    const localVel = new THREE.Vector3()
        .addScaledVector(node, -Math.sin(angle) * speed)
        .addScaledVector(nodeQuarter, Math.cos(angle) * speed);

    // Tilt the orbit about the node line; a positive angle makes the satellite ascend there.
    if (config.inclinationDeg !== undefined) {
        const inclinationRad = THREE.MathUtils.degToRad(config.inclinationDeg);
        localPos.applyAxisAngle(node, inclinationRad);
        localVel.applyAxisAngle(node, inclinationRad);
    }

    // The satellite stays face-on to its parent by spinning about its own orbit normal.
    const orbitNormal = new THREE.Vector3().crossVectors(localPos, localVel).normalize();
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
        // Primary for station-keeping. Passed explicitly rather than relying on the tidal-lock
        // target below, which happens to be the same body here but means something different.
        orbitParent: parent,
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
            spinAxisWorld: orbitNormal,
            faceAxisLocal: new THREE.Vector3(0, 0, 1),
            angularSpeed: omega,
        },
    });

    return satellite;
}

/**
 * Gets a human-readable label for a body's type based on its bodyType flags.
 * @param b The body to get the type label for.
 * @returns A string representing the body's type.
 */
export function getBodyTypeLabel(b: Body) {
    if (!b) return 'Unknown';
    if (b.bodyType & BodyTypeEnum.BlackHole) return 'Black Hole';
    if (isBodyType(b, BodyTypeEnum.Star)) return 'Star';
    if (b.bodyType && b.bodyType & BodyTypeEnum.GasGiant) return 'Gas Giant';
    if (b.bodyType && b.bodyType & BodyTypeEnum.IceGiant) return 'Ice Giant';
    if (b.bodyType && b.bodyType & BodyTypeEnum.DwarfPlanet) return 'Dwarf Planet';
    if (b.bodyType && b.bodyType & BodyTypeEnum.Planet) return 'Planet';
    if (b.bodyType && b.bodyType & BodyTypeEnum.Moon) return 'Moon';
    if (b.bodyType && b.bodyType & BodyTypeEnum.Asteroid) return 'Asteroid';
    if (b.bodyType && b.bodyType & BodyTypeEnum.Comet) return 'Comet';
    if (b.bodyType && b.bodyType & BodyTypeEnum.SpaceShip) return 'Spaceship';
    if (b.bodyType && b.bodyType & BodyTypeEnum.Probe) return 'Probe';
    if (b.bodyType && b.bodyType & BodyTypeEnum.Satellite) return 'Satellite';
    if (b.bodyType && b.bodyType & BodyTypeEnum.Wormhole) return 'Wormhole';

    return 'Unknown';
}

/**
 * Creates a sphere geometry for a celestial body with a specified radius.
 * @param radius Radius of the sphere to create
 * @param widthSegments Horizontal segments; omit to derive them from the radius and texture quality
 * @param heightSegments Vertical segments; omit to derive them from the radius and texture quality
 * @returns
 */
export function buildBodySphereGeometry(
    radius: number,
    widthSegments?: number,
    heightSegments?: number
): THREE.SphereGeometry {
    // Calculate the number of segments based on radius to maintain visual fidelity
    const minSegments = 128;
    const maxSegments = 128;
    const segmentFactor = settingsStore.settings.textureQuality === 'low' ? 0.25 : 32; // Adjust this factor to control segment density

    if (!widthSegments) {
        widthSegments = Math.max(
            minSegments,
            Math.min(maxSegments, Math.floor(radius * segmentFactor))
        );
    }

    if (!heightSegments) {
        heightSegments = Math.max(
            minSegments,
            Math.min(maxSegments, Math.floor(radius * segmentFactor))
        );
    }

    return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
}
