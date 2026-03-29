import * as THREE from 'three';

import {
    COMET_RADIUS,
} from '../utilities/consts.js';
import { BodyType } from '../utilities/utilities.js';
import {
    CelestialBody,
    ICelectialBodyDependencies,
    ICelestialBodyCreationOptions,
} from './celestial-body.js';

//export interface ICometCreationOptions extends ICelestialBodyCreationOptions {
//// Add any comet-specific options here if needed in the future
//}

// Helper function to create random polyhedron geometry (comet nucleus)
function createRandomPolyhedron(radius: number) {
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

/**
 * This class represents a comet, which is a type of celestial body with a nucleus and a tail. The tail is created using a particle system that emits particles in the opposite direction 
 * of the comet's velocity. The comet's nucleus is represented as a distorted icosahedron to give it an irregular shape.
 */
export class Comet extends CelestialBody {
    constructor(
        deps: ICelectialBodyDependencies,
        scene: THREE.Scene,
        options: ICelestialBodyCreationOptions,
        material: THREE.Material
    ) {
        // Create default material if none provided
        if (!material) {
            material = new THREE.MeshStandardMaterial({
                color: 0x888888,
                emissive: 0x000000,
                emissiveIntensity: 0,
                roughness: 0.7,
                metalness: 0.6,
            });
        }

        super(
            deps,
            scene,
            options.radius,
            0x888888,
            options.pos,
            options.vel,
            options.mass,
            options.id,
            options.name,
            BodyType.Comet,
            0xaaaaaa,
            5000,
            false,
            { axis: new THREE.Vector3(0, 1, 0), speed: 0.35 },
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

    initTail(scene: THREE.Scene) {
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

    update(acc: THREE.Vector3, dt: number) {
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
        const direction =
            speed > 1e-10 ? velocity.clone().normalize().negate() : new THREE.Vector3(1, 0, 0);

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
