import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';
import { performanceSettings } from '../utilities/consts';

/**
 * Reusable star corona particle effect.
 *
 * Owns its geometry/material/scene attachment and supports radius/color updates
 * without forcing Star to manage the particle internals directly.
 */
export class Corona implements IEffect {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    active: boolean;
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
    private _lastParticlesEnabled: boolean = true;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        radius: number,
        glowHex = 0xffffcc
    ) {
        this.dependencies = dependencies;
        this.scene = scene;
        this.active = true;
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
        this.geometry.setAttribute('life', new THREE.BufferAttribute(this.lives, 1));

        this.material = new THREE.PointsMaterial({
            color: glowHex,
            size: particleSize,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.material.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
        attribute float life;
        varying float vLife;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                `void main() {
        vLife = life;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
        varying float vLife;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float strength = smoothstep(0.5, 0.0, dist);
        float lifeFade = sin(vLife * 3.14159265);`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                'gl_FragColor = vec4(outgoingLight, lifeFade * strength * 0.9);'
            );
        };

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

        const d = currentRadius * 0.98;
        this.pArr[i * 3] = d * Math.sin(theta) * Math.cos(phi);
        this.pArr[i * 3 + 1] = d * Math.sin(theta) * Math.sin(phi);
        this.pArr[i * 3 + 2] = d * Math.cos(theta);
        this.lives[i] = 0;

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
        if (!dt) return;

        const particlesEnabled = performanceSettings.particleEffectsEnabled;
        if (particlesEnabled !== this._lastParticlesEnabled) {
            this._lastParticlesEnabled = particlesEnabled;
            this.material.visible = particlesEnabled;
        }
        if (!particlesEnabled) return;

        dt = Math.abs(dt);

        const positionAttribute = this.geometry.attributes.position as THREE.BufferAttribute;
        const p = positionAttribute.array as Float32Array;

        for (let i = 0; i < this.count; i++) {
            this.lives[i] += this.lifeIncrements[i] * (dt * 60);
            p[i * 3] += this.vels[i].x * (dt * 60);
            p[i * 3 + 1] += this.vels[i].y * (dt * 60);
            p[i * 3 + 2] += this.vels[i].z * (dt * 60);

            if (this.lives[i] >= 1.0) {
                this.resetParticle(i);
            }
        }

        positionAttribute.needsUpdate = true;
        (this.geometry.attributes.life as THREE.BufferAttribute).needsUpdate = true;
    }

    setRadius(radius: number) {
        const prevRadius = this.radius;
        this.radius = radius;

        const scaleFactor = radius / 80;
        this.baseVelocity = 0.15 * scaleFactor;
        this.velocityVariation = 0.25 * scaleFactor;
        this.material.size = 3.5 * scaleFactor;

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

    setColor(glowHex: number) {
        this.material.color.setHex(glowHex);
    }

    dispose() {
        this.scene.remove(this.points);
        this.geometry.dispose();
        this.material.dispose();
    }
}
