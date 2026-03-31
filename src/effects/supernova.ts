import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';

export class Supernova implements IEffect {
    dependencies: IStateDependencies;
    active: boolean;
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        pos: THREE.Vector3,
        radius: number,
        shouldCollapse = false
    ) {
        this.dependencies = dependencies;
        this.count = 20000; // Even more particles for maximum density
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.count * 3);
        this.colors = new Float32Array(this.count * 4); // RGBA for per-particle opacity
        this.baseColors = []; // Store original colors for fading
        this.sizes = new Float32Array(this.count);
        this.velocities = [];
        this.maxDistances = []; // Each particle has its own stopping distance
        this.active = true;
        this.scene = scene;
        this.expandTime = 0;
        this.origin = pos.clone(); // Store origin for distance calculation
        this.shouldCollapse = shouldCollapse; // If true, reverse animation (black hole formation)
        this.collapseStartTime = shouldCollapse ? 3.0 : null; // Wait 3 seconds before starting collapse

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
        // Expand to halfway to Kuiper Belt (Neptune distance / 2)
        const maxExpansion = 328000;

        for (let i = 0; i < this.count; i++) {
            // Start at supernova center
            this.positions[i * 3] = pos.x;
            this.positions[i * 3 + 1] = pos.y;
            this.positions[i * 3 + 2] = pos.z;

            const isInnerParticle = i < innerCount;

            if (isInnerParticle) {
                // Inner core particles - white-hot, random directions, slower, stop closer
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(Math.random() * 2 - 1); // Uniform sphere distribution

                const vx = Math.sin(phi) * Math.cos(theta);
                const vy = Math.sin(phi) * Math.sin(theta);
                const vz = Math.cos(phi);

                const speed = Math.random() * 80 + 40; // Much faster for scale
                const v = new THREE.Vector3(vx, vy, vz).normalize().multiplyScalar(speed);
                this.velocities.push(v);

                // Stop at inner distances
                const maxDist = Math.random() * 50000 + 20000; // 20k-70k units
                this.maxDistances.push(maxDist);

                // White-hot colors with alpha
                this.colors[i * 4] = 1.0;
                this.colors[i * 4 + 1] = 1.0;
                this.colors[i * 4 + 2] = 1.0;
                this.colors[i * 4 + 3] = 1.0; // Alpha
                this.baseColors.push({ r: 1.0, g: 1.0, b: 1.0 });

                // Much larger particles for core
                this.sizes[i] = Math.random() * 25 + 20;
            } else {
                // Outer ring particles - colorful nebula
                const angle = Math.random() * Math.PI * 2;
                const ringRadius = Math.random();
                const verticalSpread = 0.3;

                const vx = Math.cos(angle) * ringRadius;
                const vy = (Math.random() - 0.5) * verticalSpread;
                const vz = Math.sin(angle) * ringRadius;

                const speed = Math.random() * 150 + 80; // Much faster
                const v = new THREE.Vector3(vx, vy, vz).normalize().multiplyScalar(speed);
                this.velocities.push(v);

                // Stop at outer distances - up to halfway to Kuiper Belt
                const maxDist = Math.random() * (maxExpansion - 80000) + 80000; // 80k-328k units
                this.maxDistances.push(maxDist);

                // Assign random nebula color
                const color = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
                this.colors[i * 4] = color.r;
                this.colors[i * 4 + 1] = color.g;
                this.colors[i * 4 + 2] = color.b;
                this.colors[i * 4 + 3] = 1.0; // Alpha
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

        // Massive initial flash - but skip for black hole collapse (too brief)
        if (!shouldCollapse) {
            // Normal supernova gets full-size flash sphere
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
        } else {
            // No flash sphere for black hole collapse
            this.flashSphere = null;
            this.flashOpacity = 0;
        }
    }

    update(dt: number) {
        // Use absolute time for supernova so it always progresses forward
        const absDt = Math.abs(dt);
        this.expandTime += absDt;
        const p = this.geometry.attributes.position.array;
        const colorAttr = this.geometry.attributes.color.array;

        // Check if we should start collapsing (black hole formation)
        const isCollapsing = this.shouldCollapse && this.expandTime >= this.collapseStartTime;

        // Flash fades quickly - remove immediately if collapsing
        if (this.flashSphere) {
            // If the sphere was already removed from the scene somehow, still allow cleanup by opacity.
            const hasParent = !!this.flashSphere.parent;

            if (isCollapsing) {
                // Force remove flash sphere when collapse starts
                if (hasParent) this.scene.remove(this.flashSphere);
                this.flashSphere.geometry?.dispose?.();
                this.flashSphere.material?.dispose?.();
                this.flashSphere = null;
                this.flashOpacity = 0;
            } else if (this.flashOpacity > 0) {
                this.flashOpacity -= 0.02 * (absDt * 60);
                if (this.flashSphere.material) {
                    this.flashSphere.material.opacity = Math.max(0, this.flashOpacity);
                }
                this.flashSphere.scale.setScalar(1 + (1 - this.flashOpacity) * 8);

                if (this.flashOpacity <= 0) {
                    if (hasParent) this.scene.remove(this.flashSphere);
                    this.flashSphere.geometry?.dispose?.();
                    this.flashSphere.material?.dispose?.();
                    this.flashSphere = null;
                }
            }
        }

        // Particles expand and gradually fade as they approach max distance
        for (let i = 0; i < this.count; i++) {
            // Calculate distance from origin
            const dx = p[i * 3] - this.origin.x;
            const dy = p[i * 3 + 1] - this.origin.y;
            const dz = p[i * 3 + 2] - this.origin.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            const maxDist = this.maxDistances[i];
            const fadeStartDist = maxDist * 0.7; // Start fading at 70% of max distance

            if (isCollapsing) {
                // REVERSE: Pull particles back toward origin
                const dirToOrigin = new THREE.Vector3(
                    this.origin.x - p[i * 3],
                    this.origin.y - p[i * 3 + 1],
                    this.origin.z - p[i * 3 + 2]
                ).normalize();

                // Accelerate toward black hole (much faster for massive stars)
                const collapseSpeed = 300 + (1 - dist / maxDist) * 500; // Much faster collapse
                p[i * 3] += dirToOrigin.x * collapseSpeed * (absDt * 60);
                p[i * 3 + 1] += dirToOrigin.y * collapseSpeed * (absDt * 60);
                p[i * 3 + 2] += dirToOrigin.z * collapseSpeed * (absDt * 60);

                // Fade out more aggressively based on collapse progress
                const collapseProgress = (this.expandTime - this.collapseStartTime) / 3.0; // 3 seconds to fully collapse
                const baseFade = Math.max(0, 1 - collapseProgress * 0.5); // Fade over time
                const distFade = dist < maxDist * 0.5 ? dist / (maxDist * 0.5) : 1.0; // Fade near center
                colorAttr[i * 4 + 3] = Math.min(baseFade, distFade);
            } else {
                // Normal expansion - use absolute time
                p[i * 3] += this.velocities[i].x * (absDt * 60);
                p[i * 3 + 1] += this.velocities[i].y * (absDt * 60);
                p[i * 3 + 2] += this.velocities[i].z * (absDt * 60);

                // Gradually fade particles as they approach their max distance
                if (dist > fadeStartDist) {
                    const fadeProgress = (dist - fadeStartDist) / (maxDist - fadeStartDist);
                    const alpha = Math.max(0, 1 - fadeProgress);
                    colorAttr[i * 4 + 3] = alpha; // Update alpha channel

                    // Slow down particles as they fade (creates smoother expansion)
                    const slowdownFactor = 1 - fadeProgress * 0.3;
                    this.velocities[i].multiplyScalar(Math.max(0.7, slowdownFactor));
                } else {
                    colorAttr[i * 4 + 3] = 1.0;
                }
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;

        // Check if collapse is complete (all particles absorbed)
        if (isCollapsing) {
            let allAbsorbed = true;
            for (let i = 0; i < this.count; i++) {
                const dx = p[i * 3] - this.origin.x;
                const dy = p[i * 3 + 1] - this.origin.y;
                const dz = p[i * 3 + 2] - this.origin.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist > 500) {
                    // Much smaller threshold - cleanup faster
                    allAbsorbed = false;
                    break;
                }
            }
            if (allAbsorbed) {
                this.active = false; // Mark for cleanup
            }
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
            this.flashSphere.material?.dispose?.();
            this.flashSphere = null;
        }

        this.geometry?.dispose?.();
        this.material?.dispose?.();
    }
}
