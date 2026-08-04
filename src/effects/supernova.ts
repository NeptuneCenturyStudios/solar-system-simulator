import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';

import { SCALE_FACTOR } from '../utilities/consts';

export class Supernova implements IEffect {
    // Cooldown fade factor per frame (tweakable)
    static readonly COOLDOWN_FADE = 0.9998;
    // Speed loss factor per frame (tweakable)
    static readonly SPEED_LOSS = 0.9988;
    dependencies: IStateDependencies;
    active: boolean;
    count: number;
    scene: THREE.Scene;
    geometry: THREE.BufferGeometry;
    material: THREE.PointsMaterial;
    points: THREE.Points;
    positions: Float32Array;
    colors: Float32Array;
    baseColors: { r: number; g: number; b: number }[];
    sizes: Float32Array;
    velocities: THREE.Vector3[];
    expandTime: number;
    origin: THREE.Vector3;
    flashSphere: THREE.Mesh | null;
    flashOpacity: number;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        pos: THREE.Vector3,
        radius: number
    ) {
        this.dependencies = dependencies;
        this.count = 20000; // Even more particles for maximum density
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.count * 3);
        this.colors = new Float32Array(this.count * 4); // RGBA for per-particle opacity
        this.baseColors = []; // Store original colors for fading
        this.sizes = new Float32Array(this.count);
        this.velocities = [];
        this.active = true;
        this.scene = scene;
        this.expandTime = 0;
        this.origin = pos.clone(); // Store origin for distance calculation

        // Nebula color palette - vibrant cosmic colors
        const nebulaColors = [
            new THREE.Color(0xff4444), // Bright red
            new THREE.Color(0xff8800), // Orange
            new THREE.Color(0xffaa00), // Gold
            new THREE.Color(0xff00ff), // Magenta
            new THREE.Color(0x8800ff), // Purple
            new THREE.Color(0x4444ff), // Blue
            new THREE.Color(0x00ffff), // Cyan
            new THREE.Color(0xffff88), // Light yellow
            new THREE.Color(0xffffff), // White hot
        ];

        // Split particles: 5000 inner white-hot core, 15000 outer nebula
        const innerCount = 5000;

        for (let i = 0; i < this.count; i++) {
            // Start at supernova center
            this.positions[i * 3] = pos.x;
            this.positions[i * 3 + 1] = pos.y;
            this.positions[i * 3 + 2] = pos.z;

            const isInnerParticle = i < innerCount;

            if (isInnerParticle) {
                // Inner core particles - white-hot, random directions, more chaotic
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(Math.random() * 2 - 1);
                let vx = Math.sin(phi) * Math.cos(theta);
                let vy = Math.sin(phi) * Math.sin(theta);
                let vz = Math.cos(phi);

                // Add random perturbation to direction
                vx += (Math.random() - 0.5) * 0.4;
                vy += (Math.random() - 0.5) * 0.4;
                vz += (Math.random() - 0.5) * 0.4;

                // Randomize speed scaling per axis for more chaos
                const speed = (Math.random() * 180 + 80) * SCALE_FACTOR; // Increased max speed and scaled
                const v = new THREE.Vector3(
                    vx * (1 + (Math.random() - 0.5) * 0.2),
                    vy * (1 + (Math.random() - 0.5) * 0.2),
                    vz * (1 + (Math.random() - 0.5) * 0.2)
                )
                    .normalize()
                    .multiplyScalar(speed * (1 + (Math.random() - 0.5) * 0.2));
                this.velocities.push(v);

                // White-hot colors with alpha
                this.colors[i * 4] = 1.0;
                this.colors[i * 4 + 1] = 1.0;
                this.colors[i * 4 + 2] = 1.0;
                this.colors[i * 4 + 3] = 1.0;
                this.baseColors.push({ r: 1.0, g: 1.0, b: 1.0 });

                // Much larger particles for core
                this.sizes[i] = Math.random() * 25 + 20;
            } else {
                // Outer ring particles - colorful nebula, more chaotic
                const angle = Math.random() * Math.PI * 2;
                // Aggressively randomize ring radius and vertical spread
                const ringRadius = Math.pow(Math.random(), 1.5) * (1 + Math.random() * 0.7);
                const verticalSpread = 0.3 + Math.random() * 0.7;

                let vx = Math.cos(angle) * ringRadius;
                let vy = (Math.random() - 0.5) * verticalSpread * (1 + Math.random() * 0.7);
                let vz = Math.sin(angle) * ringRadius;

                // Add random perturbation to direction
                vx += (Math.random() - 0.5) * 0.7;
                vy += (Math.random() - 0.5) * 0.7;
                vz += (Math.random() - 0.5) * 0.7;

                // Randomize speed scaling per axis for more chaos
                const speed = (Math.random() * 1500 + 600) * SCALE_FACTOR; // Increased max speed and scaled
                const v = new THREE.Vector3(
                    vx * (1 + (Math.random() - 0.5) * 0.3),
                    vy * (1 + (Math.random() - 0.5) * 0.3),
                    vz * (1 + (Math.random() - 0.5) * 0.3)
                )
                    .normalize()
                    .multiplyScalar(speed * (1 + (Math.random() - 0.5) * 0.3));
                this.velocities.push(v);

                // Assign random nebula color
                const color = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
                this.colors[i * 4] = color.r;
                this.colors[i * 4 + 1] = color.g;
                this.colors[i * 4 + 2] = color.b;
                this.colors[i * 4 + 3] = 1.0;
                this.baseColors.push({ r: color.r, g: color.g, b: color.b });

                // Much larger particles for nebula
                this.sizes[i] = Math.random() * 30 + 15;
            }
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

        this.material = new THREE.PointsMaterial({
            size: 18, // Larger base size
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 2.0, // Even brighter
            sizeAttenuation: true,
            depthWrite: false,
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false; // Prevent disappearing at certain angles
        scene.add(this.points);

        // Massive initial flash sphere. Fades with simulation time in update()
        // and is removed + disposed once its opacity reaches zero.
        const flashGeo = new THREE.SphereGeometry(radius * 6, 32, 32);
        const flashMat = new THREE.MeshBasicMaterial({
            color: 0xffffaa,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
        });
        this.flashSphere = new THREE.Mesh(flashGeo, flashMat);
        this.flashSphere.position.copy(pos);
        scene.add(this.flashSphere);
        this.flashOpacity = 1.0;
    }

    update(dt: number) {
        // Use absolute time for supernova so it always progresses forward
        const absDt = Math.abs(dt);
        this.expandTime += absDt;
        const p = this.geometry.attributes.position.array;
        const colorAttr = this.geometry.attributes.color.array;

        // Flash fades quickly with simulation time (pauses when sim is paused).
        if (this.flashSphere) {
            this.flashOpacity -= 0.02 * (absDt * 60);

            if (this.flashSphere.material) {
                (this.flashSphere.material as THREE.MeshBasicMaterial).opacity = Math.max(
                    0,
                    this.flashOpacity
                );
            }
            this.flashSphere.scale.setScalar(1 + (1 - this.flashOpacity) * 8);

            if (this.flashOpacity <= 0) {
                // Fade complete — remove from the scene and release GPU resources.
                if (this.flashSphere.parent) this.scene.remove(this.flashSphere);
                this.flashSphere.geometry?.dispose?.();
                (this.flashSphere.material as THREE.MeshBasicMaterial)?.dispose?.();
                this.flashSphere = null;
            }
        }

        // Particles expand and gradually slow down
        let allFaded = true;
        for (let i = 0; i < this.count; i++) {
            // Normal expansion - particles slow down gradually
            p[i * 3] += this.velocities[i].x * (absDt * 60);
            p[i * 3 + 1] += this.velocities[i].y * (absDt * 60);
            p[i * 3 + 2] += this.velocities[i].z * (absDt * 60);
            // Apply gradual slowdown (tweak factor for desired effect)
            this.velocities[i].multiplyScalar(Supernova.SPEED_LOSS); // Tweakable slowdown factor
            // Gradually fade out each particle
            colorAttr[i * 4 + 3] *= Supernova.COOLDOWN_FADE;
            if (colorAttr[i * 4 + 3] < 0.01) {
                colorAttr[i * 4 + 3] = 0;
            } else {
                allFaded = false;
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;

        // If all particles are faded, mark for cleanup
        if (allFaded) {
            this.active = false;
        }
    }

    dispose() {
        // Manual cleanup called on respawn
        if (this.points && this.points.parent) {
            this.scene.remove(this.points);
        }

        // Make sure flash sphere is removed if it still exists (idempotent)
        if (this.flashSphere) {
            if (this.flashSphere.parent) {
                this.scene.remove(this.flashSphere);
            }
            this.flashSphere.geometry?.dispose?.();
            (this.flashSphere.material as THREE.MeshBasicMaterial)?.dispose?.();
            this.flashSphere = null;
        }

        this.geometry?.dispose?.();
        this.material?.dispose?.();
    }
}
