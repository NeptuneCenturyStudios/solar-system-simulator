import * as THREE from '../vendors/three.module.js';

import { CelestialBody } from './celestial-body.js';
import { BodyType } from '../utilities/utilities.js';

// Helper function to create random polygon/asteroid geometry
function createRandomPolyhedron(radius) {
    // Create a random polyhedron by starting with an icosahedron and distorting it
    const geometry = new THREE.IcosahedronGeometry(radius, 0);
    const positions = geometry.attributes.position.array;

    // Randomly distort each vertex to create irregular asteroid shape
    for (let i = 0; i < positions.length; i += 3) {
        const distortionFactor = 0.3 + Math.random() * 0.4; // Random distortion between 0.3 and 0.7
        positions[i] *= distortionFactor;
        positions[i + 1] *= distortionFactor;
        positions[i + 2] *= distortionFactor;
    }

    geometry.computeVertexNormals();
    return geometry;
}

export class Asteroid extends CelestialBody {
    constructor(
        deps,
        scene,
        {
            radius = 0.5 + Math.random() * 2,
            color = 0x666666 + Math.random() * 0x444444,
            pos,
            vel,
            mass = 0.01 + Math.random() * 0.08,
            id = null,
            name = null,
            trailColor = 0x888888,
            maxTrail = 1500,
            roughness = 0.9,
            metalness = 0.1,
        } = {}
    ) {
        if (!pos || !vel) {
            throw new Error('Asteroid requires { pos, vel }');
        }

        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: roughness,
            metalness: metalness,
        });

        super(
            deps,
            scene,
            radius,
            color,
            pos,
            vel,
            mass,
            id,
            name || 'Asteroid',
            BodyType.Asteroid,
            trailColor,
            maxTrail,
            false,
            false,
            false,
            {
                axis: [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5],
                speed: 0.6 + Math.random() * 1.2,
            },
            (r) => createRandomPolyhedron(r),
            material
        );
    }
}
