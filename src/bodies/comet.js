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
            { axis: [0, 1, 0], speed: 0.35 },
            (r) => createRandomPolyhedron(r),
            material
        );

        this.tailCount = 400;
        this.tailIndex = 0;
        this.tailParticles = null;
        this.tailGeo = null;
        this.tailMat = null;
        this.tailPos = null;
        this.tailOpacities = null;
        this.tailVelocities = null;

        this.initTail(scene);
    }

    initTail(scene) {
        const tailCount = this.tailCount || 400;
        this.tailPos = new Float32Array(tailCount * 3);
        this.tailOpacities = new Float32Array(tailCount);
        this.tailVelocities = new Float32Array(tailCount * 3);

        this.tailGeo = new THREE.BufferGeometry();
        this.tailGeo.setAttribute('position', new THREE.BufferAttribute(this.tailPos, 3));
        this.tailGeo.setAttribute('opacity', new THREE.BufferAttribute(this.tailOpacities, 1));

        this.tailMat = new THREE.PointsMaterial({
            color: 0xddeeff,
            size: 2.5,
            transparent: true,
            opacity: 0.75,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: false,
        });

        this.tailParticles = new THREE.Points(this.tailGeo, this.tailMat);
        this.tailParticles.visible = true;
        scene.add(this.tailParticles);
    }

    update(acc, dt) {
        super.update(acc, dt);
        this.updateTail();
    }

    updateTail() {
        if (!this.tailParticles || !this.tailGeo || !this.tailPos || !this.tailOpacities) return;
        if (!this.mesh) return;

        const position = this.mesh.position;
        const velocity = this.velocity || new THREE.Vector3();
        const speed = velocity.length();

        const tailCount = this.tailCount || 400;
        const tailLength = Math.max(40, tailCount * 0.25);
        const direction = speed > 1e-10 ? velocity.clone().normalize().negate() : new THREE.Vector3(1, 0, 0);

        this.tailIndex = (this.tailIndex + 1) % tailCount;
        const i3 = this.tailIndex * 3;

        this.tailPos[i3] = position.x;
        this.tailPos[i3 + 1] = position.y;
        this.tailPos[i3 + 2] = position.z;

        this.tailVelocities[i3] = direction.x * tailLength;
        this.tailVelocities[i3 + 1] = direction.y * tailLength;
        this.tailVelocities[i3 + 2] = direction.z * tailLength;
        this.tailOpacities[this.tailIndex] = 1;

        for (let i = 0; i < tailCount; i++) {
            const idx = i * 3;
            const opacity = this.tailOpacities[i];
            if (opacity <= 0) continue;

            this.tailPos[idx] += this.tailVelocities[idx] * 0.01;
            this.tailPos[idx + 1] += this.tailVelocities[idx + 1] * 0.01;
            this.tailPos[idx + 2] += this.tailVelocities[idx + 2] * 0.01;
            this.tailOpacities[i] = Math.max(0, opacity - 0.015);
        }

        const posAttr = this.tailGeo.getAttribute('position');
        const opacityAttr = this.tailGeo.getAttribute('opacity');
        if (posAttr) posAttr.needsUpdate = true;
        if (opacityAttr) opacityAttr.needsUpdate = true;
    }

    die(skipEffects = false) {
        this.disposeTail();
        super.die(skipEffects);
    }

    disposeTail() {
        if (this.tailParticles?.parent) {
            this.tailParticles.parent.remove(this.tailParticles);
        }
        if (this.tailGeo) this.tailGeo.dispose();
        if (this.tailMat) this.tailMat.dispose();

        this.tailParticles = null;
        this.tailGeo = null;
        this.tailMat = null;
        this.tailPos = null;
        this.tailOpacities = null;
        this.tailVelocities = null;
    }
}
