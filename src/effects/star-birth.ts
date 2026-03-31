import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';

/**
 * StarBirth
 * Visual effect used when a NEW star is created.
 *
 * Implementation: particles converge into the star position + a central glow that ramps up.
 * This effect is intentionally decoupled from star death (supernova/collapse).
 */
export class StarBirth implements IEffect {
    dependencies: IStateDependencies;
    active: boolean;
    scene: THREE.Scene;
    count: number;
    positions: Float32Array;
    points: THREE.Points;
    geometry: THREE.BufferGeometry;
    material: THREE.PointsMaterial;
    velocities: THREE.Vector3[];
    centralGlow: THREE.Mesh;
    origin: THREE.Vector3;
    birthTime: number;
    duration: number;
    isComplete: boolean;
    colors: Float32Array;

    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} pos
     * @param {number} radius
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene, pos: THREE.Vector3, radius: number) {
        this.dependencies = dependencies;
        this.active = true;
        this.count = 1500; // Particles converging to form star
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.count * 3);
        this.colors = new Float32Array(this.count * 3);
        this.velocities = [];
        this.scene = scene;
        this.origin = pos.clone();
        this.birthTime = 0;
        this.duration = 2.0; // Birth takes 2 seconds
        this.isComplete = false;

        // Start particles at random positions around the origin
        for (let i = 0; i < this.count; i++) {
            // Random spherical distribution around origin
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const distance = Math.random() * 800 + 400; // Start 400-1200 units away

            const x = pos.x + distance * Math.sin(phi) * Math.cos(theta);
            const y = pos.y + distance * Math.sin(phi) * Math.sin(theta);
            const z = pos.z + distance * Math.cos(phi);

            this.positions[i * 3] = x;
            this.positions[i * 3 + 1] = y;
            this.positions[i * 3 + 2] = z;

            // Calculate velocity towards center
            const dir = new THREE.Vector3(pos.x - x, pos.y - y, pos.z - z).normalize();
            const speed = distance / this.duration / 60; // Will reach center in ~2 seconds
            this.velocities.push(dir.multiplyScalar(speed));

            // Golden/white colors - generic "stellar birth"
            const colorChoice = Math.random();
            if (colorChoice < 0.6) {
                // Bright white
                this.colors[i * 3] = 1.0;
                this.colors[i * 3 + 1] = 1.0;
                this.colors[i * 3 + 2] = 1.0;
            } else {
                // Golden yellow
                this.colors[i * 3] = 1.0;
                this.colors[i * 3 + 1] = 0.9;
                this.colors[i * 3 + 2] = 0.4;
            }
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

        this.material = new THREE.PointsMaterial({
            size: 10,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 1.0,
            sizeAttenuation: true,
            depthWrite: false,
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        scene.add(this.points);

        // Central glow that grows as particles converge
        const glowGeo = new THREE.SphereGeometry(radius * 0.1, 32, 32);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xffffdd,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
        });
        this.centralGlow = new THREE.Mesh(glowGeo, glowMat);
        this.centralGlow.position.copy(pos);
        scene.add(this.centralGlow);
    }

    update(dt: number) {
        this.birthTime += dt;
        const progress = Math.min(this.birthTime / this.duration, 1.0);
        const p = this.geometry.attributes.position.array;

        // Move particles toward center
        for (let i = 0; i < this.count; i++) {
            p[i * 3] += this.velocities[i].x * (dt * 60);
            p[i * 3 + 1] += this.velocities[i].y * (dt * 60);
            p[i * 3 + 2] += this.velocities[i].z * (dt * 60);
        }

        this.geometry.attributes.position.needsUpdate = true;

        // Grow central glow as particles converge
        this.centralGlow.material.opacity = progress * 0.8;
        this.centralGlow.scale.setScalar(progress * 50);

        // Fade out particles as they approach center
        this.material.opacity = 1.0 - progress * 0.7;

        // Mark complete when done
        if (progress >= 1.0) {
            this.isComplete = true;
        }
    }

    dispose() {
        this.active = false;
        this.scene.remove(this.points);
        this.scene.remove(this.centralGlow);
        this.geometry.dispose();
        this.material.dispose();
        this.centralGlow.geometry.dispose();
        this.centralGlow.material.dispose();
    }
}
