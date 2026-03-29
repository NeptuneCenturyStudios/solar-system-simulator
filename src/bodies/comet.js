import * as THREE from 'three';

import {
    G,
    SUN_MASS,
    COMET_PERIHELION_DIST,
    COMET_APHELION_DIST,
    COMET_RADIUS,
} from '../utilities/consts.js';
import { BodyType } from '../utilities/utilities.js';
import { CelestialBody } from './celestial-body.js';

// Helper function to create random polyhedron geometry (comet nucleus)
function createRandomPolyhedron(radius) {
    // Start with an icosahedron and distort it for an irregular nucleus
    const geometry = new THREE.IcosahedronGeometry(radius, 0);
    const positions = geometry.attributes.position.array;

    for (let i = 0; i < positions.length; i += 3) {
        // Slightly less distortion than asteroids; comets are typically smoother/icy
        const distortionFactor = 0.6 + Math.random() * 0.5; // 0.6..1.1
        positions[i] *= distortionFactor;
        positions[i + 1] *= distortionFactor;
        positions[i + 2] *= distortionFactor;
    }

    geometry.computeVertexNormals();
    return geometry;
}

export class Comet extends CelestialBody {
    constructor(deps, scene) {
        // Halley-like elliptical orbit
        const perihelion = COMET_PERIHELION_DIST; // Just outside Mars (scaled)
        const aphelion = COMET_APHELION_DIST; // Scaled
        const semiMajorAxis = (perihelion + aphelion) / 2;

        // Start at aphelion (farthest point)
        const distance = aphelion;
        const inclination = Math.PI / 6; // 30 degrees inclination

        // Position at aphelion
        const x = distance * Math.cos(Math.PI / 4);
        const y = distance * Math.sin(inclination) * 0.5;
        const z = distance * Math.sin(Math.PI / 4);

        // Velocity perpendicular to position vector (for elliptical orbit)
        // Using vis-viva equation: v = sqrt(G*M*(2/r - 1/a))
        const speed = Math.sqrt(G * SUN_MASS * (2 / distance - 1 / semiMajorAxis));

        // Velocity perpendicular to radius, inclined
        const velX = -speed * Math.sin(Math.PI / 4) * Math.cos(inclination);
        const velY = speed * Math.sin(inclination) * 0.3;
        const velZ = speed * Math.cos(Math.PI / 4) * Math.cos(inclination);

        const material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.6,
        });

        super(
            deps,
            scene,
            COMET_RADIUS,
            0x888888,
            [x, y, z],
            [velX, velY, velZ],
            0.01, // Very small mass
            'camComet',
            'Comet',
            BodyType.Comet,
            0xaaaaaa,
            5000,
            false,
            true,
            { axis: [0, 1, 0], speed: 0.35 },
            (r) => createRandomPolyhedron(r),
            material
        );
    }
}
