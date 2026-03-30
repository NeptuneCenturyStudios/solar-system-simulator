import * as THREE from 'three';

/**
 * Reusable star corona particle effect.
 *
 * Owns its geometry/material/scene attachment and supports radius/color updates
 * without forcing Star to manage the particle internals directly.
 */
export class Corona {
    scene: THREE.Scene;
    points: THREE.Points;
    count: number;
    pArr: Float32Array;
    lives: Float32Array;
    lifeIncrements: Float32Array;
    vels: THREE.Vector3[];
    radius: number;
    baseVelocity: number;
    velocityVariation: number;
    private material: THREE.PointsMaterial;
    private geometry: THREE.BufferGeometry;

    constructor(scene: THREE.Scene, radius: number, glowHex = 0xffffcc) {
        this.scene = scene;
        this.count = 1500;
        this.radius = radius;
        this.pArr = new Float32Array(this.count * 3);
        this.lives = new Float32Array(this.count);
        this.lifeIncrements = new Float32Array(this.count);
        this.vels = [];

        const scaleFactor = radius / 80;
        const particleSize = 3.5 * scaleFactor;
        this.baseVelocity = 0.15 * scaleFactor;
        this.velocityVariation = 0.25 * scaleFactor;

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pArr, 3));

        this.material = new THREE.PointsMaterial({
            color: glowHex,
            size: particleSize,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 0.7,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        this.scene.add(this.points);

        for (let i = 0; i < this.count; i++) {
            this.resetParticle(i);
            this.lives[i] = Math.random();
        }
    }

    private resetParticle(i: number) {
        const phi = Math.random() * Math.PI * 2;
        const theta = Math.random() * Math.PI;
        const currentRadius = this.radius;
        const isReverse = this.lives[i] <= 0.0;

        if (isReverse) {
            const d = currentRadius * (1.2 + Math.random() * 0.8);
            this.pArr[i * 3] = d * Math.sin(theta) * Math.cos(phi);
            this.pArr[i * 3 + 1] = d * Math.sin(theta) * Math.sin(phi);
            this.pArr[i * 3 + 2] = d * Math.cos(theta);
            this.lives[i] = 1;
        } else {
            const d = currentRadius * 0.98;
            this.pArr[i * 3] = d * Math.sin(theta) * Math.cos(phi);
            this.pArr[i * 3 + 1] = d * Math.sin(theta) * Math.sin(phi);
            this.pArr[i * 3 + 2] = d * Math.cos(theta);
            this.lives[i] = 0;
        }

        this.lifeIncrements[i] = 0.007 * (0.7 + Math.random() * 0.6);

        const baseVel = this.baseVelocity || 0.15 * (currentRadius / 80);
        const velVar = this.velocityVariation || 0.25 * (currentRadius / 80);
        this.vels[i] = new THREE.Vector3(
            this.pArr[i * 3],
            this.pArr[i * 3 + 1],
            this.pArr[i * 3 + 2]
        )
            .normalize()
            .multiplyScalar(baseVel + Math.random() * velVar);
    }

    update(dt: number) {
        const tScale = typeof window !== 'undefined' ? window.timeScale : 1;
        if (!dt || tScale === 0) return;

        const positionAttribute = this.geometry.attributes.position as THREE.BufferAttribute;
        const p = positionAttribute.array as Float32Array;

        for (let i = 0; i < this.count; i++) {
            this.lives[i] += this.lifeIncrements[i] * (dt * 60);
            p[i * 3] += this.vels[i].x * (dt * 60);
            p[i * 3 + 1] += this.vels[i].y * (dt * 60);
            p[i * 3 + 2] += this.vels[i].z * (dt * 60);

            if (this.lives[i] >= 1.0 || this.lives[i] <= 0.0) {
                this.resetParticle(i);
            }
        }

        positionAttribute.needsUpdate = true;
    }

    setRadius(radius: number) {
        const prevRadius = this.radius;
        this.radius = radius;

        const scaleFactor = radius / 80;
        this.baseVelocity = 0.15 * scaleFactor;
        this.velocityVariation = 0.25 * scaleFactor;
        this.material.size = 3.5 * scaleFactor;

        const tScale = typeof window !== 'undefined' ? window.timeScale : 1;
        if (tScale !== 0) {
            const s = prevRadius > 0 ? radius / prevRadius : 1;
            if (Number.isFinite(s) && s > 0 && s !== 1) {
                for (let i = 0; i < this.count; i++) {
                    this.pArr[i * 3] *= s;
                    this.pArr[i * 3 + 1] *= s;
                    this.pArr[i * 3 + 2] *= s;
                }

                (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
            }
        }
    }

    setColor(glowHex: number) {
        this.material.color.setHex(glowHex);
    }

    dispose() {
        this.scene.remove(this.points);
        this.geometry.dispose();
        this.material.dispose();
    }
}