import * as THREE from 'three';

import { SCALE_FACTOR } from '../utilities/consts.js';
import { BodyType } from '../utilities/utilities.js';
import {
    CelestialBody,
    ICelestialBodyCreationOptions,
} from './celestial-body.js';
import { IStateDependencies } from '../interfaces.js';

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
    private tailCount: number;
    private tailGeo: THREE.BufferGeometry | null;
    private tailMat: THREE.PointsMaterial | null;
    private tailParticles: THREE.Points | null;
    private tailPos: Float32Array | null;
    private tailColors: Float32Array | null;
    private tailOpacities: Float32Array | null;
    private tailVelocities: { life: number; lifeIncrement: number; vel: THREE.Vector3; isBlue: boolean }[] | null;

    constructor(
        deps: IStateDependencies,
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

        this.tailCount = 800;
        this.tailGeo = new THREE.BufferGeometry();
        this.tailPos = new Float32Array(this.tailCount * 3);
        this.tailColors = new Float32Array(this.tailCount * 3);
        this.tailOpacities = new Float32Array(this.tailCount);
        this.tailVelocities = [];

        // Direction away from sun for initial tail positioning
        const awayFromSun = new THREE.Vector3(
            options.pos.x,
            options.pos.y,
            options.pos.z
        ).normalize();

        for (let i = 0; i < this.tailCount; i++) {
            // Initialize with random life values like corona does
            const life = Math.random();
            const isBlue = Math.random() < 0.5;

            // Create velocity vector
            const velVec = awayFromSun
                .clone()
                .multiplyScalar(0.3 + Math.random() * 0.4)
                .add(
                    new THREE.Vector3(
                        (Math.random() - 0.5) * 0.2,
                        (Math.random() - 0.5) * 0.2,
                        (Math.random() - 0.5) * 0.2
                    )
                );

            // Position particle along tail based on its life value
            // Simulate where it would be if it had been traveling
            const travelDistance = life * 200; // Approximate distance based on life
            const idx = i * 3;
            this.tailPos[idx] = options.pos.x + velVec.x * travelDistance;
            this.tailPos[idx + 1] = options.pos.y + velVec.y * travelDistance;
            this.tailPos[idx + 2] = options.pos.z + velVec.z * travelDistance;

            const color = isBlue ? new THREE.Color(0x7ab8ff) : new THREE.Color(0xffffff);
            this.tailColors[idx] = color.r;
            this.tailColors[idx + 1] = color.g;
            this.tailColors[idx + 2] = color.b;

            // this.tailOpacities[i] = (1 - life) * 0.5; // Initial fade
             this.tailVelocities[i] = { life: life, lifeIncrement: 0.001, vel: velVec, isBlue };
        }

        this.tailGeo.setAttribute('position', new THREE.BufferAttribute(this.tailPos, 3));
        this.tailGeo.setAttribute('color', new THREE.BufferAttribute(this.tailColors, 3));
        this.tailMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 2.5,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            vertexColors: true,
        });
        this.tailParticles = new THREE.Points(this.tailGeo, this.tailMat);
        this.tailParticles.frustumCulled = false;
        
        this.scene.add(this.tailParticles);
    }

    update(acc: THREE.Vector3, dt: number) {
        super.update(acc, dt);
        this.updateTail(dt);
    }

    updateTail(dt: number) {
        if (
            !this.mesh ||
            !this.tailParticles ||
            !this.tailGeo ||
            !this.tailMat ||
            !this.tailPos ||
            !this.tailColors ||
            !this.tailOpacities ||
            !this.tailVelocities
        ) {
            return;
        }

        // Calculate distance to sun (optimized with squared distance)
        const distToSunSq =
            this.mesh.position.x ** 2 + this.mesh.position.y ** 2 + this.mesh.position.z ** 2;
        const distToSun = Math.sqrt(distToSunSq);

        // Calculate comet's velocity magnitude (cached)
        const cometSpeed = this.velocity.length();

        // Scale tail intensity based on distance (closer = brighter/longer)
        // Intesity at known distance: 20000000000 * SCALE_FACTOR
        // Apply the inverse square law.
        const tailIntensity = Math.min(1, 20000000000 * SCALE_FACTOR / distToSunSq);

        // Direction away from sun (normalized once)
        const invDistToSun = 1 / distToSun;
        const awayFromSunX = this.mesh.position.x * invDistToSun;
        const awayFromSunY = this.mesh.position.y * invDistToSun;
        const awayFromSunZ = this.mesh.position.z * invDistToSun;

        // Calculate desired tail length based on comet state (precompute constants)
        const baseTailLength = 50 * SCALE_FACTOR;
        const intensityBonus = tailIntensity * 400 * SCALE_FACTOR;
        const velocityBonus = cometSpeed * 100 * SCALE_FACTOR;
        const targetTailLength = baseTailLength + intensityBonus + velocityBonus;

        // Convert tail length to life increment
        const avgParticleSpeed = 0.35;
        const lifeIncrement = (avgParticleSpeed * 60) / targetTailLength;

        const dtScaled = Math.abs(dt) * 60;
        const spread = this.radius * 1 * SCALE_FACTOR;

        // Update all particles
        for (let i = 0; i < this.tailCount; i++) {
            const vel = this.tailVelocities[i];

            // Increment life using the current lifeIncrement
            vel.life += vel.lifeIncrement * dt;

            // Move particle
            const idx = i * 3;
            this.tailPos[idx] += vel.vel.x * dtScaled;
            this.tailPos[idx + 1] += vel.vel.y * dtScaled;
            this.tailPos[idx + 2] += vel.vel.z * dtScaled;

            // If particle dies, reset it with NEW lifeIncrement (works in forward or reverse time)
            if (vel.life >= 1.0 || vel.life <= 0.0) {
                this.tailPos[idx] = this.mesh.position.x + (Math.random() - 0.5) * spread;
                this.tailPos[idx + 1] = this.mesh.position.y + (Math.random() - 0.5) * spread;
                this.tailPos[idx + 2] = this.mesh.position.z + (Math.random() - 0.5) * spread;
                vel.life = vel.life >= 1.0 ? 0 : 1; // Reset to opposite end based on direction
                // Add randomness to lifeIncrement so particles don't all die at once
                vel.lifeIncrement = lifeIncrement * (0.7 + Math.random() * 0.6); // ±30% variation

                // Reuse awayFromSun calculation
                const baseSpeed = 0.3 + Math.random() * 0.4;
                vel.vel.x = awayFromSunX * baseSpeed + (Math.random() - 0.5) * 0.2;
                vel.vel.y = awayFromSunY * baseSpeed + (Math.random() - 0.5) * 0.2;
                vel.vel.z = awayFromSunZ * baseSpeed + (Math.random() - 0.5) * 0.2;

                vel.isBlue = Math.random() < 0.5;
                const color = vel.isBlue ? new THREE.Color(0x7ab8ff) : new THREE.Color(0xffffff);
                this.tailColors[idx] = color.r;
                this.tailColors[idx + 1] = color.g;
                this.tailColors[idx + 2] = color.b;
            }

            // Fade based on life ratio and intensity
            this.tailOpacities[i] = (1 - vel.life) * tailIntensity;
        }

        this.tailGeo.attributes.position.needsUpdate = true;
        this.tailGeo.attributes.color.needsUpdate = true;
        // Make material opacity and size scale with distance
        this.tailMat.opacity = 0.01 + tailIntensity * .8
        // Larger particles when closer to sun for denser appearance
        this.tailMat.size = 2.5 + tailIntensity * 5;
    }

    die(skipEffects = false) {
        this.disposeTail();
        super.die(skipEffects);
    }

    disposeTail() {
        if (!this.tailParticles && !this.tailGeo && !this.tailMat) {
            return;
        }

        try {
            if (this.tailParticles?.parent) {
                this.tailParticles.parent.remove(this.tailParticles);
            }
        } catch {
            // ignore
        }

        try {
            if (this.tailGeo) {
                this.tailGeo.dispose();
            }
        } catch {
            // ignore
        }

        try {
            if (this.tailMat) {
                this.tailMat.dispose();
            }
        } catch {
            // ignore
        }

        this.tailParticles = null;
        this.tailGeo = null;
        this.tailMat = null;
        this.tailPos = null;
        this.tailColors = null;
        this.tailOpacities = null;
        this.tailVelocities = null;
    }
}
